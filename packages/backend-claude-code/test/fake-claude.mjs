#!/usr/bin/env node
// A scripted stand-in for `claude -p --output-format stream-json`.
// FAKE_CLAUDE_SCENARIO: success | error | silent | hang | split-utf8 (result text from FAKE_CLAUDE_RESULT_TEXT) |
//   ignore-sigint-writer               the CLI itself ignores SIGINT and keeps writing
//   grandchild-writer                  a writer in the CLI's own group ignores SIGINT; the CLI dies on SIGINT
//   detached-writer                    starts a writer the way Claude Code's bash tool starts commands
//                                      (detached: its own group and session), then hangs; dies on SIGINT
//                                      without stopping the writer
//   detached-writer-stopped-on-sigint  the same, but on SIGINT it sends SIGTERM to the writer's group and exits
//                                      once the writer has; the writer takes 150ms to finish, then writes stopped.txt
//   completed-with-shell-background-writer
//                                      a tool shell, started detached, runs `writer &` and exits at once; the CLI
//                                      reports success while the writer keeps going, then exits
// Writers append to progress.log in the cwd, record their own pid in writer.pid, and exit by themselves after 5s.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const tick = () => appendFileSync("progress.log", "tick\n");
// Bound the damage if a test fails to stop it.
const exitLater = () => setTimeout(() => process.exit(0), 5_000);

// Ignores SIGINT and keeps appending to progress.log in the cwd, like a tool that will not stop.
const writeUntilKilled = () => {
  process.on("SIGINT", () => {});
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

// Keeps writing until SIGTERM, then takes a moment to finish, like a tool shutting down cleanly.
const writeUntilAsked = () => {
  tick();
  const ticking = setInterval(tick, 20);
  process.on("SIGTERM", () => {
    clearInterval(ticking);
    setTimeout(() => {
      writeFileSync("stopped.txt", "stopped\n");
      process.exit(0);
    }, 150);
  });
  exitLater();
};

const emit = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);

// Writes the chunks with a pause after each flush, so the reader sees separate pipe reads.
const writeApart = (chunks) => {
  const [head, ...rest] = chunks;
  if (head === undefined) return;
  process.stdout.write(head, () => setTimeout(() => writeApart(rest), 50));
};

const self = fileURLToPath(import.meta.url);
const startWriter = (role, options = {}) =>
  spawn(process.execPath, [self], { env: { ...process.env, FAKE_CLAUDE_ROLE: role }, stdio: "ignore", ...options });

const role = process.env.FAKE_CLAUDE_ROLE;
if (role === "writer" || role === "polite-writer") {
  writeFileSync("writer.pid", String(process.pid));
  if (role === "writer") writeUntilKilled();
  else writeUntilAsked();
} else {
  const scenario = process.env.FAKE_CLAUDE_SCENARIO ?? "success";
  writeFileSync("claude-args.json", JSON.stringify(process.argv.slice(2)));

  emit({ type: "system", subtype: "init", session_id: "sess_fake", model: "fake", tools: ["Read", "Edit"] });
  if (scenario === "hang") {
    setInterval(() => {}, 1_000);
  } else if (scenario === "ignore-sigint-writer") {
    writeUntilKilled();
  } else if (scenario === "grandchild-writer") {
    // The grandchild stays in this process group but does not hold our stdout, so `close`
    // arrives as soon as this process dies on SIGINT while the grandchild keeps writing.
    startWriter("writer");
    setInterval(() => {}, 1_000);
  } else if (scenario === "detached-writer") {
    startWriter("writer", { detached: true });
    setInterval(() => {}, 1_000);
  } else if (scenario === "detached-writer-stopped-on-sigint") {
    const writer = startWriter("polite-writer", { detached: true });
    process.on("SIGINT", () => {
      writer.on("exit", () => process.exit(130));
      process.kill(-writer.pid, "SIGTERM");
    });
    setInterval(() => {}, 1_000);
  } else if (scenario === "completed-with-shell-background-writer") {
    spawn("/bin/sh", ["-c", '"$0" "$1" &', process.execPath, self], {
      env: { ...process.env, FAKE_CLAUDE_ROLE: "writer" },
      stdio: "ignore",
      detached: true,
    });
    // Report success only once the writer is running, and take a moment to shut down after it.
    const waitForWriter = setInterval(() => {
      if (!existsSync("progress.log")) return;
      clearInterval(waitForWriter);
      emit({ type: "result", subtype: "success", is_error: false, result: "Done.", session_id: "sess_fake", num_turns: 1, permission_denials: [] });
      setTimeout(() => process.exit(0), 200);
    }, 10);
  } else if (scenario === "split-utf8") {
    const text = process.env.FAKE_CLAUDE_RESULT_TEXT ?? "";
    const line = Buffer.from(
      `${JSON.stringify({ type: "result", subtype: "success", is_error: false, result: text, session_id: "sess_fake", num_turns: 1, permission_denials: [] })}\n`,
    );
    // Cut one byte into the first multi-byte character and two bytes into the last one
    // (a 4-byte emoji when the text ends with one), so both boundaries split a character.
    const leads = [];
    for (let i = 0; i < line.length; i++) if (line[i] >= 0xc0) leads.push(i);
    const first = leads[0] + 1;
    const last = leads[leads.length - 1] + 2;
    writeApart([line.subarray(0, first), line.subarray(first, last), line.subarray(last)]);
  } else if (scenario === "silent") {
    process.stderr.write("Not logged in\n");
    process.exit(1);
  } else {
    emit({ type: "assistant", session_id: "sess_fake", message: { content: [{ type: "tool_use", name: "Edit" }] } });
    writeFileSync("edited.txt", "changed by fake claude\n");
    if (scenario === "error") {
      emit({ type: "result", subtype: "error_during_execution", is_error: true, result: "boom", session_id: "sess_fake" });
      process.exit(1);
    }
    emit({ type: "result", subtype: "success", is_error: false, result: "Added the field.", session_id: "sess_fake", num_turns: 3, total_cost_usd: 0.01, permission_denials: [] });
  }
}
