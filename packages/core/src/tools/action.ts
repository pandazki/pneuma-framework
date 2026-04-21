import type { ToolRegistry, ToolResult } from "./types.js";

export function registerActionTools(reg: ToolRegistry): void {
  reg.register(
    {
      name: "lifecycle.dev.start",
      description: "Start the dev-mode process group. Waits for ##pneuma:ready before returning.",
      inputSchema: {
        type: "object",
        properties: { port: { type: "number" } },
        required: [],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const port = typeof params.port === "number" ? params.port : undefined;
      // Fire and await ready; do NOT await the full runDev promise (that resolves on dev exit).
      void ctx.orchestrator.runDev(port);
      await ctx.orchestrator.awaitDevReady();
      return { ok: true, state: ctx.orchestrator.state.dev };
    },
  );

  reg.register(
    {
      name: "lifecycle.dev.stop",
      description: "Stop the dev-mode process group (runs stop.sh if present, then SIGTERM/SIGKILL ladder).",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (ctx): Promise<ToolResult> => {
      await ctx.orchestrator.runStop();
      return { ok: true, state: ctx.orchestrator.state.dev };
    },
  );

  reg.register(
    {
      name: "lifecycle.dev.restart",
      description: "Stop then start dev.",
      inputSchema: {
        type: "object",
        properties: { port: { type: "number" } },
        required: [],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      await ctx.orchestrator.runStop();
      const port = typeof params.port === "number" ? params.port : undefined;
      void ctx.orchestrator.runDev(port);
      await ctx.orchestrator.awaitDevReady();
      return { ok: true, state: ctx.orchestrator.state.dev };
    },
  );

  reg.register(
    {
      name: "lifecycle.build.run",
      description: "Run build.sh. Returns manifest path on success.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (ctx): Promise<ToolResult> => {
      const res = await ctx.orchestrator.runBuild();
      if (res.exitCode !== 0) return { ok: false, error: `build exited with code ${res.exitCode}` };
      return { ok: true, state: { manifestPath: res.manifestPath, exitCode: 0 } };
    },
  );

  reg.register(
    {
      name: "lifecycle.deploy.run",
      description: "Run deploy.sh. Uses most recent build manifest by default.",
      inputSchema: {
        type: "object",
        properties: { manifestPath: { type: "string" } },
        required: [],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const manifestPath = typeof params.manifestPath === "string" ? params.manifestPath : undefined;
      const res = await ctx.orchestrator.runDeploy({ manifestPath });
      if (res.exitCode === 2) return { ok: false, error: "no build manifest available; run lifecycle.build.run first" };
      if (res.exitCode !== 0) return { ok: false, error: `deploy exited with code ${res.exitCode}` };
      return { ok: true, state: { exitCode: 0 } };
    },
  );

  reg.register(
    {
      name: "lifecycle.migrate.run",
      description: "Run migrate.sh (data migration). Not implemented in v0; returns error.",
      inputSchema: { type: "object", properties: { direction: { type: "string" }, target: { type: "string" } }, required: [] },
    },
    async (): Promise<ToolResult> => ({ ok: false, error: "lifecycle.migrate.run: not implemented in v0 (deferred to M4)" }),
  );

  reg.register(
    {
      name: "lifecycle.fork.run",
      description: "Run fork.sh (produce a fresh workspace from a source). Not implemented in v0.",
      inputSchema: { type: "object", properties: { source: { type: "string" } }, required: ["source"] },
    },
    async (): Promise<ToolResult> => ({ ok: false, error: "lifecycle.fork.run: not implemented in v0 (deferred to M4)" }),
  );

  reg.register(
    {
      name: "lifecycle.confirm",
      description: "Respond to a pending ##pneuma:needs-confirm marker.",
      inputSchema: {
        type: "object",
        properties: {
          verb: { type: "string" },
          label: { type: "string" },
          decision: { type: "string", enum: ["yes", "no"] },
        },
        required: ["verb", "label", "decision"],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const verb = params.verb as string;
      const label = params.label as string;
      const decision = params.decision as "yes" | "no";
      await ctx.orchestrator.resolveConfirm(verb as never, label, decision);
      return { ok: true };
    },
  );
}
