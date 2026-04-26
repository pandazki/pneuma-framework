// OperationExecutor — ADR-0018 pipeline.
// UI click 和 Agent tool call 在此汇合到同一条路径.
//
// Steps:
//   1. Construct PermissionContext (caller 传入)
//   2. PolicyEvaluator.check(invoke, operation:<id>, ctx) → deny 直接返回 + audit
//   3. destructive → impact.compute(input) → ImpactReport
//   4. destructive → 要求 confirmation (caller 传 confirmed flag)
//   5. emit "operation.started" event
//   6. operation.handler(ctx, input) 执行
//   7. emit "operation.completed" (audit:true)
//   8. 返回 output
//
// 本模块职责：编排 + 事件 + 权限/confirm 闸门。数据读写由 handler 调 StorageService 完成.

import { Operation, type HandlerRef } from "../aggregates/operation.js";
import type { View } from "../aggregates/view.js";
import type { PermissionContext } from "../value-objects/permission-context.js";
import type { EventStream, EventCategory } from "../aggregates/event-stream.js";
import type { PolicyEvaluator, PolicyDecision } from "./policy-evaluator.js";
import type { StorageService } from "./storage-service.js";
import { Resources } from "../aggregates/policy-set.js";
import { deriveSpan } from "../value-objects/permission-context.js";

// ---------- handler registry ----------

export interface HandlerContext {
  readonly ctx: PermissionContext;
  readonly input: unknown;
  readonly storage: StorageService;
  /** 可选: 其它服务. runtime 层装配时注入; 纯 core-domain 测试可以不用 */
  readonly services?: HandlerServices;
}

/**
 * 给 code handler 的额外服务句柄. 在 `packages/runtime` 里被注入.
 * 在 pure core-domain 单测里可以不传 (执行器只是转发).
 */
export interface HandlerServices {
  readonly queryExec?: unknown;         // QueryExecutor — 不在这里 import 避免循环
  readonly transformRunner?: unknown;   // TransformRunner
  readonly adapterInvoker?: unknown;    // AdapterInvoker
  /** AppHistoryStore — used by framework handlers that append history entries. */
  readonly history?: unknown;           // AppHistoryStore — typed `unknown` to avoid circular dep
  /** Current Operation registry, injected by runtime for framework definition handlers. */
  readonly operations?: {
    readonly get: (id: string) => Operation | undefined;
    readonly list: () => readonly Operation[];
  };
  /** Current View registry, injected by runtime for framework definition handlers. */
  readonly views?: {
    readonly get: (id: string) => View | undefined;
    readonly list: () => readonly View[];
  };
}

export type HandlerFn = (args: HandlerContext) => Promise<unknown>;

export interface ImpactReport {
  readonly disclosure: string; // agent 翻译用（基于 disclosure_template 渲染）
  readonly details?: Readonly<Record<string, unknown>>;
}

export type ImpactComputeFn = (args: HandlerContext) => Promise<ImpactReport>;

export class HandlerRegistry {
  private readonly handlers = new Map<string, HandlerFn>();
  private readonly impacts = new Map<string, ImpactComputeFn>();

  registerHandler(ref: string, fn: HandlerFn): void {
    this.handlers.set(ref, fn);
  }

  registerImpact(ref: string, fn: ImpactComputeFn): void {
    this.impacts.set(ref, fn);
  }

  resolveHandler(ref: HandlerRef): HandlerFn {
    const fn = this.handlers.get(ref.ref);
    if (!fn) throw new OperationExecutionError(
      `handler not registered: "${ref.ref}"`,
      "handler_not_registered"
    );
    return fn;
  }

  resolveImpact(ref: HandlerRef): ImpactComputeFn {
    const fn = this.impacts.get(ref.ref);
    if (!fn) throw new OperationExecutionError(
      `impact compute not registered: "${ref.ref}"`,
      "impact_not_registered"
    );
    return fn;
  }
}

// ---------- errors ----------

export class OperationExecutionError extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "OperationExecutionError";
  }
}

export class PolicyDeniedError extends OperationExecutionError {
  constructor(public readonly decision: PolicyDecision) {
    super(
      `policy denied: reason=${decision.reason}`,
      "policy_denied"
    );
    this.name = "PolicyDeniedError";
  }
}

export class ConfirmationRequiredError extends OperationExecutionError {
  constructor(public readonly impact: ImpactReport) {
    super(
      `confirmation required (destructive operation): ${impact.disclosure}`,
      "confirmation_required"
    );
    this.name = "ConfirmationRequiredError";
  }
}

// ---------- executor ----------

export interface InvokeOptions {
  /** destructive operation 调用者必须显式传 true 才执行，否则抛 ConfirmationRequiredError */
  readonly confirmed?: boolean;
}

export interface InvokeResult {
  readonly output: unknown;
  readonly impact?: ImpactReport;
  readonly events: readonly string[]; // emitted event ids
}

export class OperationExecutor {
  constructor(
    private readonly policyEvaluator: PolicyEvaluator,
    private readonly eventStream: EventStream,
    private readonly storage: StorageService,
    private readonly handlers: HandlerRegistry,
    /** 可选: 附加服务, 由 runtime 层注入; code handler 能通过 HandlerContext.services 拿到 */
    private readonly services?: HandlerServices
  ) {}

  async invoke(
    op: Operation,
    input: unknown,
    ctx: PermissionContext,
    opts: InvokeOptions = {}
  ): Promise<InvokeResult> {
    const childCtx = deriveSpan(ctx);
    const events: string[] = [];

    // Step 2: policy check
    // Operation resources default to "restricted" — framework invariant.
    // Even in an app with app-level default_posture=public, Operation invocation
    // must be explicitly allowed (ADR-0018 security premise).
    const decision = this.policyEvaluator.check(
      "invoke",
      Resources.operation(op.id),
      childCtx,
      {
        input: (input as Record<string, unknown>) ?? undefined,
        resourceDefaultAccess: "restricted",
      }
    );

    if (decision.decision === "deny") {
      const e = await this.eventStream.append({
        id: newId(),
        ts: Date.now(),
        category: "access",
        ctx: childCtx,
        trace_id: childCtx.trace_id,
        span_id: childCtx.span_id,
        parent_span_id: childCtx.parent_span_id,
        payload: {
          decision: "deny",
          reason: decision.reason,
          action: "invoke",
          resource: { kind: "operation", id: op.id },
          matched_rule_ids: decision.matched_rule_ids,
        },
        audit: true,
      });
      events.push(e.id);
      throw new PolicyDeniedError(decision);
    }

    // Step 3: impact for destructive
    let impact: ImpactReport | undefined;
    if (op.affects.destructive && op.impact) {
      const computeFn = this.handlers.resolveImpact(op.impact.compute);
      impact = await computeFn({
        ctx: childCtx,
        input,
        storage: this.storage,
        services: this.services,
      });
      // MVP: disclosure_template 的渲染交给 caller/agent；这里只暴露 impact.details
    }

    // Step 4: confirmation gate
    if (op.requiresConfirmation() && !opts.confirmed) {
      throw new ConfirmationRequiredError(
        impact ?? { disclosure: op.impact?.disclosure_template ?? "" }
      );
    }

    // Step 5: emit started
    const startedEvent = await this.eventStream.append({
      id: newId(),
      ts: Date.now(),
      category: "agent" satisfies EventCategory, // operation 事件 MVP 先归 agent 类；amend ADR-0013 正式加 operation 类后切
      ctx: childCtx,
      trace_id: childCtx.trace_id,
      span_id: childCtx.span_id,
      parent_span_id: childCtx.parent_span_id,
      payload: {
        operation_id: op.id,
        phase: "started",
        invoked_via: childCtx.invoked_via,
      },
      audit: true,
      tags: ["operation"],
    });
    events.push(startedEvent.id);

    // Step 6: execute handler
    let output: unknown;
    try {
      if (op.handler.kind !== "code") {
        // MVP 不做 query 路径（那是 QueryExecutor 职责）
        throw new OperationExecutionError(
          `OperationExecutor.invoke does not handle query operations; use QueryExecutor`,
          "wrong_executor_for_query"
        );
      }
      const fn = this.handlers.resolveHandler(op.handler);
      output = await fn({
        ctx: childCtx,
        input,
        storage: this.storage,
        services: this.services,
      });
    } catch (err) {
      // emit failed
      const failedEvent = await this.eventStream.append({
        id: newId(),
        ts: Date.now(),
        category: "agent",
        ctx: childCtx,
        trace_id: childCtx.trace_id,
        span_id: childCtx.span_id,
        parent_span_id: childCtx.parent_span_id,
        payload: {
          operation_id: op.id,
          phase: "failed",
          invoked_via: childCtx.invoked_via,
          error: err instanceof Error ? err.message : String(err),
        },
        audit: true,
        tags: ["operation", "failure"],
      });
      events.push(failedEvent.id);
      throw err;
    }

    // Step 7: emit completed (audit:true)
    const completedEvent = await this.eventStream.append({
      id: newId(),
      ts: Date.now(),
      category: "agent",
      ctx: childCtx,
      trace_id: childCtx.trace_id,
      span_id: childCtx.span_id,
      parent_span_id: childCtx.parent_span_id,
      payload: {
        operation_id: op.id,
        phase: "completed",
        invoked_via: childCtx.invoked_via,
        impact,
      },
      audit: true,
      tags: ["operation"],
    });
    events.push(completedEvent.id);

    return { output, impact, events };
  }
}

function newId(): string {
  return `ev-${Math.random().toString(16).slice(2, 10)}-${Date.now()}`;
}
