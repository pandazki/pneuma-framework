import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostStore } from "./host-store.js";

describe("M12 host store", () => {
  test("creates a Generated Application project with a v0 version directory", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m12-store-"));
    try {
      const store = createHostStore({ workspace, now: () => 1_000 });

      const result = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });

      expect(result.project.app_id).toBe("team-knowledge-inbox");
      expect(result.project.current_version_id).toBe("v0");
      expect(result.version.version_id).toBe("v0");
      expect(result.version.version_dir).toBe(
        join(workspace, "generated-apps", "team-knowledge-inbox", "versions", "v0"),
      );
      expect(result.version.sqlite_path).toBe(join(result.version.app_workspace_dir, "data", "app.db"));

      expect(existsSync(join(workspace, ".pneuma-host", "host-state.json"))).toBe(true);
      expect(existsSync(join(workspace, "generated-apps", "team-knowledge-inbox", "project.json"))).toBe(true);
      expect(existsSync(join(result.version.version_dir, "version.json"))).toBe(true);
      expect(existsSync(join(result.version.app_workspace_dir, "data"))).toBe(true);

      const projectJson = JSON.parse(
        readFileSync(join(workspace, "generated-apps", "team-knowledge-inbox", "project.json"), "utf8"),
      );
      expect(projectJson.display_name).toBe("Team Knowledge Inbox");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("persists and reloads projects and creation sessions", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m12-store-reload-"));
    try {
      const store = createHostStore({ workspace, now: () => 2_000 });
      store.createProject({
        app_id: "customer-notes",
        display_name: "Customer Notes",
        profile_id: "knowledge-inbox-bun-sqlite",
      });
      store.recordCreationSession({
        session_id: "session-1",
        app_id: "customer-notes",
        version_id: "v0",
        builder_user_id: "builder-alice",
        builder_request: "Create a small customer-note inbox.",
      });

      const reloaded = createHostStore({ workspace, now: () => 3_000 });
      expect(reloaded.listProjects().map((project) => project.app_id)).toEqual(["customer-notes"]);
      expect(reloaded.listVersions("customer-notes").map((version) => version.version_id)).toEqual(["v0"]);
      expect(reloaded.listSessions("customer-notes")).toEqual([
        {
          session_id: "session-1",
          app_id: "customer-notes",
          version_id: "v0",
          builder_user_id: "builder-alice",
          builder_request: "Create a small customer-note inbox.",
          created_at_ms: 2_000,
        },
      ]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("rejects duplicate app ids", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m12-store-dupe-"));
    try {
      const store = createHostStore({ workspace, now: () => 4_000 });
      store.createProject({
        app_id: "ops-inbox",
        display_name: "Ops Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });

      expect(() =>
        store.createProject({
          app_id: "ops-inbox",
          display_name: "Ops Inbox Copy",
          profile_id: "knowledge-inbox-bun-sqlite",
        }),
      ).toThrow("generated app already exists: ops-inbox");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
