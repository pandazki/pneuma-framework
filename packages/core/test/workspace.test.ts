import { test, expect } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initWorkspace,
  stateDir,
  buildDir,
} from "../src/workspace.js";

test("initWorkspace creates the state dir", () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-ws-"));
  initWorkspace(root);
  expect(existsSync(join(root, ".pneuma"))).toBe(true);
});

test("stateDir returns <root>/.pneuma", () => {
  expect(stateDir("/a/b")).toBe("/a/b/.pneuma");
});

test("buildDir produces a fresh timestamped directory", () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-ws-"));
  initWorkspace(root);
  const d1 = buildDir(root);
  const d2 = buildDir(root);
  expect(existsSync(d1)).toBe(true);
  expect(existsSync(d2)).toBe(true);
  expect(d1).not.toBe(d2);
});
