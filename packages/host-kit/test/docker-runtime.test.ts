import { describe, expect, test } from "bun:test";
import { createDockerRuntimeAdapter, type DockerCommandRunner } from "../src/docker-runtime.js";

describe("createDockerRuntimeAdapter", () => {
  test("starts published runtime through Docker without making Docker a semantic default", async () => {
    const calls: Array<readonly string[]> = [];
    const runner: DockerCommandRunner = {
      run: async (args) => {
        calls.push(args);
        return { ok: true, stdout: "container-id\n", stderr: "", exit_code: 0 };
      },
    };
    const adapter = createDockerRuntimeAdapter({
      image: "team-notes:v1",
      internal_port: 3000,
      published_host_port: 19401,
      command_runner: runner,
      fetch_impl: async () => new Response("ok", { status: 200 }),
    });

    const handle = await adapter.startPublished({
      app_id: "team-notes",
      version_id: "v1",
      data_dir: "/tmp/team-notes/published/v1",
    });
    const ready = await adapter.waitUntilReady({ url: handle.url, timeout_ms: 50 });
    await adapter.stopPublished({ runtime_generation_id: handle.runtime_generation_id });

    expect(handle.url).toBe("http://127.0.0.1:19401");
    expect(ready.ok).toBe(true);
    expect(calls[0]).toEqual(["rm", "-f", "pneuma-team-notes-v1"]);
    expect(calls[1]).toContain("run");
    expect(calls[1]).toContain("--detach");
    expect(calls[1]).toContain("--publish");
    expect(calls[1]).toContain("19401:3000");
    expect(calls[1]).toContain("--volume");
    expect(calls[1]).toContain("/tmp/team-notes/published/v1:/data");
    expect(calls.at(-1)).toEqual(["rm", "-f", "pneuma-team-notes-v1"]);
  });

  test("reports runtime-not-ready checks when health never passes", async () => {
    const adapter = createDockerRuntimeAdapter({
      image: "team-notes:v1",
      internal_port: 3000,
      published_host_port: 19401,
      command_runner: {
        run: async () => ({ ok: true, stdout: "", stderr: "", exit_code: 0 }),
      },
      fetch_impl: async () => new Response("nope", { status: 503 }),
    });

    const ready = await adapter.waitUntilReady({
      url: "http://127.0.0.1:19401",
      timeout_ms: 5,
    });

    expect(ready.ok).toBe(false);
    expect(ready.checks.at(-1)).toMatchObject({
      name: "docker-health",
      status: "failed",
    });
  });

  test("fails when docker run fails", async () => {
    const adapter = createDockerRuntimeAdapter({
      image: "team-notes:v1",
      internal_port: 3000,
      published_host_port: 19401,
      command_runner: {
        run: async (args) => args[0] === "run"
          ? { ok: false, stdout: "", stderr: "image missing", exit_code: 125 }
          : { ok: true, stdout: "", stderr: "", exit_code: 0 },
      },
      fetch_impl: async () => new Response("ok", { status: 200 }),
    });

    await expect(adapter.startPublished({
      app_id: "team-notes",
      version_id: "v1",
      data_dir: "/tmp/team-notes/published/v1",
    })).rejects.toThrow(/image missing/);
  });
});
