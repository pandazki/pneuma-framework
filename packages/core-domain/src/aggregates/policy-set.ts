// PolicySet — 一个 app 的全部 policy rules 作为一个原子 aggregate (ADR-0007 + ADR-0009).
//
// 为什么整体一个 aggregate（不是每 rule 独立）:
//   - 规则联合求值（任一 allow 命中即允许）需要统一编译
//   - 单次编辑常跨多 rule
//   - monotonic version 让 query cache 失效干净 (ADR-0020 amend 依赖)
//
// 不变量:
//   - subject / action / resource 都来自封闭词汇表 (ADR-0007)
//   - rule.when 是合法 WhereClause (由 isWhereClause 保证, 传入时校验)
//   - version 单调递增（每次 edit +1）
// 跨 aggregate:
//   - rule.on 指向 Table / Operation / Adapter / ... 的存在性: 由 StorageService / deploy-time 做

import {
  getSubjects,
  requiresUserContext,
  isWhereClause,
  type WhereClause,
  type SubjectPath,
} from "../value-objects/where-clause.js";

// ---------- closed vocabularies ----------

export type Subject =
  | { readonly kind: "user"; readonly id: string }
  | { readonly kind: "role"; readonly name: string }
  | { readonly kind: "owner" }
  | { readonly kind: "self" }
  | { readonly kind: "anyone" }
  | { readonly kind: "anonymous" }
  | { readonly kind: "any" }; // `*`

export type Action =
  | "read"
  | "write"
  | "create"
  | "delete"
  | "list"
  | "invoke"
  | "*";

export type Resource =
  | { readonly kind: "app" }
  | { readonly kind: "table"; readonly id: string; readonly scope?: "row" }
  | { readonly kind: "column"; readonly table: string; readonly name: string }
  | { readonly kind: "view"; readonly id: string }
  | { readonly kind: "adapter"; readonly id: string }
  | { readonly kind: "transform"; readonly id: string }
  | { readonly kind: "operation"; readonly id: string };

export type PolicyEffect = "allow" | "deny";

const SUBJECT_KINDS: ReadonlySet<string> = new Set([
  "user",
  "role",
  "owner",
  "self",
  "anyone",
  "anonymous",
  "any",
]);

const ACTIONS: ReadonlySet<string> = new Set([
  "read",
  "write",
  "create",
  "delete",
  "list",
  "invoke",
  "*",
]);

const RESOURCE_KINDS: ReadonlySet<string> = new Set([
  "app",
  "table",
  "column",
  "view",
  "adapter",
  "transform",
  "operation",
]);

// ---------- rule + set ----------

export interface PolicyRule {
  readonly id: string;
  readonly effect?: PolicyEffect;
  readonly allow: readonly Subject[];
  readonly do: readonly Action[];
  readonly on: Resource;
  readonly when?: WhereClause;
}

export interface PolicyRuleUpdate {
  readonly effect?: PolicyEffect;
  readonly allow?: readonly Subject[];
  readonly do?: readonly Action[];
  readonly on?: Resource;
  readonly when?: WhereClause | null;
}

export interface DefaultPosture {
  readonly app: "public" | "restricted";
}

export interface PolicySetInit {
  app_id: string;
  default_posture?: DefaultPosture;
  rules?: PolicyRule[];
}

export class PolicySetInvariantViolation extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "PolicySetInvariantViolation";
  }
}

// ---------- compile / analysis types ----------

export interface CompiledPolicy {
  readonly app_id: string;
  readonly version: number;
  readonly default_posture: DefaultPosture;
  readonly rules: readonly PolicyRule[];
}

export interface AnalysisReport {
  readonly referenced_resources: readonly Resource[];
  readonly referenced_user_paths: readonly string[];
  readonly user_bound_rules_count: number;
}

// ---------- aggregate ----------

export class PolicySet {
  readonly app_id: string;
  private _rules: PolicyRule[] = [];
  private _version = 0;
  private _defaultPosture: DefaultPosture;

  constructor(init: PolicySetInit) {
    if (!init.app_id) {
      throw new PolicySetInvariantViolation("app_id required", "empty_app_id");
    }
    this.app_id = init.app_id;
    this._defaultPosture = init.default_posture ?? { app: "public" };
    for (const r of init.rules ?? []) this.addRuleInternal(r);
    // Constructor-time additions count as a single version bump to 1 (if any rules)
    if ((init.rules ?? []).length > 0) this._version = 1;
  }

  get rules(): readonly PolicyRule[] {
    return this._rules;
  }

  get version(): number {
    return this._version;
  }

  get default_posture(): DefaultPosture {
    return this._defaultPosture;
  }

  /** 添加规则；version +1 */
  addRule(rule: PolicyRule): void {
    this.addRuleInternal(rule);
    this._version++;
  }

  /** 删规则；找不到报错；version +1 */
  removeRule(id: string): void {
    const idx = this._rules.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new PolicySetInvariantViolation(
        `rule "${id}" not found`,
        "rule_not_found"
      );
    }
    this._rules.splice(idx, 1);
    this._version++;
  }

  /** 更新规则；保留 rule id；找不到报错；version +1 */
  updateRule(id: string, patch: PolicyRuleUpdate): PolicyRule {
    const idx = this._rules.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new PolicySetInvariantViolation(
        `rule "${id}" not found`,
        "rule_not_found"
      );
    }

    const current = this._rules[idx]!;
    const next: PolicyRule = {
      id: current.id,
      effect: patch.effect ?? current.effect,
      allow: patch.allow ?? current.allow,
      do: patch.do ?? current.do,
      on: patch.on ?? current.on,
      ...nextWhen(current, patch),
    };

    new PolicySet({
      app_id: this.app_id,
      default_posture: this._defaultPosture,
      rules: [
        ...this._rules.slice(0, idx),
        next,
        ...this._rules.slice(idx + 1),
      ],
    });

    this._rules[idx] = { ...next };
    this._version++;
    return this._rules[idx]!;
  }

  /** 替换 default_posture；version +1 */
  setDefaultPosture(p: DefaultPosture): void {
    this._defaultPosture = p;
    this._version++;
  }

  /** 编译为"决策树快照"（MVP 仅是规则列表 + 元数据）. PolicyEvaluator 真正做求值时用 */
  compile(): CompiledPolicy {
    return {
      app_id: this.app_id,
      version: this._version,
      default_posture: this._defaultPosture,
      rules: [...this._rules],
    };
  }

  /** 静态分析：列被引用的 resource / user.* paths / user-bound rules 计数 */
  staticAnalysis(): AnalysisReport {
    const refResources = this._rules.map((r) => r.on);
    const userPaths = new Set<string>();
    let userBound = 0;
    for (const r of this._rules) {
      if (!r.when) continue;
      if (requiresUserContext(r.when)) userBound++;
      for (const s of getSubjects(r.when)) {
        if (s.ns === "user") userPaths.add(pathKey(s));
      }
    }
    return {
      referenced_resources: refResources,
      referenced_user_paths: Array.from(userPaths),
      user_bound_rules_count: userBound,
    };
  }

  // ---------- internals ----------

  private addRuleInternal(rule: PolicyRule): void {
    if (!rule.id) {
      throw new PolicySetInvariantViolation("rule id required", "empty_rule_id");
    }
    if (this._rules.some((r) => r.id === rule.id)) {
      throw new PolicySetInvariantViolation(
        `duplicate rule id "${rule.id}"`,
        "duplicate_rule_id"
      );
    }
    if (rule.effect !== undefined && rule.effect !== "allow" && rule.effect !== "deny") {
      throw new PolicySetInvariantViolation(
        `rule "${rule.id}": effect "${rule.effect}" not in closed vocabulary`,
        "invalid_effect"
      );
    }
    if (rule.allow.length === 0) {
      throw new PolicySetInvariantViolation(
        `rule "${rule.id}": allow cannot be empty`,
        "empty_allow"
      );
    }
    for (const s of rule.allow) {
      if (!SUBJECT_KINDS.has(s.kind)) {
        throw new PolicySetInvariantViolation(
          `rule "${rule.id}": subject kind "${s.kind}" not in closed vocabulary`,
          "invalid_subject_kind"
        );
      }
      if (s.kind === "user" && !s.id) {
        throw new PolicySetInvariantViolation(
          `rule "${rule.id}": user subject requires non-empty id`,
          "empty_user_id"
        );
      }
      if (s.kind === "role" && !s.name) {
        throw new PolicySetInvariantViolation(
          `rule "${rule.id}": role subject requires non-empty name`,
          "empty_role_name"
        );
      }
    }
    if (rule.do.length === 0) {
      throw new PolicySetInvariantViolation(
        `rule "${rule.id}": do cannot be empty`,
        "empty_do"
      );
    }
    for (const a of rule.do) {
      if (!ACTIONS.has(a)) {
        throw new PolicySetInvariantViolation(
          `rule "${rule.id}": action "${a}" not in closed vocabulary`,
          "invalid_action"
        );
      }
    }
    if (!RESOURCE_KINDS.has(rule.on.kind)) {
      throw new PolicySetInvariantViolation(
        `rule "${rule.id}": resource kind "${rule.on.kind}" not in closed vocabulary`,
        "invalid_resource_kind"
      );
    }
    if (rule.when !== undefined && !isWhereClause(rule.when)) {
      throw new PolicySetInvariantViolation(
        `rule "${rule.id}": when is not a valid WhereClause`,
        "invalid_when"
      );
    }
    this._rules.push({ ...rule });
  }
}

function pathKey(s: SubjectPath): string {
  return s.path.join(".");
}

function nextWhen(
  current: PolicyRule,
  patch: PolicyRuleUpdate
): Pick<PolicyRule, "when"> | Record<string, never> {
  if (!Object.prototype.hasOwnProperty.call(patch, "when")) {
    return current.when === undefined ? {} : { when: current.when };
  }
  return patch.when === null || patch.when === undefined ? {} : { when: patch.when };
}

// ---------- resource helpers (便利构造) ----------

export const Resources = {
  app: (): Resource => ({ kind: "app" }),
  table: (id: string): Resource => ({ kind: "table", id }),
  tableRow: (id: string): Resource => ({ kind: "table", id, scope: "row" }),
  column: (table: string, name: string): Resource => ({
    kind: "column",
    table,
    name,
  }),
  operation: (id: string): Resource => ({ kind: "operation", id }),
  view: (id: string): Resource => ({ kind: "view", id }),
  adapter: (id: string): Resource => ({ kind: "adapter", id }),
  transform: (id: string): Resource => ({ kind: "transform", id }),
};

export const Subjects = {
  user: (id: string): Subject => ({ kind: "user", id }),
  role: (name: string): Subject => ({ kind: "role", name }),
  owner: (): Subject => ({ kind: "owner" }),
  self: (): Subject => ({ kind: "self" }),
  anyone: (): Subject => ({ kind: "anyone" }),
  anonymous: (): Subject => ({ kind: "anonymous" }),
  any: (): Subject => ({ kind: "any" }),
};
