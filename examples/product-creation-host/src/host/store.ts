import { Database } from "bun:sqlite";
import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { BuildChangeReviewPacket, DataEvolutionReceipt, PreparedCodeChangeProposal } from "@pneuma-framework/core";
import type { HostKitCodeAgentDraftReceipt } from "@pneuma-framework/host-kit";
import type { DevBoardDefinition, DevBoardItem } from "../domain/dev-board.js";

export type ProductProjectStatus =
  | "draft"
  | "awaiting_builder_confirmation"
  | "awaiting_reviewer_approval"
  | "blocked"
  | "ready_to_preview"
  | "previewing"
  | "published"
  | "forked";

export type ProductAgentLogKind = "host" | "session" | "assistant" | "tool" | "permission" | "error";

export interface ProductAgentLogEntry {
  readonly id: number;
  readonly app_id: string;
  readonly at_ms: number;
  readonly kind: ProductAgentLogKind;
  readonly text: string;
}

export interface ProductProjectRecord {
  readonly app_id: string;
  readonly name: string;
  readonly goal: string;
  readonly template_id: string;
  readonly profile_id: string;
  readonly builder_subject: string;
  readonly confirmation_subject: string;
  readonly status: ProductProjectStatus;
  readonly thread_id: string;
  readonly current_version_id: string;
  readonly active_version_id?: string;
  readonly source_app_id?: string;
  readonly preview_url?: string;
  readonly published_url?: string;
  readonly last_block_reason?: string;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
}

export interface ProductVersionRecord {
  readonly app_id: string;
  readonly version_id: string;
  readonly definition: DevBoardDefinition;
  readonly items: readonly DevBoardItem[];
  readonly source_root: string;
  readonly draft_root: string;
  readonly data_dir: string;
  readonly created_at_ms: number;
}

export interface ProductPendingEvolutionRecord {
  readonly app_id: string;
  readonly proposal_id: string;
  readonly build_change_id: string;
  readonly builder_message: string;
  readonly proposal: PreparedCodeChangeProposal;
  readonly review_packet: BuildChangeReviewPacket;
  readonly code_agent_receipt?: HostKitCodeAgentDraftReceipt;
  readonly data_receipt?: DataEvolutionReceipt;
  readonly decisions: readonly {
    readonly subject: string;
    readonly decision: "approved" | "denied";
    readonly decided_at_ms: number;
    readonly reason?: string;
  }[];
  readonly created_at_ms: number;
}

export interface ProductShareArtifactRecord {
  readonly artifact_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly manifest: ProductShareArtifactManifest;
  readonly created_at_ms: number;
}

export interface ProductShareArtifactManifest {
  readonly schema_version: 1;
  readonly artifact_id: string;
  readonly app_id: string;
  readonly app_name: string;
  readonly version_id: string;
  readonly source_snapshot: {
    readonly definition: DevBoardDefinition;
  };
  readonly init_recipe: {
    readonly steps: readonly {
      readonly id: string;
      readonly kind: "semantic-operation";
      readonly operation_id: string;
      readonly payload: unknown;
    }[];
  };
  readonly provider_requirements: readonly {
    readonly provider_id: "github-public" | "manual";
    readonly purpose: string;
  }[];
  readonly fork_policy: {
    readonly allow_fork: true;
    readonly requires_credential_rebinding: false;
  };
}

export interface ProductHostSnapshot {
  readonly developer_contract: ProductDeveloperContract;
  readonly projects: readonly (ProductProjectRecord & {
    readonly current_version?: ProductVersionRecord;
    readonly versions: readonly ProductVersionRecord[];
    readonly pending_evolution?: ProductPendingEvolutionRecord;
    readonly agent_logs: readonly ProductAgentLogEntry[];
  })[];
  readonly shares: readonly ProductShareArtifactRecord[];
}

export interface ProductDeveloperContract {
  readonly developer: "Alice";
  readonly creation_host: "Dev Board Builder";
  readonly stack_profile: "local-bun-sqlite";
  readonly generated_app_boundary: "host-owned scaffold source with framework-governed code-change lane";
  readonly framework_owned: readonly string[];
  readonly host_owned: readonly string[];
  readonly builder_visible_promises: readonly string[];
}

export const productDeveloperContract: ProductDeveloperContract = {
  developer: "Alice",
  creation_host: "Dev Board Builder",
  stack_profile: "local-bun-sqlite",
  generated_app_boundary: "host-owned scaffold source with framework-governed code-change lane",
  framework_owned: [
    "BuildThread transcript",
    "HostKit code-change review packet",
    "approval route evaluation",
    "preview data rehearsal receipt",
    "release rollout state",
  ],
  host_owned: [
    "Dev Board domain modules",
    "generated app runtime UI",
    "SQLite workspace layout",
    "share artifact product surface",
    "public GitHub attention mapping",
  ],
  builder_visible_promises: [
    "Builder can inspect what the agent changed before approval.",
    "Builder confirmation is required before source and data changes apply.",
    "Preview and publish are separate product states.",
    "Shared artifacts can be forked without copying private workspace state.",
  ],
};

export class ProductHostStore {
  readonly workspace: string;
  readonly dbPath: string;
  #db: Database;

  constructor(input: { readonly workspace: string }) {
    this.workspace = resolve(input.workspace);
    mkdirSync(this.workspace, { recursive: true });
    this.dbPath = join(this.workspace, "host.db");
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
    project: ProductProjectRecord,
    version: Omit<ProductVersionRecord, "source_root" | "draft_root" | "data_dir">,
  ): ProductProjectRecord {
    mkdirSync(this.sourceRoot(project.app_id), { recursive: true });
    mkdirSync(this.dataDir(project.app_id, version.version_id), { recursive: true });
    writeBoardDefinition(this.sourceRoot(project.app_id), version.definition);
    this.#db.transaction(() => {
      this.#db.query(`
        INSERT INTO projects (
          app_id, name, goal, template_id, profile_id, builder_subject, confirmation_subject, status,
          thread_id, current_version_id, active_version_id, source_app_id, preview_url, published_url,
          last_block_reason, created_at_ms, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        project.app_id,
        project.name,
        project.goal,
        project.template_id,
        project.profile_id,
        project.builder_subject,
        project.confirmation_subject,
        project.status,
        project.thread_id,
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

  getProject(appId: string): ProductProjectRecord {
    const row = this.#db.query("SELECT * FROM projects WHERE app_id = ?").get(appId) as ProjectRow | null;
    if (!row) throw new Error(`Project ${appId} does not exist.`);
    return projectFromRow(row);
  }

  listProjects(): readonly ProductProjectRecord[] {
    return (this.#db.query("SELECT * FROM projects ORDER BY created_at_ms ASC").all() as ProjectRow[]).map(projectFromRow);
  }

  updateProject(appId: string, patch: Partial<Omit<ProductProjectRecord, "app_id" | "created_at_ms">>): ProductProjectRecord {
    const current = this.getProject(appId);
    const next: ProductProjectRecord = {
      ...current,
      ...patch,
      updated_at_ms: Date.now(),
    };
    this.#db.query(`
      UPDATE projects SET
        name = ?, goal = ?, template_id = ?, profile_id = ?, builder_subject = ?, confirmation_subject = ?,
        status = ?, thread_id = ?, current_version_id = ?, active_version_id = ?, source_app_id = ?,
        preview_url = ?, published_url = ?, last_block_reason = ?, updated_at_ms = ?
      WHERE app_id = ?
    `).run(
      next.name,
      next.goal,
      next.template_id,
      next.profile_id,
      next.builder_subject,
      next.confirmation_subject,
      next.status,
      next.thread_id,
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

  saveVersion(version: ProductVersionRecord): ProductVersionRecord {
    mkdirSync(version.source_root, { recursive: true });
    mkdirSync(version.data_dir, { recursive: true });
    writeBoardDefinition(version.source_root, version.definition);
    writeFileAtomic(
      join(version.data_dir, "items.json"),
      `${JSON.stringify(version.items, null, 2)}\n`,
    );
    this.#db.query(`
      INSERT OR REPLACE INTO versions (
        app_id, version_id, definition_json, items_json, source_root, draft_root, data_dir, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      version.app_id,
      version.version_id,
      JSON.stringify(version.definition),
      JSON.stringify(version.items),
      version.source_root,
      version.draft_root,
      version.data_dir,
      version.created_at_ms,
    );
    return version;
  }

  getVersion(appId: string, versionId: string): ProductVersionRecord {
    const row = this.#db.query("SELECT * FROM versions WHERE app_id = ? AND version_id = ?").get(appId, versionId) as VersionRow | null;
    if (!row) throw new Error(`Version ${appId}@${versionId} does not exist.`);
    return versionFromRow(row);
  }

  latestVersion(appId: string): ProductVersionRecord {
    const project = this.getProject(appId);
    return this.getVersion(appId, project.current_version_id);
  }

  listVersions(appId: string): readonly ProductVersionRecord[] {
    return (this.#db.query("SELECT * FROM versions WHERE app_id = ? ORDER BY created_at_ms ASC").all(appId) as VersionRow[])
      .map(versionFromRow);
  }

  nextVersionId(appId: string): string {
    const rows = this.#db.query("SELECT version_id FROM versions WHERE app_id = ?").all(appId) as { version_id: string }[];
    const max = rows.reduce((acc, row) => {
      const match = /^v(\d+)$/.exec(row.version_id);
      return match ? Math.max(acc, Number(match[1])) : acc;
    }, -1);
    return `v${max + 1}`;
  }

  savePendingEvolution(record: ProductPendingEvolutionRecord): ProductPendingEvolutionRecord {
    this.#db.query(`
      INSERT OR REPLACE INTO pending_evolutions (
        app_id, proposal_id, build_change_id, builder_message, proposal_json, review_packet_json,
        code_agent_receipt_json, data_receipt_json, decisions_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.app_id,
      record.proposal_id,
      record.build_change_id,
      record.builder_message,
      JSON.stringify(record.proposal),
      JSON.stringify(record.review_packet),
      record.code_agent_receipt ? JSON.stringify(record.code_agent_receipt) : null,
      record.data_receipt ? JSON.stringify(record.data_receipt) : null,
      JSON.stringify(record.decisions),
      record.created_at_ms,
    );
    return record;
  }

  getPendingEvolution(appId: string): ProductPendingEvolutionRecord | undefined {
    const row = this.#db.query("SELECT * FROM pending_evolutions WHERE app_id = ?").get(appId) as PendingRow | null;
    return row ? pendingFromRow(row) : undefined;
  }

  clearPendingEvolution(appId: string): void {
    this.#db.query("DELETE FROM pending_evolutions WHERE app_id = ?").run(appId);
  }

  appendAgentLog(
    appId: string,
    entry: { readonly kind: ProductAgentLogKind; readonly text: string; readonly at_ms?: number },
    options: { readonly merge_with_previous?: boolean } = {},
  ): ProductAgentLogEntry {
    const atMs = entry.at_ms ?? Date.now();
    if (options.merge_with_previous) {
      const last = this.#db.query("SELECT * FROM agent_logs WHERE app_id = ? ORDER BY id DESC LIMIT 1").get(appId) as AgentLogRow | null;
      if (last?.kind === entry.kind) {
        const text = `${last.text}${entry.text}`;
        this.#db.query("UPDATE agent_logs SET text = ?, at_ms = ? WHERE id = ?").run(text, atMs, last.id);
        return { id: last.id, app_id: appId, at_ms: atMs, kind: entry.kind, text };
      }
    }
    const result = this.#db.query("INSERT INTO agent_logs (app_id, at_ms, kind, text) VALUES (?, ?, ?, ?)").run(appId, atMs, entry.kind, entry.text);
    return { id: Number(result.lastInsertRowid), app_id: appId, at_ms: atMs, kind: entry.kind, text: entry.text };
  }

  listAgentLogs(appId: string): readonly ProductAgentLogEntry[] {
    return (this.#db.query("SELECT * FROM agent_logs WHERE app_id = ? ORDER BY id ASC").all(appId) as AgentLogRow[]).map(agentLogFromRow);
  }

  saveShareArtifact(record: ProductShareArtifactRecord): ProductShareArtifactRecord {
    this.#db.query(`
      INSERT OR REPLACE INTO share_artifacts (artifact_id, app_id, version_id, manifest_json, created_at_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(record.artifact_id, record.app_id, record.version_id, JSON.stringify(record.manifest), record.created_at_ms);
    return record;
  }

  getShareArtifact(artifactId: string): ProductShareArtifactRecord {
    const row = this.#db.query("SELECT * FROM share_artifacts WHERE artifact_id = ?").get(artifactId) as ShareRow | null;
    if (!row) throw new Error(`Share artifact ${artifactId} does not exist.`);
    return shareFromRow(row);
  }

  listShareArtifacts(): readonly ProductShareArtifactRecord[] {
    return (this.#db.query("SELECT * FROM share_artifacts ORDER BY created_at_ms ASC").all() as ShareRow[]).map(shareFromRow);
  }

  snapshot(): ProductHostSnapshot {
    return {
      developer_contract: productDeveloperContract,
      projects: this.listProjects().map((project) => ({
        ...project,
        current_version: this.getVersion(project.app_id, project.current_version_id),
        versions: this.listVersions(project.app_id),
        pending_evolution: this.getPendingEvolution(project.app_id),
        agent_logs: this.listAgentLogs(project.app_id),
      })),
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
        profile_id TEXT NOT NULL,
        builder_subject TEXT NOT NULL,
        confirmation_subject TEXT NOT NULL,
        status TEXT NOT NULL,
        thread_id TEXT NOT NULL,
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
        definition_json TEXT NOT NULL,
        items_json TEXT NOT NULL,
        source_root TEXT NOT NULL,
        draft_root TEXT NOT NULL,
        data_dir TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY (app_id, version_id),
        FOREIGN KEY (app_id) REFERENCES projects(app_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS pending_evolutions (
        app_id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        build_change_id TEXT NOT NULL,
        builder_message TEXT NOT NULL,
        proposal_json TEXT NOT NULL,
        review_packet_json TEXT NOT NULL,
        code_agent_receipt_json TEXT,
        data_receipt_json TEXT,
        decisions_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        FOREIGN KEY (app_id) REFERENCES projects(app_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agent_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id TEXT NOT NULL,
        at_ms INTEGER NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL,
        FOREIGN KEY (app_id) REFERENCES projects(app_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS share_artifacts (
        artifact_id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
    `);
    const projectColumns = this.#db.query("PRAGMA table_info(projects)").all() as { readonly name: string }[];
    const columnNames = new Set(projectColumns.map((column) => column.name));
    if (!columnNames.has("confirmation_subject")) {
      this.#db.exec("ALTER TABLE projects ADD COLUMN confirmation_subject TEXT");
      const sourceColumn = columnNames.has("reviewer_subject") ? "reviewer_subject" : "builder_subject";
      this.#db.exec(`
        UPDATE projects
        SET confirmation_subject = COALESCE(${sourceColumn}, builder_subject)
        WHERE confirmation_subject IS NULL
      `);
    }
  }
}

export function writeBoardDefinition(sourceRoot: string, definition: DevBoardDefinition): void {
  mkdirSync(join(sourceRoot, "src"), { recursive: true });
  writeFileAtomic(join(sourceRoot, "src", "board.json"), `${JSON.stringify(definition, null, 2)}\n`);
}

export function readBoardDefinition(sourceRoot: string): DevBoardDefinition {
  return JSON.parse(readFileSync(join(sourceRoot, "src", "board.json"), "utf8")) as DevBoardDefinition;
}

export function resetDraftFromSource(sourceRoot: string, draftRoot: string): void {
  rmSync(draftRoot, { recursive: true, force: true });
  copyDir(sourceRoot, draftRoot);
}

function copyDir(source: string, target: string): void {
  cpSync(source, target, { recursive: true });
}

function writeFileAtomic(path: string, content: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.hrtime.bigint().toString(36)}.tmp`;
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, path);
}

interface ProjectRow {
  readonly app_id: string;
  readonly name: string;
  readonly goal: string;
  readonly template_id: string;
  readonly profile_id: string;
  readonly builder_subject: string;
  readonly confirmation_subject: string;
  readonly status: ProductProjectStatus;
  readonly thread_id: string;
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
  readonly definition_json: string;
  readonly items_json: string;
  readonly source_root: string;
  readonly draft_root: string;
  readonly data_dir: string;
  readonly created_at_ms: number;
}

interface PendingRow {
  readonly app_id: string;
  readonly proposal_id: string;
  readonly build_change_id: string;
  readonly builder_message: string;
  readonly proposal_json: string;
  readonly review_packet_json: string;
  readonly code_agent_receipt_json: string | null;
  readonly data_receipt_json: string | null;
  readonly decisions_json: string;
  readonly created_at_ms: number;
}

interface AgentLogRow {
  readonly id: number;
  readonly app_id: string;
  readonly at_ms: number;
  readonly kind: ProductAgentLogKind;
  readonly text: string;
}

interface ShareRow {
  readonly artifact_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly manifest_json: string;
  readonly created_at_ms: number;
}

function projectFromRow(row: ProjectRow): ProductProjectRecord {
  return {
    ...row,
    active_version_id: row.active_version_id ?? undefined,
    source_app_id: row.source_app_id ?? undefined,
    preview_url: row.preview_url ?? undefined,
    published_url: row.published_url ?? undefined,
    last_block_reason: row.last_block_reason ?? undefined,
  };
}

function versionFromRow(row: VersionRow): ProductVersionRecord {
  return {
    app_id: row.app_id,
    version_id: row.version_id,
    definition: JSON.parse(row.definition_json) as DevBoardDefinition,
    items: JSON.parse(row.items_json) as readonly DevBoardItem[],
    source_root: row.source_root,
    draft_root: row.draft_root,
    data_dir: row.data_dir,
    created_at_ms: row.created_at_ms,
  };
}

function pendingFromRow(row: PendingRow): ProductPendingEvolutionRecord {
  return {
    app_id: row.app_id,
    proposal_id: row.proposal_id,
    build_change_id: row.build_change_id,
    builder_message: row.builder_message,
    proposal: JSON.parse(row.proposal_json) as PreparedCodeChangeProposal,
    review_packet: JSON.parse(row.review_packet_json) as BuildChangeReviewPacket,
    code_agent_receipt: row.code_agent_receipt_json
      ? JSON.parse(row.code_agent_receipt_json) as HostKitCodeAgentDraftReceipt
      : undefined,
    data_receipt: row.data_receipt_json ? JSON.parse(row.data_receipt_json) as DataEvolutionReceipt : undefined,
    decisions: JSON.parse(row.decisions_json) as ProductPendingEvolutionRecord["decisions"],
    created_at_ms: row.created_at_ms,
  };
}

function agentLogFromRow(row: AgentLogRow): ProductAgentLogEntry {
  return row;
}

function shareFromRow(row: ShareRow): ProductShareArtifactRecord {
  return {
    artifact_id: row.artifact_id,
    app_id: row.app_id,
    version_id: row.version_id,
    manifest: JSON.parse(row.manifest_json) as ProductShareArtifactManifest,
    created_at_ms: row.created_at_ms,
  };
}
