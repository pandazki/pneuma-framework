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

export interface VerbExecution {
  verb: LifecycleVerb;
  pid: number;
  startedAt: number;
  exitedAt?: number;
  exitCode?: number | null;
  state: VerbState;
  services: ServiceStatus[];
  pendingConfirm?: { label: string; at: number };
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
