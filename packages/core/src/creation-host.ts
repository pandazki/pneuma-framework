import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

export type CreationHostJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly CreationHostJsonValue[]
  | { readonly [key: string]: CreationHostJsonValue };

export type CreationHostJsonRecord = {
  readonly [key: string]: CreationHostJsonValue;
};

export interface CreationHostProfile {
  readonly id: string;
  readonly display_name: string;
  readonly description: string;
  readonly template_dir: string;
  readonly stack_id?: string;
  readonly capabilities?: readonly string[];
  readonly metadata?: CreationHostJsonRecord;
}

export interface CreationHostProject {
  readonly app_id: string;
  readonly display_name: string;
  readonly profile_id: string;
  readonly created_at_ms: number;
  readonly current_version_id: string;
}

export interface CreationHostVersion {
  readonly app_id: string;
  readonly version_id: string;
  readonly profile_id: string;
  readonly status: "previewable";
  readonly created_at_ms: number;
  readonly version_dir: string;
  readonly app_workspace_dir: string;
  readonly metadata?: CreationHostJsonRecord;
}

export interface CreationHostState {
  readonly schema_version: 1;
  readonly projects: readonly CreationHostProject[];
  readonly versions: readonly CreationHostVersion[];
}

export interface CreateCreationHostStoreOptions {
  readonly workspace: string;
  readonly profiles: readonly CreationHostProfile[];
  readonly now?: () => number;
}

export interface CreateCreationHostProjectInput {
  readonly app_id: string;
  readonly display_name: string;
  readonly profile_id: string;
}

export interface ForkCreationHostVersionInput {
  readonly app_id: string;
  readonly from_version_id: string;
  readonly to_version_id: string;
}

export interface CreationHostStore {
  readonly workspace: string;
  readonly state_path: string;
  listProfiles(): readonly CreationHostProfile[];
  getProfile(profileId: string): CreationHostProfile;
  listProjects(): readonly CreationHostProject[];
  getProject(appId: string): CreationHostProject;
  listVersions(appId: string): readonly CreationHostVersion[];
  getVersion(appId: string, versionId: string): CreationHostVersion;
  createProject(input: CreateCreationHostProjectInput): {
    readonly project: CreationHostProject;
    readonly version: CreationHostVersion;
  };
  forkVersion(input: ForkCreationHostVersionInput): CreationHostVersion;
  readState(): CreationHostState;
}

const EMPTY_STATE: CreationHostState = {
  schema_version: 1,
  projects: [],
  versions: [],
};

export function createCreationHostStore(
  options: CreateCreationHostStoreOptions,
): CreationHostStore {
  const workspace = resolve(options.workspace);
  const profiles = [...options.profiles];
  const hostDir = join(workspace, ".pneuma-host");
  const statePath = join(hostDir, "host-state.json");
  const now = options.now ?? (() => Date.now());

  mkdirSync(hostDir, { recursive: true });
  if (!existsSync(statePath)) writeJson(statePath, EMPTY_STATE);

  let state = readHostState(statePath);

  function save(next: CreationHostState): void {
    state = next;
    writeJson(statePath, state);
  }

  function requireProfile(profileId: string): CreationHostProfile {
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error(`unknown Creation Host profile: ${profileId}`);
    return profile;
  }

  function projectWithCurrentVersion(
    project: CreationHostProject,
    versionId: string,
  ): CreationHostProject {
    return { ...project, current_version_id: versionId };
  }

  return {
    workspace,
    state_path: statePath,

    listProfiles() {
      return [...profiles];
    },

    getProfile(profileId: string) {
      return requireProfile(profileId);
    },

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

    createProject(input: CreateCreationHostProjectInput) {
      validateAppId(input.app_id);
      const displayName = input.display_name.trim();
      if (!displayName) throw new Error("display_name is required");
      requireProfile(input.profile_id);
      if (state.projects.some((project) => project.app_id === input.app_id)) {
        throw new Error(`generated app already exists: ${input.app_id}`);
      }

      const createdAtMs = now();
      const version = buildVersion({
        workspace,
        appId: input.app_id,
        versionId: "v0",
        profileId: input.profile_id,
        createdAtMs,
      });
      mkdirSync(join(version.app_workspace_dir, "data"), { recursive: true });

      const project: CreationHostProject = {
        app_id: input.app_id,
        display_name: displayName,
        profile_id: input.profile_id,
        created_at_ms: createdAtMs,
        current_version_id: "v0",
      };

      writeJson(join(workspace, "generated-apps", input.app_id, "project.json"), project);
      writeJson(join(version.version_dir, "version.json"), version);
      save({
        schema_version: 1,
        projects: [...state.projects, project],
        versions: [...state.versions, version],
      });

      return { project, version };
    },

    forkVersion(input: ForkCreationHostVersionInput) {
      validateVersionId(input.to_version_id);
      const project = this.getProject(input.app_id);
      const from = this.getVersion(input.app_id, input.from_version_id);
      if (state.versions.some((version) =>
        version.app_id === input.app_id && version.version_id === input.to_version_id
      )) {
        throw new Error(`generated app version already exists: ${input.app_id}@${input.to_version_id}`);
      }

      const forked = buildVersion({
        workspace,
        appId: input.app_id,
        versionId: input.to_version_id,
        profileId: from.profile_id,
        createdAtMs: now(),
      });
      cpSync(from.version_dir, forked.version_dir, { recursive: true });
      writeJson(join(forked.version_dir, "version.json"), forked);

      const nextProject = projectWithCurrentVersion(project, forked.version_id);
      writeJson(join(workspace, "generated-apps", input.app_id, "project.json"), nextProject);
      save({
        schema_version: 1,
        projects: state.projects.map((candidate) =>
          candidate.app_id === input.app_id ? nextProject : candidate
        ),
        versions: [...state.versions, forked],
      });
      return forked;
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

function buildVersion(input: {
  readonly workspace: string;
  readonly appId: string;
  readonly versionId: string;
  readonly profileId: string;
  readonly createdAtMs: number;
}): CreationHostVersion {
  const versionDir = join(input.workspace, "generated-apps", input.appId, "versions", input.versionId);
  const appWorkspaceDir = join(versionDir, "workspace");
  return {
    app_id: input.appId,
    version_id: input.versionId,
    profile_id: input.profileId,
    status: "previewable",
    created_at_ms: input.createdAtMs,
    version_dir: versionDir,
    app_workspace_dir: appWorkspaceDir,
  };
}

function validateAppId(appId: string): void {
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(appId)) {
    throw new Error(`invalid app_id: ${appId}`);
  }
}

function validateVersionId(versionId: string): void {
  if (!/^v[0-9]+$/.test(versionId)) {
    throw new Error(`invalid version_id: ${versionId}`);
  }
}

function readHostState(statePath: string): CreationHostState {
  const parsed = JSON.parse(readFileSync(statePath, "utf8")) as CreationHostState;
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
