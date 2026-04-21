import { readFileSync, writeFileSync } from "node:fs";
import type { BuildManifest } from "./types.js";

export function readBuildManifest(path: string): BuildManifest {
  const raw = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`build.manifest.json is not valid JSON: ${(err as Error).message}`);
  }
  return validateBuildManifest(parsed);
}

export function writeBuildManifest(path: string, manifest: BuildManifest): void {
  validateBuildManifest(manifest);
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

export function validateBuildManifest(value: unknown): BuildManifest {
  if (!value || typeof value !== "object") {
    throw new Error("build manifest must be an object");
  }
  const m = value as Record<string, unknown>;
  if (m.schemaVersion !== 1) {
    throw new Error(`unsupported build manifest schemaVersion: ${String(m.schemaVersion)}`);
  }
  if (typeof m.kind !== "string" || m.kind.length === 0) {
    throw new Error("build manifest.kind must be a non-empty string");
  }
  if (typeof m.entrypoint !== "string" || m.entrypoint.length === 0) {
    throw new Error("build manifest.entrypoint must be a non-empty string");
  }
  if (!Array.isArray(m.produced) || !m.produced.every((x) => typeof x === "string")) {
    throw new Error("build manifest.produced must be an array of strings");
  }
  return value as BuildManifest;
}
