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
  validateProcesses(m.processes);
  validateData(m.data);
  validateMigrations(m.migrations);
  if (m.healthcheck !== undefined && typeof m.healthcheck !== "string") {
    throw new Error("build manifest.healthcheck must be a string");
  }
  return value as BuildManifest;
}

function validateProcesses(value: unknown): void {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("build manifest.processes must be an object");
  }
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`build manifest.processes.${name} must be an object`);
    }
    const process = raw as Record<string, unknown>;
    if (typeof process.command !== "string" || process.command.length === 0) {
      throw new Error(`build manifest.processes.${name}.command must be a non-empty string`);
    }
    if (process.health !== undefined && typeof process.health !== "string") {
      throw new Error(`build manifest.processes.${name}.health must be a string`);
    }
    if (process.optional !== undefined && typeof process.optional !== "boolean") {
      throw new Error(`build manifest.processes.${name}.optional must be a boolean`);
    }
  }
}

function validateData(value: unknown): void {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("build manifest.data must be an object");
  }
  const data = value as Record<string, unknown>;
  if (data.volume !== undefined && typeof data.volume !== "string") {
    throw new Error("build manifest.data.volume must be a string");
  }
  if (data.sqlite !== undefined && typeof data.sqlite !== "string") {
    throw new Error("build manifest.data.sqlite must be a string");
  }
}

function validateMigrations(value: unknown): void {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("build manifest.migrations must be an object");
  }
  const migrations = value as Record<string, unknown>;
  if (typeof migrations.command !== "string" || migrations.command.length === 0) {
    throw new Error("build manifest.migrations.command must be a non-empty string");
  }
  if (
    migrations.direction !== undefined &&
    migrations.direction !== "up" &&
    migrations.direction !== "down"
  ) {
    throw new Error("build manifest.migrations.direction must be up or down");
  }
}
