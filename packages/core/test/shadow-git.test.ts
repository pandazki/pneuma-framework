import { test, expect } from "bun:test";
import { $ } from "bun";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initWorkspace } from "../src/workspace.js";
import {
  initShadowGit,
  createCheckpoint,
  listCheckpoints,
  rewindTo,
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

test("createCheckpoint excludes the host .git directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-sg-"));
  initWorkspace(root);
  await initShadowGit(root);

  // Simulate a normal git checkout: create a .git/ directory with some typical contents.
  mkdirSync(join(root, ".git/objects"), { recursive: true });
  writeFileSync(join(root, ".git/HEAD"), "ref: refs/heads/main\n");
  writeFileSync(join(root, ".git/config"), "[core]\n");

  writeFileSync(join(root, "src.txt"), "hello\n");
  await createCheckpoint(root, "turn 1");

  // The shadow repo's HEAD tree should contain src.txt but NOT anything under .git/.
  const lsTree = await $`git --git-dir=${join(root, ".pneuma/shadow.git")} --work-tree=${root} ls-tree -r --name-only HEAD`.text();
  expect(lsTree).toContain("src.txt");
  expect(lsTree).not.toContain(".git/");
  expect(lsTree).not.toContain(".git/HEAD");
});

test("rewindTo resets working tree to an earlier checkpoint hash", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-sg-rewind-"));
  initWorkspace(root);
  await initShadowGit(root);

  writeFileSync(join(root, "a.txt"), "one\n");
  const h1 = await createCheckpoint(root, "turn 1");

  writeFileSync(join(root, "a.txt"), "two\n");
  await createCheckpoint(root, "turn 2");

  await rewindTo(root, h1);
  const after = readFileSync(join(root, "a.txt"), "utf8");
  expect(after).toBe("one\n");
});

test("rewindTo removes files that were added after the target checkpoint", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-sg-rewind-add-"));
  initWorkspace(root);
  await initShadowGit(root);

  writeFileSync(join(root, "a.txt"), "one\n");
  const h1 = await createCheckpoint(root, "turn 1");

  writeFileSync(join(root, "b.txt"), "added later\n");
  await createCheckpoint(root, "turn 2");
  expect(existsSync(join(root, "b.txt"))).toBe(true);

  await rewindTo(root, h1);
  expect(existsSync(join(root, "b.txt"))).toBe(false);
  expect(readFileSync(join(root, "a.txt"), "utf8")).toBe("one\n");
});
