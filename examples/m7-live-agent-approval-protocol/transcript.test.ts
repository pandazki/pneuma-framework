import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  createAgentExecutionTranscript,
  readAgentExecutionTranscript,
  recordApprovalResponse,
  recordAssistantTextDelta,
  recordCompletion,
  recordPermissionPrompt,
  recordToolCall,
  recordToolResult,
  writeAgentExecutionTranscript,
} from "./transcript.js";

describe("M7 agent execution transcript", () => {
  test("creates a transcript with a builder request and before/after slots", () => {
    const transcript = createAgentExecutionTranscript({
      runId: "m7-test",
      builderRequest: "Add a priority queue",
      before: { operations: [], views: [], tables: [] },
    });

    expect(transcript.schema_version).toBe(1);
    expect(transcript.run_id).toBe("m7-test");
    expect(transcript.status).toBe("running");
    expect(transcript.builder_request).toBe("Add a priority queue");
    expect(transcript.before).toEqual({ operations: [], views: [], tables: [] });
    expect(transcript.after).toBeNull();
    expect(transcript.events.map((event) => event.kind)).toEqual(["builder_message"]);
    expect(transcript.events[0]).toMatchObject({
      actor: "builder",
      summary: "Add a priority queue",
    });
  });

  test("merges adjacent assistant text deltas into one assistant message", () => {
    const transcript = createAgentExecutionTranscript({
      runId: "m7-test",
      builderRequest: "Add a priority queue",
      before: { operations: [], views: [], tables: [] },
    });

    recordAssistantTextDelta(transcript, "I will add ");
    recordAssistantTextDelta(transcript, "a governed operation.");
    recordToolCall(transcript, {
      callId: "call-1",
      tool: "definition.apply",
      input: { changes: [] },
    });
    recordAssistantTextDelta(transcript, "The proposal is waiting for approval.");

    const assistantMessages = transcript.events.filter((event) => event.kind === "assistant_message");
    expect(assistantMessages).toHaveLength(2);
    expect(assistantMessages[0]?.summary).toBe("I will add a governed operation.");
    expect(assistantMessages[1]?.summary).toBe("The proposal is waiting for approval.");
  });

  test("correlates permission prompt, approval response, tool result, and completion", () => {
    const transcript = createAgentExecutionTranscript({
      runId: "m7-test",
      builderRequest: "Add a priority queue",
      before: { operations: [], views: [], tables: [] },
    });

    recordToolCall(transcript, {
      callId: "call-1",
      tool: "definition.apply",
      input: { changes: [{ kind: "add_operation", operation: "list_priority_queue" }] },
    });
    recordPermissionPrompt(transcript, {
      promptId: "prompt-1",
      tool: "definition.apply",
      detail: { change_count: 3 },
    });
    recordApprovalResponse(transcript, {
      promptId: "prompt-1",
      tool: "definition.apply",
      decision: "allow",
    });
    recordToolResult(transcript, {
      callId: "call-1",
      tool: "definition.apply",
      ok: true,
      result: { applied: true },
    });
    recordCompletion(transcript, {
      status: "completed",
      after: { operations: ["list_priority_queue"], views: ["priority_queue"], tables: [] },
      summary: "Priority Queue is live.",
    });

    expect(transcript.status).toBe("completed");
    expect(transcript.after).toEqual({
      operations: ["list_priority_queue"],
      views: ["priority_queue"],
      tables: [],
    });
    expect(transcript.events.map((event) => event.kind)).toEqual([
      "builder_message",
      "tool_call",
      "permission_prompt",
      "approval_response",
      "tool_result",
      "completion",
    ]);
    expect(transcript.events[3]).toMatchObject({
      actor: "builder",
      decision: "allow",
      prompt_id: "prompt-1",
      tool: "definition.apply",
    });
  });

  test("writes and reads the transcript from the workspace data directory", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m7-transcript-"));
    try {
      const transcript = createAgentExecutionTranscript({
        runId: "m7-test",
        builderRequest: "Add a priority queue",
        before: { operations: [] },
      });

      const path = writeAgentExecutionTranscript(workspace, transcript);
      const readBack = await readAgentExecutionTranscript(workspace);

      expect(path.endsWith("data/m7-agent-execution-transcript.json")).toBe(true);
      expect(readBack).toEqual(transcript);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
