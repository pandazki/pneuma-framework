// PermissionContext — per-request runtime VO (ADR-0010, ADR-0013).
// 跨 domain service 显式传参 — 不用 AsyncLocalStorage (per ADR-0013 "显式优于隐式").

import { randomUUID } from "node:crypto";

export type InvokedVia = "ui" | "agent" | "cli" | "webhook" | "system";

export interface PermissionContext {
  readonly app_id: string;
  readonly tenant_id: string; // MVP 固定 "default"（ADR-0001 约束 1）
  readonly user?: {
    readonly id: string;
    readonly attrs: Readonly<Record<string, unknown>>;
    readonly roles: readonly string[];
  };
  readonly anonymous: boolean;
  readonly trace_id: string;
  readonly span_id?: string;
  readonly parent_span_id?: string;
  readonly invoked_via: InvokedVia;
}

export interface BuildRootContextInput {
  app_id: string;
  invoked_via: InvokedVia;
  tenant_id?: string;
  user?: PermissionContext["user"];
  trace_id?: string;
}

export function buildRootContext(input: BuildRootContextInput): PermissionContext {
  return {
    app_id: input.app_id,
    tenant_id: input.tenant_id ?? "default",
    user: input.user,
    anonymous: !input.user,
    trace_id: input.trace_id ?? newId(),
    invoked_via: input.invoked_via,
  };
}

/**
 * 派生一个嵌套 span：保持 trace_id，把当前 span_id 作为 parent。
 * 用于 Operation handler 调用 Transform / Adapter / sub-Operation 时。
 */
export function deriveSpan(parent: PermissionContext): PermissionContext {
  return {
    ...parent,
    span_id: newId(),
    parent_span_id: parent.span_id,
  };
}

function newId(): string {
  return randomUUID();
}
