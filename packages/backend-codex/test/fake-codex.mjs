#!/usr/bin/env node
// A scripted stand-in for `codex app-server`, speaking the documented wire shape.
// Like the real app-server in stdio mode it exits on end of input, unless the scenario says otherwise.
// It records its pid in app-server.pid. FAKE_CODEX_SCENARIO picks the turn outcome:
//   completed | failed | idle | approval
//   idle-then-completed | idle-then-failed   the order codex-cli 0.167 really sends
//   idle-then-active                         the thread goes idle, resumes, and completes later
//   ignore-sigterm-writer                    the app-server ignores end of input and SIGTERM and keeps writing; no turn/completed
//   grandchild-writer                        a command it started ignores SIGTERM and keeps writing; no turn/completed
//   completed-with-background-writer         the turn completes while a command it started keeps writing
//   session-writer                           starts a command in a new session, the way Codex starts shell-tool
//                                            commands; no turn/completed; exits on end of input without stopping it
//   session-writer-stopped-on-eof            the same, but on end of input it sends SIGTERM to the command and exits
//                                            once the command has; the command takes 150ms to finish, then writes stopped.txt
//   completed-with-shell-background-writer   a tool shell, started in a new session, runs `writer &` and exits at
//                                            once; the turn completes while the writer keeps going
//   no-answer-initialize | no-answer-thread-start | no-answer-turn-start
//                                            never answers that request, and ignores end of input
// Commands append to progress.log in the draft, record their own pid in writer.pid, and exit by themselves after 5s.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// Bound the damage if a test fails to stop it.
const exitLater = () => setTimeout(() => process.exit(0), 5_000);

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
  exitLater();
};

// Keeps writing until SIGTERM, then takes a moment to finish, like a command shutting down cleanly.
const writeUntilAsked = (dir) => {
  const tick = () => appendFileSync(join(dir, "progress.log"), "tick\n");
  tick();
  const ticking = setInterval(tick, 20);
  process.on("SIGTERM", () => {
    clearInterval(ticking);
    setTimeout(() => {
      writeFileSync(join(dir, "stopped.txt"), "stopped\n");
      process.exit(0);
    }, 150);
  });
  exitLater();
};

const self = fileURLToPath(import.meta.url);
// Without `session`, the command stays in this process group. Either way it does not hold our stdio.
const startWriter = (dir, { role = "writer", session = false } = {}) =>
  spawn(process.execPath, [self], { cwd: dir, env: { ...process.env, FAKE_CODEX_ROLE: role }, stdio: "ignore", detached: session });

const scenario = process.env.FAKE_CODEX_SCENARIO ?? "completed";
const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const threadId = "thr_fake";
const unanswered = scenario.startsWith("no-answer-") ? scenario.slice("no-answer-".length).replace("-", "/") : undefined;
let cwd = process.cwd();
let sawDecline = false;
let writer;

const role = process.env.FAKE_CODEX_ROLE;
if (role === "writer" || role === "polite-writer") {
  writeFileSync(join(process.cwd(), "writer.pid"), String(process.pid));
  if (role === "writer") writeUntilKilled(process.cwd());
  else writeUntilAsked(process.cwd());
} else {
  writeFileSync(join(process.cwd(), "app-server.pid"), String(process.pid));
  // A hung app-server: stays up after end of input, until a signal or this bound.
  if (unanswered) setTimeout(() => process.exit(0), 15_000);
  const lines = createInterface({ input: process.stdin });
  lines.on("close", () => {
    if (unanswered || scenario === "ignore-sigterm-writer") return;
    if (scenario === "session-writer-stopped-on-eof" && writer) {
      writer.on("exit", () => process.exit(0));
      return process.kill(-writer.pid, "SIGTERM");
    }
    process.exit(0);
  });
  lines.on("line", (line) => {
    const msg = JSON.parse(line);
    if (msg.method !== undefined && msg.method === unanswered) return;
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
      if (scenario === "session-writer") return startWriter(cwd, { session: true });
      if (scenario === "session-writer-stopped-on-eof") {
        writer = startWriter(cwd, { role: "polite-writer", session: true });
        return;
      }
      if (scenario === "completed-with-background-writer" || scenario === "completed-with-shell-background-writer") {
        if (scenario === "completed-with-background-writer") startWriter(cwd);
        else {
          spawn("/bin/sh", ["-c", '"$0" "$1" &', process.execPath, self], {
            cwd,
            env: { ...process.env, FAKE_CODEX_ROLE: "writer" },
            stdio: "ignore",
            detached: true,
          });
        }
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
}
