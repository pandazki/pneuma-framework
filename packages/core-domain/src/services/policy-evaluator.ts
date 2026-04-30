// PolicyEvaluator — 对给定 (action, resource, ctx, row?, target?) 求 allow/deny 决策.
// 对应 domain-model.md §4.3. 基于 PolicySet 的 rules 遍历 + WhereClause 求值.
//
// MVP rules (ADR-0007/0009):
//   1. 遍历所有 rules 命中 (action, resource) 的
//   2. 对每个命中 rule:
//      - subject 与 ctx 匹配? → 否则 skip
//      - 有 when 子句? → 评估; 不过则 skip
//   3. 任一 deny 通过 → deny (explicit-deny)
//   4. 否则任一 allow 通过 → allow (explicit-allow)
//   5. 都没通过 → 取 resource.default_access (caller 传) 或 app 级 default_posture
//      public → allow (default-public), restricted → deny (default-restricted-no-match)

import type {
  Action,
  CompiledPolicy,
  DefaultPosture,
  PolicyRule,
  Resource,
  Subject,
} from "../aggregates/policy-set.js";
import { PolicySet } from "../aggregates/policy-set.js";
import type { PermissionContext } from "../value-objects/permission-context.js";
import { evaluate, type WhereClause } from "../value-objects/where-clause.js";

export type PolicyReason =
  | "explicit-allow"
  | "explicit-deny"
  | "default-public"
  | "default-restricted-no-match";

export type PolicyExplanationReason = PolicyReason;

export interface PolicyDecision {
  readonly decision: "allow" | "deny";
  readonly reason: PolicyReason;
  readonly matched_rule_ids: readonly string[];
}

export interface PolicyExplanation extends Omit<PolicyDecision, "reason"> {
  readonly reason: PolicyExplanationReason;
  readonly default_posture: "public" | "restricted";
  readonly action: Action;
  readonly resource: Resource;
}

export interface CheckOptions {
  readonly rowView?: Readonly<Record<string, unknown>>;
  readonly target?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly resourceDefaultAccess?: "public" | "restricted";
  readonly now?: number;
}

export class PolicyEvaluator {
  constructor(private policy: CompiledPolicy) {}

  snapshot(): CompiledPolicy {
    return {
      ...this.policy,
      rules: [...this.policy.rules],
    };
  }

  registerRule(rule: PolicyRule): void {
    new PolicySet({
      app_id: this.policy.app_id,
      default_posture: this.policy.default_posture,
      rules: [...this.policy.rules, rule],
    });
    this.policy = {
      ...this.policy,
      version: this.policy.version + 1,
      rules: [...this.policy.rules, rule],
    };
  }

  setDefaultPosture(default_posture: DefaultPosture): void {
    new PolicySet({
      app_id: this.policy.app_id,
      default_posture,
      rules: [...this.policy.rules],
    });
    this.policy = {
      ...this.policy,
      version: this.policy.version + 1,
      default_posture,
    };
  }

  check(
    action: Action,
    resource: Resource,
    ctx: PermissionContext,
    options: CheckOptions = {}
  ): PolicyDecision {
    const denyMatches: string[] = [];
    const allowMatches: string[] = [];

    for (const rule of this.policy.rules) {
      if (!this.actionMatches(rule.do, action)) continue;
      if (!this.resourceMatches(rule.on, resource)) continue;
      if (!this.anySubjectMatches(rule.allow, ctx, options.rowView)) continue;
      if (rule.when && !this.evaluateWhen(rule.when, ctx, options)) continue;
      if ((rule.effect ?? "allow") === "deny") {
        denyMatches.push(rule.id);
      } else {
        allowMatches.push(rule.id);
      }
    }

    if (denyMatches.length > 0) {
      return {
        decision: "deny",
        reason: "explicit-deny",
        matched_rule_ids: denyMatches,
      };
    }

    if (allowMatches.length > 0) {
      return {
        decision: "allow",
        reason: "explicit-allow",
        matched_rule_ids: allowMatches,
      };
    }

    const posture =
      options.resourceDefaultAccess ?? this.policy.default_posture.app;
    if (posture === "public") {
      return { decision: "allow", reason: "default-public", matched_rule_ids: [] };
    }
    return {
      decision: "deny",
      reason: "default-restricted-no-match",
      matched_rule_ids: [],
    };
  }

  explain(
    action: Action,
    resource: Resource,
    ctx: PermissionContext,
    options: CheckOptions = {}
  ): PolicyExplanation {
    const decision = this.check(action, resource, ctx, options);
    return {
      ...decision,
      reason: decision.reason,
      default_posture:
        options.resourceDefaultAccess ?? this.policy.default_posture.app,
      action,
      resource,
    };
  }

  // ---------- matching ----------

  private actionMatches(ruleDo: readonly Action[], req: Action): boolean {
    if (ruleDo.includes("*")) return true;
    if (req === "*") return ruleDo.length > 0; // 测试场景：查询任意操作
    return ruleDo.includes(req);
  }

  private resourceMatches(ruleOn: Resource, req: Resource): boolean {
    if (ruleOn.kind !== req.kind) return false;
    switch (ruleOn.kind) {
      case "app":
        return true;
      case "table": {
        const b = req as Extract<Resource, { kind: "table" }>;
        if (ruleOn.id !== b.id) return false;
        // scope 必须一致（table vs table:row 不交叉）
        return (ruleOn.scope ?? undefined) === (b.scope ?? undefined);
      }
      case "column": {
        const b = req as Extract<Resource, { kind: "column" }>;
        return ruleOn.table === b.table && ruleOn.name === b.name;
      }
      case "view":
      case "adapter":
      case "transform":
      case "operation": {
        const b = req as Extract<
          Resource,
          { kind: "view" | "adapter" | "transform" | "operation" }
        >;
        return ruleOn.id === b.id;
      }
    }
  }

  private anySubjectMatches(
    allow: readonly Subject[],
    ctx: PermissionContext,
    rowView: Readonly<Record<string, unknown>> | undefined
  ): boolean {
    for (const s of allow) {
      if (this.subjectMatches(s, ctx, rowView)) return true;
    }
    return false;
  }

  private subjectMatches(
    s: Subject,
    ctx: PermissionContext,
    rowView: Readonly<Record<string, unknown>> | undefined
  ): boolean {
    switch (s.kind) {
      case "any":
        return true;
      case "anonymous":
        return ctx.anonymous === true;
      case "anyone":
        return ctx.user !== undefined;
      case "user":
        return ctx.user?.id === s.id;
      case "role":
        return ctx.user?.roles.includes(s.name) ?? false;
      case "owner":
      case "self": {
        // MVP: 依 rowView.owner_id 做 self 判定（owner / self 同语义，per ADR-0007 注释）
        if (!ctx.user || !rowView) return false;
        return rowView["owner_id"] === ctx.user.id;
      }
    }
  }

  private evaluateWhen(
    clause: WhereClause,
    ctx: PermissionContext,
    options: CheckOptions
  ): boolean {
    return evaluate(clause, {
      row: options.rowView,
      user: ctx.user,
      input: options.input,
      target: options.target,
      now: options.now,
    });
  }
}
