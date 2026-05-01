export type AgentBackendType = "claude-code" | "codex" | "opencode" | (string & {});

export interface AgentCapabilities {
  streaming: boolean;
  resume: boolean;
  permissions: boolean;
  toolProgress: boolean;
  modelSwitch: boolean;
}

export type AgentSessionState = "starting" | "ready" | "exited" | "error";

export interface AgentSession {
  sessionId: string;
  backendSessionId?: string;
  state: AgentSessionState;
  startedAt: number;
  exitedAt?: number;
  error?: string;
}

export interface AgentLaunchOptions {
  cwd: string;
  model?: string;
  resumeSessionId?: string;
  initialPrompt?: string;
  permissionMode?: "ask" | "accept" | "deny";
  toolRegistry?: unknown;
  /**
   * HTTP URL of the running template's AppRuntime (e.g. "http://localhost:8765").
   * When present, agent backends can attach an MCP bridge so the agent sees the
   * template's Operations as tools. Set by the CLI or example harness based on
   * orchestrator.state.dev.services[0].url after ##pneuma:service-ready.
   */
  appUrl?: string;
  /**
   * HTTP URL of a framework-tool proxy exposing the framework ToolRegistry to
   * an out-of-process backend agent. When present, backends can attach a second
   * MCP bridge so the agent sees semantic framework tools such as
   * definition.apply in addition to template op.* tools.
   */
  frameworkToolUrl?: string;
}

export interface AgentEvent {
  type:
    | "session-ready"
    | "session-exited"
    | "text"
    | "tool-call"
    | "permission-request"
    | "error";
  sessionId: string;
  payload: Record<string, unknown>;
}

export type AgentEventHandler = (ev: AgentEvent) => void;

export interface PermissionResponse {
  requestId: string;
  decision: "allow" | "deny" | "allow-always";
}

export interface AgentBackend {
  readonly type: AgentBackendType;
  readonly capabilities: AgentCapabilities;
  launch(opts: AgentLaunchOptions): Promise<AgentSession>;
  sendUserMessage(sessionId: string, text: string): Promise<void>;
  respondToPermission(sessionId: string, response: PermissionResponse): Promise<void>;
  onEvent(handler: AgentEventHandler): () => void;
  stop(sessionId: string): Promise<void>;
  close(): Promise<void>;
}

export interface AgentBackendDescriptor {
  type: AgentBackendType;
  displayName: string;
  capabilities: AgentCapabilities;
  detect?: () => Promise<BackendAvailability>;
}

export interface BackendAvailability {
  available: boolean;
  reason?: string;
  version?: string;
}

export type AgentBackendFactory = (config?: Record<string, unknown>) => AgentBackend;
