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
