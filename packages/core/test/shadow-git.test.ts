import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initWorkspace } from "../src/workspace.js";
import {
  initShadowGit,
  createCheckpoint,
  listCheckpoints,
} from "../src/shadow-git.js";

test("initShadowGit creates a bare repo under .pneuma/shadow.git", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-sg-"));
  initWorkspace(root);
  await initShadowGit(root);
  expect(existsSync(join(root, ".pneuma", "shadow.git", "HEAD"))).toBe(true);
});

test("createCheckpoint records a hash and listCheckpoints returns it", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-sg-"));
  initWorkspace(root);
  await initShadowGit(root);
  writeFileSync(join(root, "a.txt"), "hello\n");
  const h1 = await createCheckpoint(root, "turn 1");
  expect(h1).toMatch(/^[0-9a-f]{40}$/);

  writeFileSync(join(root, "a.txt"), "hello world\n");
  const h2 = await createCheckpoint(root, "turn 2");
  expect(h2).not.toBe(h1);

  const cps = await listCheckpoints(root);
  expect(cps.map((c) => c.label)).toEqual(["turn 1", "turn 2"]);
});
