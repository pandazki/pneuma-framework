import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFileBuildThreadStore,
  packBuildTurnsForRoleContent,
  pneumaTurnsToAnthropicMessages,
  pneumaTurnsToOpencodeMessages,
  recordBuildThreadExecutionOutcome,
  roleContentBuildTurnPacker,
  type BuildTurn,
  type BuildTurnMessagePacker,
  type BuildTurnRoleContentMessage,
} from "../src/build-thread.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "pneuma-build-thread-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

test("FileBuildThreadStore starts a BuildThread in the Creation Host workspace", async () => {
  const store = createFileBuildThreadStore({ workspace });

  const thread = await store.startThread({
    profile_id: "dev-board",
    app_id: "app-123",
    builder_user_id: "bob",
  });

  expect(thread.thread_id).toMatch(/^bthread-\d+-[0-9a-f]+$/);
  expect(thread.profile_id).toBe("dev-board");
  expect(thread.app_id).toBe("app-123");
  expect(thread.builder_user_id).toBe("bob");
  expect(thread.status).toBe("open");
  expect(thread.created_at_ms).toBeGreaterThan(0);
  expect(thread.updated_at_ms).toBe(thread.created_at_ms);
  expect(existsSync(join(workspace, ".pneuma", "build-threads.json"))).toBe(true);
});

test("appendTurn enriches canonical pneuma turns and listTurns returns them in order", async () => {
  const store = createFileBuildThreadStore({ workspace });
  const thread = await store.startThread({
    profile_id: "dev-board",
    app_id: "app-123",
    builder_user_id: "bob",
  });

  const user = await store.appendTurn(thread.thread_id, {
    kind: "user",
    text: "Add a priority column to my board.",
  });
  const proposal = await store.appendTurn(thread.thread_id, {
    kind: "agent_proposal",
    proposal_id: "proposal-1",
    summary: "Add priority support",
    rationale: "Builder wants triage order.",
    tool_calls: [{ name: "add_priority_column", arguments: { levels: ["P1", "P2", "P3"] } }],
  });
  const decision = await store.appendTurn(thread.thread_id, {
    kind: "user_decision",
    proposal_id: "proposal-1",
    decision: "approved",
  });
  const receipt = await store.appendTurn(thread.thread_id, {
    kind: "host_execution_receipt",
    proposal_id: "proposal-1",
    status: "completed",
    evidence: { version_id: "v1", rows_migrated: 3 },
  });

  expect(user.turn_index).toBe(0);
  expect(proposal.turn_index).toBe(1);
  expect(decision.turn_index).toBe(2);
  expect(receipt.turn_index).toBe(3);
  expect(receipt.thread_id).toBe(thread.thread_id);
  expect(receipt.ts_ms).toBeGreaterThanOrEqual(user.ts_ms);

  const turns = await store.listTurns(thread.thread_id);
  expect(turns.map((turn) => turn.kind)).toEqual([
    "user",
    "agent_proposal",
    "user_decision",
    "host_execution_receipt",
  ]);
});

test("closeThread prevents later turn append", async () => {
  const store = createFileBuildThreadStore({ workspace });
  const thread = await store.startThread({
    profile_id: "dev-board",
    app_id: "app-123",
    builder_user_id: "bob",
  });

  await store.closeThread(thread.thread_id);

  await expect(store.appendTurn(thread.thread_id, {
    kind: "user",
    text: "continue",
  })).rejects.toThrow("closed");
});

test("load is tolerant of missing and corrupted build-thread files", async () => {
  const store = createFileBuildThreadStore({ workspace });
  expect(await store.listThreads()).toEqual([]);

  const filePath = join(workspace, ".pneuma", "build-threads.json");
  await Bun.write(filePath, "not json");

  expect(await store.listThreads()).toEqual([]);
});

test("packBuildTurnsForRoleContent encodes proposal, decision, and receipt turns canonically", () => {
  const turns: BuildTurn[] = [
    turn("user", 0, { text: "Add priority" }),
    turn("agent_proposal", 1, {
      proposal_id: "proposal-1",
      summary: "Add priority support",
      rationale: "It helps triage.",
      tool_calls: [{ name: "add_priority_column", arguments: { levels: ["P1"] } }],
    }),
    turn("user_decision", 2, {
      proposal_id: "proposal-1",
      decision: "approved",
      reason: "Looks right",
    }),
    turn("host_execution_receipt", 3, {
      proposal_id: "proposal-1",
      status: "completed",
      evidence: { version_id: "v1" },
    }),
  ];

  const messages = packBuildTurnsForRoleContent(turns);

  expect(messages).toEqual([
    { role: "user", content: "Add priority" },
    {
      role: "assistant",
      content: [
        "[pneuma:agent_proposal proposal_id=proposal-1]",
        "Summary: Add priority support",
        "Rationale: It helps triage.",
        "Tool calls:",
        JSON.stringify([{ name: "add_priority_column", arguments: { levels: ["P1"] } }], null, 2),
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "[pneuma:user_decision proposal_id=proposal-1 decision=approved]",
        "Reason: Looks right",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "[pneuma:host_execution_receipt proposal_id=proposal-1 status=completed]",
        "Evidence:",
        JSON.stringify({ version_id: "v1" }, null, 2),
      ].join("\n"),
    },
  ]);
});

test("packBuildTurnsForRoleContent encodes rejected execution receipts", () => {
  const turns: BuildTurn[] = [
    turn("host_execution_receipt", 0, {
      proposal_id: "proposal-rejected",
      status: "rejected",
      evidence: { message: "Builder rejected the proposal." },
    }),
  ];

  expect(packBuildTurnsForRoleContent(turns)).toEqual([
    {
      role: "user",
      content: [
        "[pneuma:host_execution_receipt proposal_id=proposal-rejected status=rejected]",
        "Evidence:",
        JSON.stringify({ message: "Builder rejected the proposal." }, null, 2),
      ].join("\n"),
    },
  ]);
});

test("packer cap keeps the anchor turn and the latest turns", () => {
  const turns: BuildTurn[] = [
    turn("user", 0, { text: "initial app goal" }),
    turn("agent_text", 1, { text: "working" }),
    turn("user", 2, { text: "follow-up one" }),
    turn("agent_text", 3, { text: "more work" }),
    turn("user", 4, { text: "latest ask" }),
  ];

  const messages = packBuildTurnsForRoleContent(turns, {
    capTurns: 3,
    alwaysKeepAnchor: true,
  });

  expect(messages.map((message) => message.content)).toEqual([
    "initial app goal",
    "more work",
    "latest ask",
  ]);
});

test("roleContentBuildTurnPacker exposes the default backend-agnostic core packer", () => {
  const turns: BuildTurn[] = [
    turn("agent_clarification", 0, { question: "Which provider should this use?" }),
  ];
  const packer: BuildTurnMessagePacker<BuildTurnRoleContentMessage> = roleContentBuildTurnPacker;

  expect(packer.target).toBe("role-content");
  expect(packer.pack(turns)).toEqual([
    {
      role: "assistant",
      content: "[pneuma:agent_clarification]\nWhich provider should this use?",
    },
  ]);
});

test("legacy provider-named helpers are compatibility aliases for role/content packing", () => {
  const turns: BuildTurn[] = [
    turn("user", 0, { text: "initial app goal" }),
  ];

  expect(pneumaTurnsToAnthropicMessages(turns)).toEqual(packBuildTurnsForRoleContent(turns));
  expect(pneumaTurnsToOpencodeMessages(turns)).toEqual(packBuildTurnsForRoleContent(turns));
});

test("recordBuildThreadExecutionOutcome appends decision and receipt turns together", async () => {
  const store = createFileBuildThreadStore({ workspace });
  const thread = await store.startThread({
    profile_id: "dev-board",
    app_id: "app-123",
    builder_user_id: "bob",
  });

  const outcome = await recordBuildThreadExecutionOutcome(store, {
    thread_id: thread.thread_id,
    proposal_id: "proposal-1",
    decision: "approved",
    reason: "Ship it.",
    receipt: {
      status: "completed",
      evidence: { changed_files: ["src/widget.tsx"] },
    },
  });

  expect(outcome.decision_turn.kind).toBe("user_decision");
  expect(outcome.decision_turn.proposal_id).toBe("proposal-1");
  expect(outcome.decision_turn.decision).toBe("approved");
  expect(outcome.receipt_turn.kind).toBe("host_execution_receipt");
  expect(outcome.receipt_turn.proposal_id).toBe("proposal-1");
  expect(outcome.receipt_turn.status).toBe("completed");
  expect(outcome.receipt_turn.turn_index).toBe(outcome.decision_turn.turn_index + 1);
  expect((await store.listTurns(thread.thread_id)).map((turn) => turn.kind)).toEqual([
    "user_decision",
    "host_execution_receipt",
  ]);
});

function turn<K extends BuildTurn["kind"]>(
  kind: K,
  index: number,
  fields: Omit<Extract<BuildTurn, { kind: K }>, "kind" | "turn_id" | "thread_id" | "turn_index" | "ts_ms">,
): Extract<BuildTurn, { kind: K }> {
  return {
    kind,
    turn_id: `turn-${index}`,
    thread_id: "bthread-test",
    turn_index: index,
    ts_ms: 1000 + index,
    ...fields,
  } as Extract<BuildTurn, { kind: K }>;
}
