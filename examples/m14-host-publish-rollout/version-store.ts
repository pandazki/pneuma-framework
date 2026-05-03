import {
  cpSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { HostStore } from "../m12-reference-creation-host/host-store.js";
import type {
  GeneratedAppVersion,
  HostState,
} from "../m12-reference-creation-host/types.js";

export interface ForkGeneratedAppVersionInput {
  readonly store: HostStore;
  readonly appId: string;
  readonly fromVersionId: string;
  readonly toVersionId: string;
  readonly now?: () => number;
}

export function forkGeneratedAppVersion(input: ForkGeneratedAppVersionInput): GeneratedAppVersion {
  validateVersionId(input.toVersionId);
  const state = input.store.readState();
  if (state.versions.some((version) =>
    version.app_id === input.appId && version.version_id === input.toVersionId
  )) {
    throw new Error(`generated app version already exists: ${input.appId}@${input.toVersionId}`);
  }

  const source = input.store.getVersion(input.appId, input.fromVersionId);
  const targetVersionDir = join(
    input.store.workspace,
    "generated-apps",
    input.appId,
    "versions",
    input.toVersionId,
  );
  const targetWorkspaceDir = join(targetVersionDir, "workspace");
  const targetSqlitePath = join(targetWorkspaceDir, "data", "app.db");

  rmSync(targetVersionDir, { recursive: true, force: true });
  mkdirSync(targetVersionDir, { recursive: true });
  cpSync(source.app_workspace_dir, targetWorkspaceDir, { recursive: true });

  const version: GeneratedAppVersion = {
    app_id: input.appId,
    version_id: input.toVersionId,
    profile_id: source.profile_id,
    status: "previewable",
    created_at_ms: input.now?.() ?? Date.now(),
    version_dir: targetVersionDir,
    app_workspace_dir: targetWorkspaceDir,
    sqlite_path: targetSqlitePath,
  };

  writeJson(join(targetVersionDir, "version.json"), version);
  writeHostState(input.store.state_path, {
    schema_version: 1,
    projects: state.projects.map((project) =>
      project.app_id === input.appId
        ? { ...project, current_version_id: input.toVersionId }
        : project
    ),
    versions: [...state.versions, version],
    sessions: state.sessions,
  });
  return version;
}

function validateVersionId(versionId: string): void {
  if (!/^v[0-9]+$/.test(versionId)) {
    throw new Error(`invalid version_id: ${versionId}`);
  }
}

function writeHostState(path: string, state: HostState): void {
  writeJson(path, state);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.hrtime.bigint().toString(36)}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tmpPath, path);
}

export function readHostStateFile(path: string): HostState {
  return JSON.parse(readFileSync(path, "utf8")) as HostState;
}
