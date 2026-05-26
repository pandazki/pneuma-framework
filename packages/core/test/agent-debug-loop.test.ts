import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFileBuildThreadStore,
  runAgentDebugLoop,
  type AgentDebugAttemptRunnerInput,
  type AgentDebugCheckRunnerInput,
} from "../src/index.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "pneuma-agent-debug-loop-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

test("runAgentDebugLoop passes on the first attempt and records BuildThread evidence", async () => {
  const store = createFileBuildThreadStore({ workspace });
  const thread = await store.startThread({
    profile_id: "workflow-studio",
    app_id: "workflow-app",
    builder_user_id: "bob",
  });
  const attemptInputs: AgentDebugAttemptRunnerInput[] = [];
  const checkInputs: AgentDebugCheckRunnerInput[] = [];

  const result = await runAgentDebugLoop({
    session_id: "debug-1",
    budget: { max_attempts: 2 },
    checks: [{ id: "typecheck", description: "Run typecheck." }],
    thread_store: store,
    thread_id: thread.thread_id,
    run_attempt: async (input) => {
      attemptInputs.push(input);
      return {
        ok: true,
        backend_type: "fake-code-agent",
        summary: "Updated the draft.",
        output: "agent done",
      };
    },
    run_check: async (input) => {
      checkInputs.push(input);
      return { ok: true, message: "typecheck passed", output: "ok" };
    },
  });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected debug loop to pass");
  expect(result.proposal_ready).toBe(true);
  expect(result.session.status).toBe("passed");
  expect(result.session.attempts).toHaveLength(1);
  expect(result.passed_attempt.attempt_index).toBe(1);
  expect(attemptInputs[0]?.attempt_index).toBe(1);
  expect(attemptInputs[0]?.feedback).toBeUndefined();
  expect(checkInputs[0]?.attempt.attempt_index).toBe(1);

  const turns = await store.listTurns(thread.thread_id);
  expect(turns.map((turn) => turn.kind)).toEqual(["host_event", "host_event"]);
  expect(turns.map((turn) => turn.kind === "host_event" ? turn.label : "")).toEqual([
    "agent_debug_attempt",
    "agent_debug_session",
  ]);
});

test("runAgentDebugLoop feeds failed check evidence into the next attempt", async () => {
  const attemptInputs: AgentDebugAttemptRunnerInput[] = [];
  let checkCount = 0;

  const result = await runAgentDebugLoop({
    session_id: "debug-repair",
    budget: { max_attempts: 2 },
    checks: [{ id: "workflow-valid", description: "Validate workflow definition." }],
    run_attempt: async (input) => {
      attemptInputs.push(input);
      return {
        ok: true,
        backend_type: "fake-code-agent",
        summary: input.attempt_index === 1 ? "Initial draft." : "Repaired draft.",
      };
    },
    run_check: async () => {
      checkCount += 1;
      return checkCount === 1
        ? { ok: false, message: "view legal_queue references missing stage legal_review" }
        : { ok: true, message: "workflow definition is valid" };
    },
  });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected second attempt to pass");
  expect(result.session.attempts.map((attempt) => attempt.status)).toEqual([
    "failed_checks",
    "passed",
  ]);
  expect(attemptInputs).toHaveLength(2);
  expect(attemptInputs[1]?.feedback?.summary).toContain("workflow-valid failed");
  expect(attemptInputs[1]?.feedback?.failed_checks[0]?.message).toContain("missing stage");
});

test("runAgentDebugLoop exhausts budget without producing a proposal-ready result", async () => {
  const store = createFileBuildThreadStore({ workspace });
  const thread = await store.startThread({
    profile_id: "workflow-studio",
    app_id: "workflow-app",
    builder_user_id: "bob",
  });

  const result = await runAgentDebugLoop({
    session_id: "debug-budget",
    budget: { max_attempts: 2 },
    checks: [{ id: "build", description: "Build generated app." }],
    thread_store: store,
    thread_id: thread.thread_id,
    run_attempt: async () => ({
      ok: true,
      backend_type: "fake-code-agent",
      summary: "Tried to fix the draft.",
    }),
    run_check: async () => ({ ok: false, message: "build failed", output: "TS2322" }),
  });

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected budget exhaustion");
  expect(result.reason).toBe("budget_exhausted");
  expect(result.proposal_ready).toBe(false);
  expect(result.session.status).toBe("budget_exhausted");
  expect(result.session.attempts).toHaveLength(2);
  expect(result.session.attempts.every((attempt) => attempt.status === "failed_checks")).toBe(true);

  const turns = await store.listTurns(thread.thread_id);
  expect(turns.every((turn) => turn.kind === "host_event")).toBe(true);
  expect(turns.some((turn) => turn.kind === "agent_proposal")).toBe(false);
});
