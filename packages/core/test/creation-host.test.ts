import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCreationHostStore,
  type CreationHostProfile,
} from "../src/creation-host.js";

const profiles: CreationHostProfile[] = [
  {
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
  },
  {
    id: "team-decision-log-bun-sqlite",
    display_name: "Team Decision Log",
    description: "Record team decisions.",
    template_dir: "/templates/team-decision-log",
    stack_id: "reference-bun-sqlite",
    capabilities: ["preview", "inspect"],
    metadata: {
      read_operation_id: "list_decisions",
      data_table_id: "decisions",
    },
  },
];

describe("Creation Host profile contract", () => {
  test("creates profile-backed projects with deterministic version workspace layout", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-core-host-"));
    try {
      const store = createCreationHostStore({ workspace, profiles, now: () => 123 });
      expect(store.listProfiles().map((profile) => profile.id)).toEqual([
        "knowledge-inbox-bun-sqlite",
        "team-decision-log-bun-sqlite",
      ]);

      const { project, version } = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });

      expect(project).toMatchObject({
        app_id: "team-knowledge-inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
        current_version_id: "v0",
      });
      expect(store.getProfile("knowledge-inbox-bun-sqlite").stack_id).toBe("reference-bun-sqlite");
      expect(store.getProfile("knowledge-inbox-bun-sqlite").metadata).toMatchObject({
        read_operation_id: "list_inbox_items",
        data_table_id: "inbox_items",
      });
      expect("sqlite_path" in version).toBe(false);
      expect(existsSync(join(workspace, ".pneuma-host/host-state.json"))).toBe(true);
      expect(existsSync(join(workspace, "generated-apps/team-knowledge-inbox/versions/v0/workspace/data"))).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("forks a version directory and advances the project current version", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-core-host-fork-"));
    try {
      const store = createCreationHostStore({ workspace, profiles, now: () => 100 });
      store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });
      const markerPath = join(
        workspace,
        "generated-apps/team-knowledge-inbox/versions/v0/workspace/data/marker.txt",
      );
      writeFileSync(markerPath, "v0 data\n");

      const forked = store.forkVersion({
        app_id: "team-knowledge-inbox",
        from_version_id: "v0",
        to_version_id: "v1",
      });

      expect(forked.version_id).toBe("v1");
      expect(store.getProject("team-knowledge-inbox").current_version_id).toBe("v1");
      expect(existsSync(join(forked.app_workspace_dir, "data/marker.txt"))).toBe(true);
      expect(store.listVersions("team-knowledge-inbox").map((version) => version.version_id)).toEqual(["v0", "v1"]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("rejects unknown profiles and duplicate project ids", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-core-host-invalid-"));
    try {
      const store = createCreationHostStore({ workspace, profiles });
      expect(() => store.createProject({
        app_id: "bad-profile-app",
        display_name: "Bad Profile",
        profile_id: "missing-profile",
      })).toThrow("unknown Creation Host profile: missing-profile");

      store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });
      expect(() => store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Duplicate",
        profile_id: "knowledge-inbox-bun-sqlite",
      })).toThrow("generated app already exists: team-knowledge-inbox");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
