import {
  evaluateBuildChangeGovernance,
  type BuildChangeEvidenceRef,
  type BuildChangeGovernanceDecision,
  type BuildChangeGovernanceDecisionInput,
  type BuildChangeGovernancePolicy,
  type BuildChangeRisk,
} from "@pneuma-framework/core";

export interface HostKitApprovalInput {
  readonly app_id: string;
  readonly build_change_id: string;
  readonly builder_subject: string;
  readonly risks: readonly BuildChangeRisk[];
  readonly evidence_refs: readonly BuildChangeEvidenceRef[];
  readonly policy: BuildChangeGovernancePolicy;
  readonly decisions: readonly BuildChangeGovernanceDecisionInput[];
}

export function evaluateHostKitApproval(
  input: HostKitApprovalInput,
): BuildChangeGovernanceDecision {
  return evaluateBuildChangeGovernance(input.policy, {
    app_id: input.app_id,
    build_change_id: input.build_change_id,
    builder_subject: input.builder_subject,
    risks: input.risks,
    evidence_refs: input.evidence_refs,
    decisions: input.decisions,
  });
}
