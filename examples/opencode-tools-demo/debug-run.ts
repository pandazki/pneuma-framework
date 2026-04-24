import { createPneumaFramework, getAgentBackendFactory, type AgentBackend } from "@pneuma-framework/core";
import { registerOpencodeBackend } from "@pneuma-framework/backend-opencode";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const MODEL = "openrouter/anthropic/claude-sonnet-4.6";
const templateDir = resolve("/Users/pandazki/Codes/pneuma-framework/templates/ai-bookmarks-core-domain");
const workspace = mkdtempSync(join(tmpdir(), "pneuma-dbg-"));
console.log("[dbg] workspace:", workspace);

registerOpencodeBackend();
const factory = getAgentBackendFactory("opencode")!;
const backend = factory({ defaultModel: MODEL });
const fw = createPneumaFramework({ templateDir, workspace, backend });

await fw.orchestrator.runSetup();
const devRunning = fw.orchestrator.runDev();
await fw.orchestrator.awaitDevReady();
const appUrl = fw.orchestrator.state.dev?.services[0]?.url;
console.log("[dbg] appUrl:", appUrl);

const unsub = backend.onEvent((ev) => {
  process.stderr.write("[EVENT] " + ev.type + " " + JSON.stringify(ev.payload).slice(0, 300) + "\n");
});

const sess = await backend.launch({ cwd: workspace, appUrl });
console.log("[dbg] session:", sess.sessionId);

// Wait 2s before sending to let MCP bridge initialize
await new Promise(r => setTimeout(r, 2000));

console.log("[dbg] sending prompt...");
await backend.sendUserMessage(sess.sessionId, "Just say hello in one sentence.");
console.log("[dbg] sendUserMessage returned");

unsub();
await backend.stop(sess.sessionId);
await fw.orchestrator.runStop();
await devRunning;
await fw.close();
await backend.close();
process.exit(0);
