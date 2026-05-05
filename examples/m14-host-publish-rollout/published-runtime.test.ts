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

  test("health check tolerates transient readiness 404s after service-ready", async () => {
    let healthzCalls = 0;
    const server = Bun.serve({
      port: 0,
      fetch(req): Response {
        const url = new URL(req.url);
        if (url.pathname === "/healthz") {
          healthzCalls += 1;
          if (healthzCalls === 1) return new Response("not ready", { status: 404 });
          return Response.json({ ok: true });
        }
        if (url.pathname === "/api/config") {
          return Response.json({ operations: [{ id: "capture_item" }], tables: [{ id: "inbox_items" }] });
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const health = await healthCheckPublishedRuntime({
        kind: "published",
        app_id: "team-knowledge-inbox",
        version_id: "v0",
        url: `http://127.0.0.1:${server.port}`,
        started_at_ms: Date.now(),
        proc: { exitCode: null } as never,
        wait_until_exit: Promise.resolve(0),
        logs: [],
      });

      expect(health.ok).toBe(true);
      expect(healthzCalls).toBe(2);
    } finally {
      server.stop(true);
    }
  });
});
