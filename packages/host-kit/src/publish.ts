import {
  createReleaseInstance,
  promoteReleaseCandidate,
  rollbackActiveRelease,
  stageReleaseCandidate,
  type DataEvolutionReceipt,
  type ReleaseRolloutStore,
  type RuntimeControlReceipt,
} from "@pneuma-framework/core";
import { dataEvolutionReceiptAllowsPublish } from "./runtime-data.js";
import type { HostRuntimeAdapter } from "./local-runtime.js";

export type PublishVerifiedVersionResult =
  | {
      readonly ok: true;
      readonly url: string;
      readonly runtime_control_receipt: RuntimeControlReceipt;
    }
  | {
      readonly ok: false;
      readonly reason: "data_evolution_receipt_required" | "runtime_not_ready" | "rollout_rejected";
    };

export async function publishVerifiedVersion(input: {
  readonly app_id: string;
  readonly version_id: string;
  readonly build_change_id: string;
  readonly runtime_intent_id: string;
  readonly data_dir: string;
  readonly runtime: HostRuntimeAdapter;
  readonly rollout_store: ReleaseRolloutStore;
  readonly data_receipt?: DataEvolutionReceipt;
  readonly data_receipt_required: boolean;
}): Promise<PublishVerifiedVersionResult> {
  if (input.data_receipt_required && !dataEvolutionReceiptAllowsPublish(input.data_receipt)) {
    return { ok: false, reason: "data_evolution_receipt_required" };
  }

  const handle = await input.runtime.startPublished({
    app_id: input.app_id,
    version_id: input.version_id,
    data_dir: input.data_dir,
  });
  let ready: Awaited<ReturnType<HostRuntimeAdapter["waitUntilReady"]>>;
  try {
    ready = await input.runtime.waitUntilReady({ url: handle.url });
  } catch {
    await stopPublishedBestEffort(input.runtime, handle.runtime_generation_id);
    return { ok: false, reason: "runtime_not_ready" };
  }
  if (!ready.ok || ready.checks.some((check) => check.status === "failed")) {
    await stopPublishedBestEffort(input.runtime, handle.runtime_generation_id);
    return { ok: false, reason: "runtime_not_ready" };
  }

  const staged = stageReleaseCandidate(
    await input.rollout_store.load(),
    createReleaseInstance({
      candidate_id: input.version_id,
      image_tag: `${input.app_id}:${input.version_id}`,
      data_dir: input.data_dir,
      url: handle.url,
      status: "healthy",
      checks: ready.checks,
    }),
    { reason: "host-kit publish" },
  );
  const promoted = promoteReleaseCandidate(staged, { reason: "host-kit publish" });
  if (!promoted.ok) {
    await stopPublishedBestEffort(input.runtime, handle.runtime_generation_id);
    return { ok: false, reason: "rollout_rejected" };
  }
  await input.rollout_store.save(promoted.state);

  return {
    ok: true,
    url: handle.url,
    runtime_control_receipt: {
      receipt_id: `runtime-control-${input.version_id}`,
      app_id: input.app_id,
      build_change_id: input.build_change_id,
      runtime_intent_id: input.runtime_intent_id,
      runtime_generation_id: handle.runtime_generation_id,
      reconcile_attempt_id: `reconcile-${input.version_id}`,
      status: "completed",
      evidence_refs: input.data_receipt
        ? [{ kind: "data_evolution_receipt", receipt_id: input.data_receipt.receipt_id }]
        : [],
    },
  };
}

async function stopPublishedBestEffort(
  runtime: HostRuntimeAdapter,
  runtimeGenerationId: string,
): Promise<void> {
  try {
    await runtime.stopPublished({ runtime_generation_id: runtimeGenerationId });
  } catch {
    // Cleanup should not hide the publish failure that caused this path.
  }
}

export type RollbackPublishedVersionResult =
  | { readonly ok: true; readonly active_version_id: string }
  | { readonly ok: false; readonly reason: "no_previous_release" | "rollout_rejected" };

export async function rollbackPublishedVersion(input: {
  readonly app_id: string;
  readonly build_change_id: string;
  readonly runtime_intent_id: string;
  readonly runtime: HostRuntimeAdapter;
  readonly rollout_store: ReleaseRolloutStore;
  readonly reason: string;
}): Promise<RollbackPublishedVersionResult> {
  const state = await input.rollout_store.load();
  if (!state.previous) return { ok: false, reason: "no_previous_release" };

  const result = rollbackActiveRelease(state, { reason: input.reason });
  if (!result.ok) return { ok: false, reason: "rollout_rejected" };

  await input.rollout_store.save(result.state);
  return {
    ok: true,
    active_version_id: result.state.active?.candidate_id ?? state.previous.candidate_id,
  };
}
