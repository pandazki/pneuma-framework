// app_history — pneuma 的 rollback 存储 (ADR-0017 amend 2026-04-24, 借 ToolJet schema).
//
// 作用: Build-phase agent / Builder 每次改了 app 的 schema / policy / code 都写一行,
// Rollback 时按 version 取回 snapshot → 通过 Impact Disclosure 流程还原 prod.
//
// 本文件只定义契约和内存里用到的形态.
// SQLite 持久化 impl 在 bun-sqlite-app-history.ts.
//
// MVP 约束 (与 ADR amend 对齐):
//   - 每 10 次 change 落一次完整 snapshot; 之间 9 次本该是 JSON-Patch delta
//   - MVP 实现只写 snapshot (delta 留未来优化 — 先把正确 schema + CHECK 约束 + retention 落地)
//   - 保留最近 11 组 = 110 行; 老组整组 prune (避免悬空 delta)
//   - CHECK 约束 DB-level: history_type ∈ {snapshot, delta},
//     snapshot → payload 是 object, delta → payload 是 array + parent_snapshot_version 非空
//
// restore 协议 (MVP):
//   - 目标 entry 是 snapshot → 直接返回 payload
//   - 目标 entry 是 delta → 抛 "delta restore not implemented in MVP" (schema 已准备, 等 delta 写入实装)

export type HistoryType = "snapshot" | "delta";
export type ActorKind = "builder" | "agent" | "framework";

export interface AppHistoryEntry {
  readonly id: string;
  readonly app_id: string;
  readonly version: number;
  readonly history_type: HistoryType;
  /** snapshot: plain object (Record<string, unknown>).  delta: JSON-Patch array (Array<{ op, path, value? }>). */
  readonly payload: unknown;
  /** 仅 delta 有值; 指向依赖 snapshot 的 version */
  readonly parent_snapshot_version?: number;
  readonly is_ai_generated: boolean;
  readonly actor_id: string;
  readonly actor_kind: ActorKind;
  readonly description?: string;
  readonly operation_scope?: readonly string[];
  readonly created_at: number;
}

export type NewAppHistoryEntry = Omit<AppHistoryEntry, "id" | "version" | "created_at">;

// ADR-0017 amend 常量; 可由 Builder 在 app config 里 override (post-MVP)
export const SNAPSHOT_FREQUENCY = 10;
export const RETENTION_BUFFER_LIMIT = 11;

export class AppHistoryError extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "AppHistoryError";
  }
}

export interface AppHistoryStore {
  /** 写一行, 自动分配 version + created_at + id */
  append(entry: NewAppHistoryEntry): Promise<AppHistoryEntry>;

  /** 读指定 version 的 entry */
  getByVersion(app_id: string, version: number): Promise<AppHistoryEntry | undefined>;

  /** 当前最高 version, 没写过返回 undefined */
  latestVersion(app_id: string): Promise<number | undefined>;

  /** 一个 app 的所有 entry (按 version asc 或 desc) */
  listEntries(app_id: string, opts?: { direction?: "asc" | "desc"; limit?: number }): Promise<AppHistoryEntry[]>;

  /**
   * restore: 给定 version, 返回那一刻的 app state (snapshot payload).
   * MVP: 如果 entry 是 delta → 抛错.
   * Future: walk snapshot → apply deltas 到目标 version.
   */
  restoreStateAt(app_id: string, version: number): Promise<unknown>;

  /**
   * 裁剪超出 retention_buffer_limit 的组.
   * 一组 = 1 个 snapshot + (至多) SNAPSHOT_FREQUENCY-1 个 delta.
   * MVP 实现: 保留最新 RETENTION_BUFFER_LIMIT * SNAPSHOT_FREQUENCY 行, 其余丢弃.
   * 返回裁掉的行数.
   */
  prune(app_id: string): Promise<{ pruned: number }>;
}

/** 简单 ULID-like id (monotonic base-32 前缀 + random 后缀), 纯内存无依赖 */
export function newHistoryId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `ah_${ts}_${rand}`;
}
