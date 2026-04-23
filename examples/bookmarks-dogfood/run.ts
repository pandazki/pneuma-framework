// examples/bookmarks-dogfood/run.ts
//
// 一键把 templates/bookmarks-core-domain 用 packages/core 的 LifecycleOrchestrator
// 拉起来, 打印服务地址, 等 Ctrl-C. 不连 agent backend (那是 opencode-chat 的事).
//
// 目的: 最短路径证明端到端打通 —
//   core-domain primitives → runtime → template manifest → lifecycle → HTTP 服务.
//
// 用法:
//   bun run examples/bookmarks-dogfood/run.ts [--workspace /some/path] [--port 8765]
//
// 默认 workspace = mkdtemp 临时目录; 关闭时会打印路径, 你可以保留 / 删除.

import { resolve } from "node:path";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework } from "@pneuma-framework/core";

function parseArgs(argv: string[]): { workspace?: string; port?: number } {
  const out: { workspace?: string; port?: number } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--workspace") {
      out.workspace = argv[++i];
    } else if (a === "--port") {
      const n = Number(argv[++i]);
      if (Number.isFinite(n)) out.port = n;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const { workspace: argWs, port: argPort } = parseArgs(process.argv.slice(2));

  const templateDir = resolve(
    import.meta.dir,
    "..",
    "..",
    "templates",
    "bookmarks-core-domain"
  );
  if (!existsSync(templateDir)) {
    console.error(`template not found: ${templateDir}`);
    process.exit(1);
  }

  const workspace = argWs
    ? resolve(argWs)
    : mkdtempSync(join(tmpdir(), "pneuma-bookmarks-dogfood-"));
  const port = argPort ?? 8765;

  console.log(`template:  ${templateDir}`);
  console.log(`workspace: ${workspace}`);
  console.log(`port:      ${port}`);
  console.log("");

  const framework = await createPneumaFramework({
    templateDir,
    workspace,
    portHint: port,
    // no backend — we just want the app server, no agent conversation here
  });

  const orch = framework.orchestrator;

  // kick dev in the background; it resolves when dev process exits
  const devRun = orch.runDev(port);

  // race ready-vs-exit so we fail fast if the template dev.sh crashes
  const READY = Symbol("ready");
  const EXITED = Symbol("exited");
  const first = await Promise.race([
    orch.awaitDevReady().then(() => READY),
    devRun.then(() => EXITED),
  ]);

  if (first === EXITED) {
    console.error("dev exited before reporting ready — see logs above");
    await framework.close();
    process.exit(1);
  }

  const services = orch.state.dev?.services ?? [];
  for (const s of services) {
    console.log(`service ${s.name}: ${s.url}`);
  }
  console.log("");
  console.log("Try:");
  console.log(`  curl http://127.0.0.1:${port}/api/health`);
  console.log(`  curl http://127.0.0.1:${port}/api/operations`);
  console.log(`  open http://127.0.0.1:${port}/`);
  console.log("");
  console.log("Press Ctrl-C to stop. Your data persists in:");
  console.log(`  ${join(workspace, "data")}/`);
  console.log("");

  // graceful shutdown
  const stop = async (): Promise<void> => {
    console.log("");
    console.log("stopping…");
    try {
      await orch.runStop();
    } catch {
      // ignore
    }
    await framework.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());

  // wait for dev to exit (e.g. manual kill)
  await devRun;
  await framework.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
