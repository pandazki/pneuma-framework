// Operation — UI/Agent 双绑定 first-class primitive (ADR-0018).
// Operation 是声明式对象：UI 按钮、Agent tool、audit event、policy check、
// impact disclosure 全部由一份声明派生。MVP 只支持 code handler 和 query body,
// prompt-as-handler / composition 推到 post-MVP.
//
// 不变量:
//   - affects.reads_only === true ⟹ handler 是 QueryBody, 或 (code handler 且 mutations/adapter_writes 都为空)
//     (后者是 ADR-0018 amend 2026-04-24: "reads-only computed" — 例如 cosine 相似度 / 图聚合,
//     真不写数据但需要代码表达, 不能用 QueryBody 声明清楚)
//   - affects.destructive === true ⟹ impact 必填
//   - affects.reads_only === true AND affects.destructive === true → 矛盾，拒绝
//   - input.fields 的 CellType 都合法
//   - affects.mutations / adapter_writes 元素为非空字符串
//   - 跨 aggregate 的 mutations / adapter_writes 指向存在性由 StorageService / AdapterInvoker 校验

import { isCellType, type CellType } from "../value-objects/cell-type.js";
import type { WhereClause } from "../value-objects/where-clause.js";

// ---------- input schema ----------

export interface InputSchemaField {
  readonly type: CellType;
  readonly required?: boolean;
  readonly default?: unknown;
}

export interface InputSchema {
  readonly type: "record";
  readonly fields: Readonly<Record<string, InputSchemaField>>;
}

// ---------- affect declaration ----------

export interface AffectDeclaration {
  readonly mutations: readonly string[]; // table ids
  readonly adapter_writes: readonly string[]; // adapter ids
  readonly destructive: boolean;
  readonly reads_only: boolean;
}

// ---------- handler / query body (mutually exclusive) ----------

export interface HandlerRef {
  readonly kind: "code";
  readonly ref: string; // e.g. "./operations/delete_bookmark.ts"
}

export interface QueryBody {
  readonly kind: "query";
  readonly on: string; // table id
  readonly filter?: WhereClause;
  readonly sort?: ReadonlyArray<{ readonly column: string; readonly dir: "asc" | "desc" }>;
  readonly fields?: readonly string[];
  /** with (关系 join)：MVP 留 shape，不实现；默认不传 */
  readonly with?: readonly QueryWith[];
  readonly pagination: {
    readonly kind: "cursor" | "offset";
    readonly size: number;
  };
  readonly cache_ttl?: number;
}

export interface QueryWith {
  readonly relation: string;
  readonly as?: string;
  readonly filter?: WhereClause;
  readonly sort?: ReadonlyArray<{ readonly column: string; readonly dir: "asc" | "desc" }>;
  readonly limit?: number;
  readonly fields?: readonly string[];
}

// ---------- UI / Agent hints ----------

export interface UIBinding {
  readonly visible_on?: ReadonlyArray<{
    readonly view: string;
    readonly placement: "row_menu" | "header_action" | "inline_button" | "context_menu";
    readonly label?: string;
    readonly icon?: string;
    readonly style?: "default" | "primary" | "destructive";
  }>;
  readonly confirm_dialog?: boolean;
}

export interface AgentToolConfig {
  readonly name?: string;
  readonly parameter_descriptions?: Readonly<Record<string, string>>;
  readonly examples?: ReadonlyArray<{
    readonly utterance: string;
    readonly resolved_params: unknown;
  }>;
}

// ---------- impact ----------

export interface ImpactDescriptor {
  readonly compute: HandlerRef;
  readonly disclosure_template: string;
}

// ---------- output spec ----------

export type OperationOutput = CellType | { readonly kind: "void" } | { readonly kind: "row-list"; readonly row_type: string };

// ---------- aggregate ----------

export interface OperationInit {
  id: string;
  app_id: string;
  name: string;
  description: string;
  input: InputSchema;
  output: OperationOutput;
  affects: AffectDeclaration;
  handler: HandlerRef | QueryBody;
  ui_binding?: UIBinding;
  agent_tool?: AgentToolConfig;
  impact?: ImpactDescriptor;
}

export class OperationInvariantViolation extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "OperationInvariantViolation";
  }
}

export class Operation {
  readonly id: string;
  readonly app_id: string;
  readonly name: string;
  readonly description: string;
  readonly input: InputSchema;
  readonly output: OperationOutput;
  readonly affects: AffectDeclaration;
  readonly handler: HandlerRef | QueryBody;
  readonly ui_binding?: UIBinding;
  readonly agent_tool?: AgentToolConfig;
  readonly impact?: ImpactDescriptor;

  constructor(init: OperationInit) {
    if (!init.id) throw new OperationInvariantViolation("id required", "empty_id");
    if (!init.app_id) throw new OperationInvariantViolation("app_id required", "empty_app_id");
    if (!init.name) throw new OperationInvariantViolation("name required", "empty_name");

    // reads_only + destructive 矛盾
    if (init.affects.reads_only && init.affects.destructive) {
      throw new OperationInvariantViolation(
        `operation "${init.id}": reads_only and destructive cannot both be true`,
        "contradictory_affects"
      );
    }

    // reads_only ⟹ (QueryBody) OR (code handler with no side effects)
    //   - query body: classic read Operation, runs via QueryExecutor
    //   - code handler + empty mutations + empty adapter_writes: "reads-only computed"
    //     (e.g. cosine similarity over existing rows) — runs via OperationExecutor
    //     like any other code Operation. See ADR-0018 amendment 2026-04-24.
    if (init.affects.reads_only && init.handler.kind !== "query") {
      const hasMutations = init.affects.mutations.length > 0;
      const hasAdapterWrites = init.affects.adapter_writes.length > 0;
      if (hasMutations || hasAdapterWrites) {
        throw new OperationInvariantViolation(
          `operation "${init.id}": reads_only=true with code handler requires empty mutations and adapter_writes ` +
            `(got mutations=[${init.affects.mutations.join(",")}], adapter_writes=[${init.affects.adapter_writes.join(",")}])`,
          "reads_only_code_must_be_side_effect_free"
        );
      }
    }
    // !reads_only + query handler → 也错（query 不该做变更）
    if (!init.affects.reads_only && init.handler.kind === "query") {
      throw new OperationInvariantViolation(
        `operation "${init.id}": query handler requires reads_only=true`,
        "query_requires_reads_only"
      );
    }

    // destructive ⟹ impact
    if (init.affects.destructive && !init.impact) {
      throw new OperationInvariantViolation(
        `operation "${init.id}": destructive=true requires impact descriptor`,
        "destructive_requires_impact"
      );
    }

    // input fields 类型合法
    for (const [name, field] of Object.entries(init.input.fields)) {
      if (!isCellType(field.type)) {
        throw new OperationInvariantViolation(
          `operation "${init.id}": input field "${name}" has invalid CellType`,
          "invalid_input_type"
        );
      }
    }

    // affects 的 id 列表非空字符串
    for (const t of init.affects.mutations) {
      if (!t || typeof t !== "string") {
        throw new OperationInvariantViolation(
          `operation "${init.id}": affects.mutations contains empty / non-string id`,
          "invalid_mutation_ref"
        );
      }
    }
    for (const a of init.affects.adapter_writes) {
      if (!a || typeof a !== "string") {
        throw new OperationInvariantViolation(
          `operation "${init.id}": affects.adapter_writes contains empty / non-string id`,
          "invalid_adapter_ref"
        );
      }
    }

    this.id = init.id;
    this.app_id = init.app_id;
    this.name = init.name;
    this.description = init.description;
    this.input = init.input;
    this.output = init.output;
    this.affects = init.affects;
    this.handler = init.handler;
    this.ui_binding = init.ui_binding;
    this.agent_tool = init.agent_tool;
    this.impact = init.impact;
  }

  isQuery(): boolean {
    return this.affects.reads_only && this.handler.kind === "query";
  }

  requiresConfirmation(): boolean {
    // destructive + 非 reads_only + UI binding 默认开启 confirm（除非显式关掉）
    if (!this.affects.destructive) return false;
    if (this.ui_binding?.confirm_dialog === false) return false;
    return true;
  }
}
