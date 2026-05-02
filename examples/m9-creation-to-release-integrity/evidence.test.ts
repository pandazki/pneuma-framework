import { expect, test } from "bun:test";
import {
  createReleaseCandidate,
  finalizeReleaseCandidate,
  markReleaseCandidateBuilding,
  markReleaseCandidateVerifying,
  recordReleaseCandidateCheck,
} from "../../packages/core/src/release-candidate.js";
import {
  createCreationToReleaseEvidence,
  finalizeCreationToReleaseEvidence,
  recordCreationApproval,
  recordCreationExecution,
  recordCreationProposal,
  recordCreationRecovery,
  recordCreationReleaseCandidate,
  serializeCreationToReleaseEvidence,
} from "./evidence.js";

test("success evidence connects Builder request, approval, execution, and release candidate", () => {
  const evidence = createCreationToReleaseEvidence({
    run_id: "m9-success",
    created_at: "2026-05-02T00:00:00.000Z",
    builder_request: "Add a Priority Queue to Knowledge Inbox.",
  });
  recordCreationProposal(evidence, {
    intent: "Review inbox by priority",
    summary: "Add Priority Queue",
    tool: "definition.apply_change_set",
    changes: ["add_table_column", "add_operation", "add_view", "add_policy_rule"],
  });
  recordCreationApproval(evidence, {
    prompt_id: "prompt-priority-queue",
    decision: "allow",
    decided_at: "2026-05-02T00:00:01.000Z",
  });
  recordCreationExecution(evidence, {
    change_set_id: "def-set-priority-queue",
    status: "applied",
    child_progress: [
      { index: 0, operation_id: "add_table_column", status: "applied" },
      { index: 1, operation_id: "add_operation", status: "applied" },
      { index: 2, operation_id: "add_view", status: "applied" },
      { index: 3, operation_id: "add_policy_rule", status: "applied" },
    ],
  });

  const candidate = finalizeReleaseCandidate([
    { name: "health", status: "passed" as const, at_ms: 10 },
    { name: "config", status: "passed" as const, at_ms: 20 },
    { name: "api", status: "passed" as const, at_ms: 30 },
  ].reduce((current, check) => recordReleaseCandidateCheck(current, check), markReleaseCandidateVerifying(
    markReleaseCandidateBuilding(createReleaseCandidate({
      id: "rc-priority-queue",
      source_workspace: "/tmp/pneuma-m9-success",
      definition_fingerprint: "definition:v2",
      created_at_ms: 1,
    }), {
      build_manifest_path: "/tmp/pneuma-m9-success/.pneuma-build/build.manifest.json",
      image_tag: "pneuma-knowledge-inbox:m9-success",
      at_ms: 2,
    }),
    { at_ms: 3 },
  )), {
    required_checks: ["health", "config", "api"],
    at_ms: 40,
  });
  recordCreationReleaseCandidate(evidence, candidate);
  finalizeCreationToReleaseEvidence(evidence, "release_candidate_ready");

  expect(evidence.final_status).toBe("release_candidate_ready");
  expect(evidence.proposal?.tool).toBe("definition.apply_change_set");
  expect(evidence.approval?.decision).toBe("allow");
  expect(evidence.execution?.child_progress).toHaveLength(4);
  expect(evidence.release_candidate?.status).toBe("ready");
  expect(evidence.release_candidate?.checks.map((check) => check.name)).toEqual(["health", "config", "api"]);
  expect(serializeCreationToReleaseEvidence(evidence)).toContain('"final_status": "release_candidate_ready"');
});

test("failure evidence records child progress and recovery without producing a release candidate", () => {
  const evidence = createCreationToReleaseEvidence({
    run_id: "m9-failure",
    builder_request: "Add a Priority Queue to Knowledge Inbox.",
  });
  recordCreationProposal(evidence, {
    intent: "Review inbox by priority",
    summary: "Add Priority Queue",
    tool: "definition.apply_change_set",
    changes: ["add_table_column", "add_operation", "add_view", "add_policy_rule"],
  });
  recordCreationApproval(evidence, {
    prompt_id: "prompt-priority-queue",
    decision: "allow",
  });
  recordCreationExecution(evidence, {
    change_set_id: "def-set-priority-queue",
    status: "failed",
    failed_change_index: 1,
    child_progress: [
      { index: 0, operation_id: "add_table_column", status: "applied" },
      {
        index: 1,
        operation_id: "add_operation",
        status: "failed",
        failure: { category: "operation_failed", message: "HTTP 500" },
      },
      { index: 2, operation_id: "add_view", status: "pending" },
      { index: 3, operation_id: "add_policy_rule", status: "pending" },
    ],
  });
  recordCreationRecovery(evidence, {
    status: "manual_repair_required",
    strategy: "manual_repair",
    reason: "A child mutation completed before the change set failed.",
    options: ["definition.repair.status", "definition.repair.reset_to_last_good"],
  });
  finalizeCreationToReleaseEvidence(evidence, "failed_repair_required");

  expect(evidence.final_status).toBe("failed_repair_required");
  expect(evidence.release_candidate).toBeUndefined();
  expect(evidence.execution?.failed_change_index).toBe(1);
  expect(evidence.recovery?.status).toBe("manual_repair_required");
  const json = serializeCreationToReleaseEvidence(evidence);
  expect(json).toContain('"release_candidate"');
  expect(json).toContain('"manual_repair_required"');
});
