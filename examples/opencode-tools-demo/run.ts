#!/usr/bin/env bun
// opencode-tools-demo
//
// Demonstrates the MCP bridge wiring introduced in Step 4b:
//   1. Spin the "ai-bookmarks-core-domain" template as a pneuma-framework dev process.
//   2. Once the template's HTTP service is ready, pass its URL as `appUrl` to the
//      opencode backend — this causes opencode to spawn the template-mcp-bridge and
//      expose op.* tools (e.g. op.add_bookmark) to the agent.
//   3. Send a prompt that exercises an op.* tool call.
//   4. Stream the response and shut everything down.
//
// Auth: expects openrouter credentials in opencode's auth.json
// (~/.local/share/opencode/auth.json) — set up via `opencode auth login`.
//
// Env:
//   OPENCODE_MODEL  — model in "<providerID>/<modelID>" form
//                     (default: openrouter/anthropic/claude-opus-4.7)
//   OPENROUTER_API_KEY — alternative to opencode auth login for openrouter
//
// Usage:
//   bun run examples/opencode-tools-demo/run.ts
//   bun run examples/opencode-tools-demo/run.ts "Add a bookmark for https://example.com"

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createPneumaFramework,
  getAgentBackendFactory,
  type AgentBackend,
} from "@pneuma-framework/core";
import { registerOpencodeBackend } from "@pneuma-framework/backend-opencode";

const MODEL = process.env["OPENCODE_MODEL"] ?? "openrouter/anthropic/claude-opus-4.7";
const PROMPT = process.argv.slice(2).join(" ").trim()
  || "Add a bookmark for https://example.com and then tell me what you stored.";

async function main(): Promise<number> {
  const templateDir = resolve(import.meta.dir, "../../templates/ai-bookmarks-core-domain");
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-tools-demo-ws-"));
  console.log(`[demo] workspace:  ${workspace}`);
  console.log(`[demo] template:   ai-bookmarks-core-domain`);
  console.log(`[demo] model:      ${MODEL}`);

  registerOpencodeBackend();
  const factory = getAgentBackendFactory("opencode");
  if (!factory) throw new Error("opencode backend failed to register");
  const backend: AgentBackend = factory({ defaultModel: MODEL });
  const fw = createPneumaFramework({ templateDir, workspace, backend });

  // Run setup first so the template's dependencies are installed.
  console.log("[demo] running template setup…");
  await fw.orchestrator.runSetup();

  // Spin the dev server — this starts the Bun HTTP app that exposes /api/config
  // and /api/operations/:id.
  console.log("[demo] starting template dev server…");
  const devRunning = fw.orchestrator.runDev();
  await fw.orchestrator.awaitDevReady();

  // Grab the first HTTP service URL (the ai-bookmarks-core-domain template
  // emits ##pneuma:service-ready after Bun.serve starts).
  const appUrl = fw.orchestrator.state.dev?.services[0]?.url;
  if (!appUrl) {
    console.error("[demo] template did not emit a service-ready URL — aborting");
    await fw.orchestrator.runStop();
    await devRunning;
    return 1;
  }
  console.log(`[demo] app URL:    ${appUrl}`);

  try {
    console.log("[demo] launching opencode backend with MCP bridge…");
    const unsub = backend.onEvent((ev) => {
      if (process.env["DEBUG_EVENTS"]) {
        process.stderr.write(`[ev] ${ev.type} ${JSON.stringify(ev.payload).slice(0, 200)}\n`);
      }
      if (ev.type === "text") {
        // message.part.delta events carry { partId, messageID, delta } — incremental
        // streaming chunks. Print each delta as it arrives.
        const asDelta = ev.payload as { delta?: unknown };
        if (typeof asDelta.delta === "string" && asDelta.delta) {
          process.stdout.write(asDelta.delta);
        }
        // message.part.updated events carry { part: { type, text, time? } } — these
        // are cumulative snapshots that would duplicate the delta stream, so skip them.
      } else if (ev.type === "error") {
        process.stderr.write(`\n[demo] agent error: ${JSON.stringify(ev.payload)}\n`);
      }
    });

    // Pass appUrl so the adapter injects the MCP bridge config into opencode.
    // The agent will see op.add_bookmark and other operations as callable tools.
    const sess = await backend.launch({ cwd: workspace, appUrl });
    console.log(`[demo] session ready: ${sess.sessionId}`);

    console.log(`[demo] prompt: ${PROMPT}`);
    console.log("[demo] agent reply:");
    console.log("--------------------------------");
    await backend.sendUserMessage(sess.sessionId, PROMPT);
    console.log("\n--------------------------------");

    unsub();
    await backend.stop(sess.sessionId);
    return 0;
  } finally {
    console.log("[demo] shutting down…");
    await fw.orchestrator.runStop();
    await devRunning;
    await fw.close();
    await backend.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("[demo] fatal:", err);
    process.exit(1);
  },
);
