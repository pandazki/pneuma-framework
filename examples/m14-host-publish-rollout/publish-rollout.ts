import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  FileReleaseRolloutStore,
  createReleaseInstance,
  markReleaseInstanceHealthy,
  promoteReleaseCandidate,
  rollbackActiveRelease,
  stageReleaseCandidate,
  summarizeReleaseRollout,
  type ReleaseInstance,
  type ReleaseRolloutState,
  type ReleaseRolloutSummary,
} from "@pneuma-framework/core";
import type {
  GeneratedAppProject,
  GeneratedAppVersion,
} from "../m12-reference-creation-host/types.js";
import {
  healthCheckPublishedRuntime,
  startPublishedRuntime,
  stopPublishedRuntime,
  type PublishedRuntimeHandle,
  type PublishedRuntimeHealth,
} from "./published-runtime.js";

export interface CreateHostPublishRolloutManagerInput {
  readonly workspace: string;
  readonly project: GeneratedAppProject;
  readonly versions: readonly GeneratedAppVersion[];
}

export interface HostPublishRolloutResult {
  readonly state: ReleaseRolloutState;
  readonly summary: ReleaseRolloutSummary;
  readonly health: PublishedRuntimeHealth;
  readonly active: ReleaseInstance;
}

export interface HostPublishRolloutManager {
  publishVersion(versionId: string): Promise<HostPublishRolloutResult>;
  restartActive(): Promise<HostPublishRolloutResult>;
  rollback(): Promise<HostPublishRolloutResult>;
  status(): Promise<{ state: ReleaseRolloutState; summary: ReleaseRolloutSummary }>;
  activeVersionId(): Promise<string | undefined>;
  activeRuntime(): PublishedRuntimeHandle | undefined;
  close(): Promise<void>;
}

export function createHostPublishRolloutManager(
  input: CreateHostPublishRolloutManagerInput,
): HostPublishRolloutManager {
  return new HostPublishRolloutManagerImpl(input);
}

class HostPublishRolloutManagerImpl implements HostPublishRolloutManager {
  private readonly store: FileReleaseRolloutStore;
  private readonly versionsById: Map<string, GeneratedAppVersion>;
  private readonly runtimesByVersionId = new Map<string, PublishedRuntimeHandle>();

  constructor(private readonly input: CreateHostPublishRolloutManagerInput) {
    this.versionsById = new Map(input.versions.map((version) => [version.version_id, version]));
    const appDir = join(input.workspace, "generated-apps", input.project.app_id);
    mkdirSync(appDir, { recursive: true });
    this.store = new FileReleaseRolloutStore({ workspace: appDir });
  }

  async publishVersion(versionId: string): Promise<HostPublishRolloutResult> {
    const version = this.requireVersion(versionId);
    const runtime = await this.ensureRuntime(version);
    const health = await healthCheckPublishedRuntime(runtime);
    if (!health.ok) throw new Error(`published runtime health failed for ${versionId}`);

    const candidate = markReleaseInstanceHealthy(
      createReleaseInstance({
        candidate_id: candidateId(this.input.project.app_id, version.version_id),
        image_tag: `${this.input.project.app_id}:${version.version_id}`,
        data_dir: join(version.app_workspace_dir, "data"),
        url: runtime.url,
        status: "healthy",
        checks: health.checks,
      }),
      { checks: health.checks },
    );

    const staged = stageReleaseCandidate(await this.store.load(), candidate, {
      reason: `publish ${version.version_id} from Creation Host`,
    });
    const promoted = promoteReleaseCandidate(staged, {
      reason: `promote ${version.version_id} as active Published Application`,
    });
    if (!promoted.ok) throw new Error(promoted.error);
    await this.store.save(promoted.state);
    return this.result(promoted.state, health);
  }

  async restartActive(): Promise<HostPublishRolloutResult> {
    const state = await this.store.load();
    const active = state.active;
    if (!active) throw new Error("active release is required before restart");
    const version = this.requireVersion(versionIdFromCandidate(active.candidate_id));
    const existing = this.runtimesByVersionId.get(version.version_id);
    if (existing) await stopPublishedRuntime(existing);
    this.runtimesByVersionId.delete(version.version_id);
    const runtime = await this.ensureRuntime(version);
    const health = await healthCheckPublishedRuntime(runtime);
    if (!health.ok) throw new Error(`restarted active runtime health failed for ${version.version_id}`);

    const restartedActive = markReleaseInstanceHealthy(
      {
        ...active,
        url: runtime.url,
        checks: health.checks,
        updated_at_ms: Date.now(),
      },
      { checks: health.checks },
    );
    const nextState: ReleaseRolloutState = {
      ...state,
      active: restartedActive,
      updated_at_ms: Date.now(),
    };
    await this.store.save(nextState);
    return this.result(nextState, health);
  }

  async rollback(): Promise<HostPublishRolloutResult> {
    const current = await this.store.load();
    if (!current.previous) throw new Error("previous release is required before rollback");
    const previousVersion = this.requireVersion(versionIdFromCandidate(current.previous.candidate_id));
    const runtime = await this.ensureRuntime(previousVersion);
    const health = await healthCheckPublishedRuntime(runtime);
    if (!health.ok) throw new Error(`rollback runtime health failed for ${previousVersion.version_id}`);
    const refreshedPrevious = markReleaseInstanceHealthy(
      {
        ...current.previous,
        url: runtime.url,
        checks: health.checks,
        updated_at_ms: Date.now(),
      },
      { checks: health.checks },
    );
    const rolledBack = rollbackActiveRelease({
      ...current,
      previous: refreshedPrevious,
    }, {
      reason: `rollback to ${previousVersion.version_id}`,
    });
    if (!rolledBack.ok) throw new Error(rolledBack.error);
    await this.store.save(rolledBack.state);
    return this.result(rolledBack.state, health);
  }

  async status(): Promise<{ state: ReleaseRolloutState; summary: ReleaseRolloutSummary }> {
    const state = await this.store.load();
    return { state, summary: summarizeReleaseRollout(state) };
  }

  async activeVersionId(): Promise<string | undefined> {
    const active = (await this.store.load()).active;
    return active ? versionIdFromCandidate(active.candidate_id) : undefined;
  }

  activeRuntime(): PublishedRuntimeHandle | undefined {
    return [...this.runtimesByVersionId.values()].find((runtime) => runtime.version_id === "v1")
      ?? [...this.runtimesByVersionId.values()][0];
  }

  async close(): Promise<void> {
    await Promise.all([...this.runtimesByVersionId.values()].map((runtime) => stopPublishedRuntime(runtime)));
    this.runtimesByVersionId.clear();
  }

  private async ensureRuntime(version: GeneratedAppVersion): Promise<PublishedRuntimeHandle> {
    const existing = this.runtimesByVersionId.get(version.version_id);
    if (existing && existing.proc.exitCode === null) return existing;
    const runtime = await startPublishedRuntime({
      project: this.input.project,
      version,
      port: 0,
    });
    this.runtimesByVersionId.set(version.version_id, runtime);
    return runtime;
  }

  private requireVersion(versionId: string): GeneratedAppVersion {
    const version = this.versionsById.get(versionId);
    if (!version) throw new Error(`unknown generated app version: ${this.input.project.app_id}@${versionId}`);
    return version;
  }

  private result(state: ReleaseRolloutState, health: PublishedRuntimeHealth): HostPublishRolloutResult {
    if (!state.active) throw new Error("rollout state missing active release");
    return {
      state,
      summary: summarizeReleaseRollout(state),
      health,
      active: state.active,
    };
  }
}

function candidateId(appId: string, versionId: string): string {
  return `${appId}-${versionId}`;
}

function versionIdFromCandidate(candidate: string): string {
  const match = candidate.match(/-(v[0-9]+)$/);
  if (!match) throw new Error(`candidate_id does not include version id: ${candidate}`);
  return match[1];
}
