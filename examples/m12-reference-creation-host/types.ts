export type StackProfileId = "knowledge-inbox-bun-sqlite";

export interface StackProfile {
  readonly id: StackProfileId;
  readonly display_name: string;
  readonly description: string;
  readonly template_dir: string;
  readonly persistence: "sqlite";
  readonly runtime: "bun-typescript";
}

export interface GeneratedAppProject {
  readonly app_id: string;
  readonly display_name: string;
  readonly profile_id: StackProfileId;
  readonly created_at_ms: number;
  readonly current_version_id: string;
}

export interface GeneratedAppVersion {
  readonly app_id: string;
  readonly version_id: string;
  readonly profile_id: StackProfileId;
  readonly status: "previewable";
  readonly created_at_ms: number;
  readonly version_dir: string;
  readonly app_workspace_dir: string;
  readonly sqlite_path: string;
}

export interface CreationSessionRecord {
  readonly session_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly builder_user_id: string;
  readonly builder_request: string;
  readonly created_at_ms: number;
}

export interface HostState {
  readonly schema_version: 1;
  readonly projects: readonly GeneratedAppProject[];
  readonly versions: readonly GeneratedAppVersion[];
  readonly sessions: readonly CreationSessionRecord[];
}

export interface PreviewRuntimeRecord {
  readonly preview_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly preview_url: string;
  readonly started_at_ms: number;
  readonly status: "running";
}

export interface PreviewRuntimeHandle extends PreviewRuntimeRecord {
  readonly proc: ReturnType<typeof Bun.spawn>;
  readonly logs: string[];
  readonly wait_until_exit: Promise<number>;
}

export interface PreviewInspection {
  readonly schema: {
    readonly tables: readonly Record<string, unknown>[];
    readonly views: readonly Record<string, unknown>[];
    readonly policy_rules: readonly Record<string, unknown>[];
  };
  readonly operations: readonly Record<string, unknown>[];
  readonly data: {
    readonly inbox_items: readonly Record<string, unknown>[];
  };
  readonly logs: readonly string[];
}
