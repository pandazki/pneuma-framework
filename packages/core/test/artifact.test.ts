import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBuildManifest, writeBuildManifest } from "../src/artifact.js";
import type { BuildManifest } from "../src/types.js";

test("writeBuildManifest + readBuildManifest round-trip", () => {
  const dir = mkdtempSync(join(tmpdir(), "pneuma-art-"));
  const path = join(dir, "build.manifest.json");
  const m: BuildManifest = {
    schemaVersion: 1,
    kind: "static-site",
    entrypoint: "./site/index.html",
    produced: ["site/index.html", "site/main.css"],
  };
  writeBuildManifest(path, m);
  const loaded = readBuildManifest(path);
  expect(loaded).toEqual(m);
});

test("readBuildManifest rejects wrong schemaVersion", () => {
  const dir = mkdtempSync(join(tmpdir(), "pneuma-art-"));
  const path = join(dir, "build.manifest.json");
  writeFileSync(path, JSON.stringify({ schemaVersion: 99, kind: "x", entrypoint: ".", produced: [] }));
  expect(() => readBuildManifest(path)).toThrow(/schemaVersion/);
});

test("readBuildManifest rejects missing required fields", () => {
  const dir = mkdtempSync(join(tmpdir(), "pneuma-art-"));
  const path = join(dir, "build.manifest.json");
  writeFileSync(path, JSON.stringify({ schemaVersion: 1 }));
  expect(() => readBuildManifest(path)).toThrow(/kind|entrypoint|produced/);
});
