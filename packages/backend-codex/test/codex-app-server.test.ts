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

  /** The pid a fake process recorded for itself in `pidFile` (in the draft), once it has. */
  const recordedPid = (pidFile: string): number | undefined => {
    const path = join(draft, pidFile);
    const pid = existsSync(path) ? Number(readFileSync(path, "utf8")) : 0;
    return pid > 1 ? pid : undefined;
  };

  const alive = (pidFile: string): boolean => {
    const pid = recordedPid(pidFile);
    try {
      return pid !== undefined && process.kill(pid, 0);
    } catch {
      return false;
    }
  };

  const expectStillWriting = async (): Promise<void> => {
    expect(alive("writer.pid")).toBe(true);
    const size = progressSize();
    await Bun.sleep(100);
    expect(progressSize()).toBeGreaterThan(size);
  };

  // The adapter leaves these writers running, so the test stops exactly the pid the writer recorded.
  const stopWriter = (): void => {
    const pid = recordedPid("writer.pid");
    try {
      if (pid !== undefined) process.kill(pid, "SIGKILL");
    } catch {
      // already gone
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

  // Codex starts shell-tool commands in a new session.
  test("an app-server that stops its own command on end of input gets the grace period to, and the adapter settles after it without a signal", async () => {
    const lines: string[] = [];
    const started = Date.now();
    const err = await run("session-writer-stopped-on-eof", { timeoutMs: 400, killGraceMs: 3_000, log: (line) => lines.push(line) }).catch(
      (e: unknown) => e,
    );
    expect(isCodexTurnCompletionTimeout(err)).toBe(true);
    // The command takes 150ms to finish after SIGTERM, and the app-server exits once it has.
    expect(existsSync(join(draft, "stopped.txt"))).toBe(true);
    expect(alive("writer.pid")).toBe(false);
    expect(lines.filter((line) => /SIGTERM|SIGKILL/.test(line))).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2_000);
    await expectStoppedWriting();
  });

  test("limit: a timeout settles while a command the app-server started in a new session, and did not stop, is still writing", async () => {
    try {
      const err = await run("session-writer", { timeoutMs: 600, killGraceMs: 200 }).catch((e: unknown) => e);
      expect(isCodexTurnCompletionTimeout(err)).toBe(true);
      await expectStillWriting();
    } finally {
      stopWriter();
    }
  });

  test("limit: a completed turn returns while a command a tool shell left in the background (`cmd &`) is still writing", async () => {
    try {
      expect((await run("completed-with-shell-background-writer", { killGraceMs: 200 })).status).toBe("completed");
      await expectStillWriting();
    } finally {
      stopWriter();
    }
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

  test("never runs ps, on a completed, a timed-out or an aborted turn", () => {
    const bin = mkdtempSync(join(tmpdir(), "fake-ps-"));
    const calls = join(bin, "calls");
    writeFileSync(join(bin, "ps"), `#!/bin/sh\necho called >> '${calls}'\nexit 1\n`);
    chmodSync(join(bin, "ps"), 0o755);
    // PATH set when a process starts reaches both spawn APIs; changing process.env.PATH here would not reach Bun.spawn.
    const inChild = (code: string) =>
      Bun.spawnSync([process.execPath, "-e", code], { cwd: draft, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, timeout: 15_000 });
    try {
      inChild(`Bun.spawnSync(["ps"]); require("node:child_process").spawnSync("ps");`);
      expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(2);
      rmSync(calls);
      const out = inChild(`
        import { isCodexTurnCompletionTimeout, runCodexAgent } from ${JSON.stringify(join(import.meta.dir, "../src/codex-app-server.ts"))};
        const run = (scenario, timeoutMs, signal) => {
          process.env.FAKE_CODEX_SCENARIO = scenario;
          return runCodexAgent({ draftRoot: process.cwd(), prompt: "p", baseInstructions: "", codexBin: ${JSON.stringify(fake)}, timeoutMs, killGraceMs: 100, signal })
            .then(() => "completed", (e) => (isCodexTurnCompletionTimeout(e) ? "timeout" : e.message));
        };
        const completed = await run("completed", 5000);
        const timedOut = await run("ignore-sigterm-writer", 300);
        const abort = new AbortController();
        setTimeout(() => abort.abort(), 300);
        console.log(JSON.stringify([completed, timedOut, await run("ignore-sigterm-writer", 5000, abort.signal)]));
      `);
      expect(out.stdout.toString().trim()).toBe(JSON.stringify(["completed", "timeout", "Codex turn aborted"]));
      expect(existsSync(calls)).toBe(false);
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  }, 20_000);

  test("an already aborted signal rejects without starting the app-server", async () => {
    const controller = new AbortController();
    controller.abort();
    // A binary that does not exist would fail to spawn, so the abort error shows nothing was started.
    await expect(run("completed", { signal: controller.signal, codexBin: join(draft, "no-such-codex") })).rejects.toThrow("Codex turn aborted");
  });
});
