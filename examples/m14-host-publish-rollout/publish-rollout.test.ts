import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostStore } from "../m12-reference-creation-host/host-store.js";
import { createHostEvolutionRuntime } from "../m13-host-agent-evolution/host-evolution.js";
import { forkGeneratedAppVersion } from "./version-store.js";
import { createHostPublishRolloutManager } from "./publish-rollout.js";

describe("M14 host publish rollout manager", () => {
  test("publishes v0, promotes v1, restarts active, and rolls back to v0", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m14-rollout-"));
    try {
      const store = createHostStore({ workspace, now: () => 1000 });
      const { project, version: v0 } = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });
      const v1 = forkGeneratedAppVersion({
        store,
        appId: project.app_id,
        fromVersionId: "v0",
        toVersionId: "v1",
        now: () => 2000,
      });
      const evolution = await createHostEvolutionRuntime({
        project,
        version: v1,
        backend: "fake",
        autoDecision: "allow",
      });
      try {
        await evolution.startPreview();
        await evolution.startEvolution({
          builderUserId: "builder-alice",
          builderRequest: "Add a Priority Queue for urgent inbox items.",
        });
      } finally {
        await evolution.close();
      }

      const manager = createHostPublishRolloutManager({ workspace, project, versions: [v0, v1] });
      try {
        const baseline = await manager.publishVersion("v0");
        expect(baseline.summary.active_candidate_id).toBe("team-knowledge-inbox-v0");
        expect(baseline.summary.previous_candidate_id).toBeUndefined();
        expect(await manager.activeVersionId()).toBe("v0");

        const candidate = await manager.publishVersion("v1");
        expect(candidate.summary.active_candidate_id).toBe("team-knowledge-inbox-v1");
        expect(candidate.summary.previous_candidate_id).toBe("team-knowledge-inbox-v0");
        expect(await manager.activeVersionId()).toBe("v1");

        const beforeRestart = candidate.summary.active_url;
        const restarted = await manager.restartActive();
        expect(restarted.summary.active_candidate_id).toBe("team-knowledge-inbox-v1");
        expect(restarted.summary.active_url).not.toBe(beforeRestart);
        expect(restarted.health.ok).toBe(true);

        const rolledBack = await manager.rollback();
        expect(rolledBack.summary.active_candidate_id).toBe("team-knowledge-inbox-v0");
        expect(rolledBack.summary.previous_candidate_id).toBe("team-knowledge-inbox-v1");
        expect(rolledBack.summary.active_url).toBe(rolledBack.health.url);
        expect(await manager.activeVersionId()).toBe("v0");
      } finally {
        await manager.close();
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});
