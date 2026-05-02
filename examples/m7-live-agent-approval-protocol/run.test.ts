import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAgentExecutionTranscript } from "./transcript.js";
import { buildM7LiveAgentPrompt } from "./run.js";

async function runM7Cli(input: {
  workspace: string;
  autoDecision: "allow" | "deny";
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn({
    cmd: [
      "bun",
      "run",
      join(import.meta.dir, "run.ts"),
      "--backend",
      "fake",
      "--workspace",
      input.workspace,
      "--port",
      "0",
      "--auto-decision",
      input.autoDecision,
      "--smoke-exit",
    ],
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

describe("M7 live agent approval runner", () => {
  test("runs the deterministic allow path, records approval transcript, and verifies Priority Queue rows", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m7-allow-"));
    try {
      const { stdout, stderr, exitCode } = await runM7Cli({ workspace, autoDecision: "allow" });
      const transcript = await readAgentExecutionTranscript(workspace);

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("M7 Live Agent Approval ready:");
      expect(stdout).toContain("backend: fake");
      expect(stdout).toContain("auto-decision: allow");
      expect(stdout).toContain("priority queue smoke: 3 rows");
      expect(stdout).toContain("live approval completion: completed");
      expect(transcript?.status).toBe("completed");
      expect(transcript?.events.filter((event) => event.kind === "permission_prompt")).toHaveLength(1);
      expect(transcript?.events.filter((event) =>
        event.kind === "permission_prompt" && event.tool === "definition.apply_change_set"
      )).toHaveLength(1);
      expect(transcript?.events.some((event) =>
        event.kind === "approval_response" && event.decision === "allow"
      )).toBe(true);
      expect(transcript?.events.filter((event) =>
        event.kind === "tool_result" && event.tool === "definition.apply_change_set" && event.ok === true
      )).toHaveLength(1);
      expect(JSON.stringify(transcript?.after)).toContain("list_priority_queue");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);

  test("runs the deterministic deny path, records denial transcript, and leaves Priority Queue absent", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m7-deny-"));
    try {
      const { stdout, stderr, exitCode } = await runM7Cli({ workspace, autoDecision: "deny" });
      const transcript = await readAgentExecutionTranscript(workspace);

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("M7 Live Agent Approval ready:");
      expect(stdout).toContain("backend: fake");
      expect(stdout).toContain("auto-decision: deny");
      expect(stdout).toContain("live approval completion: denied");
      expect(stdout).not.toContain("priority queue smoke: 3 rows");
      expect(transcript?.status).toBe("denied");
      expect(transcript?.events.filter((event) => event.kind === "permission_prompt")).toHaveLength(1);
      expect(transcript?.events.filter((event) =>
        event.kind === "permission_prompt" && event.tool === "definition.apply_change_set"
      )).toHaveLength(1);
      expect(transcript?.events.some((event) =>
        event.kind === "approval_response" && event.decision === "deny"
      )).toBe(true);
      expect(JSON.stringify(transcript?.after)).not.toContain("list_priority_queue");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);

  test("live approval prompt instructs the backend agent to execute governed changes and wait for Builder approval", () => {
    const prompt = buildM7LiveAgentPrompt({ backend: "fake" });

    expect(prompt).toContain("definition.apply_change_set");
    expect(prompt).toContain("require_approval");
    expect(prompt).toContain("one Builder approval response");
    expect(prompt).toContain("Apply this exact JSON input");
    expect(prompt).not.toContain("one by one");
    expect(prompt).toContain("add_table_column");
    expect(prompt).toContain("add_operation");
    expect(prompt).toContain("add_view");
    expect(prompt).toContain("add_policy_rule");
    expect(prompt).toContain("list_priority_queue");
    expect(prompt).toContain("priority_queue");
  });

  test("opencode prompt asks the real backend agent to construct the proposal instead of replaying exact JSON", () => {
    const prompt = buildM7LiveAgentPrompt({
      backend: "opencode",
      before: {
        tableColumns: ["id", "title", "body", "status"],
        operations: ["capture_item", "list_items", "update_item_status"],
        views: [],
        policyRules: [],
        hasPriorityColumn: false,
        hasPriorityOperation: false,
        hasPriorityView: false,
        hasPriorityReadPolicy: false,
      },
    });

    expect(prompt).toContain("definition.apply_change_set");
    expect(prompt).toContain("Construct the proposal yourself");
    expect(prompt).toContain("approval_mode");
    expect(prompt).toContain("defer");
    expect(prompt).toContain("Current app-definition snapshot");
    expect(prompt).toContain("\"kind\": \"primitive\"");
    expect(prompt).toContain("\"of\": \"Text\"");
    expect(prompt).toContain("P1");
    expect(prompt).toContain("handler: { \"kind\": \"query\"");
    expect(prompt).toContain("\"fields\": [...]");
    expect(prompt).toContain("\"sort\":");
    expect(prompt).toContain("allow: [{ \"kind\": \"anyone\" }, { \"kind\": \"anonymous\" }]");
    expect(prompt).toContain("capture_item");
    expect(prompt).toContain("list_items");
    expect(prompt).toContain("one Builder approval");
    expect(prompt).not.toContain("Apply this exact JSON input");
    expect(prompt).not.toContain("\"changes\": [");
    expect(prompt).not.toContain("priorityCapabilityChanges");
  });
});
