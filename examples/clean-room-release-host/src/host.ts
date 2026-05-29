import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { copyTree, linkDependencies, type TreeDiff } from "./workspace";
import {
  buildGovernedProposal,
  GovernedProposalRejected,
  type ObservationEvidence,
} from "@pneuma-framework/host-kit/governed-change";
import { runCommand, startBunRuntime, waitForHealth, type RuntimeHandle } from "./run";
import {
  inspectNeonSchema,
  readClientBundleManifest,
  type BundleManifest,
  type DbSchemaSnapshot,
} from "./observe";
import { runDeterministicAgent, DETERMINISTIC_REQUEST } from "./agents/deterministic";
import { isCodexTurnCompletionTimeout, runCodexAgent } from "./agents/codex";
import { NeonBranchClient, parseNeonDbRole } from "./neon-branch";

// ---------------------------------------------------------------------------
// Creation Host harness for the Release Operations Board profile.
//
// Lifecycle: create-from-profile → preview/publish v0 → code-agent draft →
// scaffold verify gate → proposal → approve/apply vNext → publish (local Bun or
// Vercel) → rollback. The Host records the app contract signature, the packaged
// client bundle, and the Neon schema so each evolution's effect is visible.
// ---------------------------------------------------------------------------

export type AgentKind = "deterministic" | "codex-app-server";
export type DeployTarget = "local" | "vercel";

export interface VersionMeta {
  versionId: string;
  appSchemaSignature: string;
  bundle: BundleManifest;
  appliedAt: string;
  changedPaths: string[];
  request: string | null;
}

export interface ProjectState {
  id: string;
  profileId: string;
  displayName: string;
  versions: string[];
  activeVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Proposal {
  draftId: string;
  projectId: string;
  agent: AgentKind;
  request: string;
  status: "ready";
  changedPaths: string[];
  diff: TreeDiff;
  verifyTail: string;
  appSchemaSignatureBefore: string;
  appSchemaSignatureAfter: string;
  bundleBefore: BundleManifest;
  bundleAfter: BundleManifest;
  agentNote: string;
}

export type PreviewTarget = "active" | "draft";
export type PreviewData = "memory" | "neon-branch";

export interface PreviewHandle {
  url: string;
  persistence: "memory" | "neon";
  target: PreviewTarget;
  versionId: string;
  data: PreviewData;
  branchId?: string;
}

export interface PublishReceipt {
  target: DeployTarget;
  versionId: string;
  url: string;
  persistence: "neon";
  dbSchema: DbSchemaSnapshot;
  migrateTail: string;
  deploymentId?: string;
  files?: number;
}

const CODEX_BASE_INSTRUCTIONS = [
  "You are evolving a Bun + Hono + React + Drizzle + Zod release-operations app inside a draft workspace.",
  "Only edit product source under src/shared, src/server/app.ts, src/server/repository.ts, src/db/schema.ts, src/db/neon-repository.ts, src/client, drizzle, and test.",
  "NEVER edit api/, Dockerfile, vercel.json, package.json, tsconfig.json, vite.config.ts, src/db/client.ts, src/db/migrate.ts, src/profile, or any .env file.",
  "When you change the data model, update the Zod contract in src/shared/contracts.ts, the Drizzle schema in src/db/schema.ts, add a new idempotent drizzle/*.sql migration (ALTER TABLE ... ADD COLUMN IF NOT EXISTS in the release_board schema), and update both repositories.",
  "The change must keep `bun run verify` passing. A Vite Node-version warning that still exits 0 is harmless environment noise; do not chase it.",
].join("\n");

export interface ReleaseHostOptions {
  scaffoldDir: string;
  workDir: string;
  databaseUrl?: string;
  vercel?: { token: string; project: string; teamId?: string };
  neon?: { apiKey: string; projectId?: string };
  codexModel?: string;
  log?: (line: string) => void;
}

export class ReleaseHost {
  private projects = new Map<string, ProjectState>();
  private versionMeta = new Map<string, VersionMeta>();
  private proposals = new Map<string, Proposal>();
  private previews = new Map<string, { handle: RuntimeHandle; branchId?: string }>();
  private published = new Map<string, { handle?: RuntimeHandle; receipt: PublishReceipt }>();
  private counter = 0;
  private log: (line: string) => void;

  constructor(private readonly opts: ReleaseHostOptions) {
    this.log = opts.log ?? (() => {});
    mkdirSync(this.opts.workDir, { recursive: true });
  }

  // --- paths ---------------------------------------------------------------
  private projectDir(id: string): string {
    return join(this.opts.workDir, "projects", id);
  }
  private versionDir(id: string, v: string): string {
    return join(this.projectDir(id), "versions", v);
  }
  private sourceDir(id: string): string {
    return join(this.projectDir(id), "source");
  }
  private get scaffoldNodeModules(): string {
    return join(this.opts.scaffoldDir, "node_modules");
  }
  private metaKey(id: string, v: string): string {
    return `${id}/${v}`;
  }

  // --- helpers -------------------------------------------------------------
  private async readAppSchemaSignature(root: string): Promise<string> {
    const res = await runCommand(
      ["bun", "-e", 'const m = await import("./src/shared/contracts.ts"); console.log(m.schemaSignature())'],
      root,
      30_000,
    );
    const line = res.output.split("\n").map((l) => l.trim()).find((l) => l.startsWith("release_items("));
    return line ?? `(unknown: ${res.output.slice(0, 80)})`;
  }

  private async buildAndSnapshot(
    versionId: string,
    root: string,
    changedPaths: string[],
    request: string | null,
  ): Promise<VersionMeta> {
    const build = await runCommand(["bun", "run", "build"], root, 120_000);
    if (build.code !== 0) throw new Error(`build failed for ${versionId}:\n${build.output.slice(-2000)}`);
    const meta: VersionMeta = {
      versionId,
      appSchemaSignature: await this.readAppSchemaSignature(root),
      bundle: readClientBundleManifest(root),
      appliedAt: new Date().toISOString(),
      changedPaths,
      request,
    };
    return meta;
  }

  private persist(state: ProjectState): void {
    state.updatedAt = new Date().toISOString();
    this.projects.set(state.id, state);
    writeFileSync(join(this.projectDir(state.id), "state.json"), JSON.stringify(state, null, 2));
  }

  // --- lifecycle -----------------------------------------------------------
  async createProject(displayName = "Release Operations Board"): Promise<ProjectState> {
    this.counter += 1;
    const id = `rob-${this.counter}`;
    const source = this.sourceDir(id);
    copyTree(this.opts.scaffoldDir, source);
    linkDependencies(source, this.scaffoldNodeModules);

    const v0 = this.versionDir(id, "v0");
    copyTree(source, v0);
    linkDependencies(v0, this.scaffoldNodeModules);

    const state: ProjectState = {
      id,
      profileId: "clean-room-release-board",
      displayName,
      versions: ["v0"],
      activeVersionId: "v0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mkdirSync(this.projectDir(id), { recursive: true });
    this.persist(state);

    const meta = await this.buildAndSnapshot("v0", v0, [], null);
    this.versionMeta.set(this.metaKey(id, "v0"), meta);
    this.log(`created ${id}: v0 ${meta.appSchemaSignature} bundle=${meta.bundle.signature}`);
    return state;
  }

  listProjects(): ProjectState[] {
    return [...this.projects.values()];
  }
  getProject(id: string): ProjectState | undefined {
    return this.projects.get(id);
  }
  getVersionMeta(id: string, v: string): VersionMeta | undefined {
    return this.versionMeta.get(this.metaKey(id, v));
  }
  getProposal(id: string): Proposal | undefined {
    return this.proposals.get(id);
  }

  private requireProject(id: string): ProjectState {
    const state = this.projects.get(id);
    if (!state) throw new Error(`unknown project ${id}`);
    return state;
  }

  // --- preview (disposable, in-memory) -------------------------------------
  async startPreview(
    id: string,
    target: PreviewTarget = "active",
    data: PreviewData = "memory",
  ): Promise<PreviewHandle> {
    const state = this.requireProject(id);
    await this.stopPreview(id);
    let root: string;
    let versionId: string;
    if (target === "draft") {
      const pending = this.proposals.get(id);
      if (!pending) throw new Error("no pending proposal to preview");
      root = join(this.projectDir(id), "drafts", pending.draftId);
      versionId = "draft";
    } else {
      versionId = state.activeVersionId;
      root = this.versionDir(id, versionId);
    }

    // Preview Data Rehearsal: clone real data into an isolated Neon branch, run
    // the draft's migration against it, and point the preview at the branch.
    if (data === "neon-branch") {
      if (!this.opts.neon || !this.opts.databaseUrl) {
        throw new Error("Neon branch preview needs NEON_API_KEY and DATABASE_URL");
      }
      const { databaseName, roleName } = parseNeonDbRole(this.opts.databaseUrl);
      const client = new NeonBranchClient({
        apiKey: this.opts.neon.apiKey,
        projectId: this.opts.neon.projectId,
        databaseName,
        roleName,
        log: this.log,
      });
      const branch = await client.createBranch(`rehearsal-${id}-${versionId}-${Date.now()}`);
      try {
        const migrate = await runCommand(["bun", "run", "db:migrate"], root, 120_000, {
          ...process.env,
          DATABASE_URL: branch.connectionUri,
        });
        if (migrate.code !== 0) {
          throw new Error(`rehearsal migration failed:\n${migrate.output.slice(-1500)}`);
        }
        const handle = await startBunRuntime(root, {
          ...process.env,
          DATABASE_URL: branch.connectionUri,
        });
        this.previews.set(id, { handle, branchId: branch.branchId });
        this.log(`preview ${id} ${target}:${versionId} at ${handle.url} (neon branch ${branch.branchId})`);
        return {
          url: handle.url,
          persistence: "neon",
          target,
          versionId,
          data,
          branchId: branch.branchId,
        };
      } catch (err) {
        await client.deleteBranch(branch.branchId);
        throw err;
      }
    }

    const handle = await startBunRuntime(root, { ...process.env, DATABASE_URL: undefined });
    this.previews.set(id, { handle });
    this.log(`preview ${id} ${target}:${versionId} at ${handle.url} (memory)`);
    return { url: handle.url, persistence: "memory", target, versionId, data: "memory" };
  }

  async stopPreview(id: string): Promise<void> {
    const existing = this.previews.get(id);
    if (existing) {
      await existing.handle.stop();
      this.previews.delete(id);
      if (existing.branchId && this.opts.neon && this.opts.databaseUrl) {
        const { databaseName, roleName } = parseNeonDbRole(this.opts.databaseUrl);
        const client = new NeonBranchClient({
          apiKey: this.opts.neon.apiKey,
          projectId: this.opts.neon.projectId,
          databaseName,
          roleName,
          log: this.log,
        });
        await client.deleteBranch(existing.branchId);
      }
    }
  }

  // --- code-agent draft + verify gate --------------------------------------
  async runAgent(id: string, params: { request?: string; agent: AgentKind }): Promise<Proposal> {
    const state = this.requireProject(id);
    const activeRoot = this.versionDir(id, state.activeVersionId);
    // Iterate on an un-applied proposal: a follow-up turn starts from the
    // pending draft so fixes/additions stack, instead of restarting from the
    // active version and discarding the pending work.
    const pending = this.proposals.get(id);
    const pendingDraftRoot = pending
      ? join(this.projectDir(id), "drafts", pending.draftId)
      : null;
    const baseRoot = pendingDraftRoot && existsSync(pendingDraftRoot) ? pendingDraftRoot : activeRoot;
    const iterating = baseRoot !== activeRoot;
    const draftId = `draft-${this.metaKey(id, state.activeVersionId)}-${this.counter}-${Date.now()}`.replace(/[^\w.-]/g, "_");
    const draftRoot = join(this.projectDir(id), "drafts", draftId);
    copyTree(baseRoot, draftRoot);
    linkDependencies(draftRoot, this.scaffoldNodeModules);

    const request = params.request?.trim() || DETERMINISTIC_REQUEST;

    // Reuse the active version's recorded evidence as the "before" baseline so
    // the framework backbone need not re-build/boot the active version.
    const beforeMeta = this.getVersionMeta(id, state.activeVersionId);
    const beforeEvidence: ObservationEvidence | undefined = beforeMeta
      ? {
          appSchemaSignature: beforeMeta.appSchemaSignature,
          bundleSignature: beforeMeta.bundle.signature,
          bundleBytes: beforeMeta.bundle.totalBytes,
          extra: { bundle: beforeMeta.bundle },
        }
      : undefined;

    // The Host supplies every effect as a closure; the framework's
    // buildGovernedProposal owns the sequencing + fail-closed gating.
    const observe = async (root: string): Promise<ObservationEvidence> => {
      const bundle = readClientBundleManifest(root);
      return {
        appSchemaSignature: await this.readAppSchemaSignature(root),
        bundleSignature: bundle.signature,
        bundleBytes: bundle.totalBytes,
        extra: { bundle },
      };
    };

    const verify = async (root: string): Promise<{ ok: boolean; output: string }> => {
      const result = await runCommand(["bun", "run", "verify"], root, 180_000);
      if (result.code !== 0) return { ok: false, output: result.output };
      // runtime evidence: the draft boots and serves items
      const runtime = await startBunRuntime(root, { ...process.env, DATABASE_URL: undefined });
      try {
        const items = await fetch(`${runtime.url}/api/items`);
        if (!items.ok) {
          return { ok: false, output: `${result.output}\nruntime evidence: /api/items returned ${items.status}` };
        }
      } finally {
        await runtime.stop();
      }
      return { ok: true, output: result.output };
    };

    const runAgentTurn = async (root: string): Promise<{ note: string }> => {
      if (params.agent === "deterministic") {
        const changed = runDeterministicAgent(root);
        return { note: `deterministic lane edited ${changed.length} files` };
      }
      await runCodexAgent({
        draftRoot: root,
        prompt: request,
        baseInstructions: CODEX_BASE_INSTRUCTIONS,
        model: this.opts.codexModel,
        log: this.log,
      });
      return { note: "codex turn completed" };
    };

    let gp;
    try {
      gp = await buildGovernedProposal({
        draftId,
        activeRoot,
        draftRoot,
        protectedRoots: this.protectedRoots(),
        iterated: iterating,
        beforeEvidence,
        runAgent: runAgentTurn,
        isAgentTimeout: isCodexTurnCompletionTimeout,
        verify,
        observe,
      });
    } catch (err) {
      rmSync(draftRoot, { recursive: true, force: true });
      if (err instanceof GovernedProposalRejected) {
        throw new Error(`${err.message}${err.detail ? `\n${err.detail}` : ""}`);
      }
      throw err;
    }

    const beforeBundle =
      (gp.before.extra?.bundle as BundleManifest | undefined) ??
      ({ files: [], totalBytes: 0, signature: "(none)" } satisfies BundleManifest);
    const afterBundle =
      (gp.after.extra?.bundle as BundleManifest | undefined) ?? readClientBundleManifest(draftRoot);
    const proposal: Proposal = {
      draftId,
      projectId: id,
      agent: params.agent,
      request,
      status: "ready",
      changedPaths: gp.changedPaths,
      diff: gp.diff,
      verifyTail: gp.verifyTail,
      appSchemaSignatureBefore: gp.before.appSchemaSignature,
      appSchemaSignatureAfter: gp.after.appSchemaSignature,
      bundleBefore: beforeBundle,
      bundleAfter: afterBundle,
      agentNote: gp.iterated ? `${gp.agentNote} (refined the pending proposal)` : gp.agentNote,
    };
    // Replace the previous pending proposal and drop its now-superseded draft.
    if (iterating && pendingDraftRoot) rmSync(pendingDraftRoot, { recursive: true, force: true });
    this.proposals.set(id, proposal);
    this.log(
      `proposal ${id}${iterating ? " (iterated)" : ""}: ${gp.changedPaths.length} paths, schema ${proposal.appSchemaSignatureBefore} -> ${proposal.appSchemaSignatureAfter}`,
    );
    return proposal;
  }

  private protectedRoots(): string[] {
    // Read from the scaffold's profile so the Host honours the Developer's
    // contract rather than hard-coding it. Parse the protectedRoots array only.
    const profilePath = join(this.opts.scaffoldDir, "src", "profile", "stack-profile.ts");
    const src = readFileSync(profilePath, "utf8");
    const start = src.indexOf("protectedRoots");
    const block = src.slice(start, start + src.slice(start).indexOf("]"));
    return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string).filter(Boolean);
  }

  // --- approve + apply -----------------------------------------------------
  async approve(id: string): Promise<VersionMeta> {
    const state = this.requireProject(id);
    const proposal = this.proposals.get(id);
    if (!proposal) throw new Error("no proposal to approve");
    const n = state.versions.length;
    const newVersion = `v${n}`;
    const draftRoot = join(this.projectDir(id), "drafts", proposal.draftId);
    const versionRoot = this.versionDir(id, newVersion);
    copyTree(draftRoot, versionRoot);
    linkDependencies(versionRoot, this.scaffoldNodeModules);
    copyTree(versionRoot, this.sourceDir(id));
    linkDependencies(this.sourceDir(id), this.scaffoldNodeModules);

    state.versions.push(newVersion);
    state.activeVersionId = newVersion;
    this.persist(state);

    const meta = await this.buildAndSnapshot(newVersion, versionRoot, proposal.changedPaths, proposal.request);
    this.versionMeta.set(this.metaKey(id, newVersion), meta);
    this.proposals.delete(id);
    rmSync(draftRoot, { recursive: true, force: true });
    // A running preview now points at the previous version's runtime; stop it so
    // the UI doesn't keep showing a stale preview after the apply.
    await this.stopPreview(id);
    this.log(`applied ${id} ${newVersion}: schema ${meta.appSchemaSignature} bundle=${meta.bundle.signature}`);
    return meta;
  }

  // --- publish (local Bun or Vercel) ---------------------------------------
  async publish(id: string, target: DeployTarget): Promise<PublishReceipt> {
    const state = this.requireProject(id);
    if (!this.opts.databaseUrl) throw new Error("DATABASE_URL is required to publish");
    const versionId = state.activeVersionId;
    const root = this.versionDir(id, versionId);
    linkDependencies(root, this.scaffoldNodeModules);

    // Migrate Neon first so the published schema matches the version.
    const migrate = await runCommand(["bun", "run", "db:migrate"], root, 120_000, {
      ...process.env,
      DATABASE_URL: this.opts.databaseUrl,
    });
    if (migrate.code !== 0) throw new Error(`publish migration failed:\n${migrate.output.slice(-2000)}`);
    const dbSchema = await inspectNeonSchema(this.opts.databaseUrl);

    await this.stopPublished(id);

    if (target === "vercel") {
      if (!this.opts.vercel) throw new Error("Vercel is not configured (VERCEL_TOKEN)");
      const { deployToVercel } = await import("./vercel-deploy");
      const receipt = await deployToVercel({
        root,
        token: this.opts.vercel.token,
        project: this.opts.vercel.project,
        teamId: this.opts.vercel.teamId,
        databaseUrl: this.opts.databaseUrl,
        meta: { projectId: id, version: versionId },
        log: this.log,
      });
      const healthy = await waitForHealth(`${receipt.url}/api/health`, 60_000);
      if (!healthy) throw new Error(`published Vercel url not healthy: ${receipt.url}`);
      const items = await fetch(`${receipt.url}/api/items`);
      if (!items.ok) throw new Error(`published /api/items returned ${items.status}`);
      const pub: PublishReceipt = {
        target: "vercel",
        versionId,
        url: receipt.url,
        persistence: "neon",
        dbSchema,
        migrateTail: migrate.output.slice(-600),
        deploymentId: receipt.deploymentId,
        files: receipt.files,
      };
      this.published.set(id, { receipt: pub });
      return pub;
    }

    // local Bun published runtime, backed by Neon
    const build = await runCommand(["bun", "run", "build"], root, 120_000);
    if (build.code !== 0) throw new Error(`publish build failed:\n${build.output.slice(-2000)}`);
    const handle = await startBunRuntime(root, { ...process.env, DATABASE_URL: this.opts.databaseUrl });
    const pub: PublishReceipt = {
      target: "local",
      versionId,
      url: handle.url,
      persistence: "neon",
      dbSchema,
      migrateTail: migrate.output.slice(-600),
    };
    this.published.set(id, { handle, receipt: pub });
    this.log(`published ${id} ${versionId} at ${handle.url} (neon, ${dbSchema.columns.length} columns)`);
    return pub;
  }

  getPublished(id: string): PublishReceipt | undefined {
    return this.published.get(id)?.receipt;
  }

  async stopPublished(id: string): Promise<void> {
    const existing = this.published.get(id);
    if (existing?.handle) {
      await existing.handle.stop();
    }
    this.published.delete(id);
  }

  // --- rollback ------------------------------------------------------------
  async rollback(id: string): Promise<ProjectState> {
    const state = this.requireProject(id);
    const idx = state.versions.indexOf(state.activeVersionId);
    if (idx <= 0) throw new Error("no earlier version to roll back to");
    const target = state.versions[idx - 1] as string;
    copyTree(this.versionDir(id, target), this.sourceDir(id));
    linkDependencies(this.sourceDir(id), this.scaffoldNodeModules);
    state.activeVersionId = target;
    this.persist(state);
    await this.stopPreview(id);
    this.log(`rolled back ${id} to ${target}`);
    return state;
  }

  // --- teardown (tests) ----------------------------------------------------
  async shutdown(): Promise<void> {
    for (const id of [...this.previews.keys()]) await this.stopPreview(id);
    for (const id of [...this.published.keys()]) await this.stopPublished(id);
  }
}
