// QueryExecutor — 执行 reads_only Operation (ADR-0020).
// 职责:
//   1. 根据主 Table 的 source 分派:
//      - stored: 扫内存 rows, WhereClause.evaluate 过滤
//      - adapter-backed: 委托 AdapterInvoker.list (带 pushdown split),
//        AdapterInvoker 对 local_filter 部分返回; QueryExecutor 应用本地过滤
//   2. sort / fields / limit 后处理
//   3. MVP 不做: cursor pagination · with 关系 · cache_ttl · derived / hybrid source

import type { Operation, QueryBody } from "../aggregates/operation.js";
import type { PermissionContext } from "../value-objects/permission-context.js";
import { evaluate } from "../value-objects/where-clause.js";
import type { StorageService } from "./storage-service.js";
import {
  AdapterInvoker,
  applyLocalFilter,
  type ExternalRow,
} from "./adapter-invoker.js";
import type { Adapter } from "../aggregates/adapter.js";
import type { Repository } from "../repositories/types.js";
import type { Row } from "../aggregates/row.js";

// ---------- shape ----------

export interface QueryResult {
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  /** 未来扩展: cursor / total_count / debug */
}

export class QueryExecutionError extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "QueryExecutionError";
  }
}

// ---------- executor ----------

export class QueryExecutor {
  constructor(
    private readonly storage: StorageService,
    private readonly invoker: AdapterInvoker,
    private readonly adapters: Repository<Adapter>
  ) {}

  async run(
    op: Operation,
    input: unknown,
    ctx: PermissionContext
  ): Promise<QueryResult> {
    if (!op.isQuery() || op.handler.kind !== "query") {
      throw new QueryExecutionError(
        `operation "${op.id}" is not a query (reads_only=false or handler.kind!=query)`,
        "not_a_query"
      );
    }
    const query = op.handler;
    const table = await this.storage.requireTable(query.on);

    if (table.source.kind === "stored") {
      return this.runStored(query, input, ctx);
    }
    if (table.source.kind === "adapter-backed") {
      const adapterId = table.source.adapter;
      const adapter = await this.adapters.get(adapterId);
      if (!adapter) {
        throw new QueryExecutionError(
          `adapter-backed table "${query.on}" references unknown adapter "${adapterId}"`,
          "adapter_not_found"
        );
      }
      return this.runAdapterBacked(query, adapter, input, ctx);
    }
    throw new QueryExecutionError(
      `unsupported table source "${table.source.kind}" for query (MVP)`,
      "unsupported_source"
    );
  }

  // ---------- stored ----------

  private async runStored(
    query: QueryBody,
    input: unknown,
    ctx: PermissionContext
  ): Promise<QueryResult> {
    const rows = await this.storage.listRowsByTable(query.on);
    const views = rows.map((r) => r.toRowView());

    const filtered = query.filter
      ? views.filter((rv) =>
          evaluate(query.filter!, {
            row: rv,
            user: ctx.user,
            input: (input as Record<string, unknown>) ?? undefined,
            now: Date.now(),
          })
        )
      : views;

    const sorted = applySort(filtered, query.sort);
    const limited =
      query.pagination.kind === "offset" || query.pagination.kind === "cursor"
        ? sorted.slice(0, query.pagination.size)
        : sorted;
    const projected = projectFields(limited, query.fields);

    return { rows: projected };
  }

  // ---------- adapter-backed ----------

  private async runAdapterBacked(
    query: QueryBody,
    adapter: Adapter,
    input: unknown,
    ctx: PermissionContext
  ): Promise<QueryResult> {
    // 把 input 暴露给 WhereClause 求值时 (invoker 会把 user.* 提前解析; input.* 由本地 filter 用)
    const listResult = await this.invoker.list(adapter, ctx, {
      filter: query.filter,
      sort: query.sort,
      limit: query.pagination.size,
      fields: query.fields ? [...query.fields] : undefined,
    });

    // local filter: WhereClause 里不可下推的那部分, 用 row-aware ctx 求值
    const locallyFiltered = (
      listResult.local_filter
        ? (listResult.rows as readonly ExternalRow[]).filter((r) =>
            evaluate(listResult.local_filter!, {
              row: r,
              user: ctx.user,
              input: (input as Record<string, unknown>) ?? undefined,
              now: Date.now(),
            })
          )
        : listResult.rows
    ) as readonly Readonly<Record<string, unknown>>[];

    // 本地 sort (adapter 可能没完全 sort) — sort is idempotent, 重来一遍不伤
    const sorted = applySort([...locallyFiltered], query.sort);
    // 本地 limit
    const limited = sorted.slice(0, query.pagination.size);
    const projected = projectFields(limited, query.fields);

    return { rows: projected };
  }
}

// ---------- helpers ----------

function applySort(
  rows: readonly Readonly<Record<string, unknown>>[],
  sort: QueryBody["sort"]
): Readonly<Record<string, unknown>>[] {
  if (!sort || sort.length === 0) return [...rows];
  const copy = [...rows];
  copy.sort((a, b) => {
    for (const s of sort) {
      const av = a[s.column];
      const bv = b[s.column];
      const cmp = compareValues(av, bv);
      if (cmp !== 0) return s.dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
  return copy;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  return 0;
}

function projectFields(
  rows: readonly Readonly<Record<string, unknown>>[],
  fields: readonly string[] | undefined
): Readonly<Record<string, unknown>>[] {
  if (!fields || fields.length === 0) return [...rows];
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const f of fields) if (f in r) out[f] = r[f];
    return out;
  });
}

// Re-export for convenience in tests (delete_bookmark not affected)
export type { Row };
