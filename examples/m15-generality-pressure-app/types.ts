export type M15StackProfileId =
  | "knowledge-inbox-bun-sqlite"
  | "team-decision-log-bun-sqlite";

export interface M15StackProfile {
  readonly id: M15StackProfileId;
  readonly display_name: string;
  readonly description: string;
  readonly template_dir: string;
  readonly persistence: "sqlite";
  readonly runtime: "bun-typescript";
  readonly read_operation_id: string;
  readonly data_table_id: string;
}

export interface M15GeneratedAppProject {
  readonly app_id: string;
  readonly display_name: string;
  readonly profile_id: M15StackProfileId;
  readonly created_at_ms: number;
  readonly current_version_id: string;
}

export interface M15GeneratedAppVersion {
  readonly app_id: string;
  readonly version_id: string;
  readonly profile_id: M15StackProfileId;
  readonly status: "previewable";
  readonly created_at_ms: number;
  readonly version_dir: string;
  readonly app_workspace_dir: string;
  readonly sqlite_path: string;
}

export interface M15HostState {
  readonly schema_version: 1;
  readonly projects: readonly M15GeneratedAppProject[];
  readonly versions: readonly M15GeneratedAppVersion[];
}

export interface M15PreviewRuntimeRecord {
  readonly preview_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly profile_id: M15StackProfileId;
  readonly preview_url: string;
  readonly started_at_ms: number;
  readonly status: "running";
}

export interface M15PreviewRuntimeHandle extends M15PreviewRuntimeRecord {
  readonly proc: ReturnType<typeof Bun.spawn>;
  readonly logs: string[];
  readonly wait_until_exit: Promise<number>;
}

export interface M15PreviewInspection {
  readonly schema: {
    readonly tables: readonly Record<string, unknown>[];
    readonly views: readonly Record<string, unknown>[];
    readonly policy_rules: readonly Record<string, unknown>[];
  };
  readonly operations: readonly Record<string, unknown>[];
  readonly data: Readonly<Record<string, readonly Record<string, unknown>[]>>;
  readonly logs: readonly string[];
}
