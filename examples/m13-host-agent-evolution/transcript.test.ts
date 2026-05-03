import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHostAgentTranscript,
  recordAgentMessage,
  recordApprovalPrompt,
  recordApprovalResponse,
  recordCompletion,
  recordToolCall,
  recordToolResult,
  transcriptPath,
  writeHostAgentTranscript,
} from "./transcript.js";

describe("M13 host agent transcript", () => {
  test("records one Builder intent, one approval, one tool call, and completion", () => {
    const transcript = createHostAgentTranscript({
      runId: "m13-run-1",
      appId: "team-knowledge-inbox",
      versionId: "v0",
      builderUserId: "builder-alice",
      builderRequest: "Add Priority Queue.",
      before: { operations: ["list_inbox_items"] },
    });

    recordAgentMessage(transcript, "I will propose one governed change-set.");
    recordToolCall(transcript, {
      callId: "call-1",
      tool: "definition.apply_change_set",
      input: { summary: "Add Priority Queue" },
    });
    recordApprovalPrompt(transcript, {
      promptId: "prompt-1",
      tool: "definition.apply_change_set",
      summary: "Add Priority Queue",
      detail: { impact: "adds priority queue capability" },
    });
    recordApprovalResponse(transcript, {
      promptId: "prompt-1",
      tool: "definition.apply_change_set",
      decision: "allow",
    });
    recordToolResult(transcript, {
      callId: "call-1",
      tool: "definition.apply_change_set",
      ok: true,
      result: { ok: true },
    });
    recordCompletion(transcript, {
      status: "completed",
      after: { operations: ["list_inbox_items", "list_priority_queue"] },
      summary: "Priority Queue is ready.",
    });

    expect(transcript.status).toBe("completed");
    expect(transcript.app_id).toBe("team-knowledge-inbox");
    expect(transcript.version_id).toBe("v0");
    expect(transcript.events.map((event) => event.kind)).toEqual([
      "builder_message",
      "agent_message",
      "tool_call",
      "approval_prompt",
      "approval_response",
      "tool_result",
      "completion",
    ]);
    expect(transcript.events.filter((event) => event.kind === "approval_prompt")).toHaveLength(1);
    expect(transcript.events.filter((event) => event.kind === "approval_response")).toHaveLength(1);
  });

  test("writes transcript under the generated app version workspace", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m13-transcript-"));
    try {
      const transcript = createHostAgentTranscript({
        runId: "m13-run-2",
        appId: "team-knowledge-inbox",
        versionId: "v0",
        builderUserId: "builder-alice",
        builderRequest: "Add Priority Queue.",
        before: {},
      });
      const path = writeHostAgentTranscript(workspace, transcript);

      expect(path).toBe(join(workspace, ".pneuma-host", "agent-transcripts", "m13-run-2.json"));
      expect(transcriptPath(workspace, "m13-run-2")).toBe(path);
      expect(existsSync(path)).toBe(true);
      const persisted = JSON.parse(readFileSync(path, "utf8"));
      expect(persisted.run_id).toBe("m13-run-2");
      expect(persisted.builder_request).toBe("Add Priority Queue.");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
