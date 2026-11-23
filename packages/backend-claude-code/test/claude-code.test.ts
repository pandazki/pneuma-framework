import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCodeArgs, isClaudeCodeTurnCompletionTimeout, runClaudeCodeAgent } from "../src/claude-code.js";

describe("claudeCodeArgs", () => {
  test("builds a non-interactive, stream-json, accept-edits invocation without --bare", () => {
    const args = claudeCodeArgs({ draftRoot: "/d", prompt: "add a field", appendSystemPrompt: "only edit src/", model: "sonnet" });
    expect(args.slice(0, 2)).toEqual(["-p", "add a field"]);
    expect(args).toContain("stream-json");
    expect(args).toContain("--verbose");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("acceptEdits");
    expect(args[args.indexOf("--allowedTools") + 1]).toContain("Bash(npm test)");
    expect(args[args.indexOf("--append-system-prompt") + 1]).toBe("only edit src/");
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
    expect(args).not.toContain("--bare");
  });

  test("resumes a session when asked", () => {
    const args = claudeCodeArgs({ draftRoot: "/d", prompt: "again", resumeSessionId: "sess_1" });
    expect(args[args.indexOf("--resume") + 1]).toBe("sess_1");
  });
});

// The real CLI needs a login and is exercised by host E2E runs. These tests
// drive the lane against a scripted process that emits the documented events.
describe("runClaudeCodeAgent against a scripted CLI", () => {
  const fake = join(import.meta.dir, "fake-claude.mjs");
  let draft: string;

  beforeEach(() => {
    chmodSync(fake, 0o755);
    draft = mkdtempSync(join(tmpdir(), "claude-draft-"));
  });
  afterEach(() => rmSync(draft, { recursive: true, force: true }));

  const run = (
    scenario: string,
    timeoutMs = 5_000,
    extra: { killGraceMs?: number; env?: Record<string, string>; signal?: AbortSignal; claudeBin?: string; log?: (line: string) => void } = {},
  ) =>
    runClaudeCodeAgent({
      draftRoot: draft,
      prompt: "add a field",
      claudeBin: extra.claudeBin ?? fake,
      timeoutMs,
      killGraceMs: extra.killGraceMs,
      signal: extra.signal,
      env: { FAKE_CLAUDE_SCENARIO: scenario, ...extra.env },
      log: extra.log,
    });

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

  const writerAlive = (): boolean => {
    try {
      process.kill(Number(readFileSync(join(draft, "writer.pid"), "utf8")), 0);
      return true;
    } catch {
      return false;
    }
  };

  test("runs in the draft and returns the final result event", async () => {
    const result = await run("success");
    expect(result).toEqual({ sessionId: "sess_fake", result: "Added the field.", numTurns: 3, totalCostUsd: 0.01, permissionDenials: [] });
    expect(existsSync(join(draft, "edited.txt"))).toBe(true);
    expect(JSON.parse(readFileSync(join(draft, "claude-args.json"), "utf8"))[0]).toBe("-p");
  });

  test("rejects when the result event reports an error", async () => {
    await expect(run("error")).rejects.toThrow("claude turn failed (error_during_execution): boom");
  });

  test("rejects when the process ends without a result event", async () => {
    await expect(run("silent")).rejects.toThrow("no result event: Not logged in");
  });

  test("a hung turn is a recognizable timeout, never a success", async () => {
    const err = await run("hang", 300).catch((e: unknown) => e);
    expect(isClaudeCodeTurnCompletionTimeout(err)).toBe(true);
  });

  test("a timeout settles only after a CLI that ignores SIGINT has stopped writing", async () => {
    const started = Date.now();
    const err = await run("ignore-sigint-writer", 300, { killGraceMs: 200 }).catch((e: unknown) => e);
    expect(isClaudeCodeTurnCompletionTimeout(err)).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(450);
    const sizeAtReject = progressSize();
    expect(sizeAtReject).toBeGreaterThan(0);
    await Bun.sleep(200);
    expect(progressSize()).toBe(sizeAtReject);
  });

  test("a timeout also stops a grandchild that ignores SIGINT after the CLI itself exits", async () => {
    const started = Date.now();
    const err = await run("grandchild-writer", 500, { killGraceMs: 2_000 }).catch((e: unknown) => e);
    expect(isClaudeCodeTurnCompletionTimeout(err)).toBe(true);
    expect(Date.now() - started).toBeLessThan(2_000);
    const sizeAtReject = progressSize();
    expect(sizeAtReject).toBeGreaterThan(0);
    await Bun.sleep(200);
    expect(progressSize()).toBe(sizeAtReject);
  });

  test("an abort stops the turn like a timeout, but is not classified as one", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    const started = Date.now();
    const err = await run("ignore-sigint-writer", 5_000, { killGraceMs: 200, signal: controller.signal }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("Claude Code turn aborted");
    expect(isClaudeCodeTurnCompletionTimeout(err)).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(450);
    const sizeAtReject = progressSize();
    expect(sizeAtReject).toBeGreaterThan(0);
    await Bun.sleep(200);
    expect(progressSize()).toBe(sizeAtReject);
  });

  test("an abort during the kill grace period of a timeout still rejects as aborted", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 400);
    const err = await run("ignore-sigint-writer", 300, { killGraceMs: 300, signal: controller.signal }).catch((e: unknown) => e);
    expect((err as Error).message).toContain("Claude Code turn aborted");
    expect(isClaudeCodeTurnCompletionTimeout(err)).toBe(false);
    const sizeAtReject = progressSize();
    await Bun.sleep(200);
    expect(progressSize()).toBe(sizeAtReject);
  });

  // Claude Code's bash tool starts commands detached, each in a process group of its own, which
  // signalling the CLI's group does not reach.
  test("a timeout also stops a tool command the CLI started in its own process group", async () => {
    const err = await run("detached-writer", 300, { killGraceMs: 200 }).catch((e: unknown) => e);
    expect(isClaudeCodeTurnCompletionTimeout(err)).toBe(true);
    expect(writerAlive()).toBe(false);
    await expectStoppedWriting();
  });

  test("an abort also stops a tool command the CLI started in its own process group", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    const err = await run("detached-writer", 5_000, { killGraceMs: 200, signal: controller.signal }).catch((e: unknown) => e);
    expect((err as Error).message).toContain("Claude Code turn aborted");
    expect(writerAlive()).toBe(false);
    await expectStoppedWriting();
  });

  test("a CLI that stops its own tool commands on SIGINT is given the time to, and nothing is force-killed", async () => {
    const lines: string[] = [];
    const started = Date.now();
    const err = await run("detached-writer-stopped-on-sigint", 400, { killGraceMs: 3_000, log: (line) => lines.push(line) }).catch((e: unknown) => e);
    expect(isClaudeCodeTurnCompletionTimeout(err)).toBe(true);
    // The writer finishes 150ms after the CLI has exited; the adapter waited for that.
    expect(existsSync(join(draft, "stopped.txt"))).toBe(true);
    expect(lines.filter((line) => line.includes("SIGKILL") || line.includes("outside its process group"))).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(writerAlive()).toBe(false);
    await expectStoppedWriting();
  });

  test("a completed turn also stops a tool command still running in the background", async () => {
    expect((await run("completed-with-detached-writer")).result).toBe("Done.");
    expect(writerAlive()).toBe(false);
    await expectStoppedWriting();
  });

  test("when ps cannot be run, the CLI's process group is still stopped and the log says so once", async () => {
    const bin = mkdtempSync(join(tmpdir(), "no-ps-"));
    writeFileSync(join(bin, "ps"), "#!/bin/sh\nexit 1\n");
    chmodSync(join(bin, "ps"), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;
    const lines: string[] = [];
    try {
      // Looks at the process table twice: when the turn is stopped and before SIGKILL.
      const err = await run("ignore-sigint-writer", 300, { killGraceMs: 100, log: (line) => lines.push(line) }).catch((e: unknown) => e);
      expect(isClaudeCodeTurnCompletionTimeout(err)).toBe(true);
    } finally {
      process.env.PATH = path;
      rmSync(bin, { recursive: true, force: true });
    }
    expect(lines.filter((line) => line.includes("cannot read the process table"))).toHaveLength(1);
    await expectStoppedWriting();
  });

  test("an already aborted signal rejects without starting the CLI", async () => {
    const controller = new AbortController();
    controller.abort();
    // A binary that does not exist would fail to start, so the abort error shows nothing was started.
    await expect(run("success", 5_000, { signal: controller.signal, claudeBin: join(draft, "no-such-claude") })).rejects.toThrow("Claude Code turn aborted");
  });

  test("decodes multi-byte text split across pipe reads", async () => {
    const text = "已添加字段，测试通过 🎉";
    const result = await run("split-utf8", 5_000, { env: { FAKE_CLAUDE_RESULT_TEXT: text } });
    expect(result.result).toBe(text);
    expect(result.result).not.toContain("�");
  });
});
