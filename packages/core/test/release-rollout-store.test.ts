import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
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
