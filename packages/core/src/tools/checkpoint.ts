import { listCheckpoints, rewindTo } from "../shadow-git.js";
import type { ToolRegistry, ToolResult } from "./types.js";

export function registerCheckpointTools(reg: ToolRegistry): void {
  reg.register(
    {
      name: "checkpoint.list",
      description: "Enumerate shadow-git checkpoints recorded for this workspace.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (ctx): Promise<ToolResult> => {
      const cps = await listCheckpoints(ctx.orchestrator.workspace);
      return { ok: true, state: { checkpoints: cps } };
    },
  );

  reg.register(
    {
      name: "checkpoint.rewind",
      description: "Rewind the workspace to a prior checkpoint hash (40-char SHA, 7+ prefix also accepted).",
      inputSchema: {
        type: "object",
        properties: { hash: { type: "string" } },
        required: ["hash"],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const hash = params.hash as string;
      if (typeof hash !== "string" || hash.length === 0) {
        return { ok: false, error: "checkpoint.rewind requires a non-empty hash" };
      }
      // Refuse to reset the worktree out from under a live dev process — it
      // would leave the server with half-rewritten files and stale state.
      // Build/deploy finish synchronously so we only gate on dev here.
      if (ctx.orchestrator.state.dev?.state === "running") {
        return { ok: false, error: "cannot rewind while dev is running; call lifecycle.dev.stop first" };
      }
      try {
        await rewindTo(ctx.orchestrator.workspace, hash);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );
}
