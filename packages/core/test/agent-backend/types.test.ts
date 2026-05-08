import { test, expect } from "bun:test";
import type {
  AgentBackend,
  AgentBackendType,
  AgentCapabilities,
  AgentSession,
  AgentLaunchOptions,
  AgentRunTurnOptions,
  AgentRunTurnResult,
  AgentEvent,
  PermissionResponse,
} from "../../src/agent-backend/types.js";

test("AgentBackendType accepts known and arbitrary strings", () => {
  const a: AgentBackendType = "claude-code";
  const b: AgentBackendType = "opencode";
  const c: AgentBackendType = "future-backend";
  expect([a, b, c]).toHaveLength(3);
});

test("AgentCapabilities is a complete boolean bag", () => {
  const caps: AgentCapabilities = {
    streaming: true, resume: true, permissions: true, toolProgress: true, modelSwitch: true,
  };
  expect(Object.keys(caps)).toHaveLength(5);
});

test("AgentBackend interface can be satisfied by a stub", async () => {
  const stub: AgentBackend = {
    type: "fake",
    capabilities: { streaming: true, resume: false, permissions: true, toolProgress: false, modelSwitch: false },
    async launch(_: AgentLaunchOptions): Promise<AgentSession> {
      return { sessionId: "s1", state: "ready", startedAt: Date.now() };
    },
    async runTurn(_: AgentRunTurnOptions): Promise<AgentRunTurnResult> {
      throw new Error("not implemented");
    },
    async sendUserMessage() {},
    async respondToPermission(_sid, _r: PermissionResponse) {},
    onEvent(_h): () => void { return () => {}; },
    async stop() {},
    async close() {},
  };
  const ev: AgentEvent = { type: "session-ready", sessionId: "s1", payload: {} };
  expect(stub.type).toBe("fake");
  expect(ev.type).toBe("session-ready");
});
