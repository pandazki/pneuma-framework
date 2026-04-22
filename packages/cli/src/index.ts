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

  // Construct backend (factory call) BEFORE createPneumaFramework so the
  // framework's wire bridge attaches to it at construct time. We then launch
  // the backend and annotate the session id — the bridge drops events until
  // that annotation, so there's no event-leakage window.
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
  }

  const fw = createPneumaFramework({
    templateDir,
    workspace,
    portHint: parsed.port,
    backend,
    wire: parsed.verb === "dev"
      ? { enabled: true, autoAcceptPermissions: true }
      : undefined,
  });

  if (backend) {
    try {
      const sess = await backend.launch({ cwd: workspace });
      fw.annotateBackendSession(sess.sessionId);
    } catch (err) {
      try { await backend.close(); } catch { /* best-effort */ }
      try { await fw.close(); } catch { /* best-effort */ }
      console.error(`pneuma-framework: backend "${parsed.backend}" failed to launch: ${(err as Error).message}`);
      return 1;
    }
  }

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
        if (fw.wireServer && fw.sessionId) {
          const viewerService = fw.orchestrator.state.dev?.services.find((s) => s.name === "viewer");
          if (viewerService) {
            const viewerUrl = appendSidAndWs(viewerService.url, fw.sessionId, fw.wireServer.url);
            console.log(`\n  Builder URL: ${viewerUrl}\n  (copy to browser · 复制到浏览器打开)\n`);
          }
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

function appendSidAndWs(url: string, sid: string, wsUrl: string): string {
  const u = new URL(url);
  u.searchParams.set("sid", sid);
  u.searchParams.set("ws", wsUrl);
  return u.toString();
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
