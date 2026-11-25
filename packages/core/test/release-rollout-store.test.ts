import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createReleaseInstance,
  createReleaseRolloutState,
  markReleaseInstanceHealthy,
  promoteReleaseCandidate,
  stageReleaseCandidate,
} from "../src/release-rollout.js";
import {
  FileReleaseRolloutStore,
  releaseRolloutFilePath,
} from "../src/release-rollout-store.js";

test("FileReleaseRolloutStore persists and reloads rollout state", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-rollout-store-"));
  try {
    const store = new FileReleaseRolloutStore({ workspace });
    const candidate = markReleaseInstanceHealthy(createReleaseInstance({
      candidate_id: "rc-semantic-search",
      image_tag: "pneuma-knowledge-inbox:m11-candidate",
      url: "http://127.0.0.1:4101",
    }), {
      checks: [{ name: "health", status: "passed", at_ms: 1 }],
      at_ms: 1,
    });
    const staged = stageReleaseCandidate(createReleaseRolloutState(), candidate, { at_ms: 2 });
    const promoted = promoteReleaseCandidate(staged, { at_ms: 3 });
    if (!promoted.ok) throw new Error(promoted.error);

    await store.save(promoted.state);
    expect(releaseRolloutFilePath(workspace)).toContain(".pneuma/release-rollout.json");

    const reloaded = await new FileReleaseRolloutStore({ workspace }).load();
    expect(reloaded.active?.candidate_id).toBe("rc-semantic-search");
    expect(reloaded.timeline.map((event) => event.type)).toEqual(["candidate_staged", "candidate_promoted"]);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

function promotedState() {
  const candidate = markReleaseInstanceHealthy(createReleaseInstance({
    candidate_id: "rc-1",
    image_tag: "app:rc-1",
    url: "http://127.0.0.1:4101",
  }), {
    checks: [{ name: "health", status: "passed", at_ms: 1 }],
    at_ms: 1,
  });
  const staged = stageReleaseCandidate(createReleaseRolloutState(), candidate, { at_ms: 2 });
  const promoted = promoteReleaseCandidate(staged, { at_ms: 3 });
  if (!promoted.ok) throw new Error(promoted.error);
  return promoted.state;
}

function withWorkspace(run: (workspace: string) => Promise<void> | void): () => Promise<void> {
  return async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-rollout-store-dir-"));
    try {
      await run(workspace);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  };
}

test("with stateDir, save writes release-rollout.json under that directory", withWorkspace(async (workspace) => {
  await new FileReleaseRolloutStore({ workspace, stateDir: ".x" }).save(promotedState());

  expect(existsSync(join(workspace, ".x", "release-rollout.json"))).toBe(true);
}));

test("with stateDir, save never creates .pneuma", withWorkspace(async (workspace) => {
  await new FileReleaseRolloutStore({ workspace, stateDir: ".x" }).save(promotedState());

  expect(existsSync(join(workspace, ".pneuma"))).toBe(false);
}));

test("with stateDir, a staged and promoted release reloads from a new store on the same directory", withWorkspace(async (workspace) => {
  await new FileReleaseRolloutStore({ workspace, stateDir: ".x" }).save(promotedState());

  const reloaded = await new FileReleaseRolloutStore({ workspace, stateDir: ".x" }).load();

  expect(reloaded.active?.candidate_id).toBe("rc-1");
  expect(reloaded.timeline.map((event) => event.type)).toEqual(["candidate_staged", "candidate_promoted"]);
}));

test("with stateDir, a rollout file in .pneuma is not read", withWorkspace(async (workspace) => {
  await new FileReleaseRolloutStore({ workspace }).save(promotedState());

  const state = await new FileReleaseRolloutStore({ workspace, stateDir: ".x" }).load();

  expect(state.active).toBeUndefined();
  expect(state.timeline).toEqual([]);
}));

test("releaseRolloutFilePath puts the file under stateDir, and under .pneuma without it", withWorkspace((workspace) => {
  expect(releaseRolloutFilePath(workspace, ".x")).toBe(join(workspace, ".x", "release-rollout.json"));
  expect(releaseRolloutFilePath(workspace)).toBe(join(workspace, ".pneuma", "release-rollout.json"));
}));

for (const bad of ["", "a/b", "a\\b", ".", "..", "a\0b"]) {
  test(`FileReleaseRolloutStore with stateDir ${JSON.stringify(bad)} throws`, () => {
    expect(() => new FileReleaseRolloutStore({ workspace: tmpdir(), stateDir: bad })).toThrow(/stateDir must be the name of one directory/);
  });

  test(`releaseRolloutFilePath with stateDir ${JSON.stringify(bad)} throws`, () => {
    expect(() => releaseRolloutFilePath(tmpdir(), bad)).toThrow(/stateDir must be the name of one directory/);
  });
}

test("FileReleaseRolloutStore returns an empty state when no rollout file exists", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-rollout-store-empty-"));
  try {
    const state = await new FileReleaseRolloutStore({ workspace }).load();

    expect(state.active).toBeUndefined();
    expect(state.candidate).toBeUndefined();
    expect(state.previous).toBeUndefined();
    expect(state.timeline).toEqual([]);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
