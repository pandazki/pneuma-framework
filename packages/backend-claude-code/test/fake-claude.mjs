#!/usr/bin/env node
// A scripted stand-in for `claude -p --output-format stream-json`.
// FAKE_CLAUDE_SCENARIO: success | error | silent | hang.
import { writeFileSync } from "node:fs";

const scenario = process.env.FAKE_CLAUDE_SCENARIO ?? "success";
const emit = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
writeFileSync("claude-args.json", JSON.stringify(process.argv.slice(2)));

emit({ type: "system", subtype: "init", session_id: "sess_fake", model: "fake", tools: ["Read", "Edit"] });
if (scenario === "hang") {
  setInterval(() => {}, 1_000);
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
