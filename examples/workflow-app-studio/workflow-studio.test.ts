import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { transitionWorkflowRecord } from "./src/domain/workflow-app.js";
import { createWorkflowAppStudio, createWorkflowRecord } from "./src/host/workflow-studio.js";

function workspace(): string {
  return mkdtempSync(join(tmpdir(), "pneuma-workflow-studio-test-"));
}

describe("workflow app studio host flow", () => {
  test("creates, evolves, approves, previews, publishes, shares, forks, and rolls back a workflow app", async () => {
    const host = createWorkflowAppStudio({
      workspace: workspace(),
      base_url: "http://127.0.0.1:0",
    });
    try {
      const bob = await host.createProject({
        name: "Vendor Intake Portal",
        goal: "Collect vendor requests, review risk, and approve onboarding.",
        template_id: "vendor_intake",
        builder_subject: "user:bob",
      });
      expect(bob.app_id).toBe("vendor-intake-portal");
      expect(host.snapshot().projects[0]?.current_version?.source.workflow.views.map((view) => view.kind)).toEqual(["form", "queue", "detail"]);

      await host.startPreview({ app_id: bob.app_id, preview_id: "preview-v0" });
      const v0Publish = await host.publish({ app_id: bob.app_id });
      expect(v0Publish.version_id).toBe("v0");

      await host.requestEvolution({
        app_id: bob.app_id,
        builder_subject: "user:bob",
        message: "Add a legal review stage before approval and require contract value for high-risk vendors.",
      });
      let project = host.snapshot().projects.find((item) => item.app_id === bob.app_id);
      expect(project?.pending_evolution?.summary).toBe("Add legal review to the workflow before approval.");
      expect(project?.pending_evolution?.changed_files).toEqual(["src/workflow.json"]);
      expect(project?.pending_evolution?.highlights.join(" ")).toContain("Legal review");

      const approved = await host.approveEvolution({ app_id: bob.app_id, subject: "user:bob" });
      expect(approved.status).toBe("ready_to_preview");
      if (approved.status === "ready_to_preview") expect(approved.migrated_records).toBe(2);

      const preview = await host.startPreview({ app_id: bob.app_id, preview_id: "preview-v1" });
      expect(preview.url).toContain(`/preview/${bob.app_id}`);
      const published = await host.publish({ app_id: bob.app_id });
      expect(published.version_id).toBe("v1");
      project = host.snapshot().projects.find((item) => item.app_id === bob.app_id);
      expect(project?.current_version?.source.workflow.stages.map((stage) => stage.id)).toContain("legal_review");
      expect(project?.current_version?.records[0]?.values.contract_value).toBeDefined();

      const share = await host.share({ app_id: bob.app_id });
      expect(share.manifest.source_snapshot.workflow.stages.map((stage) => stage.id)).toContain("legal_review");
      const charlie = await host.fork({
        artifact_id: share.artifact_id,
        name: "Partner Intake Portal",
        builder_subject: "user:charlie",
      });
      expect(charlie.source_app_id).toBe(bob.app_id);
      expect(host.snapshot().projects.find((item) => item.app_id === charlie.app_id)?.current_version?.source.workflow.title).toBe("Partner Intake Portal");

      const rollback = await host.rollback({ app_id: bob.app_id });
      expect(rollback.active_version_id).toBe("v0");
    } finally {
      await host.close();
    }
  });

  test("generated runtime records can be created and transitioned through workflow rules", async () => {
    const host = createWorkflowAppStudio({
      workspace: workspace(),
      base_url: "http://127.0.0.1:0",
    });
    try {
      const project = await host.createProject({
        name: "Vendor Intake Portal",
        goal: "Collect vendor requests.",
        template_id: "vendor_intake",
        builder_subject: "user:bob",
      });
      const version = host.store.currentVersion(project.app_id);
      const record = createWorkflowRecord(version.source, {
        title: "New analytics vendor",
        owner: "Dana",
        values: { vendor_name: "Amplitude", requestor: "Dana", category: "software", risk_level: "medium" },
      });
      const transitioned = transitionWorkflowRecord(version.source.workflow, record, {
        action_id: "submit_for_business_review",
        actor_role: "operations",
        actor_subject: "user:bob",
      });

      expect(record.stage).toBe("submitted");
      expect(transitioned.stage).toBe("business_review");
      expect(transitioned.history).toHaveLength(1);
    } finally {
      await host.close();
    }
  });
});
