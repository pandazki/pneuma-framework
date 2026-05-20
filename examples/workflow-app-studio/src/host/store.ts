import { Database } from "bun:sqlite";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  BuildChangeReviewPacket,
  PreparedCodeChangeProposal,
} from "@pneuma-framework/core";
import type { WorkflowAppDefinition, WorkflowRecord } from "../domain/workflow-app.js";
import { defaultWorkflowAppModuleSource } from "./generated-app-module.js";

export type WorkflowProjectStatus =
  | "draft"
  | "awaiting_builder_confirmation"
  | "ready_to_preview"
  | "previewing"
  | "published"
  | "blocked";

export interface WorkflowThemeSource {
  readonly accent: "teal" | "indigo" | "slate";
  readonly density: "comfortable" | "compact";
}

export interface WorkflowRuntimeSource {
  readonly schema_version: 1;
  readonly record_actions_layout: "stage_buttons";
  readonly allow_end_user_create: true;
  readonly history_visible: true;
}

export interface WorkflowSourceSnapshot {
  readonly workflow: WorkflowAppDefinition;
  readonly runtime: WorkflowRuntimeSource;
  readonly theme: WorkflowThemeSource;
  readonly app_code: string;
}

export interface WorkflowProjectRecord {
  readonly app_id: string;
  readonly name: string;
  readonly goal: string;
  readonly template_id: string;
  readonly builder_subject: string;
  readonly status: WorkflowProjectStatus;
  readonly current_version_id: string;
  readonly active_version_id?: string;
  readonly source_app_id?: string;
  readonly preview_url?: string;
  readonly published_url?: string;
  readonly last_block_reason?: string;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
}

export interface WorkflowVersionRecord {
  readonly app_id: string;
  readonly version_id: string;
  readonly source: WorkflowSourceSnapshot;
  readonly records: readonly WorkflowRecord[];
  readonly source_root: string;
  readonly draft_root: string;
  readonly data_dir: string;
  readonly created_at_ms: number;
}

export interface WorkflowPendingEvolutionRecord {
  readonly app_id: string;
  readonly proposal_id: string;
  readonly thread_id: string;
  readonly builder_message: string;
  readonly interpretation: string;
  readonly summary: string;
  readonly highlights: readonly string[];
  readonly changed_files: readonly string[];
  readonly diff: string;
  readonly data_impact: string;
  readonly agent_mode: "deterministic" | "opencode";
  readonly agent_logs: readonly WorkflowAgentLogEntry[];
  readonly code_change_proposal: PreparedCodeChangeProposal;
  readonly review_packet: BuildChangeReviewPacket;
  readonly code_agent_receipt?: unknown;
  readonly created_at_ms: number;
}

export interface WorkflowAgentLogEntry {
  readonly kind: "host" | "session" | "assistant" | "tool" | "permission" | "error";
  readonly text: string;
  readonly at_ms: number;
}

export interface WorkflowShareArtifactRecord {
  readonly artifact_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly manifest: WorkflowShareArtifactManifest;
  readonly created_at_ms: number;
}

export interface WorkflowShareArtifactManifest {
  readonly schema_version: 1;
  readonly artifact_id: string;
  readonly app_id: string;
  readonly app_name: string;
  readonly version_id: string;
  readonly source_snapshot: WorkflowSourceSnapshot;
  readonly seed_records: readonly WorkflowRecord[];
  readonly provider_requirements: readonly {
    readonly provider_id: "manual";
    readonly purpose: string;
  }[];
  readonly fork_policy: {
    readonly allow_fork: true;
    readonly requires_credential_rebinding: false;
  };
}

export interface WorkflowStudioSnapshot {
  readonly projects: readonly (WorkflowProjectRecord & {
    readonly current_version?: WorkflowVersionRecord;
    readonly versions: readonly WorkflowVersionRecord[];
    readonly pending_evolution?: WorkflowPendingEvolutionRecord;
  })[];
  readonly shares: readonly WorkflowShareArtifactRecord[];
}

export class WorkflowStudioStore {
  readonly workspace: string;
  readonly dbPath: string;
  #db: Database;

  constructor(input: { readonly workspace: string }) {
    this.workspace = resolve(input.workspace);
    mkdirSync(this.workspace, { recursive: true });
    this.dbPath = join(this.workspace, "workflow-studio.db");
    this.#db = new Database(this.dbPath);
    this.#db.exec("PRAGMA journal_mode = WAL");
    this.#db.exec("PRAGMA foreign_keys = ON");
    this.#migrate();
  }

  close(): void {
    this.#db.close();
  }

  projectDir(appId: string): string {
    return join(this.workspace, "projects", appId);
  }

  sourceRoot(appId: string): string {
    return join(this.projectDir(appId), "source");
  }

  draftRoot(appId: string): string {
    return join(this.projectDir(appId), "draft");
  }

  dataDir(appId: string, versionId: string): string {
    return join(this.projectDir(appId), "published", versionId);
  }

  createProject(
    project: WorkflowProjectRecord,
    version: Omit<WorkflowVersionRecord, "source_root" | "draft_root" | "data_dir">,
  ): WorkflowProjectRecord {
    mkdirSync(this.sourceRoot(project.app_id), { recursive: true });
    mkdirSync(this.dataDir(project.app_id, version.version_id), { recursive: true });
    writeWorkflowSource(this.sourceRoot(project.app_id), version.source);
    this.#db.transaction(() => {
      this.#db.query(`
        INSERT INTO projects (
          app_id, name, goal, template_id, builder_subject, status, current_version_id, active_version_id,
          source_app_id, preview_url, published_url, last_block_reason, created_at_ms, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        project.app_id,
        project.name,
        project.goal,
        project.template_id,
        project.builder_subject,
        project.status,
        project.current_version_id,
        project.active_version_id ?? null,
        project.source_app_id ?? null,
        project.preview_url ?? null,
        project.published_url ?? null,
        project.last_block_reason ?? null,
        project.created_at_ms,
        project.updated_at_ms,
      );
      this.saveVersion({
        ...version,
        source_root: this.sourceRoot(project.app_id),
        draft_root: this.draftRoot(project.app_id),
        data_dir: this.dataDir(project.app_id, version.version_id),
      });
    })();
    return project;
  }

  getProject(appId: string): WorkflowProjectRecord {
    const row = this.#db.query("SELECT * FROM projects WHERE app_id = ?").get(appId) as ProjectRow | null;
    if (!row) throw new Error(`Project ${appId} does not exist.`);
    return projectFromRow(row);
  }

  listProjects(): readonly WorkflowProjectRecord[] {
    return (this.#db.query("SELECT * FROM projects ORDER BY created_at_ms ASC").all() as ProjectRow[]).map(projectFromRow);
  }

  updateProject(appId: string, patch: Partial<Omit<WorkflowProjectRecord, "app_id" | "created_at_ms">>): WorkflowProjectRecord {
    const current = this.getProject(appId);
    const next: WorkflowProjectRecord = {
      ...current,
      ...patch,
      updated_at_ms: Date.now(),
    };
    this.#db.query(`
      UPDATE projects SET
        name = ?, goal = ?, template_id = ?, builder_subject = ?, status = ?, current_version_id = ?,
        active_version_id = ?, source_app_id = ?, preview_url = ?, published_url = ?, last_block_reason = ?,
        updated_at_ms = ?
      WHERE app_id = ?
    `).run(
      next.name,
      next.goal,
      next.template_id,
      next.builder_subject,
      next.status,
      next.current_version_id,
      next.active_version_id ?? null,
      next.source_app_id ?? null,
      next.preview_url ?? null,
      next.published_url ?? null,
      next.last_block_reason ?? null,
      next.updated_at_ms,
      appId,
    );
    return next;
  }

  saveVersion(version: WorkflowVersionRecord): WorkflowVersionRecord {
    mkdirSync(version.source_root, { recursive: true });
    mkdirSync(version.data_dir, { recursive: true });
    writeWorkflowSource(version.source_root, version.source);
    this.#db.query(`
      INSERT OR REPLACE INTO versions (
        app_id, version_id, source_json, records_json, source_root, draft_root, data_dir, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      version.app_id,
      version.version_id,
      JSON.stringify(version.source),
      JSON.stringify(version.records),
      version.source_root,
      version.draft_root,
      version.data_dir,
      version.created_at_ms,
    );
    return version;
  }

  getVersion(appId: string, versionId: string): WorkflowVersionRecord {
    const row = this.#db.query("SELECT * FROM versions WHERE app_id = ? AND version_id = ?").get(appId, versionId) as VersionRow | null;
    if (!row) throw new Error(`Version ${appId}@${versionId} does not exist.`);
    return versionFromRow(row);
  }

  listVersions(appId: string): readonly WorkflowVersionRecord[] {
    return (this.#db.query("SELECT * FROM versions WHERE app_id = ? ORDER BY created_at_ms ASC").all(appId) as VersionRow[]).map(versionFromRow);
  }

  currentVersion(appId: string): WorkflowVersionRecord {
    const project = this.getProject(appId);
    return this.getVersion(appId, project.current_version_id);
  }

  activeVersion(appId: string): WorkflowVersionRecord {
    const project = this.getProject(appId);
    if (!project.active_version_id) throw new Error(`Project ${appId} has no active published version.`);
    return this.getVersion(appId, project.active_version_id);
  }

  savePendingEvolution(pending: WorkflowPendingEvolutionRecord): void {
    this.#db.query(`
      INSERT OR REPLACE INTO pending_evolutions (
        app_id, proposal_id, thread_id, builder_message, interpretation, summary, highlights_json,
        changed_files_json, diff, data_impact, agent_mode, agent_logs_json, code_change_proposal_json,
        review_packet_json, code_agent_receipt_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pending.app_id,
      pending.proposal_id,
      pending.thread_id,
      pending.builder_message,
      pending.interpretation,
      pending.summary,
      JSON.stringify(pending.highlights),
      JSON.stringify(pending.changed_files),
      pending.diff,
      pending.data_impact,
      pending.agent_mode,
      JSON.stringify(pending.agent_logs),
      JSON.stringify(pending.code_change_proposal),
      JSON.stringify(pending.review_packet),
      pending.code_agent_receipt ? JSON.stringify(pending.code_agent_receipt) : null,
      pending.created_at_ms,
    );
  }

  getPendingEvolution(appId: string): WorkflowPendingEvolutionRecord | undefined {
    const row = this.#db.query("SELECT * FROM pending_evolutions WHERE app_id = ?").get(appId) as PendingRow | null;
    return row ? pendingFromRow(row) : undefined;
  }

  clearPendingEvolution(appId: string): void {
    this.#db.query("DELETE FROM pending_evolutions WHERE app_id = ?").run(appId);
  }

  createShareArtifact(share: WorkflowShareArtifactRecord): WorkflowShareArtifactRecord {
    this.#db.query(`
      INSERT INTO shares (artifact_id, app_id, version_id, manifest_json, created_at_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(share.artifact_id, share.app_id, share.version_id, JSON.stringify(share.manifest), share.created_at_ms);
    return share;
  }

  getShareArtifact(artifactId: string): WorkflowShareArtifactRecord {
    const row = this.#db.query("SELECT * FROM shares WHERE artifact_id = ?").get(artifactId) as ShareRow | null;
    if (!row) throw new Error(`Share artifact ${artifactId} does not exist.`);
    return shareFromRow(row);
  }

  listShareArtifacts(): readonly WorkflowShareArtifactRecord[] {
    return (this.#db.query("SELECT * FROM shares ORDER BY created_at_ms ASC").all() as ShareRow[]).map(shareFromRow);
  }

  resetDraftFromSource(appId: string): void {
    rmSync(this.draftRoot(appId), { recursive: true, force: true });
    cpSync(this.sourceRoot(appId), this.draftRoot(appId), { recursive: true });
  }

  resetWorkspace(): void {
    this.#db.transaction(() => {
      this.#db.query("DELETE FROM pending_evolutions").run();
      this.#db.query("DELETE FROM shares").run();
      this.#db.query("DELETE FROM versions").run();
      this.#db.query("DELETE FROM projects").run();
    })();
    rmSync(join(this.workspace, "projects"), { recursive: true, force: true });
    rmSync(join(this.workspace, ".pneuma"), { recursive: true, force: true });
  }

  snapshot(): WorkflowStudioSnapshot {
    const projects = this.listProjects().map((project) => {
      const versions = this.listVersions(project.app_id);
      return {
        ...project,
        current_version: versions.find((version) => version.version_id === project.current_version_id),
        versions,
        pending_evolution: this.getPendingEvolution(project.app_id),
      };
    });
    return {
      projects,
      shares: this.listShareArtifacts(),
    };
  }

  #migrate(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        app_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        goal TEXT NOT NULL,
        template_id TEXT NOT NULL,
        builder_subject TEXT NOT NULL,
        status TEXT NOT NULL,
        current_version_id TEXT NOT NULL,
        active_version_id TEXT,
        source_app_id TEXT,
        preview_url TEXT,
        published_url TEXT,
        last_block_reason TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS versions (
        app_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        source_json TEXT NOT NULL,
        records_json TEXT NOT NULL,
        source_root TEXT NOT NULL,
        draft_root TEXT NOT NULL,
        data_dir TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY (app_id, version_id)
      );

      CREATE TABLE IF NOT EXISTS pending_evolutions (
        app_id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        thread_id TEXT NOT NULL DEFAULT '',
        builder_message TEXT NOT NULL,
        interpretation TEXT NOT NULL,
        summary TEXT NOT NULL,
        highlights_json TEXT NOT NULL,
        changed_files_json TEXT NOT NULL,
        diff TEXT NOT NULL,
        data_impact TEXT NOT NULL,
        agent_mode TEXT NOT NULL DEFAULT 'deterministic',
        agent_logs_json TEXT NOT NULL DEFAULT '[]',
        code_change_proposal_json TEXT NOT NULL DEFAULT '{}',
        review_packet_json TEXT NOT NULL DEFAULT '{}',
        code_agent_receipt_json TEXT,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shares (
        artifact_id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
    `);
    this.#ensureColumn("pending_evolutions", "thread_id", "TEXT NOT NULL DEFAULT ''");
    this.#ensureColumn("pending_evolutions", "agent_mode", "TEXT NOT NULL DEFAULT 'deterministic'");
    this.#ensureColumn("pending_evolutions", "agent_logs_json", "TEXT NOT NULL DEFAULT '[]'");
    this.#ensureColumn("pending_evolutions", "code_change_proposal_json", "TEXT NOT NULL DEFAULT '{}'");
    this.#ensureColumn("pending_evolutions", "review_packet_json", "TEXT NOT NULL DEFAULT '{}'");
    this.#ensureColumn("pending_evolutions", "code_agent_receipt_json", "TEXT");
  }

  #ensureColumn(table: string, column: string, ddl: string): void {
    const rows = this.#db.query(`PRAGMA table_info(${table})`).all() as { readonly name: string }[];
    if (rows.some((row) => row.name === column)) return;
    this.#db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

export function defaultRuntimeSource(): WorkflowRuntimeSource {
  return {
    schema_version: 1,
    record_actions_layout: "stage_buttons",
    allow_end_user_create: true,
    history_visible: true,
  };
}

export function defaultThemeSource(): WorkflowThemeSource {
  return {
    accent: "teal",
    density: "comfortable",
  };
}

export function writeWorkflowSource(root: string, source: WorkflowSourceSnapshot): void {
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "workflow.json"), `${JSON.stringify(source.workflow, null, 2)}\n`);
  writeFileSync(join(root, "src", "runtime.json"), `${JSON.stringify(source.runtime, null, 2)}\n`);
  writeFileSync(join(root, "src", "theme.json"), `${JSON.stringify(source.theme, null, 2)}\n`);
  writeFileSync(join(root, "src", "app.ts"), source.app_code);
}

export function readWorkflowSource(root: string): WorkflowSourceSnapshot {
  const sourceDir = existsSync(join(root, "src")) ? join(root, "src") : root;
  return {
    workflow: JSON.parse(readFileSync(join(sourceDir, "workflow.json"), "utf8")) as WorkflowAppDefinition,
    runtime: JSON.parse(readFileSync(join(sourceDir, "runtime.json"), "utf8")) as WorkflowRuntimeSource,
    theme: JSON.parse(readFileSync(join(sourceDir, "theme.json"), "utf8")) as WorkflowThemeSource,
    app_code: existsSync(join(sourceDir, "app.ts"))
      ? readFileSync(join(sourceDir, "app.ts"), "utf8")
      : defaultWorkflowAppModuleSource(),
  };
}

interface ProjectRow {
  readonly app_id: string;
  readonly name: string;
  readonly goal: string;
  readonly template_id: string;
  readonly builder_subject: string;
  readonly status: WorkflowProjectStatus;
  readonly current_version_id: string;
  readonly active_version_id: string | null;
  readonly source_app_id: string | null;
  readonly preview_url: string | null;
  readonly published_url: string | null;
  readonly last_block_reason: string | null;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
}

interface VersionRow {
  readonly app_id: string;
  readonly version_id: string;
  readonly source_json: string;
  readonly records_json: string;
  readonly source_root: string;
  readonly draft_root: string;
  readonly data_dir: string;
  readonly created_at_ms: number;
}

interface PendingRow {
  readonly app_id: string;
  readonly proposal_id: string;
  readonly thread_id: string;
  readonly builder_message: string;
  readonly interpretation: string;
  readonly summary: string;
  readonly highlights_json: string;
  readonly changed_files_json: string;
  readonly diff: string;
  readonly data_impact: string;
  readonly agent_mode: string;
  readonly agent_logs_json: string;
  readonly code_change_proposal_json: string;
  readonly review_packet_json: string;
  readonly code_agent_receipt_json: string | null;
  readonly created_at_ms: number;
}

interface ShareRow {
  readonly artifact_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly manifest_json: string;
  readonly created_at_ms: number;
}

function projectFromRow(row: ProjectRow): WorkflowProjectRecord {
  return {
    ...row,
    active_version_id: row.active_version_id ?? undefined,
    source_app_id: row.source_app_id ?? undefined,
    preview_url: row.preview_url ?? undefined,
    published_url: row.published_url ?? undefined,
    last_block_reason: row.last_block_reason ?? undefined,
  };
}

function versionFromRow(row: VersionRow): WorkflowVersionRecord {
  const source = JSON.parse(row.source_json) as Partial<WorkflowSourceSnapshot>;
  return {
    app_id: row.app_id,
    version_id: row.version_id,
    source: normalizeWorkflowSource(source),
    records: JSON.parse(row.records_json) as WorkflowRecord[],
    source_root: row.source_root,
    draft_root: row.draft_root,
    data_dir: row.data_dir,
    created_at_ms: row.created_at_ms,
  };
}

function pendingFromRow(row: PendingRow): WorkflowPendingEvolutionRecord {
  return {
    app_id: row.app_id,
    proposal_id: row.proposal_id,
    thread_id: row.thread_id,
    builder_message: row.builder_message,
    interpretation: row.interpretation,
    summary: row.summary,
    highlights: JSON.parse(row.highlights_json) as string[],
    changed_files: JSON.parse(row.changed_files_json) as string[],
    diff: row.diff,
    data_impact: row.data_impact,
    agent_mode: row.agent_mode === "opencode" ? "opencode" : "deterministic",
    agent_logs: JSON.parse(row.agent_logs_json) as WorkflowAgentLogEntry[],
    code_change_proposal: JSON.parse(row.code_change_proposal_json) as PreparedCodeChangeProposal,
    review_packet: JSON.parse(row.review_packet_json) as BuildChangeReviewPacket,
    code_agent_receipt: row.code_agent_receipt_json ? JSON.parse(row.code_agent_receipt_json) : undefined,
    created_at_ms: row.created_at_ms,
  };
}

function shareFromRow(row: ShareRow): WorkflowShareArtifactRecord {
  const manifest = JSON.parse(row.manifest_json) as WorkflowShareArtifactManifest;
  return {
    artifact_id: row.artifact_id,
    app_id: row.app_id,
    version_id: row.version_id,
    manifest: {
      ...manifest,
      source_snapshot: normalizeWorkflowSource(manifest.source_snapshot),
    },
    created_at_ms: row.created_at_ms,
  };
}

function normalizeWorkflowSource(source: Partial<WorkflowSourceSnapshot>): WorkflowSourceSnapshot {
  return {
    workflow: source.workflow as WorkflowAppDefinition,
    runtime: source.runtime as WorkflowRuntimeSource,
    theme: source.theme as WorkflowThemeSource,
    app_code: source.app_code ?? defaultWorkflowAppModuleSource(),
  };
}
