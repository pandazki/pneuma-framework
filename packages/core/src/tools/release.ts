import {
  RELEASE_INSTANCE_STATUSES,
  createReleaseInstance,
  markReleaseInstanceHealthy,
  promoteReleaseCandidate,
  rollbackActiveRelease,
  stageReleaseCandidate,
  summarizeReleaseRollout,
  type ReleaseInstance,
  type ReleaseInstanceStatus,
  type ReleaseRolloutCheck,
} from "../release-rollout.js";
import { FileReleaseRolloutStore } from "../release-rollout-store.js";
import type { ToolContext, ToolRegistry, ToolResult } from "./types.js";

type ParsedReleaseStage =
  | { ok: true; instance: ReleaseInstance; at_ms?: number; reason?: string }
  | { ok: false; error: string };

export function registerReleaseTools(reg: ToolRegistry): void {
  reg.register(
    {
      name: "release.status",
      description:
        "Read the framework release rollout state, including active, candidate, previous, timeline, and active URL summary.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (ctx): Promise<ToolResult> => {
      const store = rolloutStore(ctx);
      const state = await store.load();
      return { ok: true, state: { state, summary: summarizeReleaseRollout(state) } };
    },
  );

  reg.register(
    {
      name: "release.stage",
      description:
        "Stage a release candidate in framework rollout state. Docker/cloud details are adapter implementation details; this tool records the candidate instance and verification evidence.",
      inputSchema: {
        type: "object",
        properties: {
          candidate_id: { type: "string" },
          image_tag: { type: "string" },
          data_dir: { type: "string" },
          container_name: { type: "string" },
          url: { type: "string" },
          status: { type: "string", enum: [...RELEASE_INSTANCE_STATUSES] },
          checks: { type: "array", items: { type: "object" } },
          at_ms: { type: "number" },
          reason: { type: "string" },
        },
        required: ["candidate_id", "image_tag"],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const parsed = parseReleaseStage(params);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const store = rolloutStore(ctx);
      const current = await store.load();
      const state = stageReleaseCandidate(current, parsed.instance, {
        at_ms: parsed.at_ms,
        reason: parsed.reason,
      });
      await store.save(state);
      return { ok: true, state: { state, summary: summarizeReleaseRollout(state) } };
    },
  );

  reg.register(
    {
      name: "release.promote",
      description:
        "Promote the currently staged healthy release candidate to active release state and keep the old active release as previous.",
      inputSchema: {
        type: "object",
        properties: {
          at_ms: { type: "number" },
          reason: { type: "string" },
        },
        required: [],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const store = rolloutStore(ctx);
      const current = await store.load();
      const result = promoteReleaseCandidate(current, {
        at_ms: typeof params.at_ms === "number" ? params.at_ms : undefined,
        reason: typeof params.reason === "string" ? params.reason : undefined,
      });
      if (!result.ok) return { ok: false, error: result.error, state: result.state };
      await store.save(result.state);
      return { ok: true, state: { state: result.state, summary: summarizeReleaseRollout(result.state) } };
    },
  );

  reg.register(
    {
      name: "release.rollback",
      description:
        "Rollback active release state to the previous healthy release and retain the replaced release as previous evidence.",
      inputSchema: {
        type: "object",
        properties: {
          at_ms: { type: "number" },
          reason: { type: "string" },
        },
        required: [],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const store = rolloutStore(ctx);
      const current = await store.load();
      const result = rollbackActiveRelease(current, {
        at_ms: typeof params.at_ms === "number" ? params.at_ms : undefined,
        reason: typeof params.reason === "string" ? params.reason : undefined,
      });
      if (!result.ok) return { ok: false, error: result.error, state: result.state };
      await store.save(result.state);
      return { ok: true, state: { state: result.state, summary: summarizeReleaseRollout(result.state) } };
    },
  );
}

function rolloutStore(ctx: ToolContext): FileReleaseRolloutStore {
  return new FileReleaseRolloutStore({ workspace: ctx.orchestrator.workspace });
}

function parseReleaseStage(params: Record<string, unknown>): ParsedReleaseStage {
  if (typeof params.candidate_id !== "string" || params.candidate_id.length === 0) {
    return { ok: false, error: "release.stage requires a non-empty candidate_id" };
  }
  if (typeof params.image_tag !== "string" || params.image_tag.length === 0) {
    return { ok: false, error: "release.stage requires a non-empty image_tag" };
  }
  const status = parseReleaseInstanceStatus(params.status);
  if (!status.ok) return status;
  const checks = parseReleaseRolloutChecks(params.checks);
  if (!checks.ok) return checks;

  const createdAt = typeof params.at_ms === "number" ? params.at_ms : undefined;
  let instance = createReleaseInstance({
    candidate_id: params.candidate_id,
    image_tag: params.image_tag,
    data_dir: typeof params.data_dir === "string" ? params.data_dir : undefined,
    container_name: typeof params.container_name === "string" ? params.container_name : undefined,
    url: typeof params.url === "string" ? params.url : undefined,
    status: status.status,
    checks: checks.checks,
    created_at_ms: createdAt,
    updated_at_ms: createdAt,
  });

  if (status.status === "healthy") {
    instance = markReleaseInstanceHealthy(instance, {
      checks: checks.checks,
      at_ms: createdAt,
    });
  }

  return {
    ok: true,
    instance,
    at_ms: createdAt,
    reason: typeof params.reason === "string" ? params.reason : undefined,
  };
}

function parseReleaseInstanceStatus(input: unknown):
  | { ok: true; status: ReleaseInstanceStatus }
  | { ok: false; error: string } {
  if (input === undefined) return { ok: true, status: "created" };
  if (typeof input !== "string" || !RELEASE_INSTANCE_STATUSES.includes(input as ReleaseInstanceStatus)) {
    return {
      ok: false,
      error: "release.stage status must be one of created, starting, healthy, unhealthy, or stopped",
    };
  }
  return { ok: true, status: input as ReleaseInstanceStatus };
}

function parseReleaseRolloutChecks(input: unknown):
  | { ok: true; checks: readonly ReleaseRolloutCheck[] }
  | { ok: false; error: string } {
  if (input === undefined) return { ok: true, checks: [] };
  if (!Array.isArray(input)) return { ok: false, error: "release.stage checks must be an array when provided" };
  const now = Date.now();
  const checks: ReleaseRolloutCheck[] = [];
  for (const [index, raw] of input.entries()) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { ok: false, error: `release.stage checks[${index}] must be an object` };
    }
    const check = raw as Record<string, unknown>;
    if (typeof check.name !== "string" || check.name.length === 0) {
      return { ok: false, error: `release.stage checks[${index}].name must be a non-empty string` };
    }
    if (check.status !== "passed" && check.status !== "failed") {
      return { ok: false, error: `release.stage checks[${index}].status must be passed or failed` };
    }
    checks.push({
      name: check.name,
      status: check.status,
      message: typeof check.message === "string" ? check.message : undefined,
      at_ms: typeof check.at_ms === "number" ? check.at_ms : now,
    });
  }
  return { ok: true, checks };
}
