import { test, expect } from "bun:test";
import { buildLifecycleEnv } from "../src/env.js";

test("buildLifecycleEnv includes workspace + verb + mode", () => {
  const env = buildLifecycleEnv({
    workspace: "/tmp/ws",
    verb: "dev",
    mode: "dev",
  });
  expect(env.PNEUMA_WORKSPACE).toBe("/tmp/ws");
  expect(env.PNEUMA_VERB).toBe("dev");
  expect(env.PNEUMA_MODE).toBe("dev");
});

test("buildLifecycleEnv includes build dir and artifact manifest when provided", () => {
  const env = buildLifecycleEnv({
    workspace: "/ws",
    verb: "deploy",
    mode: "release",
    buildDir: "/ws/.pneuma-build/123",
    artifactManifestPath: "/ws/.pneuma-build/123/build.manifest.json",
  });
  expect(env.PNEUMA_BUILD_DIR).toBe("/ws/.pneuma-build/123");
  expect(env.PNEUMA_ARTIFACT_MANIFEST).toBe("/ws/.pneuma-build/123/build.manifest.json");
});

test("buildLifecycleEnv preserves parent env and allows overrides", () => {
  const env = buildLifecycleEnv({
    workspace: "/ws",
    verb: "dev",
    mode: "dev",
    parentEnv: { PATH: "/usr/bin", FOO: "bar" },
  });
  expect(env.PATH).toBe("/usr/bin");
  expect(env.FOO).toBe("bar");
  expect(env.PNEUMA_VERB).toBe("dev");
});

test("buildLifecycleEnv includes port hint when provided", () => {
  const env = buildLifecycleEnv({
    workspace: "/ws",
    verb: "dev",
    mode: "dev",
    portHint: 8765,
  });
  expect(env.PNEUMA_PORT_HINT).toBe("8765");
});

test("buildLifecycleEnv strips stale PNEUMA_* from parentEnv", () => {
  const env = buildLifecycleEnv({
    workspace: "/ws",
    verb: "dev",
    mode: "dev",
    parentEnv: {
      PATH: "/usr/bin",
      FOO: "bar",
      PNEUMA_BUILD_DIR: "/stale/build",
      PNEUMA_ARTIFACT_MANIFEST: "/stale/manifest.json",
      PNEUMA_LOG_DIR: "/stale/logs",
      PNEUMA_FORK_SOURCE: "stale://source",
    },
  });
  // Non-PNEUMA parent vars survive.
  expect(env.PATH).toBe("/usr/bin");
  expect(env.FOO).toBe("bar");
  // Explicitly-set PNEUMA_* appear.
  expect(env.PNEUMA_WORKSPACE).toBe("/ws");
  expect(env.PNEUMA_VERB).toBe("dev");
  expect(env.PNEUMA_MODE).toBe("dev");
  // Stale PNEUMA_* from parent are gone.
  expect(env.PNEUMA_BUILD_DIR).toBeUndefined();
  expect(env.PNEUMA_ARTIFACT_MANIFEST).toBeUndefined();
  expect(env.PNEUMA_LOG_DIR).toBeUndefined();
  expect(env.PNEUMA_FORK_SOURCE).toBeUndefined();
});

test("buildLifecycleEnv forwards sessionId and wsUrl when provided", () => {
  const env = buildLifecycleEnv({
    workspace: "/ws",
    verb: "dev",
    mode: "dev",
    sessionId: "sid-123",
    wsUrl: "http://127.0.0.1:40000",
    parentEnv: {},
  });
  expect(env.PNEUMA_SESSION_ID).toBe("sid-123");
  expect(env.PNEUMA_WS_URL).toBe("http://127.0.0.1:40000");
});

test("buildLifecycleEnv omits sessionId / wsUrl when undefined", () => {
  const env = buildLifecycleEnv({
    workspace: "/ws", verb: "dev", mode: "dev", parentEnv: {},
  });
  expect(env.PNEUMA_SESSION_ID).toBeUndefined();
  expect(env.PNEUMA_WS_URL).toBeUndefined();
});
