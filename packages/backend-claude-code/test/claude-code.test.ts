import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  const run = (scenario: string, timeoutMs = 5_000) =>
    runClaudeCodeAgent({ draftRoot: draft, prompt: "add a field", claudeBin: fake, timeoutMs, env: { FAKE_CLAUDE_SCENARIO: scenario } });

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
});
