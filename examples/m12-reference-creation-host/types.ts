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
