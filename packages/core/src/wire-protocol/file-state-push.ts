import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { WireServer } from "./server.js";
import type { Session } from "./session-registry.js";
import type { WireEnvelope } from "./types.js";
import { watchFiles } from "./file-watcher.js";

export interface StatePushOptions {
  /** File extensions to push. Default: [".md"] */
  extensions?: string[];
  debounceMs?: number;
}

export function startFileStatePush(
  session: Session,
  workspaceRoot: string,
  wireServer: WireServer,
  opts: StatePushOptions = {},
): () => void {
  const exts = opts.extensions ?? [".md"];
  const debounce = opts.debounceMs ?? 50;
  return watchFiles(workspaceRoot, { extensions: exts, debounceMs: debounce }, (abs) => {
    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      return;
    }
    wireServer.broadcast(session.sid, {
      dir: "a2v", kind: "state",
      state: {
        path: relative(workspaceRoot, abs),
        content,
        ts: Date.now(),
      },
    });
  });
}

/**
 * Produce a2v state envelopes for every matching file currently in the
 * workspace. Used on viewer-open to seed the initial view — file watcher
 * only fires on CHANGES.
 */
export function seedInitialState(
  workspaceRoot: string,
  extensions: string[] = [".md"],
): WireEnvelope[] {
  const out: WireEnvelope[] = [];
  if (!existsSync(workspaceRoot)) return out;
  const skip = new Set([".pneuma", ".pneuma-build", "node_modules", ".git"]);
  const walk = (dir: string): void => {
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      if (skip.has(name)) continue;
      const abs = join(dir, name);
      let st;
      try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) { walk(abs); continue; }
      const dotIdx = name.lastIndexOf(".");
      if (dotIdx < 0) continue;
      const ext = name.slice(dotIdx).toLowerCase();
      if (!extensions.includes(ext)) continue;
      let content = "";
      try { content = readFileSync(abs, "utf8"); } catch { continue; }
      out.push({
        dir: "a2v", kind: "state",
        state: { path: relative(workspaceRoot, abs), content, ts: Date.now() },
      });
    }
  };
  walk(workspaceRoot);
  return out;
}
