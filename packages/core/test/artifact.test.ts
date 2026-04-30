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

test("validateBuildManifest accepts deployable substrate metadata", () => {
  const manifest = readBuildManifestFromValue({
    schemaVersion: 1,
    kind: "bookmarks-core-domain",
    entrypoint: "server/app.ts",
    produced: ["server/app.ts", "viewer/index.html"],
    processes: {
      web: {
        command: "bun server/app.ts",
        health: "/healthz",
      },
    },
    data: {
      volume: "/data",
      sqlite: "/data/app.db",
    },
    migrations: {
      command: "scripts/migrate.sh",
      direction: "up",
    },
    healthcheck: "/healthz",
  });

  expect(manifest.processes!.web.command).toBe("bun server/app.ts");
  expect(manifest.data!.sqlite).toBe("/data/app.db");
  expect(manifest.migrations!.command).toBe("scripts/migrate.sh");
});

test("validateBuildManifest rejects a process without a command", () => {
  expect(() =>
    readBuildManifestFromValue({
      schemaVersion: 1,
      kind: "bad",
      entrypoint: "server/app.ts",
      produced: [],
      processes: {
        web: { health: "/healthz" },
      },
    })
  ).toThrow("build manifest.processes.web.command must be a non-empty string");
});

function readBuildManifestFromValue(value: unknown): BuildManifest {
  const dir = mkdtempSync(join(tmpdir(), "pneuma-art-value-"));
  const path = join(dir, "build.manifest.json");
  writeFileSync(path, JSON.stringify(value));
  return readBuildManifest(path);
}
