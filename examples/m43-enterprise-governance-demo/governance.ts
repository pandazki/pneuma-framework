import type {
  BuildChangeGovernanceDecisionInput,
  BuildChangeGovernancePolicy,
  BuildChangeGovernanceRequest,
} from "../../packages/core/src/index.js";
import type { BuildChangeRisk } from "../../packages/core/src/build-assurance.js";

export function buildGovernancePolicy(): BuildChangeGovernancePolicy {
  return {
    policy_id: "m43-enterprise-minimum",
    app_id: "dev-activity-board",
    role_assignments: [
      { subject: "user:bob", role: "builder" },
      { subject: "user:rachel", role: "reviewer" },
      { subject: "user:olivia", role: "owner" },
      { subject: "user:otto", role: "operator" },
      { subject: "user:erin", role: "end_user" },
    ],
    routes: [
      {
        route_id: "reviewer-for-standard-change",
        risks: ["source_code_change", "definition_additive"],
        required_roles: ["reviewer"],
      },
      {
        route_id: "owner-for-high-risk",
        risks: ["destructive_definition", "policy_change", "data_migration", "credential_boundary"],
        required_roles: ["owner"],
      },
    ],
  };
}

export function buildGovernanceRequest(input: {
  readonly builder_subject: string;
  readonly risks: readonly BuildChangeRisk[];
  readonly decisions: readonly BuildChangeGovernanceDecisionInput[];
}): BuildChangeGovernanceRequest {
  return {
    app_id: "dev-activity-board",
    build_change_id: "change-dev-activity-board-v1",
    builder_subject: input.builder_subject,
    risks: input.risks,
    evidence_refs: [
      { kind: "build_thread_turn", thread_id: "thread-m43", turn_id: "proposal-v1" },
      { kind: "host_check", check_id: "provider-capability-contract", status: "passed" },
    ],
    decisions: input.decisions,
  };
}
