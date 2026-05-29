import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Stack-agnostic workspace mechanics for a Creation Host: copy a source tree
// into a version/draft directory, list/hash its files, diff two trees by
// content, and decide whether a changed path falls under a protected root.
//
// These are pure plumbing — they hold no opinion about the generated app's
// stack, domain, UI, or data. A Host composes them (and supplies its own
// dependency-linking / build / verify effects) rather than re-implementing
// them. See governed-change.ts for the fail-closed proposal backbone that uses
// `diffTrees` + `isProtected`.
// ---------------------------------------------------------------------------

const DEFAULT_IGNORED_DIRS = new Set(["node_modules", "dist", ".work", ".git", ".vercel"]);
const DEFAULT_IGNORED_FILES = new Set([".env", ".env.local"]);

export interface TreeWalkOptions {
  /** Directory names to skip anywhere in the tree. */
  ignoredDirs?: Set<string>;
  /** File names to skip anywhere in the tree. */
  ignoredFiles?: Set<string>;
}

/** All file paths (posix-relative) under root, excluding ignored dirs/files. */
export function listFiles(root: string, options: TreeWalkOptions = {}): string[] {
  const ignoredDirs = options.ignoredDirs ?? DEFAULT_IGNORED_DIRS;
  const ignoredFiles = options.ignoredFiles ?? DEFAULT_IGNORED_FILES;
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        if (ignoredFiles.has(entry.name)) continue;
        out.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
      }
    }
  };
  walk(root);
  return out.sort();
}

/** Copy a source tree into dest, excluding deps/build/secret artifacts. */
export function copyTree(source: string, dest: string, options: TreeWalkOptions = {}): void {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const rel of listFiles(source, options)) {
    const to = join(dest, rel);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(source, rel), to);
  }
}

export function sha1File(path: string): string {
  return createHash("sha1").update(readFileSync(path)).digest("hex");
}

export function fileMode(path: string): number {
  return statSync(path).mode;
}

export interface TreeDiff {
  added: string[];
  removed: string[];
  changed: string[];
  /** All touched paths (added ∪ removed ∪ changed), sorted. */
  changedPaths: string[];
}

/** Content-level diff between two trees, by relative path + sha1. */
export function diffTrees(base: string, next: string, options: TreeWalkOptions = {}): TreeDiff {
  const baseFiles = new Map(listFiles(base, options).map((p) => [p, sha1File(join(base, p))]));
  const nextFiles = new Map(listFiles(next, options).map((p) => [p, sha1File(join(next, p))]));
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

/** True when a relative path equals a protected root or sits beneath one. */
export function isProtected(path: string, protectedRoots: readonly string[]): boolean {
  return protectedRoots.some((root) => path === root || path.startsWith(root + "/"));
}
