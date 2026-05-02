import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentBackend,
  AgentCapabilities,
  AgentEvent,
  AgentEventHandler,
  AgentLaunchOptions,
  AgentSession,
  PermissionResponse,
} from "@pneuma-framework/core";

/**
 * Resolve the absolute path to the template-mcp-bridge binary.
 * The adapter lives at packages/backend-opencode/src/adapter.ts, so the
 * bridge is at ../../core/bin/template-mcp-bridge.ts from this file.
 * Works for both source (Bun monorepo) and built layouts (dist/adapter.js
 * → ../../core/bin/template-mcp-bridge.ts still resolves correctly since
 * both packages preserve the same relative depth).
 */
function resolveCoreBinPath(fileName: string): string {
  const thisFile = fileURLToPath(import.meta.url);
  return resolve(thisFile, "..", "..", "..", "core", "bin", fileName);
}

function resolveTemplateBridgePath(): string {
  return resolveCoreBinPath("template-mcp-bridge.ts");
}

function resolveFrameworkBridgePath(): string {
  return resolveCoreBinPath("framework-mcp-bridge.ts");
}

function buildMcpConfig(opts: AgentLaunchOptions):
  | Record<string, { type: "local"; command: string[]; environment: Record<string, string>; enabled: true }>
  | undefined {
  const config: Record<string, { type: "local"; command: string[]; environment: Record<string, string>; enabled: true }> = {};

  if (opts.appUrl) {
    const key = opts.frameworkToolUrl ? "pneuma_app" : "pneuma";
    config[key] = {
      type: "local",
      command: ["bun", "run", resolveTemplateBridgePath()],
      environment: { PNEUMA_APP_URL: opts.appUrl },
      enabled: true,
    };
  }

  if (opts.frameworkToolUrl) {
    config["pneuma_framework"] = {
      type: "local",
      command: ["bun", "run", resolveFrameworkBridgePath()],
      environment: { PNEUMA_FRAMEWORK_TOOL_URL: opts.frameworkToolUrl },
      enabled: true,
    };
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

export const OPENCODE_CAPS: AgentCapabilities = {
  streaming: true,
  resume: true,
  permissions: true,
  toolProgress: true,
  modelSwitch: true,
};

export interface OpencodeBackendConfig {
  /** If set, connect to a pre-running `opencode serve` at this URL instead of spawning one. */
  baseUrl?: string;
  /** Credentials when targeting a remote `opencode serve`. */
  username?: string;
  password?: string;
  /**
   * Default model in "<providerID>/<modelID>" form (e.g.
   * "openrouter/anthropic/claude-haiku-4.5"). Overridden by
   * AgentLaunchOptions.model on a per-call basis.
   */
  defaultModel?: string;
  /** Local `opencode serve` port when the adapter spawns a server. Use 0 to let opencode choose. */
  serverPort?: number;
  /** Startup timeout for a spawned `opencode serve`, in milliseconds. */
  serverStartTimeoutMs?: number;
}

function parseModelId(full: string | undefined): { providerID: string; modelID: string } | undefined {
  if (!full) return undefined;
  const idx = full.indexOf("/");
  if (idx <= 0 || idx === full.length - 1) return undefined;
  return { providerID: full.slice(0, idx), modelID: full.slice(idx + 1) };
}

type OpencodeLifecycleHandle = {
  close(): Promise<void> | void;
};

interface OpencodeClientShape {
  session: {
    create(args: { body: { title?: string; parentID?: string } }): Promise<{ data: { id: string } }>;
  };
  event: {
    subscribe(): Promise<{ stream: AsyncIterable<unknown> }>;
  };
}

export interface OpencodeSdk {
  createOpencode: (opts?: unknown) => Promise<{ client: OpencodeClientShape; server?: OpencodeLifecycleHandle }>;
  createOpencodeClient: (opts: { baseUrl: string; username?: string; password?: string }) => OpencodeClientShape;
}

export class OpencodeBackend implements AgentBackend {
  readonly type = "opencode" as const;
  readonly capabilities = OPENCODE_CAPS;

  private readonly handlers = new Set<AgentEventHandler>();
  private readonly sessions = new Map<string, AgentSession>();
  // sessionModel tracks the model selection per session so sendUserMessage
  // keeps using whichever model launch() chose (or the fallback).
  private readonly sessionModel = new Map<string, { providerID: string; modelID: string }>();
  // sessionDirectory pins each session to the workspace that was passed on
  // launch. Opencode's session.prompt accepts `query.directory` to tell the
  // agent where Read/Write/Edit tools should operate; without it the agent
  // falls back to the server process's cwd and hallucinates unrelated files.
  private readonly sessionDirectory = new Map<string, string>();
  private client?: OpencodeClientShape;
  private serverHandle?: OpencodeLifecycleHandle;
  private subscribeAbort?: AbortController;

  constructor(
    private readonly config: OpencodeBackendConfig,
    private readonly sdk: OpencodeSdk,
  ) {}

  async launch(opts: AgentLaunchOptions): Promise<AgentSession> {
    if (!this.client) {
      if (this.config.baseUrl) {
        this.client = this.sdk.createOpencodeClient({
          baseUrl: this.config.baseUrl,
          username: this.config.username,
          password: this.config.password,
        });
      } else {
        // When URLs are provided, inject local MCP server configs so opencode
        // sees app op.* tools and, for M6, framework semantic tools.
        const mcpConfig = buildMcpConfig(opts);
        const spawnOptions = {
          ...(mcpConfig ? { config: { mcp: mcpConfig } } : {}),
          ...(this.config.serverPort !== undefined ? { port: this.config.serverPort } : {}),
          ...(this.config.serverStartTimeoutMs !== undefined ? { timeout: this.config.serverStartTimeoutMs } : {}),
        };
        const spawned = await this.sdk.createOpencode(
          Object.keys(spawnOptions).length > 0 ? spawnOptions : undefined,
        );
        this.client = spawned.client;
        this.serverHandle = spawned.server;
      }
      // Await event-pump setup so a failing subscribe surfaces as a launch()
      // rejection instead of a detached unhandled rejection on a session that
      // would otherwise never receive events.
      // Pass directory so opencode filters the SSE stream to events for this
      // workspace — without it, /event only yields server.connected/heartbeat.
      await this.startEventPump(opts.cwd);
    }
    // resumeSessionId means "continue an existing opencode session" — skip
    // session.create so prior context isn't silently lost.
    const resumedId = opts.resumeSessionId;
    const createArgs = {
      body: { title: opts.initialPrompt?.slice(0, 80) },
      // Pin the new session to opts.cwd so opencode's Read/Write/Edit tools
      // see the right files instead of whichever dir the opencode server
      // itself was spawned in.
      query: opts.cwd ? { directory: opts.cwd } : undefined,
    };
    const sessionId = resumedId
      ?? (await (this.client as unknown as {
        session: { create: (a: typeof createArgs) => Promise<{ data: { id: string } }>; };
      }).session.create(createArgs)).data.id;
    const sess: AgentSession = {
      sessionId,
      backendSessionId: sessionId,
      state: "ready",
      startedAt: Date.now(),
    };
    this.sessions.set(sess.sessionId, sess);
    const model = parseModelId(opts.model ?? this.config.defaultModel);
    if (model) this.sessionModel.set(sess.sessionId, model);
    if (opts.cwd) this.sessionDirectory.set(sess.sessionId, opts.cwd);
    this.emit({ type: "session-ready", sessionId: sess.sessionId, payload: { resumed: !!resumedId } });

    if (opts.initialPrompt) {
      await this.sendUserMessage(sess.sessionId, opts.initialPrompt);
    }
    return sess;
  }

  async sendUserMessage(sessionId: string, text: string): Promise<void> {
    if (!this.client) throw new Error("backend not launched");
    const clientAny = this.client as unknown as {
      session: {
        prompt: (args: {
          path: { id: string };
          query?: { directory?: string };
          body: {
            parts: Array<{ type: string; text?: string }>;
            model?: { providerID: string; modelID: string };
          };
        }) => Promise<unknown>;
      };
    };
    const model = this.sessionModel.get(sessionId);
    const directory = this.sessionDirectory.get(sessionId);
    await clientAny.session.prompt({
      path: { id: sessionId },
      ...(directory ? { query: { directory } } : {}),
      body: {
        parts: [{ type: "text", text }],
        ...(model ? { model } : {}),
      },
    });
  }

  async respondToPermission(sessionId: string, response: PermissionResponse): Promise<void> {
    if (!this.client) throw new Error("backend not launched");
    const clientAny = this.client as unknown as {
      postSessionIdPermissionsPermissionId: (args: {
        path: { id: string; permissionID: string };
        body: { response: "once" | "always" | "reject" };
      }) => Promise<unknown>;
    };
    const mapped = response.decision === "deny"
      ? "reject"
      : response.decision === "allow-always"
        ? "always"
        : "once";
    await clientAny.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: response.requestId },
      body: { response: mapped },
    });
  }

  onEvent(handler: AgentEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async stop(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.state = "exited";
    s.exitedAt = Date.now();
    this.emit({ type: "session-exited", sessionId, payload: {} });
  }

  async close(): Promise<void> {
    this.subscribeAbort?.abort();
    if (this.serverHandle) await this.serverHandle.close();
    this.client = undefined;
    this.handlers.clear();
  }

  private async startEventPump(directory?: string): Promise<void> {
    if (!this.client) return;
    const eventClient = (this.client as unknown as {
      event: { subscribe: (opts?: { query?: { directory?: string } }) => Promise<{ stream: AsyncIterable<unknown> }> };
    }).event;
    const { stream } = await eventClient.subscribe(directory ? { query: { directory } } : undefined);
    const ac = new AbortController();
    this.subscribeAbort = ac;
    (async () => {
      try {
        for await (const raw of stream) {
          if (ac.signal.aborted) break;
          this.dispatch(raw);
        }
      } catch {
        /* stream ended */
      }
    })();
  }

  private dispatch(raw: unknown): void {
    // /event (Event.subscribe) returns unwrapped Event objects with shape
    // { type, properties }. /global/event wraps them in { directory, payload },
    // but we don't use that endpoint here.
    const inner = raw as { type?: string; properties?: Record<string, unknown> };
    if (!inner?.type) return;
    const props = inner.properties ?? {};
    // Event property key is `sessionID` (capital D) across the opencode schema.
    // For message.part.updated the session id lives inside `properties.part.sessionID`,
    // not at the top level of properties — check both.
    const partSessionId = (props.part as { sessionID?: unknown } | undefined)?.sessionID;
    const sessionId = (props.sessionID as string | undefined)
      ?? (typeof partSessionId === "string" ? partSessionId : undefined)
      ?? (props.sessionId as string | undefined)
      ?? "unknown";
    switch (inner.type) {
      case "message.part.delta": {
        // opencode streams assistant text via per-chunk delta events.
        // Each has {sessionID, messageID, partID, field, delta}; we only
        // care about text fields for the chat stream.
        if (props.field !== "text") return;
        const delta = props.delta;
        if (typeof delta !== "string") return;
        this.emit({
          type: "text",
          sessionId,
          payload: {
            partId: props.partID as string | undefined,
            messageID: props.messageID as string | undefined,
            delta,
          },
        });
        return;
      }
      case "message.part.updated":
        // Forward the cumulative-text path too (bridge filters user echoes
        // by `time.start` absence and dedupes with textDeltaState so we
        // don't double-count between this and the delta events above).
        this.emit({ type: "text", sessionId, payload: props });
        return;
      case "permission.updated":
        this.emit({ type: "permission-request", sessionId, payload: props });
        return;
      case "session.error":
        this.emit({ type: "error", sessionId, payload: props });
        return;
      default:
        // ignore unknown; forward-compatible per spec.
        return;
    }
  }

  private emit(event: AgentEvent): void {
    for (const h of this.handlers) h(event);
  }
}
