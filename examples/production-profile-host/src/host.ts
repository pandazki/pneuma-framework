import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { productionGeneratedAppProfile } from "../../production-generated-app-profile/src/profile/stack-profile";
import {
  isCodexTurnCompletionTimeout,
  runCodexAppServerProductionAgent,
  type ProductionCodeAgentLogEntry,
} from "./production-codex-agent";
import { deployVercelProductionFromRoot, type VercelApiDeployReceipt } from "./vercel-api-deploy";

export interface ProductionHostProject {
  readonly app_id: string;
  readonly title: string;
  readonly source_root: string;
  readonly draft_root: string;
  readonly has_draft: boolean;
  readonly versions_root: string;
  readonly active_version_id: string;
  readonly proposal?: ProductionChangeProposal;
}

export interface ProductionChangeProposal {
  readonly proposal_id: string;
  readonly app_id: string;
  readonly builder_request: string;
  readonly changed_paths: readonly string[];
  readonly verification: ProductionDraftVerification;
  readonly summary: string;
}

export type ProductionDraftVerification =
  | {
      readonly ok: true;
      readonly changed_paths: readonly string[];
      readonly output: string;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "no_change"
        | "protected_file_changed"
        | "verify_failed"
        | "missing_runtime_evidence";
      readonly message: string;
      readonly changed_paths: readonly string[];
      readonly output?: string;
    };

export interface DeterministicProductionAgentResult {
  readonly changed_paths: readonly string[];
  readonly summary: string;
}

const ignoredCopyNames = new Set(["node_modules", "dist", ".env", ".env.local", ".vercel"]);

export class ProductionProfileHost {
  readonly workspace_root: string;
  readonly scaffold_root: string;
  readonly published_database_url?: string;
  readonly vercel?: {
    readonly token: string;
    readonly project_name: string;
    readonly team_id?: string;
  };

  constructor(input: {
    readonly workspace_root: string;
    readonly scaffold_root?: string;
    readonly published_database_url?: string;
    readonly vercel?: {
      readonly token: string;
      readonly project_name: string;
      readonly team_id?: string;
    };
  }) {
    this.workspace_root = resolve(input.workspace_root);
    this.scaffold_root = resolve(input.scaffold_root ?? join(import.meta.dir, "..", "..", "production-generated-app-profile"));
    this.published_database_url = input.published_database_url;
    this.vercel = input.vercel;
    mkdirSync(this.workspace_root, { recursive: true });
  }

  createProject(input: { readonly app_id: string; readonly title: string }): ProductionHostProject {
    const projectRoot = this.projectRoot(input.app_id);
    const sourceRoot = join(projectRoot, "source");
    const versionsRoot = join(projectRoot, "versions");
    rmSync(projectRoot, { recursive: true, force: true });
    mkdirSync(versionsRoot, { recursive: true });
    copyDirectory(this.scaffold_root, sourceRoot);
    this.writeProjectManifest(input.app_id, {
      app_id: input.app_id,
      title: input.title,
      active_version_id: "v0",
      proposal: undefined,
    });
    copyDirectory(sourceRoot, join(versionsRoot, "v0"));
    return this.project(input.app_id);
  }

  project(appId: string): ProductionHostProject {
    const manifest = JSON.parse(readFileSync(this.projectManifestPath(appId), "utf8")) as {
      app_id: string;
      title: string;
      active_version_id: string;
      proposal?: ProductionChangeProposal;
    };
    return {
      app_id: manifest.app_id,
      title: manifest.title,
      source_root: this.sourceRoot(appId),
      draft_root: this.draftRoot(appId),
      has_draft: existsSync(this.draftRoot(appId)),
      versions_root: this.versionsRoot(appId),
      active_version_id: manifest.active_version_id,
      proposal: manifest.proposal,
    };
  }

  prepareDraft(appId: string): ProductionHostProject {
    const source = this.sourceRoot(appId);
    const draft = this.draftRoot(appId);
    rmSync(draft, { recursive: true, force: true });
    copyDirectory(source, draft);
    return this.project(appId);
  }

  async runDeterministicAgent(input: {
    readonly app_id: string;
    readonly builder_request: string;
  }): Promise<DeterministicProductionAgentResult> {
    const project = this.project(input.app_id);
    if (!existsSync(project.draft_root)) this.prepareDraft(input.app_id);
    applyEnvironmentLanePatch(project.draft_root);
    return {
      changed_paths: changedPaths(project.source_root, project.draft_root),
      summary: "Added release environment as a first-class runtime field across API, seed data, and UI.",
    };
  }

  async runCodexAppServerAgent(input: {
    readonly app_id: string;
    readonly builder_request: string;
    readonly model?: string;
    readonly append_log?: (entry: ProductionCodeAgentLogEntry, options?: { readonly merge_with_previous?: boolean }) => void;
  }): Promise<DeterministicProductionAgentResult> {
    const project = this.project(input.app_id);
    if (!existsSync(project.draft_root)) this.prepareDraft(input.app_id);
    ensureLinkedDependencies(project.draft_root);
    try {
      await runCodexAppServerProductionAgent({
        draft_root: project.draft_root,
        builder_request: input.builder_request,
        model: input.model,
        append_log: input.append_log,
      });
    } catch (err) {
      if (!isCodexTurnCompletionTimeout(err)) throw err;
      input.append_log?.({
        kind: "warning",
        text: "Codex turn completion timed out. The Host will verify the draft workspace and continue only if generated-app checks pass.",
      });
    }
    return {
      changed_paths: changedPaths(project.source_root, project.draft_root),
      summary: "Codex app-server edited the production scaffold draft.",
    };
  }

  async buildProposal(input: {
    readonly app_id: string;
    readonly builder_request: string;
  }): Promise<ProductionChangeProposal> {
    const project = this.project(input.app_id);
    const verification = await verifyProductionDraft({
      source_root: project.source_root,
      draft_root: project.draft_root,
    });
    if (!verification.ok) {
      throw new Error(`Draft is not proposal-ready: ${verification.reason}: ${verification.message}`);
    }
    const proposal: ProductionChangeProposal = {
      proposal_id: `proposal-${Date.now().toString(36)}`,
      app_id: input.app_id,
      builder_request: input.builder_request,
      changed_paths: verification.changed_paths,
      verification,
      summary: "Add release environment tracking to the production scaffold.",
    };
    this.updateManifest(input.app_id, { proposal });
    return proposal;
  }

  approveAndApply(input: {
    readonly app_id: string;
    readonly proposal_id: string;
  }): ProductionHostProject {
    const project = this.project(input.app_id);
    if (!project.proposal || project.proposal.proposal_id !== input.proposal_id) {
      throw new Error(`No pending proposal ${input.proposal_id}`);
    }
    const nextVersion = nextVersionId(project.active_version_id);
    rmSync(project.source_root, { recursive: true, force: true });
    copyDirectory(project.draft_root, project.source_root);
    copyDirectory(project.source_root, join(project.versions_root, nextVersion));
    rmSync(project.draft_root, { recursive: true, force: true });
    this.updateManifest(input.app_id, {
      active_version_id: nextVersion,
      proposal: undefined,
    });
    return this.project(input.app_id);
  }

  async startDraftPreview(input: {
    readonly app_id: string;
    readonly port: number;
  }): Promise<PublishedRuntimeHandle> {
    const project = this.project(input.app_id);
    if (!existsSync(project.draft_root)) throw new Error(`Project ${input.app_id} has no draft workspace.`);
    return startEphemeralRuntimeFromRoot(project.draft_root, this.previewRoot(input.app_id, `draft-${input.port}`), input.port);
  }

  async startActiveVersionPreview(input: {
    readonly app_id: string;
    readonly port: number;
  }): Promise<PublishedRuntimeHandle> {
    const project = this.project(input.app_id);
    const versionRoot = join(project.versions_root, project.active_version_id);
    return startEphemeralRuntimeFromRoot(versionRoot, this.previewRoot(input.app_id, `${project.active_version_id}-${input.port}`), input.port);
  }

  async startPublishedRuntime(input: {
    readonly app_id: string;
    readonly port: number;
  }): Promise<PublishedRuntimeHandle> {
    const project = this.project(input.app_id);
    const versionRoot = join(project.versions_root, project.active_version_id);
    return startEphemeralRuntimeFromRoot(versionRoot, this.runtimeRoot(input.app_id, `${project.active_version_id}-${input.port}`), input.port, {
      env: this.published_database_url
        ? {
          DATABASE_URL: this.published_database_url,
          PNEUMA_SEED_DEMO_DATA: "1",
        }
        : undefined,
    });
  }

  async deployPublishedRuntimeToVercel(input: {
    readonly app_id: string;
    readonly append_log?: (entry: ProductionCodeAgentLogEntry) => void;
  }): Promise<PublishedRuntimeHandle> {
    if (!this.vercel) throw new Error("Vercel deployment is not configured.");
    if (!this.published_database_url) throw new Error("Vercel deployment requires PNEUMA_PRODUCTION_PROFILE_DATABASE_URL.");
    const project = this.project(input.app_id);
    const versionRoot = join(project.versions_root, project.active_version_id);
    ensureLinkedDependencies(versionRoot);
    const migrate = await runCommand(["bun", "run", "db:migrate"], versionRoot, 120_000, {
      ...process.env,
      DATABASE_URL: this.published_database_url,
    });
    if (migrate.code !== 0) {
      throw new Error(`Vercel publish migration failed before deploy:\n${migrate.output}`);
    }
    input.append_log?.({ kind: "session", text: "Database migration completed against Neon before Vercel deployment." });
    const receipt = await deployVercelProductionFromRoot({
      root: versionRoot,
      token: this.vercel.token,
      project_name: this.vercel.project_name,
      team_id: this.vercel.team_id,
      meta: {
        app_id: input.app_id,
        version_id: project.active_version_id,
      },
      on_log: (message) => input.append_log?.({ kind: "session", text: message }),
    });
    await verifyPublishedDeployment(receipt);
    input.append_log?.({ kind: "session", text: `Vercel production deployment is ready: ${receipt.url}` });
    return {
      kind: "vercel",
      url: receipt.url,
      receipt,
      stop: async () => {
        // Cloud deployments are immutable. A later publish supersedes this URL.
      },
    };
  }

  rollback(input: { readonly app_id: string }): ProductionHostProject {
    const project = this.project(input.app_id);
    const previous = previousVersionId(project.active_version_id);
    if (!previous || !existsSync(join(project.versions_root, previous))) {
      throw new Error(`Project ${input.app_id} has no previous version to roll back to.`);
    }
    rmSync(project.source_root, { recursive: true, force: true });
    copyDirectory(join(project.versions_root, previous), project.source_root);
    this.updateManifest(input.app_id, {
      active_version_id: previous,
      proposal: undefined,
    });
    rmSync(project.draft_root, { recursive: true, force: true });
    return this.project(input.app_id);
  }

  private projectRoot(appId: string): string {
    return join(this.workspace_root, appId);
  }

  private sourceRoot(appId: string): string {
    return join(this.projectRoot(appId), "source");
  }

  private draftRoot(appId: string): string {
    return join(this.projectRoot(appId), "draft");
  }

  private versionsRoot(appId: string): string {
    return join(this.projectRoot(appId), "versions");
  }

  private previewRoot(appId: string, previewId: string): string {
    return join(this.projectRoot(appId), "previews", previewId);
  }

  private runtimeRoot(appId: string, runtimeId: string): string {
    return join(this.projectRoot(appId), "runtimes", runtimeId);
  }

  private projectManifestPath(appId: string): string {
    return join(this.projectRoot(appId), "host-project.json");
  }

  private writeProjectManifest(appId: string, manifest: unknown): void {
    mkdirSync(this.projectRoot(appId), { recursive: true });
    writeFileSync(this.projectManifestPath(appId), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  private updateManifest(appId: string, patch: Partial<{
    readonly active_version_id: string;
    readonly proposal?: ProductionChangeProposal;
  }>): void {
    const current = JSON.parse(readFileSync(this.projectManifestPath(appId), "utf8")) as Record<string, unknown>;
    this.writeProjectManifest(appId, { ...current, ...patch });
  }
}

async function startRuntimeFromRoot(
  root: string,
  port: number,
  options: { readonly env?: Record<string, string> } = {},
): Promise<PublishedRuntimeHandle> {
  ensureLinkedDependencies(root);
  const runtimeEnv = { ...process.env, ...options.env, PORT: String(port) };
  const build = await runCommand(["bun", "run", "build"], root, 120_000);
  if (build.code !== 0) {
    throw new Error(`Runtime build failed before serve:\n${build.output}`);
  }
  if (runtimeEnv.DATABASE_URL) {
    const migrate = await runCommand(["bun", "run", "db:migrate"], root, 120_000, runtimeEnv);
    if (migrate.code !== 0) {
      throw new Error(`Runtime database migration failed before serve:\n${migrate.output}`);
    }
  }
  const proc = Bun.spawn(["bun", "run", "serve"], {
    cwd: root,
    env: runtimeEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = drainStream(proc.stderr);
  const stdout = drainStream(proc.stdout);
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(`${url}/api/health`, 15_000);
    return {
      kind: "local",
      url,
      stop: async () => {
        proc.kill();
        await Promise.race([proc.exited.catch(() => 0), sleep(1_000)]);
        await Promise.allSettled([stdout, stderr]);
      },
    };
  } catch (err) {
    proc.kill();
    const [out, errorOut] = await Promise.allSettled([stdout, stderr]);
    const output = [settledText(out), settledText(errorOut)].filter(Boolean).join("\n");
    throw new Error(`Runtime did not become healthy: ${err instanceof Error ? err.message : String(err)}\n${output}`);
  }
}

async function startEphemeralRuntimeFromRoot(
  sourceRoot: string,
  runtimeRoot: string,
  port: number,
  options: { readonly env?: Record<string, string> } = {},
): Promise<PublishedRuntimeHandle> {
  copyDirectory(sourceRoot, runtimeRoot);
  const handle = await startRuntimeFromRoot(runtimeRoot, port, options);
  return {
    url: handle.url,
    stop: async () => {
      await handle.stop();
      rmSync(runtimeRoot, { recursive: true, force: true });
    },
  };
}

export interface PublishedRuntimeHandle {
  readonly kind?: "local" | "vercel";
  readonly url: string;
  readonly receipt?: VercelApiDeployReceipt;
  readonly stop: () => Promise<void>;
}

async function verifyPublishedDeployment(receipt: VercelApiDeployReceipt): Promise<void> {
  await waitForHealth(`${receipt.url}/api/health`, 30_000);
  const response = await fetch(`${receipt.url}/api/items`);
  if (!response.ok) {
    throw new Error(`Vercel deployment ${receipt.deployment_id} failed /api/items smoke with ${response.status}: ${await response.text()}`);
  }
}

export async function verifyProductionDraft(input: {
  readonly source_root: string;
  readonly draft_root: string;
}): Promise<ProductionDraftVerification> {
  const paths = changedPaths(input.source_root, input.draft_root);
  if (paths.length === 0) {
    return { ok: false, reason: "no_change", message: "Draft did not change generated app source.", changed_paths: paths };
  }
  const protectedChanged = paths.filter((path) => isProtectedPath(path));
  if (protectedChanged.length > 0) {
    return {
      ok: false,
      reason: "protected_file_changed",
      message: `Draft changed protected files: ${protectedChanged.join(", ")}`,
      changed_paths: paths,
    };
  }
  ensureLinkedDependencies(input.draft_root);
  const verify = await runCommand(["bun", "run", "verify"], input.draft_root, 120_000);
  if (verify.code !== 0) {
    return {
      ok: false,
      reason: "verify_failed",
      message: "Generated app verify failed.",
      changed_paths: paths,
      output: verify.output,
    };
  }
  const itemsJson = await fetchItemsFromAppModule(input.draft_root);
  if (!itemsJson.includes('"environment"')) {
    return {
      ok: false,
      reason: "missing_runtime_evidence",
      message: "Draft did not expose environment in /api/items runtime data.",
      changed_paths: paths,
      output: itemsJson,
    };
  }
  return {
    ok: true,
    changed_paths: paths,
    output: verify.output,
  };
}

function isProtectedPath(path: string): boolean {
  return productionGeneratedAppProfile.generatedArtifactContract.protectedRoots.some((root) =>
    path === root || path.startsWith(`${root}/`),
  );
}

function applyEnvironmentLanePatch(root: string): void {
  patchFile(join(root, "src/shared/contracts.ts"), [
    [
      'export const itemRiskSchema = z.enum(["low", "medium", "high", "critical"]);\n',
      'export const itemRiskSchema = z.enum(["low", "medium", "high", "critical"]);\nexport const itemEnvironmentSchema = z.enum(["development", "staging", "production"]);\n',
    ],
    ['  risk: itemRiskSchema,\n', '  risk: itemRiskSchema,\n  environment: itemEnvironmentSchema,\n'],
    ['  risk: itemRiskSchema.default("medium"),\n', '  risk: itemRiskSchema.default("medium"),\n  environment: itemEnvironmentSchema.default("production"),\n'],
    [
      "export type ItemRisk = z.infer<typeof itemRiskSchema>;\n",
      "export type ItemRisk = z.infer<typeof itemRiskSchema>;\nexport type ItemEnvironment = z.infer<typeof itemEnvironmentSchema>;\n",
    ],
  ]);

  patchFile(join(root, "src/shared/demo-data.ts"), [
    ['    risk: "critical",\n', '    risk: "critical",\n    environment: "production",\n'],
    ['    risk: "high",\n', '    risk: "high",\n    environment: "staging",\n'],
    ['    risk: "medium",\n', '    risk: "medium",\n    environment: "production",\n'],
  ]);

  patchFile(join(root, "src/profile/scaffold-demos.ts"), [
    ['      risk: "critical",\n', '      risk: "critical",\n      environment: "production",\n'],
    ['      risk: "high",\n', '      risk: "high",\n      environment: "staging",\n'],
    ['      risk: "medium",\n', '      risk: "medium",\n      environment: "production",\n'],
  ]);

  patchFile(join(root, "src/db/schema.ts"), [
    ['  risk: text("risk").notNull(),\n', '  risk: text("risk").notNull(),\n  environment: text("environment").notNull().default("production"),\n'],
  ]);

  patchFile(join(root, "drizzle/0000_initial_release_operations.sql"), [
    [
      "  risk text NOT NULL CONSTRAINT release_items_risk_check CHECK (risk IN ('low', 'medium', 'high', 'critical')),\n",
      "  risk text NOT NULL CONSTRAINT release_items_risk_check CHECK (risk IN ('low', 'medium', 'high', 'critical')),\n  environment text NOT NULL DEFAULT 'production' CONSTRAINT release_items_environment_check CHECK (environment IN ('development', 'staging', 'production')),\n",
    ],
    [
      "\nCREATE TABLE IF NOT EXISTS release_events (\n",
      "\nALTER TABLE release_items ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';\n\nCREATE TABLE IF NOT EXISTS release_events (\n",
    ],
  ]);

  patchFile(join(root, "src/server/repository.ts"), [
    [
      '        risk: input.risk,\n        notes: input.notes,\n',
      '        risk: input.risk,\n        environment: input.environment,\n        notes: input.notes,\n',
    ],
    [
      '        risk: input.risk,\n        notes: input.notes,\n',
      '        risk: input.risk,\n        environment: input.environment,\n        notes: input.notes,\n',
    ],
    ['    notes: row.notes ?? "",\n', '    notes: row.notes ?? "",\n    environment: row.environment ?? "production",\n'],
  ]);

  patchFile(join(root, "src/client/App.tsx"), [
    [
      'import type { ItemPriority, ItemRisk, ItemStatus, ReleaseEvent, ReleaseItem, ReleaseSummary } from "../shared/contracts";\n',
      'import type { ItemEnvironment, ItemPriority, ItemRisk, ItemStatus, ReleaseEvent, ReleaseItem, ReleaseSummary } from "../shared/contracts";\n',
    ],
    ['    risk: "medium" as ItemRisk,\n', '    risk: "medium" as ItemRisk,\n    environment: "production" as ItemEnvironment,\n'],
    [
      '                  <small>{item.owner} · {statusCopy[item.status]}</small>\n',
      '                  <small>{item.owner} · {statusCopy[item.status]} · {item.environment}</small>\n',
    ],
    [
      '                <p className="detail-copy">{activeItem.notes}</p>\n',
      '                <p className="detail-copy">{activeItem.notes}</p>\n                <Badge tone="info">{activeItem.environment}</Badge>\n',
    ],
    [
      '            <Field label="Risk">\n',
      '            <Field label="Environment">\n              <div className="segmented compact">\n                {(["development", "staging", "production"] as const).map((value) => (\n                  <button\n                    className={draft.environment === value ? "selected" : ""}\n                    key={value}\n                    onClick={() => setDraft((current) => ({ ...current, environment: value }))}\n                    type="button"\n                  >\n                    {value}\n                  </button>\n                ))}\n              </div>\n            </Field>\n            <Field label="Risk">\n',
    ],
  ]);
}

async function fetchItemsFromAppModule(root: string): Promise<string> {
  const modulePath = `${pathToFileUrl(join(root, "src/server/app.ts"))}?cache=${Date.now()}`;
  const mod = await import(modulePath) as {
    createReleaseOperationsApp: () => { request: (path: string) => Promise<Response> };
  };
  const app = mod.createReleaseOperationsApp();
  const response = await app.request("/api/items");
  return await response.text();
}

function patchFile(path: string, replacements: readonly (readonly [string, string])[]): void {
  let content = readFileSync(path, "utf8");
  for (const [from, to] of replacements) {
    if (!content.includes(from)) throw new Error(`Patch anchor not found in ${path}: ${from}`);
    content = content.replace(from, to);
  }
  writeFileSync(path, content);
}

function changedPaths(leftRoot: string, rightRoot: string): readonly string[] {
  const paths = new Set([...listFiles(leftRoot), ...listFiles(rightRoot)]);
  return [...paths].sort().filter((path) => readOptional(leftRoot, path) !== readOptional(rightRoot, path));
}

function listFiles(root: string): readonly string[] {
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (ignoredCopyNames.has(entry)) continue;
      const absolute = join(dir, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      if (stat.isFile()) files.push(normalize(relative(root, absolute)));
    }
  };
  visit(root);
  return files;
}

function readOptional(root: string, path: string): string | undefined {
  const absolute = join(root, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : undefined;
}

function copyDirectory(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, {
    recursive: true,
    filter(source) {
      return !ignoredCopyNames.has(basename(source));
    },
  });
}

function ensureLinkedDependencies(root: string): void {
  const target = join(root, "node_modules");
  if (existsSync(target)) return;
  const source = join(import.meta.dir, "..", "..", "production-generated-app-profile", "node_modules");
  if (!existsSync(source)) {
    throw new Error("Production generated app dependencies are missing. Run bun install at the repo root first.");
  }
  symlinkSync(source, target, "dir");
}

async function runCommand(
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  env: Record<string, string | undefined> = process.env,
): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe", env });
  const timeout = sleep(timeoutMs).then(() => {
    proc.kill();
    return "timeout";
  });
  const [stdout, stderr, exited] = await Promise.all([drainStream(proc.stdout), drainStream(proc.stderr), Promise.race([proc.exited, timeout])]);
  const code = typeof exited === "number" ? exited : 124;
  return { code, output: [stdout, stderr].filter(Boolean).join("\n") };
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling until timeout.
    }
    await sleep(250);
  }
  throw new Error(`health check timed out for ${url}`);
}

async function drainStream(stream: ReadableStream<Uint8Array> | undefined | null): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

function settledText(result: PromiseSettledResult<string>): string {
  return result.status === "fulfilled" ? result.value : String(result.reason);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(path: string): string {
  return path.replaceAll("\\", "/");
}

function pathToFileUrl(path: string): string {
  return `file://${path.split("/").map(encodeURIComponent).join("/")}`;
}

function nextVersionId(current: string): string {
  const match = /^v(\d+)$/.exec(current);
  return `v${match ? Number(match[1]) + 1 : 1}`;
}

function previousVersionId(current: string): string | undefined {
  const match = /^v(\d+)$/.exec(current);
  if (!match) return undefined;
  const value = Number(match[1]);
  return value > 0 ? `v${value - 1}` : undefined;
}
