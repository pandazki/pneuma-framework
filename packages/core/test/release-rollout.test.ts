import { expect, test } from "bun:test";
import {
  createReleaseInstance,
  createReleaseRolloutState,
  markReleaseInstanceHealthy,
  promoteReleaseCandidate,
  rollbackActiveRelease,
  stageReleaseCandidate,
  summarizeReleaseRollout,
} from "../src/release-rollout.js";

test("rollout stages a candidate and refuses to promote it before health checks pass", () => {
  const initial = createReleaseRolloutState({ created_at_ms: 1 });
  const candidate = createReleaseInstance({
    candidate_id: "rc-semantic-search",
    image_tag: "pneuma-knowledge-inbox:m11-candidate",
    url: "http://127.0.0.1:4101",
    created_at_ms: 2,
  });

  const staged = stageReleaseCandidate(initial, candidate, { at_ms: 3 });
  expect(staged.candidate?.candidate_id).toBe("rc-semantic-search");
  expect(staged.timeline.map((event) => event.type)).toEqual(["candidate_staged"]);
  expect(initial.candidate).toBeUndefined();

  const attempted = promoteReleaseCandidate(staged, { at_ms: 4 });
  expect(attempted.ok).toBe(false);
  expect(attempted.error).toContain("candidate must be healthy");
  expect(attempted.state.active).toBeUndefined();
  expect(attempted.state.candidate?.candidate_id).toBe("rc-semantic-search");
});

test("rollout promotes a healthy candidate and keeps previous active release for rollback", () => {
  const previousActive = markReleaseInstanceHealthy(createReleaseInstance({
    candidate_id: "rc-baseline",
    image_tag: "pneuma-knowledge-inbox:m10-active",
    url: "http://127.0.0.1:4100",
    created_at_ms: 1,
  }), {
    at_ms: 2,
    checks: [{ name: "health", status: "passed", message: "GET /healthz passed", at_ms: 2 }],
  });
  const candidate = markReleaseInstanceHealthy(createReleaseInstance({
    candidate_id: "rc-semantic-search",
    image_tag: "pneuma-knowledge-inbox:m11-candidate",
    url: "http://127.0.0.1:4101",
    created_at_ms: 3,
  }), {
    at_ms: 4,
    checks: [
      { name: "health", status: "passed", message: "GET /healthz passed", at_ms: 4 },
      { name: "semantic_search", status: "passed", message: "semantic index ready", at_ms: 5 },
    ],
  });

  const staged = stageReleaseCandidate(createReleaseRolloutState({
    active: previousActive,
    created_at_ms: 1,
  }), candidate, { at_ms: 6 });
  const promoted = promoteReleaseCandidate(staged, { at_ms: 7 });

  expect(promoted.ok).toBe(true);
  if (!promoted.ok) throw new Error(promoted.error);
  expect(promoted.state.active?.candidate_id).toBe("rc-semantic-search");
  expect(promoted.state.previous?.candidate_id).toBe("rc-baseline");
  expect(promoted.state.candidate).toBeUndefined();
  expect(summarizeReleaseRollout(promoted.state)).toEqual({
    active_candidate_id: "rc-semantic-search",
    candidate_candidate_id: undefined,
    previous_candidate_id: "rc-baseline",
    active_url: "http://127.0.0.1:4101",
    status: "active",
  });
});

test("rollout rollback swaps previous release back into active", () => {
  const baseline = markReleaseInstanceHealthy(createReleaseInstance({
    candidate_id: "rc-baseline",
    image_tag: "pneuma-knowledge-inbox:m10-active",
    url: "http://127.0.0.1:4100",
  }), {
    checks: [{ name: "health", status: "passed", at_ms: 1 }],
    at_ms: 1,
  });
  const candidate = markReleaseInstanceHealthy(createReleaseInstance({
    candidate_id: "rc-semantic-search",
    image_tag: "pneuma-knowledge-inbox:m11-candidate",
    url: "http://127.0.0.1:4101",
  }), {
    checks: [{ name: "health", status: "passed", at_ms: 2 }],
    at_ms: 2,
  });
  const promoted = promoteReleaseCandidate(stageReleaseCandidate(createReleaseRolloutState({
    active: baseline,
  }), candidate, { at_ms: 3 }), { at_ms: 4 });
  if (!promoted.ok) throw new Error(promoted.error);

  const rolledBack = rollbackActiveRelease(promoted.state, {
    at_ms: 5,
    reason: "post-promote capability regression",
  });

  expect(rolledBack.ok).toBe(true);
  if (!rolledBack.ok) throw new Error(rolledBack.error);
  expect(rolledBack.state.active?.candidate_id).toBe("rc-baseline");
  expect(rolledBack.state.previous?.candidate_id).toBe("rc-semantic-search");
  expect(rolledBack.state.timeline.map((event) => event.type)).toEqual([
    "candidate_staged",
    "candidate_promoted",
    "rollback_completed",
  ]);
});
