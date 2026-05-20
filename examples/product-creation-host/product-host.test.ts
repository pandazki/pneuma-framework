import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createProductCreationHost } from "./src/host/product-host.js";

function workspace(): string {
  return mkdtempSync(join(tmpdir(), "pneuma-product-host-test-"));
}

describe("product creation host", () => {
  test("runs Bob create/evolve/builder-confirm/preview/publish/share and Charlie fork/evolve/publish", async () => {
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
      expect(host.snapshot().developer_contract.framework_owned).toContain("approval route evaluation");
      expect(host.snapshot().projects[0]?.versions.map((version) => version.version_id)).toEqual(["v0"]);

      await host.startPreview({ app_id: bob.app_id });
      const initialPublish = await host.publish({ app_id: bob.app_id });
      expect(initialPublish.version_id).toBe("v0");
      let bobProject = host.snapshot().projects.find((project) => project.app_id === bob.app_id);
      expect(bobProject?.preview_url).toBeUndefined();
      expect(bobProject?.published_url).toContain(`/app/${bob.app_id}`);

      const request = await host.requestEvolution({
        app_id: bob.app_id,
        builder_subject: "user:bob",
        message: "Add a review queue so items can be marked needs_review and approved.",
      });
      expect(request.status).toBe("awaiting_builder_confirmation");

      const approved = await host.approveEvolution({ app_id: bob.app_id, subject: "user:bob" });
      expect(approved.status).toBe("ready_to_preview");
      if (approved.status === "ready_to_preview") {
        expect(approved.version_id).toBe("v1");
      }
      const preview = await host.startPreview({ app_id: bob.app_id });
      expect(preview.url).toContain(`/preview/${bob.app_id}`);
      const published = await host.publish({ app_id: bob.app_id });
      expect(published.url).toContain(`/app/${bob.app_id}`);
      expect(published.version_id).toBe("v1");
      bobProject = host.snapshot().projects.find((project) => project.app_id === bob.app_id);
      expect(bobProject?.preview_url).toBeUndefined();

      const share = await host.share({ app_id: bob.app_id });
      expect(share.manifest.source_snapshot.definition.modules.map((mod) => mod.kind)).toContain("review_queue");
      expect(share.manifest.provider_requirements.map((provider) => provider.provider_id)).toContain("github-public");

      const rolledBack = await host.rollback({ app_id: bob.app_id });
      expect(rolledBack.active_version_id).toBe("v0");
      bobProject = host.snapshot().projects.find((project) => project.app_id === bob.app_id);
      expect(bobProject?.preview_url).toBeUndefined();
      expect(bobProject?.published_url).toContain(`/app/${bob.app_id}`);

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
      const charliePending = host.snapshot().projects.find((project) => project.app_id === charlie.app_id)?.pending_evolution;
      expect(charliePending?.proposal.summary).toBe("Add GitHub attention and priority lane to the Dev Board.");
      const charlieApproved = await host.approveEvolution({ app_id: charlie.app_id, subject: "user:charlie" });
      expect(charlieApproved.status).toBe("ready_to_preview");
      await host.startPreview({ app_id: charlie.app_id });
      await host.publish({ app_id: charlie.app_id });

      const snapshot = host.snapshot();
      const charlieCurrent = snapshot.projects.find((project) => project.app_id === charlie.app_id)?.current_version;
      const charlieProject = snapshot.projects.find((project) => project.app_id === charlie.app_id);
      bobProject = snapshot.projects.find((project) => project.app_id === bob.app_id);
      expect(charlieCurrent?.definition.modules.map((mod) => mod.kind)).toContain("priority_lane");
      expect(charlieCurrent?.definition.modules.map((mod) => mod.kind)).toContain("github_attention");
      expect(charlieProject?.preview_url).toBeUndefined();
      expect(charlieProject?.published_url).toContain(`/app/${charlie.app_id}`);
      expect(bobProject?.versions.map((version) => version.version_id)).toEqual(["v0", "v1"]);
      expect(bobProject?.active_version_id).toBe("v0");
      expect(snapshot.projects.length).toBe(2);
    } finally {
      await host.close();
    }
  });

  test("turns a multi-concern Builder request into one precise proposal and migrated board shape", async () => {
    const host = createProductCreationHost({
      workspace: workspace(),
      base_url: "http://127.0.0.1:0",
    });
    try {
      const project = await host.createProject({
        name: "Complex Dev Board",
        goal: "Track dependencies, blockers, CI, and deadlines.",
        template_id: "engineering",
        builder_subject: "user:bob",
      });

      await host.requestEvolution({
        app_id: project.app_id,
        builder_subject: "user:bob",
        message: "Add dependency tracking, blocker triage, CI health, and a delivery timeline so the Dev Board can show what is blocked, what depends on what, which checks are failing, and what is due this week.",
      });
      const pending = host.snapshot().projects.find((item) => item.app_id === project.app_id)?.pending_evolution;
      expect(pending?.proposal.summary).toBe("Add dependency map, blocker triage, CI health, and delivery timeline to the Dev Board.");

      const approved = await host.approveEvolution({ app_id: project.app_id, subject: "user:bob" });
      expect(approved.status).toBe("ready_to_preview");
      const current = host.snapshot().projects.find((item) => item.app_id === project.app_id)?.current_version;
      expect(current?.definition.modules.map((mod) => mod.kind)).toContain("dependency_map");
      expect(current?.definition.modules.map((mod) => mod.kind)).toContain("blocker_triage");
      expect(current?.definition.modules.map((mod) => mod.kind)).toContain("ci_health");
      expect(current?.definition.modules.map((mod) => mod.kind)).toContain("delivery_timeline");
      expect(current?.items[0]?.ci_status).toBe("failing");
      expect(current?.items[1]?.depends_on).toBe("ci-flake");
      expect(current?.items[0]?.due_date).toBe("2026-05-22");
    } finally {
      await host.close();
    }
  });

  test("turns direct owner editing into a generated runtime action instead of description-only drift", async () => {
    const host = createProductCreationHost({
      workspace: workspace(),
      base_url: "http://127.0.0.1:0",
    });
    try {
      const project = await host.createProject({
        name: "Runtime Behavior Board",
        goal: "Track work.",
        template_id: "engineering",
        builder_subject: "user:bob",
      });

      const request = await host.requestEvolution({
        app_id: project.app_id,
        builder_subject: "user:bob",
        message: "我觉得需要改负责人的功能。",
      });
      expect(request.status).toBe("awaiting_builder_confirmation");

      const snapshot = host.snapshot().projects.find((item) => item.app_id === project.app_id);
      expect(snapshot?.pending_evolution?.proposal.summary).toBe("Add direct owner editing to the Dev Board.");
      expect(snapshot?.pending_evolution?.proposal.evidence.changed_files).toEqual(["src/runtime.json"]);

      const approved = await host.approveEvolution({ app_id: project.app_id, subject: "user:bob" });
      expect(approved.status).toBe("ready_to_preview");
      const current = host.snapshot().projects.find((item) => item.app_id === project.app_id)?.current_version;
      const ownerAction = current?.runtime_extension.item_actions.find((action) => action.id === "edit_owner");
      expect(ownerAction?.field).toBe("owner");
      expect(ownerAction?.control).toBe("select");
      expect(current?.definition.description).toBe("Track work.");
    } finally {
      await host.close();
    }
  });
});
