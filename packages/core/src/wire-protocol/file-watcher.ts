import { watch } from "node:fs";
import { extname, join, sep } from "node:path";

export interface WatchOptions {
  /** File extensions to emit events for (lowercase, with leading dot). */
  extensions: string[];
  /** Coalesce events for the same path within this window (ms). */
  debounceMs: number;
}

const SKIPPED_DIRS = new Set([".pneuma", ".pneuma-build", "node_modules", ".git"]);

export function watchFiles(
  root: string,
  opts: WatchOptions,
  onChange: (absolutePath: string) => void,
): () => void {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const watcher = watch(root, { recursive: true }, (_eventType, filename) => {
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
  });
  return () => {
    for (const t of pending.values()) clearTimeout(t);
    pending.clear();
    watcher.close();
  };
}
