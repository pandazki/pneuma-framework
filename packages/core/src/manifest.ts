import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { TemplateManifest, LifecycleVerb } from "./types.js";

const KNOWN_VERBS: LifecycleVerb[] = [
  "setup", "dev", "stop", "build", "deploy", "migrate", "fork",
];

export function parseTemplateManifest(templateDir: string): TemplateManifest {
  const root = resolve(templateDir);
  const manifestPath = join(root, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`template manifest not found at ${manifestPath}`);
  }
  const raw = readFileSync(manifestPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`manifest.json is not valid JSON: ${(err as Error).message}`);
  }

  const m = parsed as TemplateManifest;

  if (m.schemaVersion !== 1) {
    throw new Error(`unsupported schemaVersion: ${m.schemaVersion} (expected 1)`);
  }
  for (const required of ["name", "version", "displayName"] as const) {
    if (typeof m[required] !== "string" || m[required].length === 0) {
      throw new Error(`manifest.${required} must be a non-empty string`);
    }
  }
  if (!m.backends || !Array.isArray(m.backends.supported) || m.backends.supported.length === 0) {
    throw new Error("manifest.backends.supported must be a non-empty array");
  }
  if (!["none", "embedded", "optional"].includes(m.runtimeAgent)) {
    throw new Error(`manifest.runtimeAgent must be one of none|embedded|optional, got ${m.runtimeAgent}`);
  }
  if (!m.scripts || typeof m.scripts !== "object") {
    throw new Error("manifest.scripts must be an object");
  }

  for (const [verb, relPath] of Object.entries(m.scripts)) {
    if (!KNOWN_VERBS.includes(verb as LifecycleVerb)) {
      throw new Error(`unknown lifecycle verb in manifest.scripts: ${verb}`);
    }
    if (typeof relPath !== "string") {
      throw new Error(`manifest.scripts.${verb} must be a string path`);
    }
    const abs = join(root, relPath);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      throw new Error(`manifest.scripts.${verb} references non-existent file: ${relPath}`);
    }
  }

  return m;
}

export function resolveScriptPath(
  templateDir: string,
  manifest: TemplateManifest,
  verb: LifecycleVerb,
): string | null {
  const rel = manifest.scripts[verb];
  if (!rel) return null;
  return resolve(templateDir, rel);
}
