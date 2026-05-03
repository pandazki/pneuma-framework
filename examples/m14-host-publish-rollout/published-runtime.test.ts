import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostStore } from "../m12-reference-creation-host/host-store.js";
import {
  healthCheckPublishedRuntime,
  startPublishedRuntime,
  stopPublishedRuntime,
} from "./published-runtime.js";

describe("M14 published runtime", () => {
  test("starts a Published Application from a generated app version workspace", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m14-published-runtime-"));
    try {
      const store = createHostStore({ workspace, now: () => 1000 });
      const { project, version } = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });

      const runtime = await startPublishedRuntime({ project, version, port: 0 });
      try {
        expect(runtime.kind).toBe("published");
        expect(runtime.app_id).toBe("team-knowledge-inbox");
        expect(runtime.version_id).toBe("v0");
        expect(runtime.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

        const health = await healthCheckPublishedRuntime(runtime);
        expect(health.ok).toBe(true);
        expect(health.checks.map((check) => check.name)).toEqual(["healthz", "config", "operations"]);
        expect(JSON.stringify(health.config)).toContain("inbox_items");
      } finally {
        await stopPublishedRuntime(runtime);
      }

      expect(runtime.proc.exitCode).not.toBe(null);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
