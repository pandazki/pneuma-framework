// StorageService — 协调 Table + Row + 跨 aggregate ref 完整性.
// 对应 domain-model.md §4 "services" + §5.1 调用链里的 StorageService 角色.

import { Table, columnTypesEqual } from "../aggregates/table.js";
import { Row } from "../aggregates/row.js";
import type { Repository } from "../repositories/types.js";
import { isValidCellValue } from "../value-objects/cell.js";
import { isRef, type Ref } from "../value-objects/ref.js";

export class StorageError extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "StorageError";
  }
}

export interface SaveRowOptions {
  /** 默认 true: 跨 aggregate 的 ref-row 指向目标必须存在；false 时跳过（测试用） */
  checkRefIntegrity?: boolean;
}

export interface DeleteRowResult {
  /** 所有被实际删除的 row id（含级联） */
  deleted: string[];
}

export class StorageService {
  constructor(
    private readonly tables: Repository<Table>,
    private readonly rows: Repository<Row>
  ) {}

  // ---------- read ----------

  async getTable(id: string): Promise<Table | undefined> {
    return this.tables.get(id);
  }

  async requireTable(id: string): Promise<Table> {
    const t = await this.tables.get(id);
    if (!t)
      throw new StorageError(`table "${id}" not found`, "table_not_found");
    return t;
  }

  async getRow(id: string): Promise<Row | undefined> {
    return this.rows.get(id);
  }

  async listRowsByTable(table_id: string): Promise<Row[]> {
    const all = await this.rows.list();
    return all.filter((r) => r.table_id === table_id);
  }

  // ---------- write ----------

  /**
   * 保存 row. 校验:
   *   1. row.table_id 指向存在的 Table
   *   2. cells 的每个 key 都在 Table.columns 里
   *   3. 每个 cell 值匹配对应 Column.type
   *   4. ref-row cell 指向的目标 row 存在（可关）
   *   5. system_owned 表的 row.id 不允许变更（通过 id 固定 readonly 保证）
   */
  async saveRow(row: Row, opts: SaveRowOptions = {}): Promise<void> {
    const table = await this.requireTable(row.table_id);

    // keys 与列对齐
    for (const [name, value] of row.cells) {
      const col = table.getColumn(name);
      if (!col) {
        throw new StorageError(
          `row "${row.id}": cell "${name}" has no matching column in table "${table.id}"`,
          "cell_name_not_in_schema"
        );
      }
      if (!isValidCellValue(col.type, value)) {
        throw new StorageError(
          `row "${row.id}": cell "${name}" value does not match column CellType`,
          "cell_value_type_mismatch"
        );
      }
    }

    // required (非 nullable) 列必须存在
    for (const col of table.columns) {
      if (col.nullable === true) continue;
      if (!row.hasCell(col.name)) {
        // 允许默认值 - 但 MVP 不实现 default，非空就是必须显式
        throw new StorageError(
          `row "${row.id}": required column "${col.name}" missing (nullable=false)`,
          "required_column_missing"
        );
      }
    }

    // ref-row 指向目标必须存在
    if (opts.checkRefIntegrity !== false) {
      for (const [name, value] of row.cells) {
        const col = table.getColumn(name);
        if (!col) continue;
        if (col.type.kind === "ref-row") {
          if (!isRef(value) || value.kind !== "row") continue;
          await this.ensureRefExists(value);
        } else if (col.type.kind === "ref-row-list") {
          if (!Array.isArray(value)) continue;
          for (const item of value) {
            if (isRef(item) && item.kind === "row") {
              await this.ensureRefExists(item);
            }
          }
        }
      }
    }

    await this.rows.save(row);
  }

  /**
   * 删 row. 支持 Table.relations 里 cascade_delete=true 的 has_many 关系级联:
   *   - 找出所有"以我为主"的 has_many relation
   *   - 对每个，把 relation.to 表里 remote_column == 本 row 的 local_column 值 的 rows 删掉（递归）
   */
  async deleteRow(id: string): Promise<DeleteRowResult> {
    const row = await this.rows.get(id);
    if (!row) {
      throw new StorageError(`row "${id}" not found`, "row_not_found");
    }
    const deleted: string[] = [];
    await this.deleteRowCascade(row, deleted, new Set());
    return { deleted };
  }

  // ---------- internal ----------

  private async ensureRefExists(ref: Extract<Ref, { kind: "row" }>): Promise<void> {
    const target = await this.rows.get(ref.id);
    if (!target) {
      throw new StorageError(
        `ref-row target missing: table="${ref.table}" id="${ref.id}"`,
        "ref_target_missing"
      );
    }
    if (target.table_id !== ref.table) {
      throw new StorageError(
        `ref-row target table mismatch: expected "${ref.table}", actual "${target.table_id}"`,
        "ref_target_table_mismatch"
      );
    }
  }

  private async deleteRowCascade(
    row: Row,
    deleted: string[],
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(row.id)) return;
    visited.add(row.id);

    // 驱动 cascade 的方式: 扫所有表的 ref-row / ref-row-list 列, 若列声明了
    // cascade_on_target_delete=true 且列 type.table === 本 row 的 table_id,
    // 则该列指向本 row 的那些 rows 都要连带删除 (递归).
    const allTables = await this.tables.list();
    const allRows = await this.rows.list();

    for (const t of allTables) {
      for (const col of t.columns) {
        if (!col.cascade_on_target_delete) continue;
        if (
          col.type.kind !== "ref-row" &&
          col.type.kind !== "ref-row-list"
        )
          continue;
        if (col.type.table !== row.table_id) continue;

        const hits = allRows.filter((r) => {
          if (r.table_id !== t.id) return false;
          const rv = r.getCell(col.name);
          if (col.type.kind === "ref-row") {
            return isRef(rv) && rv.kind === "row" && rv.id === row.id;
          }
          // ref-row-list
          if (!Array.isArray(rv)) return false;
          return rv.some(
            (item) => isRef(item) && item.kind === "row" && item.id === row.id
          );
        });
        for (const h of hits) await this.deleteRowCascade(h, deleted, visited);
      }
    }

    const ok = await this.rows.delete(row.id);
    if (ok) deleted.push(row.id);
  }

  /** schema 一致性（用于 deploy 时：两 schema 结构是否一致） */
  tablesSchemaAligned(a: Table, b: Table): boolean {
    if (a.id !== b.id) return false;
    if (a.columns.length !== b.columns.length) return false;
    for (let i = 0; i < a.columns.length; i++) {
      const ca = a.columns[i]!;
      const cb = b.columns[i]!;
      if (ca.name !== cb.name) return false;
      if (!columnTypesEqual(ca, cb)) return false;
    }
    return true;
  }
}
