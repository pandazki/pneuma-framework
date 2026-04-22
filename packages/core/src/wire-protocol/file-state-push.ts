import { readFileSync } from "node:fs";
import { relative } from "node:path";
import type { WireServer } from "./server.js";
import type { Session } from "./session-registry.js";
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
