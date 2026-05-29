import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Filesystem helpers for the Creation Host workspace. The Host materializes a
// generated app as plain directories (source / versions / drafts) and never
// commits node_modules — dependencies are symlinked from the scaffold so a
// copied tree stays runnable and verifiable.
// ---------------------------------------------------------------------------

const IGNORED_DIRS = new Set(["node_modules", "dist", ".work", ".git", ".vercel"]);
const IGNORED_FILES = new Set([".env", ".env.local"]);

/** Copy a source tree into dest, excluding deps/build/secret artifacts. */
export function copyTree(source: string, dest: string): void {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const rel of listFiles(source)) {
    const from = join(source, rel);
    const to = join(dest, rel);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }
}

/** All file paths (posix-relative) under root, excluding ignored dirs/files. */
export function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        if (IGNORED_FILES.has(entry.name)) continue;
        out.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
      }
    }
  };
  walk(root);
  return out.sort();
}

export function sha1File(path: string): string {
  return createHash("sha1").update(readFileSync(path)).digest("hex");
}

export interface TreeDiff {
  added: string[];
  removed: string[];
  changed: string[];
  /** All touched paths (added ∪ removed ∪ changed), sorted. */
  changedPaths: string[];
}

/** Content-level diff between two trees, by relative path + sha1. */
export function diffTrees(base: string, next: string): TreeDiff {
  const baseFiles = new Map(listFiles(base).map((p) => [p, sha1File(join(base, p))]));
  const nextFiles = new Map(listFiles(next).map((p) => [p, sha1File(join(next, p))]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [p, sha] of nextFiles) {
    const prev = baseFiles.get(p);
    if (prev === undefined) added.push(p);
    else if (prev !== sha) changed.push(p);
  }
  for (const p of baseFiles.keys()) {
    if (!nextFiles.has(p)) removed.push(p);
  }
  const changedPaths = [...added, ...removed, ...changed].sort();
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort(), changedPaths };
}

/** Ensure a copied tree can resolve deps by symlinking the scaffold's node_modules. */
export function linkDependencies(root: string, scaffoldNodeModules: string): void {
  const target = join(root, "node_modules");
  if (existsSync(target)) return;
  if (!existsSync(scaffoldNodeModules)) {
    throw new Error(
      `scaffold dependencies missing at ${scaffoldNodeModules}; run \`bun install\` at the repo root first`,
    );
  }
  symlinkSync(scaffoldNodeModules, target, "dir");
}

export function isProtected(path: string, protectedRoots: string[]): boolean {
  return protectedRoots.some((root) => path === root || path.startsWith(root + "/"));
}

export function fileMode(path: string): number {
  return statSync(path).mode;
}
