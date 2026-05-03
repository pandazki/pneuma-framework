export const RELEASE_SLOT_NAMES = ["active", "candidate", "previous"] as const;
export type ReleaseSlotName = (typeof RELEASE_SLOT_NAMES)[number];

export const RELEASE_INSTANCE_STATUSES = ["created", "starting", "healthy", "unhealthy", "stopped"] as const;
export type ReleaseInstanceStatus = (typeof RELEASE_INSTANCE_STATUSES)[number];

export const RELEASE_ROLLOUT_CHECK_STATUSES = ["passed", "failed"] as const;
export type ReleaseRolloutCheckStatus = (typeof RELEASE_ROLLOUT_CHECK_STATUSES)[number];

export const RELEASE_ROLLOUT_EVENT_TYPES = [
  "candidate_staged",
  "candidate_promoted",
  "rollback_completed",
] as const;
export type ReleaseRolloutEventType = (typeof RELEASE_ROLLOUT_EVENT_TYPES)[number];

export interface ReleaseRolloutCheck {
  readonly name: string;
  readonly status: ReleaseRolloutCheckStatus;
  readonly message?: string;
  readonly at_ms: number;
}

export interface ReleaseInstance {
  readonly candidate_id: string;
  readonly image_tag: string;
  readonly data_dir?: string;
  readonly container_name?: string;
  readonly url?: string;
  readonly status: ReleaseInstanceStatus;
  readonly checks: readonly ReleaseRolloutCheck[];
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
}

export interface ReleaseRolloutEvent {
  readonly type: ReleaseRolloutEventType;
  readonly at_ms: number;
  readonly candidate_id?: string;
  readonly active_candidate_id?: string;
  readonly previous_candidate_id?: string;
  readonly reason?: string;
}

export interface ReleaseRolloutState {
  readonly active?: ReleaseInstance;
  readonly candidate?: ReleaseInstance;
  readonly previous?: ReleaseInstance;
  readonly timeline: readonly ReleaseRolloutEvent[];
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
}

export interface CreateReleaseRolloutStateInput {
  readonly active?: ReleaseInstance;
  readonly candidate?: ReleaseInstance;
  readonly previous?: ReleaseInstance;
  readonly timeline?: readonly ReleaseRolloutEvent[];
  readonly created_at_ms?: number;
  readonly updated_at_ms?: number;
}

export interface CreateReleaseInstanceInput {
  readonly candidate_id: string;
  readonly image_tag: string;
  readonly data_dir?: string;
  readonly container_name?: string;
  readonly url?: string;
  readonly status?: ReleaseInstanceStatus;
  readonly checks?: readonly ReleaseRolloutCheck[];
  readonly created_at_ms?: number;
  readonly updated_at_ms?: number;
}

export interface MarkReleaseInstanceHealthyInput {
  readonly checks: readonly ReleaseRolloutCheck[];
  readonly at_ms?: number;
}

export interface ReleaseRolloutTransitionInput {
  readonly at_ms?: number;
  readonly reason?: string;
}

export type ReleaseRolloutTransitionResult =
  | { readonly ok: true; readonly state: ReleaseRolloutState }
  | { readonly ok: false; readonly error: string; readonly state: ReleaseRolloutState };

export interface ReleaseRolloutSummary {
  readonly active_candidate_id?: string;
  readonly candidate_candidate_id?: string;
  readonly previous_candidate_id?: string;
  readonly active_url?: string;
  readonly status: "empty" | "active" | "candidate_staged";
}

export function createReleaseRolloutState(input: CreateReleaseRolloutStateInput = {}): ReleaseRolloutState {
  const now = Date.now();
  return {
    active: cloneReleaseInstance(input.active),
    candidate: cloneReleaseInstance(input.candidate),
    previous: cloneReleaseInstance(input.previous),
    timeline: input.timeline?.map(cloneReleaseRolloutEvent) ?? [],
    created_at_ms: input.created_at_ms ?? now,
    updated_at_ms: input.updated_at_ms ?? input.created_at_ms ?? now,
  };
}

export function createReleaseInstance(input: CreateReleaseInstanceInput): ReleaseInstance {
  const now = Date.now();
  return {
    candidate_id: input.candidate_id,
    image_tag: input.image_tag,
    data_dir: input.data_dir,
    container_name: input.container_name,
    url: input.url,
    status: input.status ?? "created",
    checks: input.checks?.map(cloneReleaseRolloutCheck) ?? [],
    created_at_ms: input.created_at_ms ?? now,
    updated_at_ms: input.updated_at_ms ?? input.created_at_ms ?? now,
  };
}

export function markReleaseInstanceHealthy(
  instance: ReleaseInstance,
  input: MarkReleaseInstanceHealthyInput,
): ReleaseInstance {
  const checks = input.checks.map(cloneReleaseRolloutCheck);
  return {
    ...cloneReleaseInstance(instance),
    status: checks.some((check) => check.status === "failed") ? "unhealthy" : "healthy",
    checks,
    updated_at_ms: input.at_ms ?? Date.now(),
  };
}

export function stageReleaseCandidate(
  state: ReleaseRolloutState,
  candidate: ReleaseInstance,
  input: ReleaseRolloutTransitionInput = {},
): ReleaseRolloutState {
  const atMs = input.at_ms ?? Date.now();
  return {
    ...cloneReleaseRolloutState(state),
    candidate: cloneReleaseInstance(candidate),
    timeline: [
      ...state.timeline.map(cloneReleaseRolloutEvent),
      {
        type: "candidate_staged",
        at_ms: atMs,
        candidate_id: candidate.candidate_id,
        reason: input.reason,
      },
    ],
    updated_at_ms: atMs,
  };
}

export function promoteReleaseCandidate(
  state: ReleaseRolloutState,
  input: ReleaseRolloutTransitionInput = {},
): ReleaseRolloutTransitionResult {
  const current = cloneReleaseRolloutState(state);
  if (!current.candidate) {
    return { ok: false, error: "candidate release is required before promotion", state: current };
  }
  if (current.candidate.status !== "healthy") {
    return { ok: false, error: "candidate must be healthy before promotion", state: current };
  }

  const atMs = input.at_ms ?? Date.now();
  return {
    ok: true,
    state: {
      active: current.candidate,
      previous: current.active,
      candidate: undefined,
      timeline: [
        ...current.timeline,
        {
          type: "candidate_promoted",
          at_ms: atMs,
          active_candidate_id: current.candidate.candidate_id,
          previous_candidate_id: current.active?.candidate_id,
          reason: input.reason,
        },
      ],
      created_at_ms: current.created_at_ms,
      updated_at_ms: atMs,
    },
  };
}

export function rollbackActiveRelease(
  state: ReleaseRolloutState,
  input: ReleaseRolloutTransitionInput = {},
): ReleaseRolloutTransitionResult {
  const current = cloneReleaseRolloutState(state);
  if (!current.previous) {
    return { ok: false, error: "previous release is required before rollback", state: current };
  }
  if (current.previous.status !== "healthy") {
    return { ok: false, error: "previous release must be healthy before rollback", state: current };
  }

  const atMs = input.at_ms ?? Date.now();
  return {
    ok: true,
    state: {
      active: current.previous,
      previous: current.active,
      candidate: current.candidate,
      timeline: [
        ...current.timeline,
        {
          type: "rollback_completed",
          at_ms: atMs,
          active_candidate_id: current.previous.candidate_id,
          previous_candidate_id: current.active?.candidate_id,
          reason: input.reason,
        },
      ],
      created_at_ms: current.created_at_ms,
      updated_at_ms: atMs,
    },
  };
}

export function summarizeReleaseRollout(state: ReleaseRolloutState): ReleaseRolloutSummary {
  const activeCandidateId = state.active?.candidate_id;
  const candidateCandidateId = state.candidate?.candidate_id;
  const previousCandidateId = state.previous?.candidate_id;
  const status: ReleaseRolloutSummary["status"] = candidateCandidateId
    ? "candidate_staged"
    : activeCandidateId
      ? "active"
      : "empty";
  return {
    active_candidate_id: activeCandidateId,
    candidate_candidate_id: candidateCandidateId,
    previous_candidate_id: previousCandidateId,
    active_url: state.active?.url,
    status,
  };
}

function cloneReleaseRolloutState(state: ReleaseRolloutState): ReleaseRolloutState {
  return {
    active: cloneReleaseInstance(state.active),
    candidate: cloneReleaseInstance(state.candidate),
    previous: cloneReleaseInstance(state.previous),
    timeline: state.timeline.map(cloneReleaseRolloutEvent),
    created_at_ms: state.created_at_ms,
    updated_at_ms: state.updated_at_ms,
  };
}

function cloneReleaseInstance(instance: ReleaseInstance | undefined): ReleaseInstance | undefined {
  if (!instance) return undefined;
  return {
    ...instance,
    checks: instance.checks.map(cloneReleaseRolloutCheck),
  };
}

function cloneReleaseRolloutCheck(check: ReleaseRolloutCheck): ReleaseRolloutCheck {
  return { ...check };
}

function cloneReleaseRolloutEvent(event: ReleaseRolloutEvent): ReleaseRolloutEvent {
  return { ...event };
}
