import { randomUUID } from "node:crypto";
import { LifecycleOrchestrator, type OrchestratorOptions } from "./lifecycle.js";
import { buildToolRegistry } from "./tools/registry.js";
import type { ToolRegistry } from "./tools/types.js";
import { OperationToolBridge } from "./operation-tool-bridge.js";
import { createMcpServer, type McpServerHandle } from "./mcp-server.js";
import type { LifecycleState } from "./types.js";
import type { AgentBackend } from "./agent-backend/types.js";
import {
  createSessionRegistry,
  type Session,
  type SessionRegistry,
} from "./wire-protocol/session-registry.js";
import { createWireServer, type WireServer } from "./wire-protocol/server.js";
import { attachBackendBridge, handleViewerEnvelope } from "./wire-protocol/bridge.js";
import { startFileStatePush, seedInitialState } from "./wire-protocol/file-state-push.js";
import type { SessionId } from "./wire-protocol/types.js";

export interface PneumaFrameworkOptions extends OrchestratorOptions {
  backend?: AgentBackend;
  mcp?: { enabled: boolean };
  wire?: { enabled: boolean; port?: number; autoAcceptPermissions?: boolean };
}

export interface PneumaFramework {
  orchestrator: LifecycleOrchestrator;
  state: LifecycleState;
  toolRegistry: ToolRegistry;
  backend?: AgentBackend;
  mcpServer?: McpServerHandle;
  sessionRegistry?: SessionRegistry;
  wireServer?: WireServer;
  sessionId?: SessionId;
  /**
   * Record the backend-assigned session id on the framework session so
   * v2a envelope routing can target the right backend session. Call AFTER
   * `backend.launch(...)` returns. No-op when `wire` is disabled.
   */
  annotateBackendSession: (backendSessionId: string) => void;
  close: () => Promise<void>;
}

export function createPneumaFramework(opts: PneumaFrameworkOptions): PneumaFramework {
  const orchestrator = new LifecycleOrchestrator(opts);
  const toolRegistry = buildToolRegistry({ orchestrator, backend: opts.backend });
  const mcpServer = opts.mcp?.enabled ? createMcpServer(toolRegistry) : undefined;

  // Wire OperationToolBridge: register op.* tools when operations are discovered,
  // clear them when dev stops/crashes so stale tools don't linger between dev cycles.
  const opBridge = new OperationToolBridge({
    toolRegistry,
    getServiceUrl: () => {
      const services = orchestrator.state.dev?.services;
      if (!services || services.length === 0) return undefined;
      return services[0]!.url;
    },
  });
  orchestrator.onOperationsLoaded = (ops) => opBridge.register(ops);
  orchestrator.onDevStopped = () => opBridge.clear();

  let sessionRegistry: SessionRegistry | undefined;
  let wireServer: WireServer | undefined;
  let sessionId: SessionId | undefined;
  let frameworkSession: Session | undefined;

  if (opts.wire?.enabled) {
    sessionId = randomUUID();
    sessionRegistry = createSessionRegistry();
    frameworkSession = sessionRegistry.createSession(sessionId, {
      orchestrator,
      backend: opts.backend,
    });
    wireServer = createWireServer(sessionRegistry, {
      port: opts.wire.port ?? 0,
      onViewerEnvelope: (session, env) => handleViewerEnvelope(session, env),
      onViewerOpen: (_session, send) => {
        for (const env of seedInitialState(orchestrator.workspace)) send(env);
      },
    });
    if (opts.backend) {
      attachBackendBridge(frameworkSession, opts.backend, {
        broadcast: (sid, env) => wireServer!.broadcast(sid, env),
        autoAcceptPermissions: opts.wire.autoAcceptPermissions ?? false,
      });
    }
    const stopFileWatch = startFileStatePush(frameworkSession, orchestrator.workspace, wireServer);
    frameworkSession.disposers.push(stopFileWatch);
  }

  if (wireServer && sessionId) {
    orchestrator.setSessionContext({ sessionId, wsUrl: wireServer.url });
    // Surface framework-owned permission prompts (deploy, definition.apply)
    // so <PermissionPrompt> in a live viewer can render and answer them.
    const sid = sessionId;
    const ws = wireServer;
    orchestrator.setPermissionPromptPushHook((env) => ws.broadcast(sid, env));
  }

  return {
    orchestrator,
    state: orchestrator.state,
    toolRegistry,
    backend: opts.backend,
    mcpServer,
    sessionRegistry,
    wireServer,
    sessionId,
    annotateBackendSession(backendSessionId) {
      if (frameworkSession) frameworkSession.backendSessionId = backendSessionId;
    },
    close: async () => {
      // Skip teardown when:
      //   - runDev was never called (build-only flow) → state.dev undefined
      //   - runStop was already called on this orchestrator → stopInvoked true
      // state.dev.state ("stopped") is NOT a reliable "did stop.sh run" signal
      // because ##pneuma:stopping from the dev script also sets it.
      if (orchestrator.state.dev !== undefined && !orchestrator.stopInvoked) {
        try {
          await orchestrator.runStop();
        } catch {
          // runStop is already responsible for guaranteeing the dev process
          // is killed. Swallowing here is deliberate: close() must be safe
          // in finally blocks.
        }
      }
      // Caller-injected backend: ownership stays with the caller (they may
      // share it across framework instances). Only close things *we* created.
      if (mcpServer) {
        try { await mcpServer.close(); } catch { /* best-effort */ }
      }
      // Order matters: close wire server BEFORE deregistering the session so
      // in-flight socket handlers can still resolve the session. removeSession
      // then closes any remaining viewer sockets with a clean 1001 frame.
      if (wireServer) {
        try { await wireServer.close(); } catch { /* best-effort */ }
      }
      if (sessionRegistry && sessionId) {
        sessionRegistry.removeSession(sessionId);
      }
    },
  };
}
