import type {
  AgentBackend,
  AgentCapabilities,
  AgentEvent,
  AgentEventHandler,
  AgentLaunchOptions,
  AgentRunTurnOptions,
  AgentRunTurnResult,
  AgentSession,
  PermissionResponse,
} from "./types.js";
import { runAgentTurnThroughLaunchSend } from "./run-turn.js";

const FAKE_CAPS: AgentCapabilities = {
  streaming: true,
  resume: false,
  permissions: true,
  toolProgress: true,
  modelSwitch: false,
};

export class FakeAgentBackend implements AgentBackend {
  readonly type = "fake" as const;
  readonly capabilities = FAKE_CAPS;

  private readonly handlers = new Set<AgentEventHandler>();
  private readonly sessions = new Map<string, AgentSession>();
  private readonly buildThreadSessions = new Map<string, AgentSession>();
  readonly userMessages: Array<{ sessionId: string; text: string }> = [];
  readonly permissionDecisions: PermissionResponse[] = [];
  private seq = 0;

  async launch(_opts: AgentLaunchOptions): Promise<AgentSession> {
    this.seq += 1;
    const sess: AgentSession = {
      sessionId: `fake-${this.seq}`,
      state: "ready",
      startedAt: Date.now(),
    };
    this.sessions.set(sess.sessionId, sess);
    this.emit({ type: "session-ready", sessionId: sess.sessionId, payload: {} });
    return sess;
  }

  async runTurn(opts: AgentRunTurnOptions): Promise<AgentRunTurnResult> {
    return runAgentTurnThroughLaunchSend({
      ...opts,
      transport: this,
      session_cache: this.buildThreadSessions,
    });
  }

  async sendUserMessage(sessionId: string, text: string): Promise<void> {
    this.userMessages.push({ sessionId, text });
  }

  async respondToPermission(_sessionId: string, response: PermissionResponse): Promise<void> {
    this.permissionDecisions.push(response);
  }

  onEvent(handler: AgentEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async stop(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s || s.state === "exited") return;
    s.state = "exited";
    s.exitedAt = Date.now();
    this.emit({ type: "session-exited", sessionId, payload: {} });
  }

  async close(): Promise<void> {
    for (const sid of [...this.sessions.keys()]) await this.stop(sid);
    this.handlers.clear();
  }

  /** Test-only hook: inject an event as if the backend produced it. */
  simulate(event: AgentEvent): void {
    this.emit(event);
  }

  private emit(event: AgentEvent): void {
    for (const h of this.handlers) h(event);
  }
}
