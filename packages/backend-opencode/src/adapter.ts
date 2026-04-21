import type {
  AgentBackend,
  AgentCapabilities,
  AgentEvent,
  AgentEventHandler,
  AgentLaunchOptions,
  AgentSession,
  PermissionResponse,
} from "@pneuma-framework/core";

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
        const spawned = await this.sdk.createOpencode();
        this.client = spawned.client;
        this.serverHandle = spawned.server;
      }
      // Await event-pump setup so a failing subscribe surfaces as a launch()
      // rejection instead of a detached unhandled rejection on a session that
      // would otherwise never receive events.
      await this.startEventPump();
    }
    // resumeSessionId means "continue an existing opencode session" — skip
    // session.create so prior context isn't silently lost.
    const resumedId = opts.resumeSessionId;
    const sessionId = resumedId
      ?? (await this.client.session.create({ body: { title: opts.initialPrompt?.slice(0, 80) } })).data.id;
    const sess: AgentSession = {
      sessionId,
      backendSessionId: sessionId,
      state: "ready",
      startedAt: Date.now(),
    };
    this.sessions.set(sess.sessionId, sess);
    const model = parseModelId(opts.model ?? this.config.defaultModel);
    if (model) this.sessionModel.set(sess.sessionId, model);
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
          body: {
            parts: Array<{ type: string; text?: string }>;
            model?: { providerID: string; modelID: string };
          };
        }) => Promise<unknown>;
      };
    };
    const model = this.sessionModel.get(sessionId);
    await clientAny.session.prompt({
      path: { id: sessionId },
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

  private async startEventPump(): Promise<void> {
    if (!this.client) return;
    const { stream } = await this.client.event.subscribe();
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
    // Event property key is `sessionID` (capital D) across the opencode schema.
    const props = inner.properties ?? {};
    const sessionId = (props.sessionID as string | undefined)
      ?? (props.sessionId as string | undefined)
      ?? "unknown";
    switch (inner.type) {
      case "message.part.updated":
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
