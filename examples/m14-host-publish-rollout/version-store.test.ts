import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostStore } from "../m12-reference-creation-host/host-store.js";
import { forkGeneratedAppVersion } from "./version-store.js";

describe("M14 generated app version store", () => {
  test("forks v0 into a real v1 workspace and advances current_version_id", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m14-version-store-"));
    try {
      const store = createHostStore({ workspace, now: () => 1000 });
      const { version: v0 } = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });
      const sentinel = join(v0.app_workspace_dir, "data", "sentinel.txt");
      writeFileSync(sentinel, "baseline data\n", "utf8");

      const v1 = forkGeneratedAppVersion({
        store,
        appId: "team-knowledge-inbox",
        fromVersionId: "v0",
        toVersionId: "v1",
        now: () => 2000,
      });

      expect(v1.version_id).toBe("v1");
      expect(v1.app_workspace_dir).toContain("versions/v1/workspace");
      expect(existsSync(join(v1.app_workspace_dir, "data", "sentinel.txt"))).toBe(true);
      expect(readFileSync(join(v1.app_workspace_dir, "data", "sentinel.txt"), "utf8")).toBe("baseline data\n");
      const reloaded = createHostStore({ workspace });
      expect(reloaded.getProject("team-knowledge-inbox").current_version_id).toBe("v1");
      expect(reloaded.listVersions("team-knowledge-inbox").map((version) => version.version_id)).toEqual(["v0", "v1"]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
