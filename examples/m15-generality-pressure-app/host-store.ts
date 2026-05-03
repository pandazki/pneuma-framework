import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { getM15StackProfile } from "./profiles.js";
import type {
  M15GeneratedAppProject,
  M15GeneratedAppVersion,
  M15HostState,
  M15StackProfileId,
} from "./types.js";

export interface M15HostStoreOptions {
  readonly workspace: string;
  readonly now?: () => number;
}

export interface CreateM15ProjectInput {
  readonly app_id: string;
  readonly display_name: string;
  readonly profile_id: M15StackProfileId;
}

export interface M15HostStore {
  readonly workspace: string;
  readonly state_path: string;
  listProjects(): readonly M15GeneratedAppProject[];
  getProject(appId: string): M15GeneratedAppProject;
  listVersions(appId: string): readonly M15GeneratedAppVersion[];
  getVersion(appId: string, versionId: string): M15GeneratedAppVersion;
  createProject(input: CreateM15ProjectInput): {
    readonly project: M15GeneratedAppProject;
    readonly version: M15GeneratedAppVersion;
  };
  readState(): M15HostState;
}

const EMPTY_STATE: M15HostState = {
  schema_version: 1,
  projects: [],
  versions: [],
};

export function createGeneralityHostStore(options: M15HostStoreOptions): M15HostStore {
  const workspace = resolve(options.workspace);
  const hostDir = join(workspace, ".pneuma-host");
  const statePath = join(hostDir, "host-state.json");
  const now = options.now ?? (() => Date.now());

  mkdirSync(hostDir, { recursive: true });
  if (!existsSync(statePath)) writeJson(statePath, EMPTY_STATE);

  let state = readHostState(statePath);

  function save(next: M15HostState): void {
    state = next;
    writeJson(statePath, state);
  }

  return {
    workspace,
    state_path: statePath,

    listProjects() {
      return [...state.projects];
    },

    getProject(appId: string) {
      const project = state.projects.find((candidate) => candidate.app_id === appId);
      if (!project) throw new Error(`unknown generated app: ${appId}`);
      return project;
    },

    listVersions(appId: string) {
      this.getProject(appId);
      return state.versions.filter((version) => version.app_id === appId);
    },

    getVersion(appId: string, versionId: string) {
      this.getProject(appId);
      const version = state.versions.find(
        (candidate) => candidate.app_id === appId && candidate.version_id === versionId,
      );
      if (!version) throw new Error(`unknown generated app version: ${appId}@${versionId}`);
      return version;
    },

    createProject(input: CreateM15ProjectInput) {
      validateAppId(input.app_id);
      const displayName = input.display_name.trim();
      if (!displayName) throw new Error("display_name is required");
      getM15StackProfile(input.profile_id);
      if (state.projects.some((project) => project.app_id === input.app_id)) {
        throw new Error(`generated app already exists: ${input.app_id}`);
      }

      const createdAtMs = now();
      const appDir = join(workspace, "generated-apps", input.app_id);
      const versionDir = join(appDir, "versions", "v0");
      const appWorkspaceDir = join(versionDir, "workspace");
      const dataDir = join(appWorkspaceDir, "data");
      const sqlitePath = join(dataDir, "app.db");
      mkdirSync(dataDir, { recursive: true });

      const project: M15GeneratedAppProject = {
        app_id: input.app_id,
        display_name: displayName,
        profile_id: input.profile_id,
        created_at_ms: createdAtMs,
        current_version_id: "v0",
      };
      const version: M15GeneratedAppVersion = {
        app_id: input.app_id,
        version_id: "v0",
        profile_id: input.profile_id,
        status: "previewable",
        created_at_ms: createdAtMs,
        version_dir: versionDir,
        app_workspace_dir: appWorkspaceDir,
        sqlite_path: sqlitePath,
      };

      writeJson(join(appDir, "project.json"), project);
      writeJson(join(versionDir, "version.json"), version);
      save({
        schema_version: 1,
        projects: [...state.projects, project],
        versions: [...state.versions, version],
      });

      return { project, version };
    },

    readState() {
      return {
        schema_version: 1,
        projects: [...state.projects],
        versions: [...state.versions],
      };
    },
  };
}

function validateAppId(appId: string): void {
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(appId)) {
    throw new Error(`invalid app_id: ${appId}`);
  }
}

function readHostState(statePath: string): M15HostState {
  const parsed = JSON.parse(readFileSync(statePath, "utf8")) as M15HostState;
  if (parsed.schema_version !== 1) {
    throw new Error(`unsupported host state schema_version: ${String(parsed.schema_version)}`);
  }
  return {
    schema_version: 1,
    projects: [...(parsed.projects ?? [])],
    versions: [...(parsed.versions ?? [])],
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmpPath, path);
}
