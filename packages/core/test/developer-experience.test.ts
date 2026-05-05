import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertCreationHostProfileContract,
  createCreationHostStore,
  diagnoseCreationHostWorkspace,
  validateCreationHostProfileContract,
  type CreationHostProfile,
} from "../src/index.js";

const validProfile: CreationHostProfile = {
  id: "knowledge-inbox-bun-sqlite",
  display_name: "Knowledge Inbox",
  description: "Capture and triage sources.",
  template_dir: "/templates/knowledge-inbox",
  stack_id: "reference-bun-sqlite",
  capabilities: ["preview", "inspect", "evolve", "publish"],
  metadata: {
    read_operation_id: "list_inbox_items",
    data_table_id: "inbox_items",
  },
};

describe("developer Creation Host contract helpers", () => {
  test("accepts framework-level valid Creation Host profiles", () => {
    const result = validateCreationHostProfileContract(validProfile);

    expect(result.ok).toBe(true);
    expect(result.profile_id).toBe("knowledge-inbox-bun-sqlite");
    expect(result.issues).toEqual([]);
  });

  test("reports actionable profile contract issues", () => {
    const result = validateCreationHostProfileContract({
      id: "Bad Profile",
      display_name: " ",
      description: "",
      template_dir: "",
      capabilities: ["preview", ""],
      metadata: {
        broken: undefined,
      },
    } as unknown as CreationHostProfile);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "profile.id.invalid",
      "profile.display_name.required",
      "profile.description.required",
      "profile.template_dir.required",
      "profile.capabilities.invalid",
      "profile.metadata.not_json",
    ]);
    expect(() => assertCreationHostProfileContract(result.profile)).toThrow(
      /profile.id.invalid/,
    );
  });

  test("diagnoses a healthy empty Creation Host workspace with next steps", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-devx-empty-"));
    try {
      const report = diagnoseCreationHostWorkspace({
        workspace,
        profiles: [validProfile],
      });

      expect(report.ok).toBe(true);
      expect(report.summary.profile_count).toBe(1);
      expect(report.summary.project_count).toBe(0);
      expect(report.workspace_checks.map((check) => check.code)).toContain(
        "workspace.state.missing",
      );
      expect(report.next_steps).toContain(
        "Create a generated app project, then run doctor-host again to verify version directories.",
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("diagnoses missing generated-app version directories", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-devx-broken-"));
    try {
      const store = createCreationHostStore({
        workspace,
        profiles: [validProfile],
        now: () => 123,
      });
      const { version } = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: validProfile.id,
      });
      rmSync(version.version_dir, { recursive: true, force: true });

      const report = diagnoseCreationHostWorkspace({
        workspace,
        profiles: [validProfile],
      });

      expect(report.ok).toBe(false);
      expect(report.workspace_checks).toContainEqual({
        severity: "error",
        code: "workspace.version_dir.missing",
        message: "Missing version directory for team-knowledge-inbox@v0.",
        path: version.version_dir,
      });
      expect(report.next_steps).toContain(
        "Repair or recreate missing generated-app version directories before publish/restart/rollback.",
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

