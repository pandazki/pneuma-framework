import { test, expect } from "bun:test";
import type { LifecycleVerb, TemplateManifest } from "../src/types.js";

test("LifecycleVerb covers the seven canonical verbs", () => {
  const verbs: LifecycleVerb[] = [
    "setup",
    "dev",
    "stop",
    "build",
    "deploy",
    "migrate",
    "fork",
  ];
  expect(verbs).toHaveLength(7);
});

test("TemplateManifest allows partial scripts", () => {
  const m: TemplateManifest = {
    schemaVersion: 1,
    name: "x",
    version: "0.0.1",
    displayName: "X",
    description: "",
    backends: { supported: ["claude-code"] },
    runtimeAgent: "none",
    scripts: { dev: "scripts/dev.sh" },
  };
  expect(m.scripts.dev).toBe("scripts/dev.sh");
});
