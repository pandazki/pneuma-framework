import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGeneralityHostStore } from "./host-store.js";
import { STACK_PROFILES } from "./profiles.js";

describe("M15 generality host store", () => {
  test("creates generated apps for both supported profiles", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m15-store-"));
    try {
      const store = createGeneralityHostStore({ workspace, now: () => 123 });
      expect(STACK_PROFILES.map((profile) => profile.id)).toEqual([
        "knowledge-inbox-bun-sqlite",
        "team-decision-log-bun-sqlite",
      ]);

      const inbox = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });
      const decisions = store.createProject({
        app_id: "team-decision-log",
        display_name: "Team Decision Log",
        profile_id: "team-decision-log-bun-sqlite",
      });

      expect(inbox.version.sqlite_path.endsWith(
        "generated-apps/team-knowledge-inbox/versions/v0/workspace/data/app.db",
      )).toBe(true);
      expect(decisions.version.sqlite_path.endsWith(
        "generated-apps/team-decision-log/versions/v0/workspace/data/app.db",
      )).toBe(true);
      expect(store.listProjects().map((project) => project.app_id)).toEqual([
        "team-knowledge-inbox",
        "team-decision-log",
      ]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
