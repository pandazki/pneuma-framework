import { describe, expect, test } from "bun:test";
import { validateScaffoldProjectManifest } from "@pneuma-framework/core";
import {
  createInitialWorkflowApp,
  evolveWorkflowForIntent,
  migrateRecordsForDefinition,
  transitionWorkflowRecord,
  validateWorkflowAppDefinition,
  type WorkflowRecord,
} from "./src/domain/workflow-app.js";
import { applyWorkflowAppPatch } from "./src/host/generated-app-module.js";
import { workflowAppScaffoldManifest } from "./src/host/scaffold.js";

describe("workflow app domain", () => {
  test("creates a valid Vendor Intake app with form, queue, detail, and stage actions", () => {
    const app = createInitialWorkflowApp({
      app_id: "vendor-intake",
      title: "Vendor Intake Portal",
      purpose: "Collect vendor requests, review risk, and approve onboarding.",
      template_id: "vendor_intake",
    });

    expect(validateWorkflowAppDefinition(app.definition)).toEqual({ ok: true });
    expect(app.definition.entity.plural).toBe("Vendor requests");
    expect(app.definition.views.map((view) => view.kind)).toEqual(["form", "queue", "detail"]);
    expect(app.definition.actions.map((action) => action.id)).toContain("submit_for_business_review");
    expect(app.records).toHaveLength(2);
  });

  test("evolves legal review into stage graph and carries existing records forward", () => {
    const app = createInitialWorkflowApp({
      app_id: "vendor-intake",
      title: "Vendor Intake Portal",
      purpose: "Collect vendor requests, review risk, and approve onboarding.",
      template_id: "vendor_intake",
    });
    const evolved = evolveWorkflowForIntent(
      app.definition,
      "Add a legal review stage before approval and require contract value for high-risk vendors.",
    );
    const migrated = migrateRecordsForDefinition(app.records, evolved);

    expect(validateWorkflowAppDefinition(evolved)).toEqual({ ok: true });
    expect(evolved.stages.map((stage) => stage.id)).toContain("legal_review");
    expect(evolved.fields.map((field) => field.id)).toContain("contract_value");
    expect(evolved.actions.map((action) => action.id)).toContain("send_to_legal_review");
    expect(migrated).toHaveLength(app.records.length);
    expect(migrated[0]?.values.vendor_name).toBe(app.records[0]?.values.vendor_name);
    expect(migrated[0]?.values.contract_value).toBeDefined();
  });

  test("normalizes code-agent view filters written as a single string", () => {
    const app = createInitialWorkflowApp({
      app_id: "vendor-intake",
      title: "Vendor Intake Portal",
      purpose: "Collect vendor requests, review risk, and approve onboarding.",
      template_id: "vendor_intake",
    });

    const patched = applyWorkflowAppPatch(app.definition, {
      stages: [{ id: "legal_review", label: "Legal review" }],
      views: [{
        id: "legal_queue",
        label: "Legal queue",
        kind: "queue",
        fields: ["vendor_name", "risk_level"],
        stage_filter: "legal_review",
      } as never],
    });

    expect(validateWorkflowAppDefinition(patched)).toEqual({ ok: true });
    expect(patched.views.find((view) => view.id === "legal_queue")?.stage_filter).toEqual(["legal_review"]);
  });

  test("rejects definitions whose actions reference missing stages or roles", () => {
    const app = createInitialWorkflowApp({
      app_id: "vendor-intake",
      title: "Vendor Intake Portal",
      purpose: "Collect vendor requests, review risk, and approve onboarding.",
      template_id: "vendor_intake",
    });
    const invalid = {
      ...app.definition,
      actions: [
        ...app.definition.actions,
        {
          id: "ghost_approve",
          label: "Ghost approve",
          from_stage: "missing_stage",
          to_stage: "approved",
          required_role: "ghost",
        },
      ],
    };

    const validation = validateWorkflowAppDefinition(invalid);

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues).toContain("action ghost_approve references missing from_stage: missing_stage");
      expect(validation.issues).toContain("action ghost_approve references missing role: ghost");
    }
  });

  test("stage transitions enforce action stage and role requirements", () => {
    const app = createInitialWorkflowApp({
      app_id: "vendor-intake",
      title: "Vendor Intake Portal",
      purpose: "Collect vendor requests, review risk, and approve onboarding.",
      template_id: "vendor_intake",
    });
    const record: WorkflowRecord = app.records[0]!;

    expect(() =>
      transitionWorkflowRecord(app.definition, record, {
        action_id: "submit_for_business_review",
        actor_role: "requester",
        actor_subject: "user:bob",
      })
    ).toThrow("requires role: operations");

    const transitioned = transitionWorkflowRecord(app.definition, record, {
      action_id: "submit_for_business_review",
      actor_role: "operations",
      actor_subject: "user:alice",
      comment: "Ready for review.",
    });

    expect(transitioned.stage).toBe("business_review");
    expect(transitioned.history.at(-1)?.action_id).toBe("submit_for_business_review");
    expect(() =>
      transitionWorkflowRecord(app.definition, transitioned, {
        action_id: "submit_for_business_review",
        actor_role: "operations",
        actor_subject: "user:alice",
      })
    ).toThrow("cannot run action submit_for_business_review from stage business_review");
  });

  test("declares a scaffold boundary where the code agent edits generated app source only", () => {
    const manifest = workflowAppScaffoldManifest();

    expect(validateScaffoldProjectManifest(manifest)).toMatchObject({ ok: true });
    expect(manifest.artifact_boundary.writable_roots).toEqual(["src/app.ts"]);
    expect(manifest.artifact_boundary.protected_paths).toContain("src/host");
    expect(manifest.guardrails.pre_proposal.map((check) => check.id)).toContain("protected-paths-unchanged");
    expect(manifest.agent_contract.forbidden_tasks).toContain("modify Host code");
    expect(manifest.agent_contract.system_prompt_fragments.join("\n")).toContain("Never special-case a persistence provider");
  });
});
