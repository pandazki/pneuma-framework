import { expect, test } from "bun:test";
import {
  assessBuildChangeReadiness,
  createBuildChangeAssuranceCase,
  validateBuildChangeAssuranceCase,
  type BuildChangeAssuranceAssessmentInput,
  type BuildChangeAssuranceCase,
  type BuildChangeGovernanceDecision,
  type BuildChangeEvidenceRef,
  type BuildChangeRisk,
} from "../src/index.js";

test("unclear Builder intent requires clarification before proposal work", () => {
  const assessment = assessBuildChangeReadiness({
    intent_status: "needs_clarification",
    proposal_status: "not_proposed",
    approval_status: "not_required",
    execution_status: "not_started",
    risks: ["additive_ui"],
    checks: [],
    evidence_refs: [],
  });

  expect(assessment.readiness).toBe("needs_clarification");
  expect(assessment.blocking_reasons).toEqual(["intent_needs_clarification"]);
});

test("failed pre-proposal checks block the build change before approval", () => {
  const assessment = assessBuildChangeReadiness({
    intent_status: "clear",
    proposal_status: "proposed",
    approval_status: "awaiting",
    execution_status: "not_started",
    risks: ["source_code_change"],
    checks: [
      hostCheck("typecheck", "pre_proposal", "failed"),
      hostCheck("protected-paths", "pre_proposal", "passed"),
    ],
    evidence_refs: [],
  });

  expect(assessment.readiness).toBe("blocked");
  expect(assessment.blocking_reasons).toEqual(["pre_proposal_check_failed:typecheck"]);
});

test("destructive definition changes require explicit impact evidence", () => {
  const assessment = assessBuildChangeReadiness({
    intent_status: "clear",
    proposal_status: "proposed",
    approval_status: "awaiting",
    execution_status: "not_started",
    risks: ["destructive_definition"],
    checks: [hostCheck("schema-diff", "pre_proposal", "passed")],
    evidence_refs: [],
  });

  expect(assessment.readiness).toBe("blocked");
  expect(assessment.blocking_reasons).toEqual(["destructive_change_missing_explicit_impact"]);
});

test("approved applied changes with passing post-checks become verified", () => {
  const assessment = assessBuildChangeReadiness({
    intent_status: "clear",
    proposal_status: "proposed",
    approval_status: "approved",
    execution_status: "applied",
    risks: ["definition_additive"],
    checks: [
      hostCheck("typecheck", "pre_proposal", "passed"),
      hostCheck("smoke", "post_apply", "passed"),
    ],
    evidence_refs: [
      { kind: "permission_ledger_record", request_id: "request-1" },
      { kind: "code_change_receipt", proposal_id: "proposal-1" },
    ],
  });

  expect(assessment.readiness).toBe("verified");
  expect(assessment.blocking_reasons).toEqual([]);
});

test("verified release changes become ready to publish when release checks pass", () => {
  const assessment = assessBuildChangeReadiness({
    intent_status: "clear",
    proposal_status: "proposed",
    approval_status: "approved",
    execution_status: "applied",
    risks: ["release_change"],
    checks: [
      hostCheck("typecheck", "pre_proposal", "passed"),
      hostCheck("smoke", "post_apply", "passed"),
    ],
    release_checks: [
      { name: "health", status: "passed", at_ms: 1 },
      { name: "config", status: "passed", at_ms: 2 },
    ],
    evidence_refs: [
      { kind: "release_rollout", app_id: "app-1", rollout_id: "rollout-1" },
    ],
  });

  expect(assessment.readiness).toBe("ready_to_publish");
  expect(assessment.blocking_reasons).toEqual([]);
});

test("build assurance blocks publish when required governance approval is missing", () => {
  const governanceDecision: BuildChangeGovernanceDecision = {
    allowed: false,
    reason_code: "missing-required-approval",
    required_roles: ["reviewer"],
    missing_roles: ["reviewer"],
    satisfied_by_subjects: [],
    evidence_refs: [],
  };

  const assessment = assessBuildChangeReadiness({
    intent_status: "clear",
    proposal_status: "proposed",
    approval_status: "approved",
    execution_status: "applied",
    risks: ["source_code_change"],
    checks: [hostCheck("post-apply", "post_apply", "passed")],
    release_checks: [{ name: "release-health", status: "passed", at_ms: 1 }],
    evidence_refs: [{ kind: "host_check", check_id: "post-apply", status: "passed" }],
    governance: { required: true, decision: governanceDecision },
  });

  expect(assessment.readiness).toBe("blocked");
  expect(assessment.blocking_reasons).toContain("governance_approval_missing");
});

test("build assurance reaches ready to publish when governance approval and release checks pass", () => {
  const governanceDecision: BuildChangeGovernanceDecision = {
    allowed: true,
    reason_code: "required-approvals-satisfied",
    route_id: "default-reviewer",
    required_roles: ["reviewer"],
    missing_roles: [],
    satisfied_by_subjects: ["user:rachel"],
    evidence_refs: [{ kind: "permission_ledger_record", request_id: "approval-1" }],
  };

  const assessment = assessBuildChangeReadiness({
    intent_status: "clear",
    proposal_status: "proposed",
    approval_status: "approved",
    execution_status: "applied",
    risks: ["source_code_change"],
    checks: [hostCheck("post-apply", "post_apply", "passed")],
    release_checks: [{ name: "release-health", status: "passed", at_ms: 1 }],
    evidence_refs: [{ kind: "host_check", check_id: "release-health", status: "passed" }],
    governance: { required: true, decision: governanceDecision },
  });

  expect(assessment.readiness).toBe("ready_to_publish");
  expect(assessment.blocking_reasons).toEqual([]);
});

test("post-apply failures with rollback evidence are failed recovered", () => {
  const assessment = assessBuildChangeReadiness({
    intent_status: "clear",
    proposal_status: "proposed",
    approval_status: "approved",
    execution_status: "failed_recovered",
    risks: ["source_code_change"],
    checks: [
      hostCheck("typecheck", "pre_proposal", "passed"),
      hostCheck("smoke", "post_apply", "failed"),
    ],
    evidence_refs: [
      { kind: "code_change_receipt", proposal_id: "proposal-rollback" },
      { kind: "host_check", check_id: "rollback-restored-source", status: "passed" },
    ],
  });

  expect(assessment.readiness).toBe("failed_recovered");
  expect(assessment.rollback_notes).toEqual(["rollback evidence present"]);
  expect(assessment.blocking_reasons).toEqual(["post_apply_check_failed:smoke"]);
});

test("creates and validates an assurance case that references existing framework evidence", () => {
  const evidenceRefs: BuildChangeEvidenceRef[] = [
    { kind: "build_thread_turn", thread_id: "thread-1", turn_id: "turn-1" },
    { kind: "permission_ledger_record", request_id: "request-1" },
    { kind: "definition_history", app_id: "app-1", version: 3 },
    { kind: "runtime_health", runtime_id: "runtime-1", checked_at_ms: 100 },
    { kind: "host_check", check_id: "smoke", status: "passed" },
  ];
  const assessmentInput: BuildChangeAssuranceAssessmentInput = {
    intent_status: "clear",
    proposal_status: "proposed",
    approval_status: "approved",
    execution_status: "applied",
    risks: ["definition_additive"],
    checks: [hostCheck("smoke", "post_apply", "passed")],
    evidence_refs: evidenceRefs,
  };

  const assuranceCase = createBuildChangeAssuranceCase({
    build_change_id: "change-1",
    app_id: "app-1",
    thread_id: "thread-1",
    builder_subject: "user:bob",
    intent_summary: "Add a priority queue to the inbox.",
    scope_summary: "One additive definition change and one post-apply smoke check.",
    risks: ["definition_additive"],
    evidence_refs: evidenceRefs,
    assessment: assessmentInput,
    migration_mode: "none",
  });

  expect(assuranceCase.readiness).toBe("verified");
  expect(assuranceCase.evidence_refs).toEqual(evidenceRefs);
  expect(validateBuildChangeAssuranceCase(assuranceCase).ok).toBe(true);

  const invalid: BuildChangeAssuranceCase = {
    ...assuranceCase,
    builder_subject: "",
    risk_classification: ["unknown" as BuildChangeRisk],
    evidence_refs: [{ kind: "definition_history", app_id: "app-1", version: 0 }],
  };
  expect(validateBuildChangeAssuranceCase(invalid)).toEqual({
    ok: false,
    issues: [
      { path: "builder_subject", message: "builder_subject is required" },
      { path: "risk_classification[0]", message: "unknown risk kind: unknown" },
      { path: "evidence_refs[0].version", message: "version must be a positive integer" },
    ],
  });
});

function hostCheck(
  id: string,
  phase: "pre_proposal" | "pre_apply" | "post_apply" | "release",
  status: "passed" | "failed" | "skipped",
) {
  return {
    id,
    phase,
    status,
    message: `${id} ${status}`,
  };
}
