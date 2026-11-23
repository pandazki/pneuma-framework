#!/usr/bin/env node
// A scripted stand-in for `codex app-server`, speaking the documented wire shape.
// FAKE_CODEX_SCENARIO picks the turn outcome:
//   completed | failed | idle | approval
//   idle-then-completed | idle-then-failed   the order codex-cli 0.167 really sends
//   idle-then-active                         the thread goes idle, resumes, and completes later
//   ignore-sigterm-writer                    the app-server ignores SIGTERM and keeps writing; no turn/completed
//   grandchild-writer                        a command it started ignores SIGTERM and keeps writing; no turn/completed
//   completed-with-background-writer         the turn completes while a command it started keeps writing
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// Ignores SIGTERM and keeps appending to progress.log in the cwd, like a command that will not stop.
const writeUntilKilled = (dir) => {
  process.on("SIGTERM", () => {});
  const tick = () => appendFileSync(join(dir, "progress.log"), "tick\n");
  tick();
  setInterval(() => {
    try {
      tick();
    } catch {
      process.exit(1);
    }
  }, 20);
  // Bound the damage if a test fails to stop it.
  setTimeout(() => process.exit(0), 15_000);
};

// The writer stays in this process group but does not hold our stdio.
const startWriter = (dir) =>
  spawn(process.execPath, [fileURLToPath(import.meta.url)], { cwd: dir, env: { ...process.env, FAKE_CODEX_ROLE: "writer" }, stdio: "ignore" });

const scenario = process.env.FAKE_CODEX_SCENARIO ?? "completed";
const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const threadId = "thr_fake";
let cwd = process.cwd();
let sawDecline = false;

if (process.env.FAKE_CODEX_ROLE === "writer") writeUntilKilled(process.cwd());
else createInterface({ input: process.stdin }).on("line", (line) => {
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
    if (scenario === "ignore-sigterm-writer") return writeUntilKilled(cwd);
    if (scenario === "grandchild-writer") return startWriter(cwd);
    if (scenario === "completed-with-background-writer") {
      startWriter(cwd);
      // Complete only once the writer is running, so the turn really ends with it still going.
      const waitForWriter = setInterval(() => {
        if (!existsSync(join(cwd, "progress.log"))) return;
        clearInterval(waitForWriter);
        send({ method: "turn/completed", params: { threadId, turn: { id: "turn_1", status: "completed", error: null } } });
      }, 10);
      return;
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
