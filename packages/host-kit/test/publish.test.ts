import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { FileReleaseRolloutStore } from "@pneuma-framework/core";
import {
  publishVerifiedVersion,
  rollbackPublishedVersion,
  type HostRuntimeAdapter,
} from "../src/index.js";

const runtime: HostRuntimeAdapter = {
  startPreview: async () => ({
    runtime_generation_id: "preview-v1",
    url: "http://127.0.0.1:9101",
  }),
  stopPreview: async () => undefined,
  startPublished: async (input) => ({
    runtime_generation_id: `published-${input.version_id}`,
    url: `http://127.0.0.1:${input.version_id === "v1" ? "9201" : "9200"}`,
  }),
  stopPublished: async () => undefined,
  waitUntilReady: async (input) => ({
    ok: true,
    checks: [{ name: "health", status: "passed", message: `ready ${input.url}`, at_ms: 1 }],
  }),
};

const receipt = {
  receipt_id: "data-v1",
  app_id: "team-notes",
  source_version_id: "v0",
  target_version_id: "v1",
  provider_profile_id: "local-sqlite",
  policy: "carry-forward-with-receipt" as const,
  status: "completed" as const,
  created_at_ms: 1,
  steps: [{ id: "copy", status: "passed" as const, message: "copied" }],
  evidence_refs: [{ kind: "host_check" as const, check_id: "copy", status: "passed" as const }],
};

describe("host-kit publish orchestration", () => {
  test("blocks publish without required data receipt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pneuma-host-kit-publish-"));
    const result = await publishVerifiedVersion({
      app_id: "team-notes",
      version_id: "v1",
      build_change_id: "change-review-queue",
      runtime_intent_id: "intent-publish-v1",
      data_dir: join(dir, "published/v1"),
      runtime,
      rollout_store: new FileReleaseRolloutStore({ workspace: dir }),
      data_receipt: undefined,
      data_receipt_required: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected publish to be blocked");
    expect(result.reason).toBe("data_evolution_receipt_required");
    rmSync(dir, { recursive: true, force: true });
  });

  test("publishes active runtime and then rolls back to previous version", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pneuma-host-kit-publish-"));
    const store = new FileReleaseRolloutStore({ workspace: dir });

    const v0 = await publishVerifiedVersion({
      app_id: "team-notes",
      version_id: "v0",
      build_change_id: "change-initial",
      runtime_intent_id: "intent-publish-v0",
      data_dir: join(dir, "published/v0"),
      runtime,
      rollout_store: store,
      data_receipt: undefined,
      data_receipt_required: false,
    });
    expect(v0.ok).toBe(true);

    const v1 = await publishVerifiedVersion({
      app_id: "team-notes",
      version_id: "v1",
      build_change_id: "change-review-queue",
      runtime_intent_id: "intent-publish-v1",
      data_dir: join(dir, "published/v1"),
      runtime,
      rollout_store: store,
      data_receipt: receipt,
      data_receipt_required: true,
    });
    expect(v1.ok).toBe(true);
    if (!v1.ok) throw new Error("expected publish");
    expect(v1.runtime_control_receipt.status).toBe("completed");

    const rolledBack = await rollbackPublishedVersion({
      app_id: "team-notes",
      build_change_id: "change-review-queue",
      runtime_intent_id: "intent-rollback-v1",
      runtime,
      rollout_store: store,
      reason: "operator requested rollback",
    });
    expect(rolledBack.ok).toBe(true);
    if (!rolledBack.ok) throw new Error("expected rollback");
    expect(rolledBack.active_version_id).toBe("v0");
    rmSync(dir, { recursive: true, force: true });
  });
});
