import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostStore } from "../m12-reference-creation-host/host-store.js";
import {
  createHostEvolutionRuntime,
  readPriorityQueueRows,
} from "./host-evolution.js";

describe("M13 host evolution runtime", () => {
  test("allow path applies one change-set and records completed transcript", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m13-allow-"));
    try {
      const store = createHostStore({ workspace, now: () => 1000 });
      const { project, version } = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });
      const runtime = await createHostEvolutionRuntime({
        project,
        version,
        backend: "fake",
        autoDecision: "allow",
      });
      try {
        await runtime.startPreview();
        const result = await runtime.startEvolution({
          builderUserId: "builder-alice",
          builderRequest: "Add a Priority Queue for urgent inbox items.",
        });

        expect(result.status).toBe("completed");
        expect(result.transcript.status).toBe("completed");
        expect(result.transcript.events.filter((event) => event.kind === "approval_prompt")).toHaveLength(1);
        expect(result.transcript.events.filter((event) => event.kind === "approval_response")).toHaveLength(1);
        expect(result.transcript.events.some((event) =>
          event.kind === "tool_call" && event.tool === "definition.apply_change_set"
        )).toBe(true);
        expect(JSON.stringify(result.transcript.after)).toContain("list_priority_queue");
        expect(existsSync(result.transcript_path)).toBe(true);

        const rows = await readPriorityQueueRows(runtime.previewUrl());
        expect(rows).toHaveLength(3);
        expect(rows.map((row) => row.priority).sort()).toEqual(["P1", "P2", "P3"]);
      } finally {
        await runtime.close();
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);

  test("deny path records denial and leaves Priority Queue absent", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m13-deny-"));
    try {
      const store = createHostStore({ workspace, now: () => 2000 });
      const { project, version } = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });
      const runtime = await createHostEvolutionRuntime({
        project,
        version,
        backend: "fake",
        autoDecision: "deny",
      });
      try {
        await runtime.startPreview();
        const result = await runtime.startEvolution({
          builderUserId: "builder-alice",
          builderRequest: "Add a Priority Queue for urgent inbox items.",
        });

        expect(result.status).toBe("denied");
        expect(result.transcript.status).toBe("denied");
        expect(result.transcript.events.filter((event) => event.kind === "approval_prompt")).toHaveLength(1);
        expect(result.transcript.events.some((event) =>
          event.kind === "approval_response" && event.decision === "deny"
        )).toBe(true);
        await expect(readPriorityQueueRows(runtime.previewUrl())).rejects.toThrow("list_priority_queue failed");
      } finally {
        await runtime.close();
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});
