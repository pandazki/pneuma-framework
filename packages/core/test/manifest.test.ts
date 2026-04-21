import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTemplateManifest } from "../src/manifest.js";

function fixture(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pneuma-manifest-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(join(dir, "scripts/dev.sh"), "#!/bin/sh\n");
  writeFileSync(join(dir, "manifest.json"), contents);
  return dir;
}

test("parseTemplateManifest reads a valid manifest", () => {
  const dir = fixture(JSON.stringify({
    schemaVersion: 1,
    name: "demo",
    version: "0.0.1",
    displayName: "Demo",
    description: "",
    backends: { supported: ["claude-code"] },
    runtimeAgent: "none",
    scripts: { dev: "scripts/dev.sh" },
  }));
  const m = parseTemplateManifest(dir);
  expect(m.name).toBe("demo");
  expect(m.scripts.dev).toBe("scripts/dev.sh");
});

test("parseTemplateManifest rejects wrong schemaVersion", () => {
  const dir = fixture(JSON.stringify({
    schemaVersion: 2,
    name: "x",
    version: "0",
    displayName: "X",
    description: "",
    backends: { supported: ["claude-code"] },
    runtimeAgent: "none",
    scripts: {},
  }));
  expect(() => parseTemplateManifest(dir)).toThrow(/schemaVersion/);
});

test("parseTemplateManifest rejects missing scripts referenced by name", () => {
  const dir = fixture(JSON.stringify({
    schemaVersion: 1,
    name: "x",
    version: "0",
    displayName: "X",
    description: "",
    backends: { supported: ["claude-code"] },
    runtimeAgent: "none",
    scripts: { dev: "scripts/missing.sh" },
  }));
  expect(() => parseTemplateManifest(dir)).toThrow(/missing.sh/);
});

test("parseTemplateManifest rejects script paths that escape the template directory", () => {
  const parent = mkdtempSync(join(tmpdir(), "pneuma-manifest-escape-"));
  mkdirSync(join(parent, "template/scripts"), { recursive: true });
  mkdirSync(join(parent, "outside"), { recursive: true });
  writeFileSync(join(parent, "outside/evil.sh"), "#!/bin/sh\n");
  writeFileSync(join(parent, "template/manifest.json"), JSON.stringify({
    schemaVersion: 1,
    name: "x",
    version: "0",
    displayName: "X",
    description: "",
    backends: { supported: ["claude-code"] },
    runtimeAgent: "none",
    scripts: { dev: "../outside/evil.sh" },
  }));
  expect(() => parseTemplateManifest(join(parent, "template"))).toThrow(/escape|outside template/i);
});
