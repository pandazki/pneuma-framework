#!/usr/bin/env bun
import { resolve } from "node:path";
import { createPneumaFramework } from "@pneuma-framework/core";
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
  const fw = createPneumaFramework({ templateDir, workspace });

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
          // dev.sh exited before declaring ready — surface failure.
          log("dev exited before ready");
          return fw.orchestrator.state.dev?.exitCode ?? 1;
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
Usage: pneuma-framework <verb> <templateDir> [--workspace <path>]
Verbs: dev | build | deploy | stop
`);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
