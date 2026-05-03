import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { getStackProfile } from "./profiles.js";
import type {
  CreationSessionRecord,
  GeneratedAppProject,
  GeneratedAppVersion,
  HostState,
  StackProfileId,
} from "./types.js";

export interface HostStoreOptions {
  readonly workspace: string;
  readonly now?: () => number;
}

export interface CreateProjectInput {
  readonly app_id: string;
  readonly display_name: string;
  readonly profile_id: StackProfileId;
}

export interface RecordCreationSessionInput {
  readonly session_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly builder_user_id: string;
  readonly builder_request: string;
}

export interface HostStore {
  readonly workspace: string;
  readonly state_path: string;
  listProjects(): readonly GeneratedAppProject[];
  getProject(appId: string): GeneratedAppProject;
  listVersions(appId: string): readonly GeneratedAppVersion[];
  getVersion(appId: string, versionId: string): GeneratedAppVersion;
  listSessions(appId: string): readonly CreationSessionRecord[];
  createProject(input: CreateProjectInput): {
    readonly project: GeneratedAppProject;
    readonly version: GeneratedAppVersion;
  };
  recordCreationSession(input: RecordCreationSessionInput): CreationSessionRecord;
  readState(): HostState;
}

const EMPTY_STATE: HostState = {
  schema_version: 1,
  projects: [],
  versions: [],
  sessions: [],
};

export function createHostStore(options: HostStoreOptions): HostStore {
  const workspace = resolve(options.workspace);
  const hostDir = join(workspace, ".pneuma-host");
  const statePath = join(hostDir, "host-state.json");
  const now = options.now ?? (() => Date.now());

  mkdirSync(hostDir, { recursive: true });
  if (!existsSync(statePath)) {
    writeJson(statePath, EMPTY_STATE);
  }

  let state = readHostState(statePath);

  function save(next: HostState): void {
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

    listSessions(appId: string) {
      this.getProject(appId);
      return state.sessions.filter((session) => session.app_id === appId);
    },

    createProject(input: CreateProjectInput) {
      validateAppId(input.app_id);
      const displayName = input.display_name.trim();
      if (!displayName) throw new Error("display_name is required");
      getStackProfile(input.profile_id);
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
      mkdirSync(join(appDir, "sessions"), { recursive: true });

      const project: GeneratedAppProject = {
        app_id: input.app_id,
        display_name: displayName,
        profile_id: input.profile_id,
        created_at_ms: createdAtMs,
        current_version_id: "v0",
      };
      const version: GeneratedAppVersion = {
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
        sessions: state.sessions,
      });

      return { project, version };
    },

    recordCreationSession(input: RecordCreationSessionInput) {
      this.getVersion(input.app_id, input.version_id);
      if (!input.session_id.trim()) throw new Error("session_id is required");
      if (!input.builder_user_id.trim()) throw new Error("builder_user_id is required");
      if (!input.builder_request.trim()) throw new Error("builder_request is required");
      if (state.sessions.some((session) => session.session_id === input.session_id)) {
        throw new Error(`creation session already exists: ${input.session_id}`);
      }

      const session: CreationSessionRecord = {
        session_id: input.session_id,
        app_id: input.app_id,
        version_id: input.version_id,
        builder_user_id: input.builder_user_id,
        builder_request: input.builder_request,
        created_at_ms: now(),
      };
      writeJson(join(workspace, "generated-apps", input.app_id, "sessions", `${input.session_id}.json`), session);
      save({
        schema_version: 1,
        projects: state.projects,
        versions: state.versions,
        sessions: [...state.sessions, session],
      });
      return session;
    },

    readState() {
      return {
        schema_version: 1,
        projects: [...state.projects],
        versions: [...state.versions],
        sessions: [...state.sessions],
      };
    },
  };
}

function validateAppId(appId: string): void {
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(appId)) {
    throw new Error(`invalid app_id: ${appId}`);
  }
}

function readHostState(statePath: string): HostState {
  const parsed = JSON.parse(readFileSync(statePath, "utf8")) as HostState;
  if (parsed.schema_version !== 1) {
    throw new Error(`unsupported host state schema_version: ${String(parsed.schema_version)}`);
  }
  return {
    schema_version: 1,
    projects: [...(parsed.projects ?? [])],
    versions: [...(parsed.versions ?? [])],
    sessions: [...(parsed.sessions ?? [])],
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmpPath, path);
}
