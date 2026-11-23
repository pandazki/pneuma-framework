import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { declineServerRequest, isCodexTurnCompletionTimeout, runCodexAgent } from "../src/codex-app-server.js";

describe("isCodexTurnCompletionTimeout", () => {
  test("matches a turn-completion timeout", () => {
    expect(
      isCodexTurnCompletionTimeout(new Error("Timed out waiting for Codex turn completion after 900000ms")),
    ).toBe(true);
  });

  test("does not match other errors", () => {
    expect(isCodexTurnCompletionTimeout(new Error("codex rpc error: {...}"))).toBe(false);
    expect(isCodexTurnCompletionTimeout(new Error("network down"))).toBe(false);
    expect(isCodexTurnCompletionTimeout("nope")).toBe(false);
    expect(isCodexTurnCompletionTimeout(null)).toBe(false);
  });
});

describe("declineServerRequest", () => {
  test("answers each server request in the shape the protocol expects", () => {
    expect(declineServerRequest("item/commandExecution/requestApproval")).toEqual({ decision: "decline" });
    expect(declineServerRequest("item/fileChange/requestApproval")).toEqual({ decision: "decline" });
    expect(declineServerRequest("mcpServer/elicitation/request")).toEqual({ action: "decline", content: null });
    expect(declineServerRequest("item/permissions/requestApproval")).toEqual({ permissions: {} });
    expect(declineServerRequest("item/tool/requestUserInput")).toEqual({ answers: {} });
    expect(declineServerRequest("item/tool/call")).toEqual({ contentItems: [], success: false });
  });

  test("the pre-v2 approval requests are refused with ReviewDecision's own word", () => {
    expect(declineServerRequest("execCommandApproval")).toEqual({ decision: "denied" });
    expect(declineServerRequest("applyPatchApproval")).toEqual({ decision: "denied" });
  });

  test("requests with no refusal shape get no result, so the client answers with an error", () => {
    expect(declineServerRequest("account/chatgptAuthTokens/refresh")).toBeNull();
    expect(declineServerRequest("attestation/generate")).toBeNull();
  });
});

// The real transport needs a logged-in `codex` CLI and is exercised by host E2E
// runs. These tests drive the same client against a scripted app-server that
// speaks the documented wire shape.
describe("runCodexAgent against a scripted app-server", () => {
  const fake = join(import.meta.dir, "fake-codex.mjs");
  let draft: string;

  beforeEach(() => {
    chmodSync(fake, 0o755);
    draft = mkdtempSync(join(tmpdir(), "codex-draft-"));
  });
  afterEach(() => {
    delete process.env.FAKE_CODEX_SCENARIO;
    rmSync(draft, { recursive: true, force: true });
  });

  const run = (scenario: string) => {
    process.env.FAKE_CODEX_SCENARIO = scenario;
    return runCodexAgent({ draftRoot: draft, prompt: "add a field", baseInstructions: "only edit src/", codexBin: fake, timeoutMs: 5_000, idleGraceMs: 400 });
  };

  test("resolves on turn/completed with status completed and reports the last agent message", async () => {
    const result = await run("completed");
    expect(result).toEqual({ threadId: "thr_fake", status: "completed", finalMessage: "done editing" });
  });

  test("sends host instructions and the request as text inputs, with a documented sandbox policy", async () => {
    await run("completed");
    const params = JSON.parse(readFileSync(join(draft, "turn-input.json"), "utf8"));
    expect(params.input).toEqual([
      { type: "text", text: "only edit src/" },
      { type: "text", text: "add a field" },
    ]);
    expect(params.approvalPolicy).toBe("never");
    expect(params.sandboxPolicy).toEqual({ type: "workspaceWrite", writableRoots: [draft], networkAccess: true });
  });

  test("rejects when turn/completed reports a failed turn", async () => {
    await expect(run("failed")).rejects.toThrow("codex turn failed: model refused");
  });

  test("still accepts the idle fallback of older CLIs", async () => {
    expect((await run("idle")).status).toBe("idle-fallback");
  });

  // codex-cli 0.167 sends thread/status/changed -> idle first and turn/completed right after.
  test("an idle thread does not pre-empt the turn/completed that follows it", async () => {
    expect((await run("idle-then-completed")).status).toBe("completed");
    await expect(run("idle-then-failed")).rejects.toThrow("codex turn failed: model refused");
  });

  test("a thread that resumes after going idle is not cut off by the idle grace period", async () => {
    // The grace period (400ms here) would end the turn at 400ms; the work finishes at 950ms.
    expect(await run("idle-then-active")).toEqual({ threadId: "thr_fake", status: "completed", finalMessage: "done after resuming" });
  });

  test("declines a server-initiated approval instead of mistaking it for a response", async () => {
    const result = await run("approval");
    expect(result.status).toBe("completed");
    const answer = JSON.parse(readFileSync(join(draft, "approval-answer.json"), "utf8"));
    expect(answer).toEqual({ id: 1, result: { decision: "decline" } });
  });
});
