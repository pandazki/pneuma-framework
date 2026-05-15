import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { createReferenceHost } from "./src/host/reference-host.js";

describe("reference creation host", () => {
  test("creates, evolves, rehearses, publishes, and rolls back Team Notes Board", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-reference-host-"));
    const host = createReferenceHost({ workspace });

    const project = await host.createProject({
      app_id: "team-notes",
      builder_user_id: "user:bob",
    });
    expect(project.version_id).toBe("v0");
    expect(project.notes.map((note) => note.title)).toEqual(["Design review", "Release checklist"]);

    const proposal = await host.requestReviewQueueEvolution({
      app_id: "team-notes",
      builder_subject: "user:bob",
      message: "Add a review queue so notes can be marked needs_review and approved.",
    });
    expect(proposal.status).toBe("awaiting_reviewer_approval");
    expect(proposal.review_packet.risk_classification).toContain("data_migration");

    const blocked = await host.approveEvolution({
      app_id: "team-notes",
      proposal_id: proposal.proposal_id,
      subject: "user:bob",
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.reason).toBe("missing-required-approval");

    const approved = await host.approveEvolution({
      app_id: "team-notes",
      proposal_id: proposal.proposal_id,
      subject: "user:alice",
    });
    expect(approved.status).toBe("ready_to_preview");
    expect(approved.data_receipt?.status).toBe("completed");

    const preview = await host.startPreview({ app_id: "team-notes" });
    expect(preview.url).toContain("http://127.0.0.1:");

    const published = await host.publish({ app_id: "team-notes" });
    expect(published.status).toBe("published");
    expect(published.notes.every((note) => "review_status" in note)).toBe(true);

    const rolledBack = await host.rollback({ app_id: "team-notes" });
    expect(rolledBack.status).toBe("rolled_back");
    expect(rolledBack.active_version_id).toBe("v0");
    rmSync(workspace, { recursive: true, force: true });
  });
});
