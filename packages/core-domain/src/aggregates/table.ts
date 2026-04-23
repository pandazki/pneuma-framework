// Table — schema aggregate (ADR-0002).
// 不装 rows. Rows 是独立 aggregate (domain-model.md §2.2).
// Table 不校验跨 aggregate 关系 (relations[].to 是否指向存在的 Table)—— 那是 StorageService 职责.

import { isCellType, type CellType, equalsCellType } from "../value-objects/cell-type.js";

export const RESERVED_COLUMN_NAMES: ReadonlySet<string> = new Set([
  "id",
  "created_at",
  "updated_at",
  "owner_id",
]);

export interface Column {
  readonly name: string;
  readonly type: CellType;
  readonly nullable?: boolean;
  readonly default_access?: "public" | "restricted";
  /**
   * 仅对 `ref-row` / `ref-row-list` 列生效:
   * 当引用目标 row 被删除时, 本 row 也被级联删除.
   * 驱动 StorageService.deleteRow 的 cascade 行为.
   */
  readonly cascade_on_target_delete?: boolean;
}

export type TableSource =
  | { readonly kind: "stored" }
  | {
      readonly kind: "adapter-backed";
      readonly adapter: string;
      readonly config: Readonly<Record<string, unknown>>;
      /** 可选: 该 adapter 声明此表对应哪个 externalType */
      readonly externalType?: string;
    }
  | {
      readonly kind: "derived";
      /** 派生表达式 — 形态待 ADR-0002 amend + step 6 场景再定 */
      readonly expression: unknown;
    }
  | {
      readonly kind: "hybrid";
      readonly storedColumns: readonly string[];
      readonly refColumns: readonly string[];
    };

export type RelationKind = "has_one" | "has_many" | "belongs_to" | "many_to_many";

export interface Relation {
  readonly name: string;
  readonly to: string; // target table id
  readonly kind: RelationKind;
  readonly via: {
    readonly kind: "foreign_key";
    readonly local_column: string;
    readonly remote_column: string;
  };
  readonly cascade_delete?: boolean;
}

export interface TableInit {
  id: string;
  app_id: string;
  columns: Column[];
  source: TableSource;
  relations?: Relation[];
  system_owned?: boolean;
}

export class TableInvariantViolation extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "TableInvariantViolation";
  }
}

export class Table {
  readonly id: string;
  readonly app_id: string;
  readonly system_owned: boolean;
  readonly source: TableSource;
  private _columns: Column[];
  private _relations: Relation[];

  constructor(init: TableInit) {
    this.id = init.id;
    this.app_id = init.app_id;
    this.source = init.source;
    this.system_owned = init.system_owned ?? false;
    this._columns = [];
    this._relations = [];

    if (!init.id) throw new TableInvariantViolation("id required", "empty_id");
    if (!init.app_id) throw new TableInvariantViolation("app_id required", "empty_app_id");

    for (const c of init.columns) this.addColumnInternal(c);
    for (const r of init.relations ?? []) this.addRelationInternal(r);
  }

  get columns(): readonly Column[] {
    return this._columns;
  }

  get relations(): readonly Relation[] {
    return this._relations;
  }

  getColumn(name: string): Column | undefined {
    return this._columns.find((c) => c.name === name);
  }

  hasColumn(name: string): boolean {
    return this._columns.some((c) => c.name === name);
  }

  /** 加列。system_owned 表不允许（schema 锁）；同名 / 保留名 / 非法 type 抛错 */
  addColumn(col: Column): void {
    this.requireMutableSchema("addColumn");
    this.addColumnInternal(col);
  }

  /** 删列。只对 Stored 表有效；system_owned 拒 */
  dropColumn(name: string): void {
    this.requireMutableSchema("dropColumn");
    if (this.source.kind !== "stored") {
      throw new TableInvariantViolation(
        `cannot dropColumn on non-stored table (source=${this.source.kind})`,
        "non_stored_drop"
      );
    }
    const idx = this._columns.findIndex((c) => c.name === name);
    if (idx === -1) {
      throw new TableInvariantViolation(
        `column "${name}" not found`,
        "column_not_found"
      );
    }
    this._columns.splice(idx, 1);
  }

  /**
   * 改类型 / nullable / default_access. lossy 变更（如 Number→Text）框架会标
   * destructive:true (见 ADR-0017)；本 MVP 不处理 transformer 链，留给 domain service.
   */
  changeColumn(name: string, patch: Partial<Omit<Column, "name">>): void {
    this.requireMutableSchema("changeColumn");
    const idx = this._columns.findIndex((c) => c.name === name);
    if (idx === -1) {
      throw new TableInvariantViolation(
        `column "${name}" not found`,
        "column_not_found"
      );
    }
    const cur = this._columns[idx]!;
    const next: Column = {
      name: cur.name,
      type: patch.type ?? cur.type,
      nullable: patch.nullable ?? cur.nullable,
      default_access: patch.default_access ?? cur.default_access,
    };
    if (!isCellType(next.type)) {
      throw new TableInvariantViolation(
        `column "${name}" type invalid after change`,
        "invalid_cell_type"
      );
    }
    this._columns[idx] = next;
  }

  addRelation(rel: Relation): void {
    this.requireMutableSchema("addRelation");
    this.addRelationInternal(rel);
  }

  removeRelation(name: string): void {
    this.requireMutableSchema("removeRelation");
    const idx = this._relations.findIndex((r) => r.name === name);
    if (idx === -1) {
      throw new TableInvariantViolation(
        `relation "${name}" not found`,
        "relation_not_found"
      );
    }
    this._relations.splice(idx, 1);
  }

  // ---------- internals ----------

  private addColumnInternal(col: Column): void {
    if (!col.name) {
      throw new TableInvariantViolation("column name required", "empty_column_name");
    }
    // Reserved names 仅对 stored 表生效; adapter-backed / derived / hybrid 表允许
    // 使用 id / created_at / updated_at / owner_id 作为列名 (通常映射到外部系统同名字段).
    // — per ADR-0002 amendment 2026-04-24 (post-step-6 refinement)
    if (this.source.kind === "stored" && RESERVED_COLUMN_NAMES.has(col.name)) {
      throw new TableInvariantViolation(
        `column name "${col.name}" is reserved for stored tables (framework aggregate-level field)`,
        "reserved_column_name"
      );
    }
    if (this.hasColumn(col.name)) {
      throw new TableInvariantViolation(
        `duplicate column name "${col.name}"`,
        "duplicate_column"
      );
    }
    if (!isCellType(col.type)) {
      throw new TableInvariantViolation(
        `column "${col.name}" has invalid CellType`,
        "invalid_cell_type"
      );
    }
    this._columns.push({
      name: col.name,
      type: col.type,
      nullable: col.nullable,
      default_access: col.default_access,
      cascade_on_target_delete: col.cascade_on_target_delete,
    });
  }

  private addRelationInternal(rel: Relation): void {
    if (!rel.name || !rel.to) {
      throw new TableInvariantViolation(
        `relation requires name and to`,
        "invalid_relation"
      );
    }
    if (this._relations.some((r) => r.name === rel.name)) {
      throw new TableInvariantViolation(
        `duplicate relation name "${rel.name}"`,
        "duplicate_relation"
      );
    }
    // via.local_column 必须存在
    if (!this.hasColumn(rel.via.local_column)) {
      throw new TableInvariantViolation(
        `relation "${rel.name}" references non-existent local_column "${rel.via.local_column}"`,
        "relation_missing_local_column"
      );
    }
    this._relations.push({ ...rel });
  }

  private requireMutableSchema(op: string): void {
    if (this.system_owned) {
      throw new TableInvariantViolation(
        `cannot ${op} on system_owned table "${this.id}"`,
        "system_owned_locked"
      );
    }
  }
}

/**
 * 便利：比较两 Column 的 type 是否一致（结构 eq）.
 * 暴露给 StorageService / Row 做 cell-type 一致性校验用.
 */
export function columnTypesEqual(a: Column, b: Column): boolean {
  return equalsCellType(a.type, b.type);
}
