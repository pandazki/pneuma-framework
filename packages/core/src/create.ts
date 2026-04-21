import { LifecycleOrchestrator, type OrchestratorOptions } from "./lifecycle.js";
import { buildToolRegistry } from "./tools/registry.js";
import type { ToolRegistry } from "./tools/types.js";
import { createMcpServer, type McpServerHandle } from "./mcp-server.js";
import type { LifecycleState } from "./types.js";
import type { AgentBackend } from "./agent-backend/types.js";

export interface PneumaFrameworkOptions extends OrchestratorOptions {
  backend?: AgentBackend;
  mcp?: { enabled: boolean };
}

export interface PneumaFramework {
  orchestrator: LifecycleOrchestrator;
  state: LifecycleState;
  toolRegistry: ToolRegistry;
  backend?: AgentBackend;
  mcpServer?: McpServerHandle;
  close: () => Promise<void>;
}

export function createPneumaFramework(opts: PneumaFrameworkOptions): PneumaFramework {
  const orchestrator = new LifecycleOrchestrator(opts);
  const toolRegistry = buildToolRegistry({ orchestrator, backend: opts.backend });
  const mcpServer = opts.mcp?.enabled ? createMcpServer(toolRegistry) : undefined;
  return {
    orchestrator,
    state: orchestrator.state,
    toolRegistry,
    backend: opts.backend,
    mcpServer,
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
    },
  };
}
