import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export function stateDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".pneuma");
}

export function initWorkspace(workspaceRoot: string): void {
  const dir = stateDir(resolve(workspaceRoot));
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "logs"), { recursive: true });
}

export function buildDir(workspaceRoot: string, labelOverride?: string): string {
  const base = join(resolve(workspaceRoot), ".pneuma-build");
  const label = labelOverride ?? nowLabel();
  const dir = join(base, label);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function nowLabel(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}-${process.hrtime.bigint().toString(36).slice(-5)}`;
}
