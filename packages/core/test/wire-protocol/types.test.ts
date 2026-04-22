import { test, expect } from "bun:test";
import type {
  WireEnvelope,
  Focus,
  Action,
  ViewerRequest,
  PermissionPrompt,
  PermissionResponse,
  SessionId,
} from "../../src/wire-protocol/types.js";

test("WireEnvelope discriminates v2a vs a2v", () => {
  const focus: WireEnvelope = { dir: "v2a", kind: "focus", focus: { file: "a.md" } };
  const text: WireEnvelope = {
    dir: "a2v", kind: "text", turnId: "t1", partId: "p1", delta: "hi",
  };
  expect(focus.dir).toBe("v2a");
  expect(text.dir).toBe("a2v");
});

test("Focus.element supports heading kind with anchor + level", () => {
  const f: Focus = {
    file: "doc.md",
    element: { kind: "heading", index: 0, text: "Intro", anchor: "intro", level: 2 },
  };
  expect(f.element?.level).toBe(2);
});

test("Action union covers user-message and click", () => {
  const u: Action = { kind: "user-message", text: "hello" };
  const c: Action = { kind: "click", target: "save", meta: { x: 1 } };
  expect(u.kind).toBe("user-message");
  expect(c.kind).toBe("click");
});

test("SessionId is a bare string alias", () => {
  const sid: SessionId = "abc-123";
  expect(sid).toBe("abc-123");
});

test("PermissionResponse decision is a closed union", () => {
  const r: PermissionResponse = { id: "p1", decision: "allow" };
  expect(r.decision).toBe("allow");
});

test("ViewerRequest includes toast with optional level", () => {
  const v: ViewerRequest = { kind: "toast", message: "saved", level: "info" };
  expect(v.kind).toBe("toast");
});

test("PermissionPrompt has id + tool + detail", () => {
  const p: PermissionPrompt = { id: "1", tool: "write", detail: { path: "doc.md" } };
  expect(p.tool).toBe("write");
});
