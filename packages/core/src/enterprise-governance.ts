import type { BuildChangeEvidenceRef, BuildChangeRisk } from "./build-assurance.js";

export type EnterpriseGovernanceRole =
  | "builder"
  | "reviewer"
  | "owner"
  | "operator"
  | "end_user";

export interface GovernanceRoleAssignment {
  readonly subject: string;
  readonly role: EnterpriseGovernanceRole;
}

export interface BuildChangeGovernanceRoute {
  readonly route_id: string;
  readonly risks: readonly BuildChangeRisk[];
  readonly required_roles: readonly EnterpriseGovernanceRole[];
}

export interface BuildChangeGovernancePolicy {
  readonly policy_id: string;
  readonly app_id: string;
  readonly role_assignments: readonly GovernanceRoleAssignment[];
  readonly routes: readonly BuildChangeGovernanceRoute[];
}

export interface BuildChangeGovernanceDecisionInput {
  readonly subject: string;
  readonly decision: "approved" | "denied";
  readonly reason?: string;
  readonly decided_at_ms: number;
}

export interface BuildChangeGovernanceRequest {
  readonly app_id: string;
  readonly build_change_id: string;
  readonly builder_subject: string;
  readonly risks: readonly BuildChangeRisk[];
  readonly evidence_refs: readonly BuildChangeEvidenceRef[];
  readonly decisions: readonly BuildChangeGovernanceDecisionInput[];
}

export type BuildChangeGovernanceReasonCode =
  | "required-approvals-satisfied"
  | "denied"
  | "missing-required-approval"
  | "invalid-policy"
  | "app-mismatch"
  | "no-matching-route";

export interface BuildChangeGovernanceDecision {
  readonly allowed: boolean;
  readonly reason_code: BuildChangeGovernanceReasonCode;
  readonly route_id?: string;
  readonly required_roles: readonly EnterpriseGovernanceRole[];
  readonly missing_roles: readonly EnterpriseGovernanceRole[];
  readonly satisfied_by_subjects: readonly string[];
  readonly evidence_refs: readonly BuildChangeEvidenceRef[];
}

export interface BuildChangeGovernanceValidationResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

const HIGH_RISK_CHANGE_KINDS = new Set<BuildChangeRisk>([
  "destructive_definition",
  "policy_change",
  "data_migration",
  "credential_boundary",
]);

export function validateBuildChangeGovernancePolicy(
  policy: BuildChangeGovernancePolicy,
): BuildChangeGovernanceValidationResult {
  const issues: string[] = [];
  if (policy.policy_id.trim().length === 0) issues.push("policy_id.required");
  if (policy.app_id.trim().length === 0) issues.push("app_id.required");

  const roleAssignments = new Set<string>();
  for (const assignment of policy.role_assignments) {
    if (assignment.subject.trim().length === 0) issues.push("role_assignment.subject.required");
    const key = `${assignment.subject}:${assignment.role}`;
    if (roleAssignments.has(key)) issues.push("role_assignments.duplicate");
    roleAssignments.add(key);
  }

  const routeIds = new Set<string>();
  for (const route of policy.routes) {
    if (route.route_id.trim().length === 0) issues.push("route_id.required");
    if (routeIds.has(route.route_id)) issues.push("route_id.duplicate");
    routeIds.add(route.route_id);
    if (route.risks.length === 0) issues.push("route.risks.required");
    if (route.required_roles.length === 0) issues.push("route.required_roles.required");
  }

  return { ok: issues.length === 0, issues };
}

export function evaluateBuildChangeGovernance(
  policy: BuildChangeGovernancePolicy,
  request: BuildChangeGovernanceRequest,
): BuildChangeGovernanceDecision {
  const validation = validateBuildChangeGovernancePolicy(policy);
  if (!validation.ok) return deny("invalid-policy", [], [], [], request.evidence_refs);

  if (policy.app_id !== request.app_id) {
    return deny("app-mismatch", [], [], [], request.evidence_refs);
  }

  const route = selectRoute(policy.routes, request.risks);
  if (!route) return deny("no-matching-route", [], [], [], request.evidence_refs);

  if (request.decisions.some((decision) => decision.decision === "denied")) {
    return deny(
      "denied",
      route.required_roles,
      route.required_roles,
      [],
      request.evidence_refs,
      route.route_id,
    );
  }

  const rolesBySubject = new Map<string, Set<EnterpriseGovernanceRole>>();
  for (const assignment of policy.role_assignments) {
    const roles = rolesBySubject.get(assignment.subject) ?? new Set<EnterpriseGovernanceRole>();
    roles.add(assignment.role);
    rolesBySubject.set(assignment.subject, roles);
  }

  const satisfiedRoles = new Set<EnterpriseGovernanceRole>();
  const satisfiedBy: string[] = [];
  for (const decision of request.decisions.filter((candidate) => candidate.decision === "approved")) {
    if (decision.subject === request.builder_subject) continue;
    const roles = rolesBySubject.get(decision.subject);
    if (!roles) continue;
    for (const requiredRole of route.required_roles) {
      if (roles.has(requiredRole)) {
        satisfiedRoles.add(requiredRole);
        if (!satisfiedBy.includes(decision.subject)) satisfiedBy.push(decision.subject);
      }
    }
  }

  const missing = route.required_roles.filter((role) => !satisfiedRoles.has(role));
  if (missing.length > 0) {
    return deny(
      "missing-required-approval",
      route.required_roles,
      missing,
      satisfiedBy,
      request.evidence_refs,
      route.route_id,
    );
  }

  return {
    allowed: true,
    reason_code: "required-approvals-satisfied",
    route_id: route.route_id,
    required_roles: route.required_roles,
    missing_roles: [],
    satisfied_by_subjects: satisfiedBy,
    evidence_refs: request.evidence_refs,
  };
}

function selectRoute(
  routes: readonly BuildChangeGovernanceRoute[],
  risks: readonly BuildChangeRisk[],
): BuildChangeGovernanceRoute | undefined {
  const matching = routes.filter((route) => risks.some((risk) => route.risks.includes(risk)));
  if (matching.length === 0) return undefined;
  return matching
    .slice()
    .sort((left, right) => routeSeverity(right) - routeSeverity(left))[0];
}

function routeSeverity(route: BuildChangeGovernanceRoute): number {
  return route.risks.some((risk) => HIGH_RISK_CHANGE_KINDS.has(risk)) ? 1 : 0;
}

function deny(
  reason_code: BuildChangeGovernanceReasonCode,
  required_roles: readonly EnterpriseGovernanceRole[],
  missing_roles: readonly EnterpriseGovernanceRole[],
  satisfied_by_subjects: readonly string[],
  evidence_refs: readonly BuildChangeEvidenceRef[],
  route_id?: string,
): BuildChangeGovernanceDecision {
  return {
    allowed: false,
    reason_code,
    route_id,
    required_roles,
    missing_roles,
    satisfied_by_subjects,
    evidence_refs,
  };
}
