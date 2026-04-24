// packages/core/src/types.ts

export type LifecycleVerb =
  | "setup"
  | "dev"
  | "stop"
  | "build"
  | "deploy"
  | "migrate"
  | "fork";

export type BackendType = "claude-code" | "codex" | (string & {});

export interface TemplateManifest {
  schemaVersion: 1;
  name: string;
  version: string;
  displayName: string;
  description: string;
  backends: {
    supported: BackendType[];
    defaultConfig?: Record<string, unknown>;
  };
  runtimeAgent: "none" | "embedded" | "optional";
  scripts: Partial<Record<LifecycleVerb, string>>;
  skill?: {
    sourceDir: string;
    installName: string;
    envMapping?: Record<string, string>;
  };
  viewer?: {
    entry?: string;
    sdk?: "react" | "vanilla" | "custom";
    actions?: Array<{ id: string; label: string; params?: Record<string, unknown> }>;
    commands?: Array<{ id: string; label: string }>;
  };
  initParams?: Array<{
    name: string;
    type: "number" | "string" | "boolean";
    defaultValue: number | string | boolean;
    label: string;
    description?: string;
    sensitive?: boolean;
  }>;
  unattendedDeploy?: boolean;
}

export type MarkerMessage =
  | { kind: "service-ready"; name: string; url: string }
  | { kind: "ready" }
  | { kind: "stopping" }
  | { kind: "needs-confirm"; label: string }
  | { kind: "progress"; pct: number; label: string }
  | { kind: "artifact"; path: string };

export interface ServiceStatus {
  name: string;
  url: string;
  startedAt: number;
}

export type VerbState = "running" | "exited" | "crashed" | "stopped";

/**
 * Opaque shape for a single operation discovered from `GET /api/config`.
 * Kept structurally-typed here so `core` stays independent of `core-domain`'s
 * aggregate classes. Step 3 (tool registration) will cast these into whatever
 * tool-descriptor it needs.
 */
export interface DiscoveredOperation {
  readonly id: string;
  readonly action: string;
  readonly resource: unknown;
  readonly input: unknown;
  readonly output: unknown;
  readonly affects: unknown;
  readonly handler_kind: "code" | "query";
}

export interface VerbExecution {
  verb: LifecycleVerb;
  pid: number;
  startedAt: number;
  exitedAt?: number;
  exitCode?: number | null;
  state: VerbState;
  services: ServiceStatus[];
  pendingConfirm?: { label: string; at: number };
  /**
   * Operations fetched from `GET /api/config` after the first HTTP-app service
   * becomes ready. Populated once per dev start; undefined if the template does
   * not expose an HTTP-app service or if no service has become ready yet.
   */
  operations?: readonly DiscoveredOperation[];
  /**
   * Set when the `/api/config` fetch attempt fails (network error or non-2xx
   * response). Dev mode continues normally — this is informational only.
   */
  operations_fetch_error?: string;
}

export interface BuildManifest {
  schemaVersion: 1;
  kind: string;
  entrypoint: string;
  produced: string[];
  env?: Record<string, string>;
  notes?: string;
  deployHints?: {
    requiresMigration?: boolean;
    runtimeAgent?: "embedded" | "none";
  };
}

export interface LifecycleState {
  workspace: { root: string; stateDir: string };
  dev?: VerbExecution;
  lastBuild?: VerbExecution & { manifestPath?: string };
  lastDeploy?: VerbExecution;
}
