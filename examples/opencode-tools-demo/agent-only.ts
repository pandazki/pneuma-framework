#!/usr/bin/env bun
// agent-only.ts — dispatch an opencode agent at an ALREADY-RUNNING
// ai-bookmarks-core-domain server (rather than spinning one up).
//
// Use when you want to watch the viewer update live: start the app with
//   bun run examples/ai-bookmarks-real/run.ts --workspace ~/.pneuma-bookmarks --port 8765
// open http://127.0.0.1:8765/ in a browser, then in another terminal run:
//   OPENROUTER_API_KEY=... OPENCODE_MODEL=openrouter/anthropic/claude-sonnet-4.6 \
//     bun run examples/opencode-tools-demo/agent-only.ts
//
// Env:
//   PNEUMA_APP_URL     — base URL of the running template (default http://127.0.0.1:8765)
//   OPENCODE_MODEL     — "<providerID>/<modelID>" (default openrouter/anthropic/claude-sonnet-4.6)
//   OPENROUTER_API_KEY — forwarded to opencode if auth.json isn't configured
//   PNEUMA_WORKSPACE   — where to persist sessions.json (default ~/.pneuma-bookmarks)
//   PNEUMA_RESUME      — when truthy, resume the latest session for this app_id

import { mkdtempSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { getAgentBackendFactory, type AgentBackend } from "@pneuma-framework/core";
import {
  recordSession,
  touchSession,
  findLatestSession,
} from "@pneuma-framework/core";
import { registerOpencodeBackend } from "@pneuma-framework/backend-opencode";

const APP_URL = process.env["PNEUMA_APP_URL"] ?? "http://127.0.0.1:8765";
const MODEL = process.env["OPENCODE_MODEL"] ?? "openrouter/anthropic/claude-sonnet-4.6";
const PROMPT = process.argv.slice(2).join(" ").trim()
  || "Add a bookmark for https://pneuma.io and tell me what you stored.";
const WORKSPACE = process.env["PNEUMA_WORKSPACE"] ?? join(homedir(), ".pneuma-bookmarks");
const RESUME = Boolean(process.env["PNEUMA_RESUME"]);

async function main(): Promise<number> {
  console.log(`[agent-only] workspace:  ${WORKSPACE}`);

  // Verify the target server is reachable + expose operations.
  let appId = "unknown-app";
  try {
    const probe = await fetch(`${APP_URL}/api/config`);
    if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
    const cfg = await probe.json() as { app_id?: string; operations?: Array<{ id: string }> };
    const ops = cfg.operations ?? [];
    appId = cfg.app_id ?? appId;
    console.log(`[agent-only] target:     ${APP_URL}`);
    console.log(`[agent-only] app_id:     ${appId}`);
    console.log(`[agent-only] operations: ${ops.length} (${ops.map((o) => o.id).join(", ")})`);
  } catch (err) {
    console.error(`[agent-only] target server not reachable at ${APP_URL}/api/config: ${err}`);
    console.error("[agent-only] start the template first, e.g.:");
    console.error("  bun run examples/ai-bookmarks-real/run.ts --workspace ~/.pneuma-bookmarks --port 8765");
    return 1;
  }

  // Resolve a prior session to resume, if requested.
  let resumeSessionId: string | undefined;
  if (RESUME) {
    const prior = await findLatestSession(WORKSPACE, appId);
    if (prior) {
      resumeSessionId = prior.backend_session_id;
      console.log(
        `[agent-only] resuming    ${resumeSessionId} (first prompt: "${prior.initial_prompt.slice(0, 60)}")`,
      );
    } else {
      console.log("[agent-only] PNEUMA_RESUME set but no prior session found — starting fresh");
    }
  }

  registerOpencodeBackend();
  const factory = getAgentBackendFactory("opencode");
  if (!factory) throw new Error("opencode backend failed to register");
  const backend: AgentBackend = factory({ defaultModel: MODEL });

  // opencode still wants a cwd; give it a scratch dir (the template server owns its own data dir).
  // NOTE: workspace and cwd are conceptually distinct — workspace is where pneuma persists its
  // session index, cwd is where opencode can perform file operations (ephemeral scratch here).
  const cwd = mkdtempSync(join(tmpdir(), "pneuma-agent-only-"));

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
      process.stderr.write(`\n[agent-only] agent error: ${JSON.stringify(ev.payload)}\n`);
    }
  });

  try {
    console.log(`[agent-only] model:      ${MODEL}`);
    if (resumeSessionId) {
      console.log(`[agent-only] mode:       resume (${resumeSessionId})`);
    } else {
      console.log("[agent-only] mode:       new session");
    }
    console.log("[agent-only] launching opencode backend with MCP bridge…");
    const sess = await backend.launch({ cwd, appUrl: APP_URL, resumeSessionId });
    console.log(`[agent-only] session:    ${sess.sessionId}`);
    console.log(`[agent-only] prompt:     ${PROMPT}`);
    console.log("[agent-only] agent reply:");
    console.log("--------------------------------");
    await backend.sendUserMessage(sess.sessionId, PROMPT);
    console.log("\n--------------------------------");

    // Update the session index
    if (resumeSessionId && sess.sessionId === resumeSessionId) {
      const touched = await touchSession(WORKSPACE, sess.sessionId);
      if (touched) {
        console.log(`[agent-only] session touched: ${touched.id} (backend: ${touched.backend_session_id})`);
      }
    } else {
      const recorded = await recordSession({
        workspace: WORKSPACE,
        backend_session_id: sess.sessionId,
        app_id: appId,
        initial_prompt: PROMPT,
      });
      console.log(`[agent-only] session recorded: ${recorded.id} (backend: ${recorded.backend_session_id})`);
    }

    await backend.stop(sess.sessionId);
    return 0;
  } finally {
    unsub();
    await backend.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("[agent-only] fatal:", err);
    process.exit(1);
  },
);
