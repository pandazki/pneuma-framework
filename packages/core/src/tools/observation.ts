import { readdirSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ToolRegistry, ToolResult } from "./types.js";

export function registerObservationTools(reg: ToolRegistry): void {
  reg.register(
    {
      name: "lifecycle.state",
      description: "Return the full lifecycle state (dev, lastBuild, lastDeploy, workspace).",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (ctx): Promise<ToolResult> => {
      return { ok: true, state: ctx.orchestrator.state };
    },
  );

  reg.register(
    {
      name: "lifecycle.logs",
      description: "Return recent log lines for a verb. Optional since (ms) and limit (max lines).",
      inputSchema: {
        type: "object",
        properties: {
          verb: { type: "string" },
          since: { type: "number" },
          limit: { type: "number" },
        },
        required: ["verb"],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const verb = params.verb as string;
      const since = typeof params.since === "number" ? params.since : undefined;
      const limit = typeof params.limit === "number" ? params.limit : undefined;
      const lines = ctx.orchestrator.getLogs({ verb: verb as never, since, limit });
      return { ok: true, state: { lines } };
    },
  );

  reg.register(
    {
      name: "workspace.tree",
      description: "Shallow directory listing of the workspace, bounded by depth (default 1, max 3).",
      inputSchema: {
        type: "object",
        properties: { depth: { type: "number" } },
        required: [],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const requested = typeof params.depth === "number" ? params.depth : 1;
      const depth = Math.max(1, Math.min(3, requested));
      const root = resolve(ctx.orchestrator.workspace);
      const entries = walk(root, depth, 0);
      return { ok: true, state: { entries } };
    },
  );
}

interface Entry {
  name: string;
  type: "file" | "dir";
  children?: Entry[];
}

function walk(dir: string, maxDepth: number, cur: number): Entry[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: Entry[] = [];
  for (const name of names.sort()) {
    if (name === ".pneuma" || name === ".pneuma-build" || name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }
    // lstat (not stat) so symlinked directories don't let the walker escape the
    // workspace. Symlinks are surfaced as plain "file" entries without recursion.
    if (st.isSymbolicLink()) {
      out.push({ name, type: "file" });
      continue;
    }
    const type: Entry["type"] = st.isDirectory() ? "dir" : "file";
    const entry: Entry = { name, type };
    if (type === "dir" && cur + 1 < maxDepth) {
      entry.children = walk(full, maxDepth, cur + 1);
    }
    out.push(entry);
  }
  return out;
}
