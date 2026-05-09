import { expect, test } from "bun:test";
import {
  evaluateBuildChangeRecoveryDrill,
  evaluateBuildChangeRecoveryDrillMatrix,
  type BuildChangeAssuranceCase,
  type BuildChangeRecoveryDrillScenario,
} from "../src/index.js";

test("passes a recovery drill when expected readiness and evidence are present", () => {
  const result = evaluateBuildChangeRecoveryDrill(
    {
      id: "post-apply-rollback",
      title: "Post-apply check failure rolls back source",
      build_change_id: "change-1",
      failure_stage: "post_apply",
      simulated_failure: "preview smoke failed after apply",
      expected_readiness: "failed_recovered",
      required_evidence_kinds: ["code_change_receipt", "host_check"],
    },
    caseFor({
      readiness: "failed_recovered",
      evidence_refs: [
        { kind: "code_change_receipt", proposal_id: "proposal-1" },
        { kind: "host_check", check_id: "rollback-restored-source", status: "passed" },
      ],
      blocking_reasons: ["post_apply_check_failed:smoke"],
      rollback_notes: ["rollback evidence present"],
    }),
  );

  expect(result).toEqual({
    scenario_id: "post-apply-rollback",
    title: "Post-apply check failure rolls back source",
    build_change_id: "change-1",
    status: "passed",
    readiness: "failed_recovered",
    missing_evidence_kinds: [],
    issues: [],
  });
});

test("fails a recovery drill when the assurance case has the wrong readiness", () => {
  const result = evaluateBuildChangeRecoveryDrill(
    scenarioFor({ expected_readiness: "failed_recovered" }),
    caseFor({ readiness: "failed_unrecovered" }),
  );

  expect(result.status).toBe("failed");
  expect(result.issues).toContain("expected readiness failed_recovered, got failed_unrecovered");
});

test("fails a recovery drill when required evidence refs are absent", () => {
  const result = evaluateBuildChangeRecoveryDrill(
    scenarioFor({ required_evidence_kinds: ["code_change_receipt", "host_check"] }),
    caseFor({
      readiness: "failed_recovered",
      evidence_refs: [{ kind: "host_check", check_id: "rollback-restored-source", status: "passed" }],
      rollback_notes: ["rollback evidence present"],
    }),
  );

  expect(result).toMatchObject({
    status: "failed",
    missing_evidence_kinds: ["code_change_receipt"],
    issues: ["missing evidence kind: code_change_receipt"],
  });
});

test("matrix evaluation matches scenarios to cases and summarizes failures", () => {
  const matrix = evaluateBuildChangeRecoveryDrillMatrix(
    [
      scenarioFor({ id: "known", build_change_id: "change-1" }),
      scenarioFor({ id: "missing", build_change_id: "missing-change" }),
    ],
    [
      caseFor({
        build_change_id: "change-1",
        readiness: "failed_recovered",
        evidence_refs: [
          { kind: "code_change_receipt", proposal_id: "proposal-1" },
          { kind: "host_check", check_id: "rollback-restored-source", status: "passed" },
        ],
        rollback_notes: ["rollback evidence present"],
      }),
    ],
  );

  expect(matrix.summary).toEqual({
    total: 2,
    passed: 1,
    failed: 1,
  });
  expect(matrix.results.map((result) => result.status)).toEqual(["passed", "failed"]);
  expect(matrix.results[1].issues).toEqual(["missing assurance case for build_change_id missing-change"]);
});

function scenarioFor(
  overrides: Partial<BuildChangeRecoveryDrillScenario> = {},
): BuildChangeRecoveryDrillScenario {
  return {
    id: "scenario-1",
    title: "Recovered failure path",
    build_change_id: "change-1",
    failure_stage: "post_apply",
    simulated_failure: "post-apply smoke failed",
    expected_readiness: "failed_recovered",
    required_evidence_kinds: ["code_change_receipt", "host_check"],
    ...overrides,
  };
}

function caseFor(overrides: Partial<BuildChangeAssuranceCase>): BuildChangeAssuranceCase {
  return {
    build_change_id: "change-1",
    app_id: "app-1",
    thread_id: "thread-1",
    builder_subject: "user:bob",
    intent_summary: "Add priority queue.",
    scope_summary: "Additive definition change with recovery evidence.",
    risk_classification: ["definition_additive"],
    readiness: "verified",
    evidence_refs: [{ kind: "host_check", check_id: "smoke", status: "passed" }],
    blocking_reasons: [],
    migration_mode: "none",
    ...overrides,
  };
}

