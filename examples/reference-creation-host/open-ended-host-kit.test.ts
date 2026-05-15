import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import {
  applyApprovedHostKitCodeChange,
  evaluateHostKitApproval,
  prepareHostKitCodeChangeReview,
} from "@pneuma-framework/host-kit";
import { openEndedScaffoldManifest } from "./src/host/open-ended-pressure.js";

describe("Reference Host open-ended Host Kit pressure", () => {
  test("evolves a Host-owned UI artifact through the same approval/apply lane", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-reference-host-open-ended-"));
    try {
      const sourceRoot = join(workspace, "source");
      const draftRoot = join(workspace, "draft");
      mkdirSync(join(sourceRoot, "src"), { recursive: true });
      mkdirSync(join(draftRoot, "src"), { recursive: true });
      writeFileSync(
        join(sourceRoot, "src/site-definition.ts"),
        `export const site = { title: "Focus", sections: ["today"], accent: "blue" };\n`,
        "utf8",
      );
      writeFileSync(
        join(draftRoot, "src/site-definition.ts"),
        `export const site = { title: "Focus", sections: ["today", "github_attention"], accent: "green" };\n`,
        "utf8",
      );

      const review = await prepareHostKitCodeChangeReview({
        manifest: openEndedScaffoldManifest(),
        source_root: sourceRoot,
        draft_root: draftRoot,
        proposal_id: "proposal-open-ended-focus-site",
        build_change_id: "change-open-ended-focus-site",
        app_id: "focus-site",
        thread_id: "thread-open-ended",
        builder_subject: "user:bob",
        summary: "Add GitHub attention section to the focus site.",
        rationale: "The generated app needs a non-table UI/module artifact change.",
        risks: ["source_code_change"],
        migration_mode: "none",
        command_runner: async () => ({ ok: true, output: "ok" }),
      });
      expect(review.ok).toBe(true);
      if (!review.ok) throw new Error("review failed");
      expect(review.review_packet.proposed_changes.map((change) => change.kind)).toContain("source");

      const selfApproval = evaluateHostKitApproval({
        app_id: "focus-site",
        build_change_id: "change-open-ended-focus-site",
        builder_subject: "user:bob",
        risks: review.review_packet.risk_classification,
        evidence_refs: review.review_packet.evidence_refs,
        policy: {
          policy_id: "open-ended-governance",
          app_id: "focus-site",
          role_assignments: [
            { subject: "user:bob", role: "builder" },
            { subject: "user:alice", role: "reviewer" },
          ],
          routes: [{ route_id: "source-review", risks: ["source_code_change"], required_roles: ["reviewer"] }],
        },
        decisions: [{ subject: "user:bob", decision: "approved", decided_at_ms: Date.now() }],
      });
      expect(selfApproval.allowed).toBe(false);

      const reviewerApproval = evaluateHostKitApproval({
        app_id: "focus-site",
        build_change_id: "change-open-ended-focus-site",
        builder_subject: "user:bob",
        risks: review.review_packet.risk_classification,
        evidence_refs: review.review_packet.evidence_refs,
        policy: {
          policy_id: "open-ended-governance",
          app_id: "focus-site",
          role_assignments: [
            { subject: "user:bob", role: "builder" },
            { subject: "user:alice", role: "reviewer" },
          ],
          routes: [{ route_id: "source-review", risks: ["source_code_change"], required_roles: ["reviewer"] }],
        },
        decisions: [{ subject: "user:alice", decision: "approved", decided_at_ms: Date.now() }],
      });
      expect(reviewerApproval.allowed).toBe(true);

      const applied = await applyApprovedHostKitCodeChange({
        manifest: openEndedScaffoldManifest(),
        source_root: sourceRoot,
        draft_root: draftRoot,
        proposal: review.proposal,
        approval: reviewerApproval,
        command_runner: async () => ({ ok: true, output: "ok" }),
      });
      expect(applied.ok).toBe(true);
      expect(readFileSync(join(sourceRoot, "src/site-definition.ts"), "utf8")).toContain("github_attention");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
