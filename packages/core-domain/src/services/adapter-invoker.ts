// AdapterInvoker — 协调 Adapter 调用.
// 负责:
//   1. 按 credential_mode 解析 credential
//   2. 把 WhereClause 切成 pushable + local (依 adapter.capabilities.filter_pushdown)
//   3. admin_delegated 强约束: required_for_admin_delegated 的 column 必须进 pushable
//      (ADR-0021 安全契约; fail-closed, 不降级本地过滤)
//   4. 解析 value refs (user.* / row.*) 为实际值传给 adapter
//   5. 调 adapter impl (通过 registry 注入, 保持 MVP in-memory 可测)
//
// This slice only needs list-style adapter reads; write operations can be added
// as separate semantic adapter capabilities when a Host contract requires them.
// get/insert/update/delete 接口预留, 实现推后.

import type { Adapter, CredentialMode } from "../aggregates/adapter.js";
import type { PermissionContext } from "../value-objects/permission-context.js";
import {
  evaluate,
  type ComparisonOp,
  type DateSubOp,
  type WhereClause,
  type WhereLeaf,
  type WhereValue,
} from "../value-objects/where-clause.js";

// ---------- pushable query shape ----------

export interface PushableLeaf {
  readonly column: string;
  readonly op: ComparisonOp;
  readonly value?: unknown; // resolved (refs 已展开)
  readonly sub_op?: DateSubOp;
}

export interface PushableQuery {
  /** AND of leaves (MVP: 不支持 pushable 里有 OR/NOT). */
  readonly where: readonly PushableLeaf[];
  readonly sort?: ReadonlyArray<{ readonly column: string; readonly dir: "asc" | "desc" }>;
  readonly limit?: number;
  readonly fields?: readonly string[];
}

// ---------- external row ----------

export type ExternalRow = Readonly<Record<string, unknown>>;

// ---------- adapter implementation contract ----------

export interface AdapterInvocationContext {
  readonly credential_mode: CredentialMode;
  readonly credential: unknown;
  readonly user_binding_value?: unknown; // admin_delegated only
  readonly pneuma_ctx: PermissionContext;
}

export interface AdapterImpl {
  list(query: PushableQuery, ctx: AdapterInvocationContext): Promise<readonly ExternalRow[]>;
  // 预留 — MVP 不实现
  get?(id: string, ctx: AdapterInvocationContext): Promise<ExternalRow>;
  insert?(row: ExternalRow, ctx: AdapterInvocationContext): Promise<string>;
  update?(id: string, patch: Readonly<Record<string, unknown>>, ctx: AdapterInvocationContext): Promise<void>;
  delete?(id: string, ctx: AdapterInvocationContext): Promise<void>;
}

// ---------- credential store ----------

export interface CredentialStore {
  /** shared: app-level; per-user: lookup by user_id; admin_delegated: app-level admin */
  getShared(adapter_id: string): unknown | undefined;
  getPerUser(adapter_id: string, user_id: string): unknown | undefined;
  getAdmin(adapter_id: string): unknown | undefined;
}

export class InMemoryCredentialStore implements CredentialStore {
  private shared = new Map<string, unknown>();
  private perUser = new Map<string, unknown>(); // key: `${adapter}:${user_id}`
  private admin = new Map<string, unknown>();

  setShared(adapter_id: string, cred: unknown): void {
    this.shared.set(adapter_id, cred);
  }
  setPerUser(adapter_id: string, user_id: string, cred: unknown): void {
    this.perUser.set(`${adapter_id}:${user_id}`, cred);
  }
  setAdmin(adapter_id: string, cred: unknown): void {
    this.admin.set(adapter_id, cred);
  }
  getShared(adapter_id: string): unknown | undefined {
    return this.shared.get(adapter_id);
  }
  getPerUser(adapter_id: string, user_id: string): unknown | undefined {
    return this.perUser.get(`${adapter_id}:${user_id}`);
  }
  getAdmin(adapter_id: string): unknown | undefined {
    return this.admin.get(adapter_id);
  }
}

// ---------- errors ----------

export class AdapterInvocationError extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "AdapterInvocationError";
  }
}

// ---------- pushable / local filter split ----------

export interface FilterSplit {
  /** 可下推部分: 已解析 ref values */
  readonly pushable: PushableQuery;
  /** 无法下推部分: 原样 WhereClause, 调用方需要本地再过滤 */
  readonly local?: WhereClause;
}

// ---------- invoker ----------

export interface ListOptions {
  readonly filter?: WhereClause;
  readonly sort?: ReadonlyArray<{ readonly column: string; readonly dir: "asc" | "desc" }>;
  readonly limit?: number;
  readonly fields?: readonly string[];
}

export interface ListResult {
  readonly rows: readonly ExternalRow[];
  /** 未下推部分; QueryExecutor / caller 需对 rows 再本地过滤 */
  readonly local_filter?: WhereClause;
}

export class AdapterInvoker {
  constructor(
    private readonly credentials: CredentialStore,
    private readonly impls: Map<string, AdapterImpl>
  ) {}

  async list(
    adapter: Adapter,
    ctx: PermissionContext,
    opts: ListOptions = {}
  ): Promise<ListResult> {
    const impl = this.impls.get(adapter.id);
    if (!impl) {
      throw new AdapterInvocationError(
        `adapter "${adapter.id}" has no registered impl`,
        "adapter_impl_missing"
      );
    }
    if (!adapter.capabilities.list) {
      throw new AdapterInvocationError(
        `adapter "${adapter.id}" does not declare list capability`,
        "list_not_supported"
      );
    }

    const invCtx = this.resolveInvocationContext(adapter, ctx);
    const split = this.splitFilter(adapter, opts.filter, ctx);

    // admin_delegated contract: 每个 required_for_admin_delegated 列必须出现在 pushable
    if (adapter.credential_mode === "admin_delegated") {
      this.enforceAdminDelegatedContract(adapter, split.pushable);
    }

    // sort pushdown check (soft): 若 sort 列不在 sortable_columns, 警告但不失败.
    // MVP: 直接传给 adapter, adapter 自行决定.
    const pushableQuery: PushableQuery = {
      where: split.pushable.where,
      sort: opts.sort,
      limit: opts.limit,
      fields: opts.fields,
    };

    const rows = await impl.list(pushableQuery, invCtx);
    return { rows, local_filter: split.local };
  }

  // ---------- internals ----------

  private resolveInvocationContext(
    adapter: Adapter,
    ctx: PermissionContext
  ): AdapterInvocationContext {
    switch (adapter.credential_mode) {
      case "shared": {
        const cred = this.credentials.getShared(adapter.id);
        if (cred === undefined) {
          throw new AdapterInvocationError(
            `adapter "${adapter.id}" has no shared credential configured`,
            "credential_missing"
          );
        }
        return { credential_mode: "shared", credential: cred, pneuma_ctx: ctx };
      }
      case "per-user": {
        if (!ctx.user) {
          throw new AdapterInvocationError(
            `adapter "${adapter.id}" requires per-user credential but ctx.user is undefined`,
            "credential_requires_user"
          );
        }
        const cred = this.credentials.getPerUser(adapter.id, ctx.user.id);
        if (cred === undefined) {
          throw new AdapterInvocationError(
            `adapter "${adapter.id}" has no per-user credential for user "${ctx.user.id}"`,
            "credential_missing"
          );
        }
        return { credential_mode: "per-user", credential: cred, pneuma_ctx: ctx };
      }
      case "admin_delegated": {
        const cred = this.credentials.getAdmin(adapter.id);
        if (cred === undefined) {
          throw new AdapterInvocationError(
            `adapter "${adapter.id}" has no admin credential configured`,
            "credential_missing"
          );
        }
        const userBinding = this.resolveUserBinding(adapter, ctx);
        return {
          credential_mode: "admin_delegated",
          credential: cred,
          user_binding_value: userBinding,
          pneuma_ctx: ctx,
        };
      }
    }
  }

  private resolveUserBinding(adapter: Adapter, ctx: PermissionContext): unknown {
    const binding = adapter.identity_binding;
    if (!binding) {
      throw new AdapterInvocationError(
        `adapter "${adapter.id}" admin_delegated without identity_binding`,
        "binding_missing"
      );
    }
    // store_at 形如 "user.attrs.linear_user_id" — 解析成 ctx.user.attrs.linear_user_id
    const segments = binding.store_at.split(".");
    let v: unknown = { user: ctx.user, input: undefined };
    for (const seg of segments) {
      if (v === null || v === undefined || typeof v !== "object") return undefined;
      v = (v as Record<string, unknown>)[seg];
    }
    return v;
  }

  /**
   * 把 WhereClause 切成 pushable + local.
   * MVP 规则:
   *   - AND 分支: 递归切;子节点各自 pushable 合并成 pushable.where
   *   - leaf: 若 adapter.canPushdownFilter(column, op) 且 value 可解析 → pushable
   *   - OR / NOT / 复杂结构: 整体作为 local
   *   - 解析 value: 字面量原样; ValueRef { ref: "user" | "row", path } → 从 ctx 读值
   */
  private splitFilter(
    adapter: Adapter,
    clause: WhereClause | undefined,
    ctx: PermissionContext
  ): FilterSplit {
    if (!clause) {
      return { pushable: { where: [] } };
    }
    const pushable: PushableLeaf[] = [];
    const localClauses: WhereClause[] = [];
    this.walkAnd(clause, adapter, ctx, pushable, localClauses);
    const local: WhereClause | undefined =
      localClauses.length === 0
        ? undefined
        : localClauses.length === 1
          ? localClauses[0]
          : {
              kind: "branch",
              logical_op: "and",
              children: localClauses,
            };
    return { pushable: { where: pushable }, local };
  }

  private walkAnd(
    clause: WhereClause,
    adapter: Adapter,
    ctx: PermissionContext,
    pushable: PushableLeaf[],
    local: WhereClause[]
  ): void {
    if (clause.kind === "branch" && clause.logical_op === "and") {
      for (const c of clause.children) this.walkAnd(c, adapter, ctx, pushable, local);
      return;
    }
    if (clause.kind !== "leaf") {
      // OR / NOT: 整体走本地
      local.push(clause);
      return;
    }
    // leaf
    if (clause.subject.ns !== "row") {
      // adapter 只能看到 row.* — 其它 namespace 的 leaf 必须本地
      local.push(clause);
      return;
    }
    const col = clause.subject.path.join(".");
    if (!adapter.canPushdownFilter(col, clause.op)) {
      local.push(clause);
      return;
    }
    const value = this.resolveValue(clause.value, ctx);
    if (value === undefined && this.isNullOpRequiringValue(clause.op)) {
      // value 解析失败但 op 需要 value (如 eq 但 user path 未绑定)
      local.push(clause);
      return;
    }
    pushable.push({
      column: col,
      op: clause.op,
      value,
      sub_op: clause.sub_op,
    });
  }

  private resolveValue(
    v: WhereValue | undefined,
    ctx: PermissionContext,
    input?: Readonly<Record<string, unknown>>
  ): unknown {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v !== "object") return v;
    if (Array.isArray(v)) return v;
    // ValueRef
    if ("ref" in v) {
      let source: unknown;
      if (v.ref === "user") source = ctx.user;
      else if (v.ref === "input") source = input;
      else source = undefined; // "row": adapter-side pushdown 不支持 row ref (row 是 adapter 返回的结果, 不是 query 的 pre-evaluation context)
      if (!source) return undefined;
      let cur: unknown = source;
      for (const seg of v.path) {
        if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[seg];
      }
      return cur;
    }
    return v;
  }

  private isNullOpRequiringValue(op: ComparisonOp): boolean {
    // null / not_null / empty / not_empty 不需要 value; 其它大多需要
    return !["null", "not_null", "empty", "not_empty"].includes(op);
  }

  /**
   * admin_delegated 强约束 (ADR-0021):
   *   adapter.requiresAdminDelegatedFilter() 里每条 { column, required_ops }
   *   都必须在 pushable.where 里出现至少一条 (column 相同、op 在 required_ops 内、value 非 undefined).
   *   fail-closed: 不满足直接抛错, 不降级本地过滤.
   */
  private enforceAdminDelegatedContract(
    adapter: Adapter,
    pushable: PushableQuery
  ): void {
    const reqs = adapter.requiresAdminDelegatedFilter();
    for (const req of reqs) {
      const hit = pushable.where.find(
        (l) =>
          l.column === req.column &&
          req.required_ops.includes(l.op) &&
          l.value !== undefined &&
          l.value !== null
      );
      if (!hit) {
        throw new AdapterInvocationError(
          `admin_delegated safety contract violated: query for adapter "${adapter.id}" ` +
            `missing pushable filter on column "${req.column}" with op in [${req.required_ops.join(", ")}] ` +
            `(would expose all team data through admin credential)`,
          "admin_delegated_contract_violated"
        );
      }
    }
  }
}

/**
 * 对 rows 应用剩余 local_filter (如果有). 供 QueryExecutor / caller 使用.
 */
export function applyLocalFilter(
  rows: readonly ExternalRow[],
  local: WhereClause | undefined,
  ctx: PermissionContext
): readonly ExternalRow[] {
  if (!local) return rows;
  return rows.filter((r) =>
    evaluate(local, {
      row: r,
      user: ctx.user,
      now: Date.now(),
    })
  );
}
