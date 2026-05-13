import { describe, expect, test } from "bun:test";
import {
  assertRuntimeGenerationCanMutate,
  dataEvolutionReceiptRequiredForPolicy,
  isCurrentRuntimeGeneration,
  validateDataEvolutionReceipt,
  validateReconcileAttempt,
  validateRuntimeControlReceipt,
  validateRuntimeGeneration,
  validateRuntimeIntent,
  validateRuntimeObservation,
  type DataEvolutionReceipt,
  type ReconcileAttempt,
  type RuntimeControlReceipt,
  type RuntimeGeneration,
  type RuntimeIntent,
  type RuntimeObservation,
} from "../src/runtime-data-governance.js";

const intent: RuntimeIntent = {
  intent_id: "intent-publish-v2",
  build_change_id: "change-priority",
  app_id: "dev-board",
  version_id: "v2",
  profile_id: "local-sqlite",
  mode: "published",
  action: "publish",
  desired_state: "Publish v2 with carried-forward data.",
  data_evolution_policy: "carry-forward-with-receipt",
  evidence_refs: [{ kind: "build_thread_turn", thread_id: "thread-1", turn_id: "proposal-1" }],
};

const generation: RuntimeGeneration = {
  runtime_generation_id: "runtime-generation-v2-1",
  app_id: "dev-board",
  version_id: "v2",
  profile_id: "local-sqlite",
  mode: "published",
  status: "current",
  service_url: "http://127.0.0.1:9001",
  created_at_ms: 1,
};

const observation: RuntimeObservation = {
  observation_id: "observation-v2-health",
  runtime_generation_id: "runtime-generation-v2-1",
  app_id: "dev-board",
  version_id: "v2",
  profile_id: "local-sqlite",
  mode: "published",
  status: "passed",
  observed_at_ms: 2,
  checks: [
    {
      id: "health",
      kind: "runtime_health",
      status: "passed",
      message: "Published runtime is healthy.",
    },
  ],
  evidence_refs: [{ kind: "runtime_health", runtime_id: "runtime-generation-v2-1", checked_at_ms: 2 }],
};

const dataReceipt: DataEvolutionReceipt = {
  receipt_id: "data-v1-to-v2",
  app_id: "dev-board",
  source_version_id: "v1",
  target_version_id: "v2",
  provider_profile_id: "local-sqlite",
  policy: "carry-forward-with-receipt",
  status: "completed",
  created_at_ms: 3,
  steps: [
    {
      id: "copy-data",
      status: "passed",
      message: "Copied v1 data into v2 data boundary.",
    },
  ],
  evidence_refs: [{ kind: "host_check", check_id: "copy-data", status: "passed" }],
};

describe("runtime/data governance contracts", () => {
  test("validates runtime intent, generation, observation, data receipt, reconcile attempt, and control receipt", () => {
    expect(validateRuntimeIntent(intent)).toEqual({ ok: true, issues: [] });
    expect(validateRuntimeGeneration(generation)).toEqual({ ok: true, issues: [] });
    expect(validateRuntimeObservation(observation)).toEqual({ ok: true, issues: [] });
    expect(validateDataEvolutionReceipt(dataReceipt)).toEqual({ ok: true, issues: [] });

    const attempt: ReconcileAttempt = {
      attempt_id: "attempt-publish-v2",
      runtime_intent_id: intent.intent_id,
      app_id: "dev-board",
      version_id: "v2",
      status: "completed",
      started_at_ms: 4,
      completed_at_ms: 5,
      steps: [
        { id: "promote", status: "passed", message: "Release candidate promoted." },
      ],
      observation_ids: [observation.observation_id],
      data_evolution_receipt_ids: [dataReceipt.receipt_id],
      recovery: { status: "not_required" },
    };
    expect(validateReconcileAttempt(attempt)).toEqual({ ok: true, issues: [] });

    const receipt: RuntimeControlReceipt = {
      receipt_id: "runtime-control-v2",
      app_id: "dev-board",
      build_change_id: "change-priority",
      runtime_intent_id: intent.intent_id,
      runtime_generation_id: generation.runtime_generation_id,
      reconcile_attempt_id: attempt.attempt_id,
      status: "completed",
      evidence_refs: [
        { kind: "build_thread_turn", thread_id: "thread-1", turn_id: "proposal-1" },
        { kind: "runtime_observation", observation_id: observation.observation_id },
        { kind: "data_evolution_receipt", receipt_id: dataReceipt.receipt_id },
      ],
    };
    expect(validateRuntimeControlReceipt(receipt)).toEqual({ ok: true, issues: [] });
  });

  test("rejects malformed identifiers and missing runtime generation refs", () => {
    expect(validateRuntimeIntent({ ...intent, intent_id: "" }).issues).toContainEqual({
      path: "intent_id",
      message: "intent_id is required.",
    });
    expect(validateRuntimeObservation({ ...observation, runtime_generation_id: "" }).issues).toContainEqual({
      path: "runtime_generation_id",
      message: "runtime_generation_id is required.",
    });
  });

  test("stale runtime generation cannot authorize mutation", () => {
    const stale: RuntimeGeneration = { ...generation, status: "stale" };
    expect(isCurrentRuntimeGeneration(stale)).toBe(false);
    expect(assertRuntimeGenerationCanMutate(stale)).toEqual({
      ok: false,
      reason: "runtime_generation_stale",
    });
  });

  test("failed observation remains valid evidence", () => {
    const failed = validateRuntimeObservation({
      ...observation,
      status: "failed",
      checks: [{ id: "health", kind: "runtime_health", status: "failed", message: "Health check failed." }],
    });
    expect(failed.ok).toBe(true);
  });

  test("knows which data policies require a receipt", () => {
    expect(dataEvolutionReceiptRequiredForPolicy("isolated-version-data")).toBe(false);
    expect(dataEvolutionReceiptRequiredForPolicy("carry-forward-with-receipt")).toBe(true);
    expect(dataEvolutionReceiptRequiredForPolicy("provider-managed-snapshot")).toBe(true);
    expect(dataEvolutionReceiptRequiredForPolicy("provider-managed-branch")).toBe(true);
  });
});
