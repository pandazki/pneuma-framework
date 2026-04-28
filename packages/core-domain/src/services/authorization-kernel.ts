import type {
  ApprovalToken,
  AuthorizationContext,
  AuthorizationDecision,
  AuthorizationReasonCode,
  Capability,
  Principal,
} from "../value-objects/authorization.js";

export interface AuthorizationExtensionRule {
  readonly principal: Principal;
  readonly capabilities: readonly Capability[];
}

export interface AuthorizationKernelOptions {
  readonly builderWorkspaceAccess?: (principal: Extract<Principal, { kind: "builder" }>, ctx: AuthorizationContext) => boolean;
  readonly extensionRules?: readonly AuthorizationExtensionRule[];
}

const BUILD_AGENT_PROPOSE_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "definition:propose",
  "definition:rollback:validate",
  "policy:propose",
]);

const FRAMEWORK_TOKEN_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "definition:apply",
  "definition:rollback:execute",
  "policy:mutate",
]);

export class AuthorizationKernel {
  private readonly usedApprovalTokens = new Set<string>();

  constructor(private readonly options: AuthorizationKernelOptions = {}) {}

  authorize(
    principal: Principal,
    capability: Capability,
    ctx: AuthorizationContext,
  ): AuthorizationDecision {
    if (principal.kind === "build_agent") {
      if (BUILD_AGENT_PROPOSE_CAPABILITIES.has(capability)) {
        return allow(principal, capability);
      }
      if (FRAMEWORK_TOKEN_CAPABILITIES.has(capability)) {
        if (ctx.approval_token) {
          return deny(principal, capability, "principal_not_allowed", "Build-phase agent cannot spend approval tokens directly.");
        }
        return deny(principal, capability, "approval_required", "Build-phase agent can propose this change, but Builder approval is required before framework execution.");
      }
      return deny(principal, capability, "principal_not_allowed", "Build-phase agent is not allowed to use this framework capability.");
    }

    if (principal.kind === "builder") {
      if (capability === "definition:approve" || capability === "policy:approve") {
        return this.builderCanApprove(principal, ctx)
          ? allow(principal, capability)
          : deny(principal, capability, "workspace_mismatch", "Builder cannot approve this capability outside the authorized workspace/app.");
      }
      return deny(principal, capability, "principal_not_allowed", "Builder is not allowed to execute this capability directly.");
    }

    if (principal.kind === "framework_system") {
      if (FRAMEWORK_TOKEN_CAPABILITIES.has(capability)) {
        return this.authorizeFrameworkToken(principal, capability, ctx);
      }
      return deny(principal, capability, "principal_not_allowed", "Framework system is not allowed to use this capability without a framework execution token.");
    }

    if (principal.kind === "end_user") {
      if (capability === "view:read" || capability === "operation:invoke") {
        return {
          decision: "defer",
          reason_code: "defer_to_app_policy",
          principal,
          capability,
          message: "End-user app resource access is decided by the app PolicyEvaluator.",
        };
      }
      return deny(principal, capability, "principal_not_allowed", "End users cannot mutate framework app definition.");
    }

    if (principal.kind === "runtime_agent") {
      return deny(principal, capability, "principal_not_allowed", "Runtime agent cannot mutate build-time app definition in this slice.");
    }

    const extension = this.findExtensionRule(principal, capability);
    if (extension) return allow(principal, capability);
    return deny(principal, capability, "principal_not_allowed", "Extension principal is not allowed to use this capability.");
  }

  private builderCanApprove(principal: Extract<Principal, { kind: "builder" }>, ctx: AuthorizationContext): boolean {
    if (!this.options.builderWorkspaceAccess) {
      return true;
    }
    return this.options.builderWorkspaceAccess(principal, ctx);
  }

  private authorizeFrameworkToken(
    principal: Extract<Principal, { kind: "framework_system" }>,
    capability: Capability,
    ctx: AuthorizationContext,
  ): AuthorizationDecision {
    const token = ctx.approval_token;
    if (!token) {
      return deny(principal, capability, "approval_missing", "Framework execution requires a Builder approval token.");
    }
    const invalid = validateApprovalToken(token, capability, ctx, this.usedApprovalTokens);
    if (invalid) {
      return deny(principal, capability, invalid.reason, invalid.message);
    }
    this.usedApprovalTokens.add(token.token_id);
    return allow(principal, capability);
  }

  private findExtensionRule(principal: Principal, capability: Capability): AuthorizationExtensionRule | undefined {
    return this.options.extensionRules?.find((rule) => {
      if (!principalMatches(rule.principal, principal)) return false;
      return rule.capabilities.includes(capability);
    });
  }
}

function validateApprovalToken(
  token: ApprovalToken,
  capability: Capability,
  ctx: AuthorizationContext,
  usedTokens: ReadonlySet<string>,
): { reason: Exclude<AuthorizationReasonCode, "allowed" | "defer_to_app_policy">; message: string } | undefined {
  if (usedTokens.has(token.token_id)) {
    return { reason: "approval_already_used", message: "Approval token has already been consumed." };
  }
  if (token.approved_capability !== capability) {
    return { reason: "approval_capability_mismatch", message: "Approval token was issued for a different capability." };
  }
  if (token.workspace_id !== ctx.workspace_id) {
    return { reason: "workspace_mismatch", message: "Approval token was issued for a different workspace." };
  }
  if (token.app_id !== ctx.app_id) {
    return { reason: "app_mismatch", message: "Approval token was issued for a different app." };
  }
  if (ctx.target_fingerprint && token.target_fingerprint !== ctx.target_fingerprint) {
    return { reason: "approval_target_mismatch", message: "Approval token was issued for a different target." };
  }
  const now = ctx.now_ms ?? Date.now();
  if (now > token.expires_at_ms) {
    return { reason: "approval_expired", message: "Approval token has expired." };
  }
  return undefined;
}

function principalMatches(rulePrincipal: Principal, actual: Principal): boolean {
  if (rulePrincipal.kind !== actual.kind) return false;
  if ("id" in rulePrincipal && "id" in actual && rulePrincipal.id !== actual.id) return false;
  return true;
}

function allow(principal: Principal, capability: Capability): AuthorizationDecision {
  return {
    decision: "allow",
    reason_code: "allowed",
    principal,
    capability,
  };
}

function deny(
  principal: Principal,
  capability: Capability,
  reason_code: Exclude<AuthorizationReasonCode, "allowed" | "defer_to_app_policy">,
  message: string,
): AuthorizationDecision {
  return {
    decision: "deny",
    reason_code,
    principal,
    capability,
    message,
  };
}
