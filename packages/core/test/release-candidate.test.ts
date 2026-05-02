import { expect, test } from "bun:test";
import {
  RELEASE_CANDIDATE_STATUSES,
  createReleaseCandidate,
  failReleaseCandidate,
  finalizeReleaseCandidate,
  markReleaseCandidateBuilding,
  markReleaseCandidateVerifying,
  recordReleaseCandidateCheck,
} from "../src/release-candidate.js";

test("release candidate reaches ready only after manifest, image, and required checks pass", () => {
  const created = createReleaseCandidate({
    id: "rc-priority-queue",
    source_workspace: "/tmp/pneuma-workspace",
    definition_fingerprint: "definition:v2",
    created_at_ms: 10,
  });

  expect(created.status).toBe("created");
  expect(created.checks).toEqual([]);

  const building = markReleaseCandidateBuilding(created, {
    build_manifest_path: "/tmp/pneuma-workspace/.pneuma-build/build.manifest.json",
    image_tag: "pneuma-knowledge-inbox:rc-priority-queue",
    at_ms: 20,
  });
  expect(building.status).toBe("building");
  expect(building.updated_at_ms).toBe(20);
  expect(created.status).toBe("created");

  const verifying = markReleaseCandidateVerifying(building, { at_ms: 30 });
  const checked = [
    { name: "health", status: "passed" as const, message: "GET /healthz passed", at_ms: 40 },
    { name: "config", status: "passed" as const, message: "GET /api/config includes Priority Queue", at_ms: 50 },
    { name: "api", status: "passed" as const, message: "GET list_priority_queue returned P1/P2/P3", at_ms: 60 },
  ].reduce((candidate, check) => recordReleaseCandidateCheck(candidate, check), verifying);

  const ready = finalizeReleaseCandidate(checked, {
    required_checks: ["health", "config", "api"],
    at_ms: 70,
  });

  expect(ready.status).toBe("ready");
  expect(ready.checks.map((check) => check.name)).toEqual(["health", "config", "api"]);
  expect(ready.failure).toBeUndefined();
});

test("release candidate fails closed on failed or missing verification checks", () => {
  const verifying = markReleaseCandidateVerifying(markReleaseCandidateBuilding(createReleaseCandidate({
    id: "rc-broken",
    source_workspace: "/tmp/pneuma-workspace",
    definition_fingerprint: "definition:v2",
    created_at_ms: 10,
  }), {
    build_manifest_path: "/tmp/manifest.json",
    image_tag: "pneuma-knowledge-inbox:broken",
    at_ms: 20,
  }), { at_ms: 30 });

  const failedByCheck = recordReleaseCandidateCheck(verifying, {
    name: "api",
    status: "failed",
    message: "GET list_priority_queue returned HTTP 500",
    at_ms: 40,
  });
  expect(failedByCheck.status).toBe("failed");
  expect(failedByCheck.failure?.message).toContain("list_priority_queue");

  const missingChecks = finalizeReleaseCandidate(verifying, {
    required_checks: ["health", "config", "api"],
    at_ms: 50,
  });
  expect(missingChecks.status).toBe("failed");
  expect(missingChecks.failure?.message).toContain("missing required checks: health, config, api");
});

test("release candidate v0 models readiness but not rollout promotion", () => {
  expect(RELEASE_CANDIDATE_STATUSES).toEqual(["created", "building", "verifying", "ready", "failed"]);
  expect(RELEASE_CANDIDATE_STATUSES).not.toContain("promoting");
  expect(RELEASE_CANDIDATE_STATUSES).not.toContain("promoted");

  const failed = failReleaseCandidate(createReleaseCandidate({
    id: "rc-no-deploy",
    source_workspace: "/tmp/pneuma-workspace",
    definition_fingerprint: "definition:v2",
  }), {
    code: "release_candidate_failed",
    message: "Candidate failed before promotion; existing release is untouched.",
    at_ms: 90,
  });

  expect(failed.status).toBe("failed");
  expect(failed.failure?.code).toBe("release_candidate_failed");
});
