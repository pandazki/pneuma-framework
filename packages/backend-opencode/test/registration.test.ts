import { test, expect, beforeEach } from "bun:test";
import {
  clearAgentBackendRegistry,
  getAgentBackendDescriptor,
  listAgentBackends,
} from "@pneuma-framework/core";
import { registerOpencodeBackend } from "../src/index.js";

beforeEach(() => clearAgentBackendRegistry());

test("registerOpencodeBackend installs an opencode descriptor in the registry", () => {
  registerOpencodeBackend();
  const d = getAgentBackendDescriptor("opencode");
  expect(d).toBeDefined();
  expect(d?.displayName).toBe("opencode");
  expect(listAgentBackends().map((x) => x.type)).toContain("opencode");
});
