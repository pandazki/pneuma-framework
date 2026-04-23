// examples/ai-bookmarks-real/run.ts
//
// 一键把 templates/ai-bookmarks-core-domain 用 lifecycle orchestrator 起来.
//
// Prereq:
//   export OPENROUTER_API_KEY=sk-or-v1-...
//
// Usage:
//   bun run examples/ai-bookmarks-real/run.ts [--workspace DIR] [--port N]

import { resolve } from "node:path";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework } from "@pneuma-framework/core";

function parseArgs(argv: string[]): { workspace?: string; port?: number } {
  const out: { workspace?: string; port?: number } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--workspace") out.workspace = argv[++i];
    else if (a === "--port") {
      const n = Number(argv[++i]);
      if (Number.isFinite(n)) out.port = n;
    }
  }
  return out;
}

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("ERROR: env OPENROUTER_API_KEY missing.");
    process.exit(1);
  }
  const { workspace: argWs, port: argPort } = parseArgs(process.argv.slice(2));

  const templateDir = resolve(
    import.meta.dir,
    "..",
    "..",
    "templates",
    "ai-bookmarks-core-domain"
  );
  if (!existsSync(templateDir)) {
    console.error(`template not found: ${templateDir}`);
    process.exit(1);
  }

  const workspace = argWs
    ? resolve(argWs)
    : mkdtempSync(join(tmpdir(), "pneuma-ai-bookmarks-"));
  const port = argPort ?? 8765;

  console.log(`template:  ${templateDir}`);
  console.log(`workspace: ${workspace}`);
  console.log(`port:      ${port}`);
  console.log("");

  const framework = await createPneumaFramework({
    templateDir,
    workspace,
    portHint: port,
  });

  const orch = framework.orchestrator;
  const devRun = orch.runDev(port);

  const READY = Symbol("ready");
  const EXITED = Symbol("exited");
  const first = await Promise.race([
    orch.awaitDevReady().then(() => READY),
    devRun.then(() => EXITED),
  ]);
  if (first === EXITED) {
    console.error("dev exited before reporting ready");
    await framework.close();
    process.exit(1);
  }

  for (const s of orch.state.dev?.services ?? []) console.log(`service ${s.name}: ${s.url}`);
  console.log("");
  console.log("Open in browser:");
  console.log(`  http://127.0.0.1:${port}/`);
  console.log("");
  console.log("Flow:");
  console.log("  1. Pre-seeded 3 lenses (technical-depth / personal-relevance / skimmable-summary)");
  console.log("  2. Add a URL → Jina Reader fetch → each lens × Sonnet 4.6 → interpretations saved");
  console.log("  3. Add / update / delete lenses from the viewer; next bookmark runs new set");
  console.log("");
  console.log("Your data persists in:");
  console.log(`  ${join(workspace, "data")}/`);
  console.log("");
  console.log("Press Ctrl-C to stop.");
  console.log("");

  const stop = async (): Promise<void> => {
    console.log("");
    console.log("stopping…");
    try { await orch.runStop(); } catch {}
    await framework.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());

  await devRun;
  await framework.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
