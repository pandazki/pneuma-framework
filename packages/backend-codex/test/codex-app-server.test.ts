import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

  const run = (
    scenario: string,
    extra: { timeoutMs?: number; killGraceMs?: number; signal?: AbortSignal; codexBin?: string; log?: (line: string) => void } = {},
  ) => {
    process.env.FAKE_CODEX_SCENARIO = scenario;
    return runCodexAgent({
      draftRoot: draft,
      prompt: "add a field",
      baseInstructions: "only edit src/",
      codexBin: extra.codexBin ?? fake,
      timeoutMs: extra.timeoutMs ?? 5_000,
      idleGraceMs: 400,
      killGraceMs: extra.killGraceMs,
      signal: extra.signal,
      log: extra.log,
    });
  };

  const progressSize = (): number => {
    const path = join(draft, "progress.log");
    return existsSync(path) ? statSync(path).size : 0;
  };

  const expectStoppedWriting = async (): Promise<void> => {
    const sizeAtSettle = progressSize();
    expect(sizeAtSettle).toBeGreaterThan(0);
    await Bun.sleep(200);
    expect(progressSize()).toBe(sizeAtSettle);
  };

  /** Whether the process whose pid the fake recorded in `pidFile` (in the draft) is still running. */
  const alive = (pidFile: string): boolean => {
    try {
      process.kill(Number(readFileSync(join(draft, pidFile), "utf8")), 0);
      return true;
    } catch {
      return false;
    }
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

  test("a timeout settles only after an app-server that ignores SIGTERM has stopped writing", async () => {
    const started = Date.now();
    const err = await run("ignore-sigterm-writer", { timeoutMs: 300, killGraceMs: 200 }).catch((e: unknown) => e);
    expect(isCodexTurnCompletionTimeout(err)).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(450);
    await expectStoppedWriting();
  });

  test("a timeout also stops a command the app-server started that ignores SIGTERM", async () => {
    const started = Date.now();
    const err = await run("grandchild-writer", { timeoutMs: 500, killGraceMs: 2_000 }).catch((e: unknown) => e);
    expect(isCodexTurnCompletionTimeout(err)).toBe(true);
    // The app-server itself exits on end of input; the leftover command is killed without waiting out the grace period.
    expect(Date.now() - started).toBeLessThan(2_000);
    await expectStoppedWriting();
  });

  test("a completed turn also stops a command still running in the background", async () => {
    expect((await run("completed-with-background-writer", { killGraceMs: 200 })).status).toBe("completed");
    await expectStoppedWriting();
  });

  test("an abort stops the turn like a timeout, but is not classified as one", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    const started = Date.now();
    const err = await run("ignore-sigterm-writer", { killGraceMs: 200, signal: controller.signal }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("Codex turn aborted");
    expect(isCodexTurnCompletionTimeout(err)).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(450);
    await expectStoppedWriting();
  });

  test("an abort during the kill grace period of a timeout still rejects as aborted", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 400);
    const err = await run("ignore-sigterm-writer", { timeoutMs: 300, killGraceMs: 300, signal: controller.signal }).catch((e: unknown) => e);
    expect((err as Error).message).toContain("Codex turn aborted");
    expect(isCodexTurnCompletionTimeout(err)).toBe(false);
    await expectStoppedWriting();
  });

  // Codex starts shell-tool commands in a new session, which signalling the app-server's group does not reach.
  test("a timeout also stops a command the app-server started in a new session", async () => {
    const err = await run("session-writer", { timeoutMs: 300, killGraceMs: 200 }).catch((e: unknown) => e);
    expect(isCodexTurnCompletionTimeout(err)).toBe(true);
    expect(alive("writer.pid")).toBe(false);
    await expectStoppedWriting();
  });

  test("an abort also stops a command the app-server started in a new session", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    const err = await run("session-writer", { killGraceMs: 200, signal: controller.signal }).catch((e: unknown) => e);
    expect((err as Error).message).toContain("Codex turn aborted");
    expect(alive("writer.pid")).toBe(false);
    await expectStoppedWriting();
  });

  test("an app-server that stops its own commands on end of input is given the time to, and is not signalled", async () => {
    const lines: string[] = [];
    const started = Date.now();
    const err = await run("session-writer-stopped-on-eof", { timeoutMs: 400, killGraceMs: 3_000, log: (line) => lines.push(line) }).catch(
      (e: unknown) => e,
    );
    expect(isCodexTurnCompletionTimeout(err)).toBe(true);
    // The command finishes 150ms after the app-server has exited; the adapter waited for that.
    expect(existsSync(join(draft, "stopped.txt"))).toBe(true);
    expect(lines.filter((line) => /SIGTERM|SIGKILL|outside its process group/.test(line))).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(alive("writer.pid")).toBe(false);
    await expectStoppedWriting();
  });

  test("a completed turn also stops a command left running in a new session", async () => {
    expect((await run("completed-with-session-writer", { killGraceMs: 200 })).status).toBe("completed");
    expect(alive("writer.pid")).toBe(false);
    await expectStoppedWriting();
  });

  for (const request of ["initialize", "thread/start", "turn/start"]) {
    test(`a timeout also ends a turn whose ${request} is never answered, and stops the app-server`, async () => {
      const started = Date.now();
      const err = await run(`no-answer-${request.replace("/", "-")}`, { timeoutMs: 200, killGraceMs: 50 }).catch((e: unknown) => e);
      expect(isCodexTurnCompletionTimeout(err)).toBe(true);
      expect(Date.now() - started).toBeLessThan(1_500);
      expect(alive("app-server.pid")).toBe(false);
    }, 3_000);
  }

  test("when ps cannot be run, the app-server's process group is still stopped and the log says so once", async () => {
    const bin = mkdtempSync(join(tmpdir(), "no-ps-"));
    writeFileSync(join(bin, "ps"), "#!/bin/sh\nexit 1\n");
    chmodSync(join(bin, "ps"), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;
    const lines: string[] = [];
    try {
      // Looks at the process table three times: on close, before SIGTERM and before SIGKILL.
      const err = await run("ignore-sigterm-writer", { timeoutMs: 300, killGraceMs: 50, log: (line) => lines.push(line) }).catch((e: unknown) => e);
      expect(isCodexTurnCompletionTimeout(err)).toBe(true);
    } finally {
      process.env.PATH = path;
      rmSync(bin, { recursive: true, force: true });
    }
    expect(lines.filter((line) => line.includes("cannot read the process table"))).toHaveLength(1);
    await expectStoppedWriting();
  });

  test("an already aborted signal rejects without starting the app-server", async () => {
    const controller = new AbortController();
    controller.abort();
    // A binary that does not exist would fail to spawn, so the abort error shows nothing was started.
    await expect(run("completed", { signal: controller.signal, codexBin: join(draft, "no-such-codex") })).rejects.toThrow("Codex turn aborted");
  });
});
