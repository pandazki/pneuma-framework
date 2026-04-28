import type {
  ApprovalToken,
  AuthorizationContext,
  AuthorizationTarget,
  Principal,
} from "@pneuma-framework/core-domain";
import { definitionApplyAuthorizationMetadata } from "../definition-authorization-metadata.js";

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

export function builderPrincipal(id = DEFAULT_TOOL_BUILDER_ID): Extract<Principal, { kind: "builder" }> {
  return { kind: "builder", id };
}

export function definitionApplyTarget(change: unknown): AuthorizationTarget {
  return definitionApplyAuthorizationMetadata(change).target;
}

export function definitionRollbackTarget(targetHistoryVersion: number): AuthorizationTarget {
  return {
    kind: "rollback_target",
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
