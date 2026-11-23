#!/usr/bin/env node
// A scripted stand-in for `codex app-server`, speaking the documented wire shape.
// FAKE_CODEX_SCENARIO picks the turn outcome:
//   completed | failed | idle | approval
//   idle-then-completed | idle-then-failed   the order codex-cli 0.167 really sends
//   idle-then-active                         the thread goes idle, resumes, and completes later
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const scenario = process.env.FAKE_CODEX_SCENARIO ?? "completed";
const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const threadId = "thr_fake";
let cwd = process.cwd();
let sawDecline = false;

createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.method === "initialize") return send({ id: msg.id, result: { userAgent: "fake-codex" } });
  if (msg.method === "initialized") return;
  if (msg.method === "thread/start") {
    cwd = msg.params.cwd;
    return send({ id: msg.id, result: { thread: { id: threadId } } });
  }
  if (msg.method === "turn/start") {
    send({ id: msg.id, result: { turn: { id: "turn_1", status: "inProgress", items: [], error: null } } });
    send({ method: "thread/status/changed", params: { threadId, status: { type: "active" } } });
    send({ method: "turn/started", params: { threadId, turn: { id: "turn_1" } } });
    writeFileSync(join(cwd, "turn-input.json"), JSON.stringify(msg.params));
    if (scenario === "approval") {
      // A server request whose id collides with one of the client's own ids.
      return send({ id: 1, method: "item/commandExecution/requestApproval", params: { threadId, command: "rm -rf /" } });
    }
    send({ method: "item/completed", params: { threadId, item: { type: "agentMessage", id: "m1", text: "done editing" } } });
    if (scenario === "failed") {
      return send({ method: "turn/completed", params: { threadId, turn: { id: "turn_1", status: "failed", error: { message: "model refused" } } } });
    }
    if (scenario === "idle") return send({ method: "thread/status/changed", params: { threadId, status: { type: "idle" } } });
    if (scenario === "idle-then-active") {
      send({ method: "thread/status/changed", params: { threadId, status: { type: "idle" } } });
      setTimeout(() => send({ method: "thread/status/changed", params: { threadId, status: { type: "active" } } }), 50);
      setTimeout(() => send({ method: "item/completed", params: { threadId, item: { type: "agentMessage", id: "m2", text: "done after resuming" } } }), 900);
      return setTimeout(() => send({ method: "turn/completed", params: { threadId, turn: { id: "turn_1", status: "completed", error: null } } }), 950);
    }
    if (scenario === "idle-then-completed" || scenario === "idle-then-failed") {
      const failed = scenario === "idle-then-failed";
      send({ method: "thread/status/changed", params: { threadId, status: { type: "idle" } } });
      return setTimeout(
        () => send({ method: "turn/completed", params: { threadId, turn: { id: "turn_1", status: failed ? "failed" : "completed", error: failed ? { message: "model refused" } : null } } }),
        50,
      );
    }
    return send({ method: "turn/completed", params: { threadId, turn: { id: "turn_1", status: "completed", error: null } } });
  }
  // The client's answer to our approval request: a response, i.e. id without method.
  if (msg.id === 1 && msg.method === undefined && !sawDecline) {
    sawDecline = true;
    writeFileSync(join(cwd, "approval-answer.json"), JSON.stringify(msg));
    send({ method: "turn/completed", params: { threadId, turn: { id: "turn_1", status: "completed", error: null } } });
  }
});
