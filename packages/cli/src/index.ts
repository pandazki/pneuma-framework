#!/usr/bin/env bun
import { resolve } from "node:path";
import {
  createPneumaFramework,
  getAgentBackendFactory,
  type AgentBackend,
} from "@pneuma-framework/core";
import { parseArgs } from "./parse-args.js";

async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    console.error(`pneuma-framework: ${(err as Error).message}`);
    printUsage();
    return 2;
  }

  const templateDir = resolve(parsed.templateDir);
  const workspace = resolve(parsed.workspace ?? process.cwd());

  let backend: AgentBackend | undefined;
  if (parsed.backend) {
    if (parsed.backend === "opencode") {
      const mod = await import("@pneuma-framework/backend-opencode");
      mod.registerOpencodeBackend();
    }
    const factory = getAgentBackendFactory(parsed.backend);
    if (!factory) {
      console.error(`pneuma-framework: backend "${parsed.backend}" is not registered`);
      return 2;
    }
    backend = factory();
    try {
      await backend.launch({ cwd: workspace });
    } catch (err) {
      // launch failed before anything else was set up — don't leak the backend.
      try { await backend.close(); } catch { /* best-effort */ }
      console.error(`pneuma-framework: backend "${parsed.backend}" failed to launch: ${(err as Error).message}`);
      return 1;
    }
  }

  // mcp is intentionally NOT enabled here: the CLI has no stdio/tcp transport
  // wired for tools/call right now, and opencode's SDK reaches tools via the
  // opencode config mechanism rather than MCP. M3 adds the cc/codex adapters
  // that need MCP and will wire the transport at that point.
  const fw = createPneumaFramework({
    templateDir,
    workspace,
    portHint: parsed.port,
    backend,
  });

  const log = (ev: string) => console.log(`[pneuma:${ev}]`);

  try {
    switch (parsed.verb) {
      case "dev": {
        log("starting dev");
        const running = fw.orchestrator.runDev();

        // Race dev-ready against dev-exit: if dev.sh dies before ready, don't hang.
        const READY = Symbol("ready");
        const EXITED = Symbol("exited");
        const first = await Promise.race([
          fw.orchestrator.awaitDevReady().then(() => READY),
          running.then(() => EXITED),
        ]);

        if (first === EXITED) {
          // dev.sh exited before declaring ready — surface failure even if the
          // script exited 0, since "ready" was never reached.
          log("dev exited before ready");
          const code = fw.orchestrator.state.dev?.exitCode ?? 1;
          return code === 0 ? 1 : code;
        }

        log("ready");
        for (const svc of fw.orchestrator.state.dev?.services ?? []) {
          console.log(`  service ${svc.name}: ${svc.url}`);
        }

        // Race SIGINT against dev-exit: if dev process dies on its own, don't wait for Ctrl-C.
        const sigintP = waitForSigint();
        const second = await Promise.race([
          sigintP.then(() => "signal" as const),
          running.then(() => "exited" as const),
        ]);

        if (second === "signal") {
          log("stopping");
          await fw.orchestrator.runStop();
          await running;
        } else {
          log("dev exited on its own");
        }

        return fw.orchestrator.state.dev?.exitCode ?? 0;
      }
      case "build": {
        log("building");
        const res = await fw.orchestrator.runBuild();
        if (res.manifestPath) log(`manifest at ${res.manifestPath}`);
        return res.exitCode;
      }
      case "deploy": {
        log("deploying");
        const res = await fw.orchestrator.runDeploy();
        return res.exitCode;
      }
      case "stop": {
        log("stopping");
        await fw.orchestrator.runStop();
        return 0;
      }
    }
  } finally {
    await fw.close();
    // The CLI owns this backend instance (we built it via factory), so it
    // closes here. createPneumaFramework.close() deliberately leaves
    // caller-supplied backends alone.
    if (backend) {
      try { await backend.close(); } catch { /* best-effort */ }
    }
  }
  return 0;
}

function waitForSigint(): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => {
      process.off("SIGINT", handler);
      process.off("SIGTERM", handler);
      resolve();
    };
    process.on("SIGINT", handler);
    process.on("SIGTERM", handler);
  });
}

function printUsage(): void {
  console.error(`
Usage: pneuma-framework <verb> <templateDir> [--workspace <path>] [--port <n>] [--backend <name>]
Verbs: dev | build | deploy | stop
Backends: opencode
`);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
