export const RELEASE_CANDIDATE_STATUSES = ["created", "building", "verifying", "ready", "failed"] as const;

export type ReleaseCandidateStatus = typeof RELEASE_CANDIDATE_STATUSES[number];
export type ReleaseCandidateCheckStatus = "passed" | "failed";

export interface ReleaseCandidateCheck {
  readonly name: string;
  readonly status: ReleaseCandidateCheckStatus;
  readonly message?: string;
  readonly at_ms: number;
}

export interface ReleaseCandidateFailure {
  readonly code: string;
  readonly message: string;
  readonly at_ms: number;
}

export interface ReleaseCandidate {
  readonly id: string;
  readonly source_workspace: string;
  readonly definition_fingerprint: string;
  readonly build_manifest_path?: string;
  readonly image_tag?: string;
  readonly checks: readonly ReleaseCandidateCheck[];
  readonly status: ReleaseCandidateStatus;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
  readonly failure?: ReleaseCandidateFailure;
}

export interface CreateReleaseCandidateInput {
  readonly id: string;
  readonly source_workspace: string;
  readonly definition_fingerprint: string;
  readonly created_at_ms?: number;
}

export interface MarkReleaseCandidateBuildingInput {
  readonly build_manifest_path: string;
  readonly image_tag: string;
  readonly at_ms?: number;
}

export interface MarkReleaseCandidateVerifyingInput {
  readonly at_ms?: number;
}

export interface RecordReleaseCandidateCheckInput {
  readonly name: string;
  readonly status: ReleaseCandidateCheckStatus;
  readonly message?: string;
  readonly at_ms?: number;
}

export interface FinalizeReleaseCandidateInput {
  readonly required_checks: readonly string[];
  readonly at_ms?: number;
}

export interface FailReleaseCandidateInput {
  readonly code: string;
  readonly message: string;
  readonly at_ms?: number;
}

export function createReleaseCandidate(input: CreateReleaseCandidateInput): ReleaseCandidate {
  const now = input.created_at_ms ?? Date.now();
  return {
    id: input.id,
    source_workspace: input.source_workspace,
    definition_fingerprint: input.definition_fingerprint,
    checks: [],
    status: "created",
    created_at_ms: now,
    updated_at_ms: now,
  };
}

export function markReleaseCandidateBuilding(
  candidate: ReleaseCandidate,
  input: MarkReleaseCandidateBuildingInput,
): ReleaseCandidate {
  if (candidate.status === "failed") return candidate;
  const now = input.at_ms ?? Date.now();
  return {
    ...candidate,
    build_manifest_path: input.build_manifest_path,
    image_tag: input.image_tag,
    status: "building",
    updated_at_ms: now,
    failure: undefined,
  };
}

export function markReleaseCandidateVerifying(
  candidate: ReleaseCandidate,
  input: MarkReleaseCandidateVerifyingInput = {},
): ReleaseCandidate {
  if (candidate.status === "failed") return candidate;
  if (!candidate.build_manifest_path) {
    return failReleaseCandidate(candidate, {
      code: "release_candidate_missing_manifest",
      message: "Release candidate cannot enter verification without a build manifest.",
      at_ms: input.at_ms,
    });
  }
  if (!candidate.image_tag) {
    return failReleaseCandidate(candidate, {
      code: "release_candidate_missing_image",
      message: "Release candidate cannot enter verification without an image tag.",
      at_ms: input.at_ms,
    });
  }
  return {
    ...candidate,
    status: "verifying",
    updated_at_ms: input.at_ms ?? Date.now(),
    failure: undefined,
  };
}

export function recordReleaseCandidateCheck(
  candidate: ReleaseCandidate,
  input: RecordReleaseCandidateCheckInput,
): ReleaseCandidate {
  const check: ReleaseCandidateCheck = {
    name: input.name,
    status: input.status,
    ...(input.message !== undefined ? { message: input.message } : {}),
    at_ms: input.at_ms ?? Date.now(),
  };
  const checks = [...candidate.checks.filter((existing) => existing.name !== check.name), check];
  const next = {
    ...candidate,
    checks,
    updated_at_ms: check.at_ms,
  };
  if (check.status === "failed") {
    return failReleaseCandidate(next, {
      code: "release_candidate_check_failed",
      message: check.message ?? `Release candidate check failed: ${check.name}`,
      at_ms: check.at_ms,
    });
  }
  return next;
}

export function finalizeReleaseCandidate(
  candidate: ReleaseCandidate,
  input: FinalizeReleaseCandidateInput,
): ReleaseCandidate {
  if (candidate.status === "failed") return candidate;
  if (!candidate.build_manifest_path) {
    return failReleaseCandidate(candidate, {
      code: "release_candidate_missing_manifest",
      message: "Release candidate cannot become ready without a build manifest.",
      at_ms: input.at_ms,
    });
  }
  if (!candidate.image_tag) {
    return failReleaseCandidate(candidate, {
      code: "release_candidate_missing_image",
      message: "Release candidate cannot become ready without an image tag.",
      at_ms: input.at_ms,
    });
  }
  const passed = new Set(candidate.checks.filter((check) => check.status === "passed").map((check) => check.name));
  const missing = input.required_checks.filter((name) => !passed.has(name));
  if (missing.length > 0) {
    return failReleaseCandidate(candidate, {
      code: "release_candidate_missing_checks",
      message: `Release candidate missing required checks: ${missing.join(", ")}`,
      at_ms: input.at_ms,
    });
  }
  return {
    ...candidate,
    status: "ready",
    updated_at_ms: input.at_ms ?? Date.now(),
    failure: undefined,
  };
}

export function failReleaseCandidate(
  candidate: ReleaseCandidate,
  input: FailReleaseCandidateInput,
): ReleaseCandidate {
  const at = input.at_ms ?? Date.now();
  return {
    ...candidate,
    status: "failed",
    updated_at_ms: at,
    failure: {
      code: input.code,
      message: input.message,
      at_ms: at,
    },
  };
}
