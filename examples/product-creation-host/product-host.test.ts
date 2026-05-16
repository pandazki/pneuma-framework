import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createProductCreationHost } from "./src/host/product-host.js";

function workspace(): string {
  return mkdtempSync(join(tmpdir(), "pneuma-product-host-test-"));
}

describe("product creation host", () => {
  test("runs Bob create/evolve/reviewer-approve/preview/publish/share and Charlie fork/evolve/publish", async () => {
    const host = createProductCreationHost({
      workspace: workspace(),
      base_url: "http://127.0.0.1:0",
    });
    try {
      const bob = await host.createProject({
        name: "Engineering Dev Board",
        goal: "Track release work and review queues.",
        template_id: "engineering",
        builder_subject: "user:bob",
      });
      expect(bob.app_id).toBe("engineering-dev-board");

      const request = await host.requestEvolution({
        app_id: bob.app_id,
        builder_subject: "user:bob",
        message: "Add a review queue so items can be marked needs_review and approved.",
      });
      expect(request.status).toBe("awaiting_reviewer_approval");

      const blocked = await host.approveEvolution({ app_id: bob.app_id, subject: "user:bob" });
      expect(blocked.status).toBe("blocked");
      if (blocked.status === "blocked") {
        expect(blocked.reason).toBe("missing-required-approval");
      }

      const approved = await host.approveEvolution({ app_id: bob.app_id, subject: "role:reviewer" });
      expect(approved.status).toBe("ready_to_preview");
      if (approved.status === "ready_to_preview") {
        expect(approved.version_id).toBe("v1");
      }
      const preview = await host.startPreview({ app_id: bob.app_id });
      expect(preview.url).toContain(`/preview/${bob.app_id}`);
      const published = await host.publish({ app_id: bob.app_id });
      expect(published.url).toContain(`/app/${bob.app_id}`);

      const share = await host.share({ app_id: bob.app_id });
      expect(share.manifest.source_snapshot.definition.modules.map((mod) => mod.kind)).toContain("review_queue");
      expect(share.manifest.provider_requirements.map((provider) => provider.provider_id)).toContain("github-public");

      const charlie = await host.fork({
        artifact_id: share.artifact_id,
        name: "Charlie's Dev Board",
        builder_subject: "user:charlie",
      });
      expect(charlie.source_app_id).toBe(bob.app_id);

      await host.requestEvolution({
        app_id: charlie.app_id,
        builder_subject: "user:charlie",
        message: "Add a priority lane and GitHub attention list for my Linux workflow.",
      });
      const charlieApproved = await host.approveEvolution({ app_id: charlie.app_id, subject: "role:reviewer" });
      expect(charlieApproved.status).toBe("ready_to_preview");
      await host.startPreview({ app_id: charlie.app_id });
      await host.publish({ app_id: charlie.app_id });

      const snapshot = host.snapshot();
      const charlieCurrent = snapshot.projects.find((project) => project.app_id === charlie.app_id)?.current_version;
      expect(charlieCurrent?.definition.modules.map((mod) => mod.kind)).toContain("priority_lane");
      expect(charlieCurrent?.definition.modules.map((mod) => mod.kind)).toContain("github_attention");
      expect(snapshot.projects.length).toBe(2);
    } finally {
      await host.close();
    }
  });
});
