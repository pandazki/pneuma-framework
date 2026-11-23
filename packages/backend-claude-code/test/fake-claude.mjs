#!/usr/bin/env node
// A scripted stand-in for `claude -p --output-format stream-json`.
// FAKE_CLAUDE_SCENARIO: success | error | silent | hang | ignore-sigint-writer |
//   grandchild-writer | split-utf8 (result text from FAKE_CLAUDE_RESULT_TEXT).
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Ignores SIGINT and keeps appending to progress.log in the cwd, like a tool that will not stop.
const writeUntilKilled = () => {
  process.on("SIGINT", () => {});
  appendFileSync("progress.log", "tick\n");
  setInterval(() => {
    try {
      appendFileSync("progress.log", "tick\n");
    } catch {
      process.exit(1);
    }
  }, 20);
  // Bound the damage if a test fails to stop it.
  setTimeout(() => process.exit(0), 15_000);
};

const emit = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);

// Writes the chunks with a pause after each flush, so the reader sees separate pipe reads.
const writeApart = (chunks) => {
  const [head, ...rest] = chunks;
  if (head === undefined) return;
  process.stdout.write(head, () => setTimeout(() => writeApart(rest), 50));
};

if (process.env.FAKE_CLAUDE_ROLE === "writer") {
  writeUntilKilled();
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
    spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, FAKE_CLAUDE_ROLE: "writer" },
      stdio: "ignore",
    });
    setInterval(() => {}, 1_000);
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
