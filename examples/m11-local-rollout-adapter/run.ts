import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LifecycleOrchestrator,
  buildToolRegistry,
  type ReleaseRolloutEvent,
  type ReleaseRolloutState,
  type ReleaseRolloutSummary,
  type ToolResult,
} from "@pneuma-framework/core";

export interface RunM11RolloutDemoOptions {
  readonly mode: "model";
  readonly workspace?: string;
  readonly baselineUrl?: string;
  readonly candidateUrl?: string;
  readonly baselineImageTag?: string;
  readonly candidateImageTag?: string;
}

export interface M11RolloutDemoResult {
  readonly workspace: string;
  readonly summary: {
    readonly before: ReleaseRolloutSummary;
    readonly after_promote: ReleaseRolloutSummary;
    readonly after_rollback: ReleaseRolloutSummary;
  };
  readonly timeline: readonly ReleaseRolloutEvent[];
  readonly final_state: ReleaseRolloutState;
}

interface ReleaseToolState {
  readonly state: ReleaseRolloutState;
  readonly summary: ReleaseRolloutSummary;
}

export async function runM11RolloutDemo(
  options: RunM11RolloutDemoOptions,
): Promise<M11RolloutDemoResult> {
  const ownsWorkspace = options.workspace === undefined;
  const workspace = options.workspace ?? mkdtempSync(join(tmpdir(), "pneuma-m11-rollout-"));
  try {
    const templateDir = join(import.meta.dir, "../../templates/knowledge-inbox-core-domain");
    const orchestrator = new LifecycleOrchestrator({ templateDir, workspace });
    const registry = buildToolRegistry({ orchestrator, workspaceId: "m11-local-rollout-adapter" });

    await callReleaseTool(registry.call("release.stage", {
      candidate_id: "rc-baseline",
      image_tag: options.baselineImageTag ?? "pneuma-knowledge-inbox:m10-active",
      url: options.baselineUrl ?? "http://127.0.0.1:4100",
      status: "healthy",
      checks: [
        { name: "health", status: "passed", message: "baseline active release is healthy", at_ms: 10 },
        { name: "semantic_search", status: "passed", message: "baseline reports missing index evidence", at_ms: 11 },
      ],
      at_ms: 12,
    }));
    const before = await callReleaseTool(registry.call("release.promote", { at_ms: 13 }));

    await callReleaseTool(registry.call("release.stage", {
      candidate_id: "rc-semantic-search",
      image_tag: options.candidateImageTag ?? "pneuma-knowledge-inbox:m11-candidate",
      url: options.candidateUrl ?? "http://127.0.0.1:4101",
      status: "healthy",
      checks: [
        { name: "health", status: "passed", message: "candidate release is healthy", at_ms: 20 },
        { name: "semantic_search", status: "passed", message: "semantic index is ready", at_ms: 21 },
      ],
      at_ms: 22,
    }));
    const afterPromote = await callReleaseTool(registry.call("release.promote", {
      at_ms: 23,
      reason: "semantic search candidate passed verification",
    }));

    const afterRollback = await callReleaseTool(registry.call("release.rollback", {
      at_ms: 24,
      reason: "demonstrate rollback to previous active release",
    }));

    return {
      workspace,
      summary: {
        before: before.summary,
        after_promote: afterPromote.summary,
        after_rollback: afterRollback.summary,
      },
      timeline: afterRollback.state.timeline,
      final_state: afterRollback.state,
    };
  } finally {
    if (ownsWorkspace) rmSync(workspace, { recursive: true, force: true });
  }
}

async function callReleaseTool(promise: Promise<ToolResult>): Promise<ReleaseToolState> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error ?? "release tool failed");
  const state = result.state as ReleaseToolState | undefined;
  if (!state?.state || !state.summary) throw new Error("release tool did not return rollout state");
  return state;
}

if (import.meta.main) {
  const result = await runM11RolloutDemo(parseCliArgs());
  console.log(JSON.stringify(result, null, 2));
}

function parseCliArgs(): RunM11RolloutDemoOptions {
  return {
    mode: "model",
    workspace: stringArg("--workspace"),
    baselineUrl: stringArg("--baseline-url"),
    candidateUrl: stringArg("--candidate-url"),
    baselineImageTag: stringArg("--baseline-image-tag"),
    candidateImageTag: stringArg("--candidate-image-tag"),
  };
}

function stringArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}
