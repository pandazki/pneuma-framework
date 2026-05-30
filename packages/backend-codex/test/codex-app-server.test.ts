import { describe, expect, test } from "bun:test";
import { isCodexTurnCompletionTimeout } from "../src/codex-app-server.js";

// The transport itself needs a real `codex` CLI and is exercised by host E2E
// runs; the offline-safe surface is the fail-closed timeout classifier.
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
