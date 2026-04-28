export type Principal =
  | { readonly kind: "builder"; readonly id: string }
  | { readonly kind: "build_agent"; readonly id: string; readonly acting_for: { readonly kind: "builder"; readonly id: string } }
  | { readonly kind: "runtime_agent"; readonly id: string; readonly acting_for?: { readonly kind: "end_user"; readonly id: string } }
  | { readonly kind: "end_user"; readonly id: string; readonly roles: readonly string[] }
  | { readonly kind: "framework_system"; readonly id: "framework" }
  | { readonly kind: "extension"; readonly id: string; readonly roles?: readonly string[] };

export type Capability =
  | "definition:propose"
  | "definition:apply"
  | "definition:approve"
  | "definition:rollback:validate"
  | "definition:rollback:execute"
  | "policy:propose"
  | "policy:approve"
  | "policy:mutate"
  | "operation:invoke"
  | "view:read";

export type AuthorizationTargetKind =
  | "definition"
  | "policy_rule"
  | "operation"
  | "view"
  | "rollback_target";

export interface AuthorizationTarget {
  readonly kind: AuthorizationTargetKind;
  readonly id?: string;
  readonly fingerprint?: string;
}

export interface ApprovalToken {
  readonly token_id: string;
  readonly approved_by: { readonly kind: "builder"; readonly id: string };
  readonly approved_capability: Capability;
  readonly workspace_id: string;
  readonly app_id: string;
  readonly target_fingerprint: string;
  readonly issued_at_ms: number;
  readonly expires_at_ms: number;
  readonly single_use: true;
}

export interface AuthorizationContext {
  readonly workspace_id: string;
  readonly app_id: string;
  readonly session_id?: string;
  readonly trace_id?: string;
  readonly target?: AuthorizationTarget;
  readonly target_fingerprint?: string;
  readonly approval_token?: ApprovalToken;
  readonly now_ms?: number;
}

export type AuthorizationReasonCode =
  | "allowed"
  | "defer_to_app_policy"
  | "principal_not_allowed"
  | "approval_required"
  | "approval_missing"
  | "approval_capability_mismatch"
  | "approval_target_mismatch"
  | "approval_expired"
  | "approval_already_used"
  | "workspace_mismatch"
  | "app_mismatch"
  | "framework_internal_not_public";

export type AuthorizationDecision =
  | {
      readonly decision: "allow";
      readonly reason_code: "allowed";
      readonly principal: Principal;
      readonly capability: Capability;
    }
  | {
      readonly decision: "defer";
      readonly reason_code: "defer_to_app_policy";
      readonly principal: Principal;
      readonly capability: Capability;
      readonly message: string;
    }
  | {
      readonly decision: "deny";
      readonly reason_code: Exclude<AuthorizationReasonCode, "allowed" | "defer_to_app_policy">;
      readonly principal: Principal;
      readonly capability: Capability;
      readonly message: string;
    };
