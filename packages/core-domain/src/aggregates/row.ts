// Row — per-row aggregate (ADR-0002 / domain-model.md §2.2).
// 不变量（Row 自己能检查的）:
//   - id / table_id / app_id 非空
//   - updated_at >= created_at
// 不闭环（StorageService 职责）:
//   - cells 的 key 必须在 Table.columns 里
//   - cell 值类型必须匹配 Table 的列 CellType
//   - ref-row 指向的目标 Row 存在（跨 aggregate）
//
// 存储结构: cells = Map<column_name, raw_value>. 不裹 Cell 类型对象——类型由 Table schema 决定.

export interface RowInit {
  id: string;
  table_id: string;
  app_id: string;
  /** 可选：初始化时直接塞一批 cells */
  cells?: Record<string, unknown>;
  created_at?: number;
  updated_at?: number;
  owner_id?: string;
}

export class RowInvariantViolation extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "RowInvariantViolation";
  }
}

export class Row {
  readonly id: string;
  readonly table_id: string;
  readonly app_id: string;
  readonly created_at: number;
  readonly owner_id?: string;

  private readonly _cells: Map<string, unknown>;
  private _updated_at: number;

  constructor(init: RowInit) {
    if (!init.id) throw new RowInvariantViolation("id required", "empty_id");
    if (!init.table_id) throw new RowInvariantViolation("table_id required", "empty_table_id");
    if (!init.app_id) throw new RowInvariantViolation("app_id required", "empty_app_id");

    const now = Date.now();
    this.id = init.id;
    this.table_id = init.table_id;
    this.app_id = init.app_id;
    this.created_at = init.created_at ?? now;
    this._updated_at = init.updated_at ?? this.created_at;
    this.owner_id = init.owner_id;

    if (this._updated_at < this.created_at) {
      throw new RowInvariantViolation(
        "updated_at < created_at",
        "timestamp_inversion"
      );
    }

    this._cells = new Map();
    if (init.cells) {
      for (const [k, v] of Object.entries(init.cells)) {
        this._cells.set(k, v);
      }
    }
  }

  get updated_at(): number {
    return this._updated_at;
  }

  /** 浅拷贝快照，防外部直接写入 _cells */
  get cells(): ReadonlyMap<string, unknown> {
    return this._cells;
  }

  /** 纯内存视图 — 便于 WhereClause EvalContext 用 */
  toRowView(): Record<string, unknown> {
    const out: Record<string, unknown> = {
      id: this.id,
      created_at: this.created_at,
      updated_at: this._updated_at,
    };
    if (this.owner_id !== undefined) out.owner_id = this.owner_id;
    for (const [k, v] of this._cells) out[k] = v;
    return out;
  }

  hasCell(name: string): boolean {
    return this._cells.has(name);
  }

  getCell(name: string): unknown {
    return this._cells.get(name);
  }

  /** 写单元格；自动 bump updated_at */
  setCell(name: string, value: unknown, now: number = Date.now()): void {
    if (!name) throw new RowInvariantViolation("cell name required", "empty_cell_name");
    this._cells.set(name, value);
    this.bumpUpdated(now);
  }

  /** 批量写；单次 bump */
  setCells(patch: Record<string, unknown>, now: number = Date.now()): void {
    for (const [k, v] of Object.entries(patch)) {
      if (!k) throw new RowInvariantViolation("cell name required", "empty_cell_name");
      this._cells.set(k, v);
    }
    this.bumpUpdated(now);
  }

  /** 删单元格（cells Map 里移除；列是否 nullable 由 StorageService 依 Table schema 校验） */
  unsetCell(name: string, now: number = Date.now()): boolean {
    const ok = this._cells.delete(name);
    if (ok) this.bumpUpdated(now);
    return ok;
  }

  /**
   * 结构化 diff：返回所有发生变化的列 { before, after }.
   * 用于 mutation event 的 payload（ADR-0013 MutationPayload.diff）.
   */
  diff(other: Row): Record<string, { before: unknown; after: unknown }> {
    const out: Record<string, { before: unknown; after: unknown }> = {};
    const allCols = new Set<string>([
      ...this._cells.keys(),
      ...other._cells.keys(),
    ]);
    for (const col of allCols) {
      const a = this._cells.get(col);
      const b = other._cells.get(col);
      if (!shallowEqualish(a, b)) out[col] = { before: a, after: b };
    }
    return out;
  }

  private bumpUpdated(now: number): void {
    if (now < this._updated_at) {
      // 不允许倒退；容忍"同一毫秒"
      this._updated_at = this._updated_at;
    } else {
      this._updated_at = now;
    }
  }
}

/**
 * 结构化相等（浅层 + 处理 array / Uint8Array / 日期 number）.
 * 不用 JSON.stringify 避免 circular / 未定义顺序问题.
 */
function shallowEqualish(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!shallowEqualish(a[i], b[i])) return false;
    return true;
  }
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    for (const k of ak) if (!shallowEqualish(ao[k], bo[k])) return false;
    return true;
  }
  return false;
}
