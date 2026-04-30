// BunSqliteAppHistoryStore — app_history 表的 SQLite 持久化 (ADR-0017 amend).
// Schema 由 SQLite migration substrate 创建. 物理 CHECK 约束仍跟 ADR amendment
// 的 TypeScript interface 一一对应, 避免 code-level bug 写入坏 history entry.

import { Database } from "bun:sqlite";
import {
  type AppHistoryEntry,
  type AppHistoryStore,
  type NewAppHistoryEntry,
  AppHistoryError,
  newHistoryId,
  SNAPSHOT_FREQUENCY,
  RETENTION_BUFFER_LIMIT,
} from "./app-history.js";

interface DbShape {
  id: string;
  app_id: string;
  version: number;
  history_type: "snapshot" | "delta";
  payload: string;
  parent_snapshot_version: number | null;
  is_ai_generated: number;
  actor_id: string;
  actor_kind: "builder" | "agent" | "framework";
  description: string | null;
  operation_scope: string | null;
  created_at: number;
}

export class BunSqliteAppHistoryStore implements AppHistoryStore {
  constructor(private readonly db: Database) {}

  async append(input: NewAppHistoryEntry): Promise<AppHistoryEntry> {
    this.validatePayloadShape(input);

    const nextVersion = ((await this.latestVersion(input.app_id)) ?? 0) + 1;
    const id = newHistoryId();
    const created_at = Date.now();

    const payloadJson = JSON.stringify(input.payload);
    const opScopeJson = input.operation_scope ? JSON.stringify(input.operation_scope) : null;

    try {
      this.db
        .query(
          `INSERT INTO app_history
           (id, app_id, version, history_type, payload, parent_snapshot_version,
            is_ai_generated, actor_id, actor_kind, description, operation_scope, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.app_id,
          nextVersion,
          input.history_type,
          payloadJson,
          input.parent_snapshot_version ?? null,
          input.is_ai_generated ? 1 : 0,
          input.actor_id,
          input.actor_kind,
          input.description ?? null,
          opScopeJson,
          created_at
        );
    } catch (err) {
      // SQLite CHECK violation → 转成 AppHistoryError
      if (err instanceof Error && /CHECK constraint failed/i.test(err.message)) {
        throw new AppHistoryError(
          `app_history CHECK constraint violated: ${err.message}`,
          "check_violation"
        );
      }
      throw err;
    }

    return {
      id,
      app_id: input.app_id,
      version: nextVersion,
      history_type: input.history_type,
      payload: input.payload,
      parent_snapshot_version: input.parent_snapshot_version,
      is_ai_generated: input.is_ai_generated,
      actor_id: input.actor_id,
      actor_kind: input.actor_kind,
      description: input.description,
      operation_scope: input.operation_scope,
      created_at,
    };
  }

  async getByVersion(app_id: string, version: number): Promise<AppHistoryEntry | undefined> {
    const r = this.db
      .query<DbShape, [string, number]>(
        `SELECT * FROM app_history WHERE app_id = ? AND version = ?`
      )
      .get(app_id, version);
    if (!r) return undefined;
    return this.rehydrate(r);
  }

  async latestVersion(app_id: string): Promise<number | undefined> {
    const r = this.db
      .query<{ v: number | null }, [string]>(
        `SELECT MAX(version) as v FROM app_history WHERE app_id = ?`
      )
      .get(app_id);
    if (!r || r.v === null) return undefined;
    return r.v;
  }

  async listEntries(
    app_id: string,
    opts: { direction?: "asc" | "desc"; limit?: number } = {}
  ): Promise<AppHistoryEntry[]> {
    const dir = opts.direction === "desc" ? "DESC" : "ASC";
    const sql = opts.limit
      ? `SELECT * FROM app_history WHERE app_id = ? ORDER BY version ${dir} LIMIT ?`
      : `SELECT * FROM app_history WHERE app_id = ? ORDER BY version ${dir}`;
    const rows = opts.limit
      ? this.db.query<DbShape, [string, number]>(sql).all(app_id, opts.limit)
      : this.db.query<DbShape, [string]>(sql).all(app_id);
    return rows.map((r) => this.rehydrate(r));
  }

  async restoreStateAt(app_id: string, version: number): Promise<unknown> {
    const entry = await this.getByVersion(app_id, version);
    if (!entry) {
      throw new AppHistoryError(
        `no history entry for app="${app_id}" version=${version}`,
        "entry_not_found"
      );
    }
    if (entry.history_type === "snapshot") {
      return entry.payload;
    }
    // delta path: MVP not implemented.
    // Future: find entry.parent_snapshot_version → load snapshot → walk forward apply each delta
    //   until target version, using JSON Patch RFC 6902 apply().
    throw new AppHistoryError(
      `entry at version ${version} is a delta; MVP supports snapshot restore only`,
      "delta_restore_not_implemented"
    );
  }

  async prune(app_id: string): Promise<{ pruned: number }> {
    // MVP: keep the most-recent RETENTION_BUFFER_LIMIT * SNAPSHOT_FREQUENCY entries per app.
    // 真实情况下 retention 应按 "整组" 裁, 但 MVP 只写 snapshot 所以每 entry 就是一组.
    // 当混合 snapshot+delta 后 需改成 "找到第 retention 个 snapshot 再向前删" 以避免孤儿 delta.
    const keep = RETENTION_BUFFER_LIMIT * SNAPSHOT_FREQUENCY;
    const r = this.db
      .query<{ c: number }, [string]>(
        `SELECT COUNT(*) as c FROM app_history WHERE app_id = ?`
      )
      .get(app_id);
    const total = r?.c ?? 0;
    if (total <= keep) return { pruned: 0 };

    const toDelete = total - keep;
    this.db
      .query(
        `DELETE FROM app_history
         WHERE id IN (
           SELECT id FROM app_history
           WHERE app_id = ?
           ORDER BY version ASC
           LIMIT ?
         )`
      )
      .run(app_id, toDelete);
    return { pruned: toDelete };
  }

  private validatePayloadShape(input: NewAppHistoryEntry): void {
    if (input.history_type === "snapshot") {
      if (
        input.payload === null ||
        typeof input.payload !== "object" ||
        Array.isArray(input.payload)
      ) {
        throw new AppHistoryError(
          `snapshot payload must be a plain object`,
          "invalid_snapshot_payload"
        );
      }
      if (input.parent_snapshot_version !== undefined) {
        throw new AppHistoryError(
          `snapshot must not carry parent_snapshot_version`,
          "snapshot_with_parent"
        );
      }
    } else {
      // delta
      if (!Array.isArray(input.payload)) {
        throw new AppHistoryError(
          `delta payload must be a JSON-Patch array`,
          "invalid_delta_payload"
        );
      }
      if (input.parent_snapshot_version === undefined) {
        throw new AppHistoryError(
          `delta requires parent_snapshot_version`,
          "delta_missing_parent"
        );
      }
    }
  }

  private rehydrate(r: DbShape): AppHistoryEntry {
    return {
      id: r.id,
      app_id: r.app_id,
      version: r.version,
      history_type: r.history_type,
      payload: JSON.parse(r.payload),
      parent_snapshot_version: r.parent_snapshot_version ?? undefined,
      is_ai_generated: r.is_ai_generated === 1,
      actor_id: r.actor_id,
      actor_kind: r.actor_kind,
      description: r.description ?? undefined,
      operation_scope: r.operation_scope
        ? (JSON.parse(r.operation_scope) as string[])
        : undefined,
      created_at: r.created_at,
    };
  }
}
