import { watch, type FSWatcher } from "node:fs";
import { extname, join, sep } from "node:path";

export interface WatchOptions {
  /** File extensions to emit events for (lowercase, with leading dot). */
  extensions: string[];
  /** Coalesce events for the same path within this window (ms). */
  debounceMs: number;
}

const SKIPPED_DIRS = new Set([".pneuma", ".pneuma-build", "node_modules", ".git"]);

/**
 * Watch `root` for file changes, firing `onChange(absolutePath)` once per
 * debounceMs per path. M3's doc mode only writes at the workspace root, so
 * this watcher is intentionally non-recursive — recursive `fs.watch` isn't
 * portable (Linux support varies by Node version). Multi-file templates in
 * M4+ can either widen the set of watched roots or swap in `chokidar`.
 */
export function watchFiles(
  root: string,
  opts: WatchOptions,
  onChange: (absolutePath: string) => void,
): () => void {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const handler = (_eventType: string, filename: string | Buffer | null): void => {
    if (!filename) return;
    const rel: string = typeof filename === "string" ? filename : Buffer.from(filename).toString();
    const parts = rel.split(sep);
    if (parts.some((p: string) => SKIPPED_DIRS.has(p))) return;
    const ext = extname(rel).toLowerCase();
    if (!opts.extensions.includes(ext)) return;
    const abs = join(root, rel);
    const prev = pending.get(abs);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      pending.delete(abs);
      try { onChange(abs); } catch { /* observer errors don't crash the watcher */ }
    }, opts.debounceMs);
    pending.set(abs, t);
  };
  let watcher: FSWatcher | undefined;
  try {
    watcher = watch(root, { recursive: false }, handler);
  } catch {
    // Degrade gracefully if the watch syscall fails (rare — EACCES, etc.).
    // Nothing will fire, but callers won't crash.
  }
  return () => {
    for (const t of pending.values()) clearTimeout(t);
    pending.clear();
    watcher?.close();
  };
}
