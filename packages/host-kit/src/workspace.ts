import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Stack-agnostic workspace mechanics for a Creation Host: copy a source tree
// into a version/draft directory, list/hash its files, sign or diff trees by
// content, and decide whether a changed path falls under a protected root.
//
// These are pure plumbing — they hold no opinion about the generated app's
// stack, domain, UI, or data. A Host composes them (and supplies its own
// dependency-linking / build / verify effects) rather than re-implementing
// them. See governed-change.ts for the fail-closed proposal backbone that uses
// `diffTrees`, `treeSignature` and `isProtected`.
// ---------------------------------------------------------------------------

const DEFAULT_IGNORED_DIRS = new Set(["node_modules", "dist", ".work", ".git", ".vercel"]);
const DEFAULT_IGNORED_FILES = new Set([".env", ".env.local"]);

export interface TreeWalkOptions {
  /** Directory names to skip anywhere in the tree. */
  ignoredDirs?: Set<string>;
  /** File names to skip anywhere in the tree. */
  ignoredFiles?: Set<string>;
  /**
   * Posix-relative paths to skip at exactly that place: a directory (with everything
   * under it) or a file. `data` skips a top-level `data/` and leaves `src/data/` alone.
   */
  ignoredPaths?: Set<string>;
}

/** A fresh copy of the walk options a function here uses when given none. */
export function defaultTreeWalkOptions(): Required<TreeWalkOptions> {
  return {
    ignoredDirs: new Set(DEFAULT_IGNORED_DIRS),
    ignoredFiles: new Set(DEFAULT_IGNORED_FILES),
    ignoredPaths: new Set<string>(),
  };
}

/** All file paths (posix-relative) under root, excluding ignored dirs/files/paths. */
export function listFiles(root: string, options: TreeWalkOptions = {}): string[] {
  const ignoredDirs = options.ignoredDirs ?? DEFAULT_IGNORED_DIRS;
  const ignoredFiles = options.ignoredFiles ?? DEFAULT_IGNORED_FILES;
  const ignoredPaths = options.ignoredPaths ?? new Set<string>();
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(root, path).split(sep).join("/");
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name) || ignoredPaths.has(rel)) continue;
        walk(path);
      } else if (entry.isFile()) {
        if (ignoredFiles.has(entry.name) || ignoredPaths.has(rel)) continue;
        out.push(rel);
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

/**
 * Content signature of a tree: sha1 over every listed path and its file's sha1, in
 * `listFiles` order. Two trees with equal signatures under the same options hold the
 * same files with the same content.
 */
export function treeSignature(root: string, options: TreeWalkOptions = {}): string {
  const hash = createHash("sha1");
  for (const rel of listFiles(root, options)) hash.update(`${rel}\0${sha1File(join(root, rel))}\n`);
  return hash.digest("hex");
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
