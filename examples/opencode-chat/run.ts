#!/usr/bin/env bun
// End-to-end demo:
//   1. Spin the "minimal" pneuma-app template as a pneuma-framework dev process.
//   2. Launch an opencode backend via the framework's AgentBackend abstraction.
//   3. Send one prompt to the agent, stream text back, shut everything down.
//
// Auth: expects openrouter credentials in opencode's auth.json
// (~/.local/share/opencode/auth.json) — set up via `opencode auth login`.
//
// Model: set via OPENCODE_MODEL env var; defaults to the haiku 4.5 route.
// Form is "<providerID>/<modelID>", e.g. "openrouter/anthropic/claude-haiku-4.5".

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createPneumaFramework,
  getAgentBackendFactory,
  type AgentBackend,
} from "@pneuma-framework/core";
import { registerOpencodeBackend } from "@pneuma-framework/backend-opencode";

const MODEL = process.env.OPENCODE_MODEL ?? "openrouter/anthropic/claude-haiku-4.5";
const PROMPT = process.argv.slice(2).join(" ").trim()
  || "Say hello in one short sentence, then stop.";

async function main(): Promise<number> {
  const templateDir = resolve(import.meta.dir, "../../templates/minimal");
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-example-ws-"));
  console.log(`[example] workspace: ${workspace}`);
  console.log(`[example] model:     ${MODEL}`);

  // Pneuma owns the template lifecycle; createPneumaFramework also wires the
  // tool registry so an agent *could* call lifecycle.state / workspace.tree /
  // etc. via MCP (not exercised here — M3 adds the MCP transport wiring).
  registerOpencodeBackend();
  const factory = getAgentBackendFactory("opencode");
  if (!factory) throw new Error("opencode backend failed to register");
  const backend: AgentBackend = factory({ defaultModel: MODEL });
  const fw = createPneumaFramework({ templateDir, workspace, backend });

  // Start the minimal template's dev server so we can observe a running
  // pneuma-app in the loop. Not strictly required for the chat demo, but
  // this is what "end-to-end" looks like: framework + agent + app, all up.
  console.log("[example] starting minimal template dev server…");
  const devRunning = fw.orchestrator.runDev();
  await fw.orchestrator.awaitDevReady();
  for (const svc of fw.orchestrator.state.dev?.services ?? []) {
    console.log(`[example]   service ${svc.name}: ${svc.url}`);
  }

  try {
    console.log("[example] launching opencode backend (spawns `opencode serve`)…");
    const unsub = backend.onEvent((ev) => {
      if (process.env.DEBUG_EVENTS) {
        process.stderr.write(`[ev] ${ev.type} ${JSON.stringify(ev.payload).slice(0, 200)}\n`);
      }
      if (ev.type === "text") {
        // opencode emits the user's own message as a part too; only the
        // assistant's generated text parts carry a `time.start` timestamp.
        const part = (ev.payload as { part?: { type?: string; text?: string; time?: { start?: number } } }).part;
        if (part?.type === "text" && part.text && part.time?.start) {
          process.stdout.write(part.text);
        }
      } else if (ev.type === "error") {
        process.stderr.write(`\n[example] agent error: ${JSON.stringify(ev.payload)}\n`);
      }
    });

    const sess = await backend.launch({ cwd: workspace });
    console.log(`[example] session ready: ${sess.sessionId}`);

    console.log(`[example] prompt: ${PROMPT}`);
    console.log("[example] agent reply:");
    console.log("--------------------------------");
    // session.prompt blocks until the turn is finished, so awaiting it is
    // the simplest "wait for the response" signal we have.
    await backend.sendUserMessage(sess.sessionId, PROMPT);
    console.log("\n--------------------------------");

    unsub();
    await backend.stop(sess.sessionId);
    return 0;
  } finally {
    console.log("[example] shutting down…");
    await fw.orchestrator.runStop();
    await devRunning;
    await fw.close();
    await backend.close(); // CLI/example owns the backend it built.
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("[example] fatal:", err);
    process.exit(1);
  },
);
