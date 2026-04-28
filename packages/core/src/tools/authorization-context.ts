import { createHash } from "node:crypto";
import type {
  ApprovalToken,
  AuthorizationContext,
  AuthorizationTarget,
  Principal,
} from "@pneuma-framework/core-domain";

export const DEFAULT_TOOL_BUILDER_ID = "builder:default";
export const DEFAULT_TOOL_AGENT_ID = "opencode";
export const DEFAULT_TOOL_APP_ID = "app:default";
export const DEFAULT_TOOL_WORKSPACE_ID = "workspace:default";

export interface ToolAuthorizationContextInput {
  readonly app_id?: string;
  readonly workspace_id?: string;
  readonly target?: AuthorizationTarget;
  readonly target_fingerprint?: string;
  readonly approval_token?: ApprovalToken;
  readonly now_ms?: number;
}

export function defaultToolPrincipal(opts: {
  readonly agent_id?: string;
  readonly builder_id?: string;
} = {}): Principal {
  return {
    kind: "build_agent",
    id: opts.agent_id ?? DEFAULT_TOOL_AGENT_ID,
    acting_for: {
      kind: "builder",
      id: opts.builder_id ?? DEFAULT_TOOL_BUILDER_ID,
    },
  };
}

export function frameworkSystemPrincipal(): Principal {
  return { kind: "framework_system", id: "framework" };
}

export function builderPrincipal(id = DEFAULT_TOOL_BUILDER_ID): Principal {
  return { kind: "builder", id };
}

export function definitionApplyTarget(change: unknown): AuthorizationTarget {
  const fingerprint = `definition.apply:${stableHash(change)}`;
  return {
    kind: "app_definition",
    id: definitionApplyTargetId(change),
    fingerprint,
  };
}

export function definitionRollbackTarget(targetHistoryVersion: number): AuthorizationTarget {
  return {
    kind: "app_definition",
    id: `definition.rollback:${targetHistoryVersion}`,
    fingerprint: `definition.rollback:${targetHistoryVersion}`,
  };
}

export function buildToolAuthorizationContext(input: ToolAuthorizationContextInput = {}): AuthorizationContext {
  return {
    app_id: input.app_id ?? DEFAULT_TOOL_APP_ID,
    workspace_id: input.workspace_id ?? DEFAULT_TOOL_WORKSPACE_ID,
    target: input.target,
    target_fingerprint: input.target_fingerprint ?? input.target?.fingerprint,
    approval_token: input.approval_token,
    now_ms: input.now_ms,
  };
}

export function targetFingerprint(target: AuthorizationTarget): string {
  if (target.fingerprint) return target.fingerprint;
  return `${target.kind}:${target.id}`;
}

function definitionApplyTargetId(change: unknown): string {
  if (!change || typeof change !== "object" || Array.isArray(change)) return "definition.apply";
  const kind = (change as { kind?: unknown }).kind;
  if (typeof kind !== "string") return "definition.apply";
  switch (kind) {
    case "add_table":
      return `definition.apply:add_table:${stringField(change, "table_id") ?? "unknown"}`;
    case "add_table_column":
      return [
        "definition.apply:add_table_column",
        stringField(change, "table_id") ?? "unknown",
        stringField(change, "column_name") ?? "unknown",
      ].join(":");
    case "add_operation":
      return `definition.apply:add_operation:${stringField(change, "operation_id") ?? "unknown"}`;
    case "add_view":
      return `definition.apply:add_view:${stringField(change, "view_id") ?? "unknown"}`;
    case "add_policy_rule":
      return `definition.apply:add_policy_rule:${stringField(change, "rule_id") ?? "unknown"}`;
    default:
      return `definition.apply:${kind}`;
  }
}

function stringField(value: object, key: string): string | undefined {
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}
