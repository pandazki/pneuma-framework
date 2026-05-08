import { expect, test } from "bun:test";
import { PolicySet } from "@pneuma-framework/core-domain";
import {
  asBunFetch,
  bootAppRuntime,
  RuntimeReadyTimeoutError,
  waitForRuntimeReady,
  type AppConfig,
} from "../src/index.js";

function emptyConfig(): AppConfig {
  const app_id = "runtime-ready-test";
  return {
    app_id,
    tables: [],
    operations: [],
    policy: new PolicySet({ app_id }),
    handlers: {},
  };
}

test("waitForRuntimeReady resolves when /api/health is ready", async () => {
  const runtime = await bootAppRuntime(emptyConfig());
  const server = Bun.serve({ port: 0, fetch: asBunFetch(runtime) });
  try {
    const url = `http://127.0.0.1:${server.port}`;
    const result = await waitForRuntimeReady({
      url,
      timeout_ms: 500,
      interval_ms: 10,
    });
    expect(result.ok).toBe(true);
    expect(result.url).toBe(url);
    expect(result.health_url).toBe(`${url}/api/health`);
    expect(result.attempts).toBeGreaterThanOrEqual(1);
    expect(result.body).toMatchObject({ ok: true, app_id: "runtime-ready-test" });
  } finally {
    server.stop(true);
    await runtime.close();
  }
});

test("waitForRuntimeReady throws a typed timeout error when health never responds", async () => {
  await expect(waitForRuntimeReady({
    url: "http://127.0.0.1:9",
    timeout_ms: 30,
    interval_ms: 5,
  })).rejects.toBeInstanceOf(RuntimeReadyTimeoutError);
});
