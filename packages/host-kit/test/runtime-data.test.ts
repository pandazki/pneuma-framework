import { describe, expect, test } from "bun:test";
import {
  dataEvolutionReceiptAllowsPublish,
  runPreviewDataRehearsal,
  type DataEvolutionAdapter,
} from "../src/index.js";

const adapter: DataEvolutionAdapter = {
  cloneForPreview: async () => ({
    target_id: "preview-v1",
    source_version_id: "v0",
    target_version_id: "v1",
    provider_profile_id: "local-sqlite",
  }),
  rehearse: async () => ({
    receipt_id: "receipt-preview-v1",
    app_id: "team-notes",
    source_version_id: "v0",
    target_version_id: "v1",
    provider_profile_id: "local-sqlite",
    policy: "carry-forward-with-receipt",
    status: "completed",
    created_at_ms: 1,
    steps: [{ id: "default-review-status", status: "passed", message: "Assigned not_required." }],
    evidence_refs: [{ kind: "host_check", check_id: "default-review-status", status: "passed" }],
  }),
  applyForPublish: async () => ({
    receipt_id: "receipt-publish-v1",
    app_id: "team-notes",
    source_version_id: "v0",
    target_version_id: "v1",
    provider_profile_id: "local-sqlite",
    policy: "carry-forward-with-receipt",
    status: "completed",
    created_at_ms: 2,
    steps: [{ id: "publish-data", status: "passed", message: "Published data evolved." }],
    evidence_refs: [{ kind: "host_check", check_id: "publish-data", status: "passed" }],
  }),
};

describe("host-kit runtime/data orchestration", () => {
  test("records successful preview rehearsal receipt", async () => {
    const result = await runPreviewDataRehearsal({
      app_id: "team-notes",
      source_version_id: "v0",
      target_version_id: "v1",
      provider_profile_id: "local-sqlite",
      policy: "carry-forward-with-receipt",
      adapter,
    });

    expect(result.ok).toBe(true);
    expect(result.receipt?.status).toBe("completed");
    expect(dataEvolutionReceiptAllowsPublish(result.receipt)).toBe(true);
  });

  test("failed rehearsal terminates the attempt and does not allow publish", async () => {
    const failedAdapter: DataEvolutionAdapter = {
      ...adapter,
      rehearse: async () => ({
        receipt_id: "receipt-preview-v1",
        app_id: "team-notes",
        source_version_id: "v0",
        target_version_id: "v1",
        provider_profile_id: "local-sqlite",
        policy: "carry-forward-with-receipt",
        status: "failed",
        created_at_ms: 1,
        steps: [{ id: "default-review-status", status: "failed", message: "Missing target field." }],
        evidence_refs: [{ kind: "host_check", check_id: "default-review-status", status: "failed" }],
      }),
    };

    const result = await runPreviewDataRehearsal({
      app_id: "team-notes",
      source_version_id: "v0",
      target_version_id: "v1",
      provider_profile_id: "local-sqlite",
      policy: "carry-forward-with-receipt",
      adapter: failedAdapter,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failed preview rehearsal");
    expect(result.reason).toBe("preview_data_rehearsal_failed");
    expect(dataEvolutionReceiptAllowsPublish(result.receipt)).toBe(false);
  });
});
