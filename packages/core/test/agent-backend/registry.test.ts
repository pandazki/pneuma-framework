import { test, expect, beforeEach } from "bun:test";
import {
  registerAgentBackend,
  getAgentBackendDescriptor,
  getAgentBackendFactory,
  listAgentBackends,
  detectBackendAvailability,
  clearAgentBackendRegistry,
} from "../../src/agent-backend/registry.js";
import type { AgentBackend, AgentCapabilities } from "../../src/agent-backend/types.js";

const caps: AgentCapabilities = {
  streaming: true, resume: true, permissions: true, toolProgress: false, modelSwitch: true,
};

beforeEach(() => clearAgentBackendRegistry());

test("registerAgentBackend stores descriptor + factory", () => {
  registerAgentBackend(
    { type: "fake-a", displayName: "Fake A", capabilities: caps },
    () => ({} as AgentBackend),
  );
  expect(getAgentBackendDescriptor("fake-a")?.displayName).toBe("Fake A");
  expect(getAgentBackendFactory("fake-a")).toBeDefined();
});

test("listAgentBackends enumerates in registration order", () => {
  registerAgentBackend({ type: "a", displayName: "A", capabilities: caps }, () => ({} as AgentBackend));
  registerAgentBackend({ type: "b", displayName: "B", capabilities: caps }, () => ({} as AgentBackend));
  expect(listAgentBackends().map((d) => d.type)).toEqual(["a", "b"]);
});

test("detectBackendAvailability runs each descriptor's detect() in parallel", async () => {
  registerAgentBackend(
    { type: "x", displayName: "X", capabilities: caps, detect: async () => ({ available: true, version: "1.0" }) },
    () => ({} as AgentBackend),
  );
  registerAgentBackend(
    { type: "y", displayName: "Y", capabilities: caps, detect: async () => ({ available: false, reason: "no binary" }) },
    () => ({} as AgentBackend),
  );
  const results = await detectBackendAvailability();
  expect(results).toEqual([
    { type: "x", available: true, version: "1.0" },
    { type: "y", available: false, reason: "no binary" },
  ]);
});

test("detectBackendAvailability treats missing detect as available", async () => {
  registerAgentBackend({ type: "z", displayName: "Z", capabilities: caps }, () => ({} as AgentBackend));
  const results = await detectBackendAvailability();
  expect(results).toEqual([{ type: "z", available: true }]);
});

test("detectBackendAvailability isolates a throwing detect() from other backends", async () => {
  registerAgentBackend(
    { type: "good", displayName: "Good", capabilities: caps, detect: async () => ({ available: true, version: "2.0" }) },
    () => ({} as AgentBackend),
  );
  registerAgentBackend(
    { type: "broken", displayName: "Broken", capabilities: caps, detect: async () => { throw new Error("probe failed"); } },
    () => ({} as AgentBackend),
  );
  registerAgentBackend(
    { type: "plain", displayName: "Plain", capabilities: caps },
    () => ({} as AgentBackend),
  );
  const results = await detectBackendAvailability();
  expect(results).toEqual([
    { type: "good", available: true, version: "2.0" },
    { type: "broken", available: false, reason: "probe failed" },
    { type: "plain", available: true },
  ]);
});
