// Bun SQLite 持久化 Row repository.
// 阶段 B B1 第一步: 把 core-domain 从纯内存升级到 "可存可查" 的第一块.
//
// 设计:
//   - 一张 rows 表 (id / table_id / app_id / cells JSON / timestamps / owner_id)
//   - Cells 用 JSON1 存储, 通过 cell-codec 处理 Uint8Array 等非 JSON-safe 类型
//   - 索引: table_id (listByTable 用), owner_id (self-access policy 常用)
//
// 不做 (留后):
//   - 分页 / cursor / offset — Repository 接口 MVP 只有 list()
//   - SQL-level filter / sort — 由 QueryExecutor 在内存里处理 (pgsql/sqlite push-down 迁移时再说)
//   - 事务 — MVP 每次 save 独立; 跨 row 事务留给 StorageService 层面未来扩展
//   - Table repo / Adapter repo / PolicySet repo — declarations 暂留内存

import { Database } from "bun:sqlite";
import { Row } from "../aggregates/row.js";
import type { Repository } from "./types.js";
import { encodeCellValue, decodeCellValue } from "./cell-codec.js";

const DDL_ROWS = `
CREATE TABLE IF NOT EXISTS rows (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  cells TEXT NOT NULL CHECK(json_valid(cells)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  owner_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_rows_table ON rows(table_id);
CREATE INDEX IF NOT EXISTS idx_rows_owner ON rows(owner_id);
`;

interface RowDbShape {
  id: string;
  table_id: string;
  app_id: string;
  cells: string;
  created_at: number;
  updated_at: number;
  owner_id: string | null;
}

export class BunSqliteRowRepository implements Repository<Row> {
  constructor(private readonly db: Database) {
    this.db.exec(DDL_ROWS);
  }

  async get(id: string): Promise<Row | undefined> {
    const r = this.db
      .query<RowDbShape, [string]>(
        "SELECT id, table_id, app_id, cells, created_at, updated_at, owner_id FROM rows WHERE id = ?"
      )
      .get(id);
    if (!r) return undefined;
    return this.rehydrate(r);
  }

  async list(): Promise<Row[]> {
    const rs = this.db
      .query<RowDbShape, []>(
        "SELECT id, table_id, app_id, cells, created_at, updated_at, owner_id FROM rows ORDER BY id"
      )
      .all();
    return rs.map((r) => this.rehydrate(r));
  }

  async save(entity: Row): Promise<void> {
    const cellsObj: Record<string, unknown> = {};
    for (const [k, v] of entity.cells) cellsObj[k] = encodeCellValue(v);
    const cellsJson = JSON.stringify(cellsObj);
    this.db
      .query(
        `INSERT OR REPLACE INTO rows
         (id, table_id, app_id, cells, created_at, updated_at, owner_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entity.id,
        entity.table_id,
        entity.app_id,
        cellsJson,
        entity.created_at,
        entity.updated_at,
        entity.owner_id ?? null
      );
  }

  async delete(id: string): Promise<boolean> {
    const r = this.db.query("DELETE FROM rows WHERE id = ?").run(id);
    return (r.changes as number) > 0;
  }

  /** 测试辅助: 当前大小 */
  size(): number {
    const r = this.db
      .query<{ c: number }, []>("SELECT COUNT(*) as c FROM rows")
      .get();
    return r?.c ?? 0;
  }

  /** 测试辅助: 清空 */
  clear(): void {
    this.db.exec("DELETE FROM rows");
  }

  private rehydrate(r: RowDbShape): Row {
    const cellsObj = JSON.parse(r.cells) as Record<string, unknown>;
    const cells: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cellsObj)) cells[k] = decodeCellValue(v);
    return new Row({
      id: r.id,
      table_id: r.table_id,
      app_id: r.app_id,
      cells,
      created_at: r.created_at,
      updated_at: r.updated_at,
      owner_id: r.owner_id ?? undefined,
    });
  }
}

/** 便利: 开一个 :memory: 库 (测试用). 外部可传文件路径. */
export function openRowDatabase(path: string = ":memory:"): Database {
  return new Database(path);
}
