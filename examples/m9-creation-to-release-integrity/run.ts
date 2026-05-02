import { $ } from "bun";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Row } from "@pneuma-framework/core-domain";
import { bootAppRuntime } from "@pneuma-framework/runtime";
import { createPneumaFramework, type PneumaFramework } from "@pneuma-framework/core";
import type { DefinitionChangeSetResult, RuntimeConfigDiscovery } from "../../packages/core/src/lifecycle.js";
import {
  createReleaseCandidate,
  finalizeReleaseCandidate,
  markReleaseCandidateBuilding,
  markReleaseCandidateVerifying,
  recordReleaseCandidateCheck,
  type ReleaseCandidate,
  type ReleaseCandidateCheck,
} from "../../packages/core/src/release-candidate.js";
import { priorityCapabilityChanges } from "../m5-knowledge-inbox-builder-evolution/capability-plan.js";
import {
  createCreationToReleaseEvidence,
  finalizeCreationToReleaseEvidence,
  recordCreationApproval,
  recordCreationExecution,
  recordCreationProposal,
  recordCreationRecovery,
  recordCreationReleaseCandidate,
  serializeCreationToReleaseEvidence,
  type CreationToReleaseEvidence,
} from "./evidence.js";

const ROOT = resolve(import.meta.dir, "../..");
const TEMPLATE = join(ROOT, "templates/knowledge-inbox-core-domain");

const DEMO_ITEMS = [
  {
    id: "m9-priority-p1",
    url: "https://pneuma.local/m9/critical-customer-risk",
    title: "Critical customer risk",
    source: "customer escalation",
    summary: "Release-blocking customer signal that should stay at the top.",
    priority: "P1",
    created_at_cell: 1_770_100_003_000,
  },
  {
    id: "m9-priority-p2",
    url: "https://pneuma.local/m9/team-feedback",
    title: "Team feedback",
    source: "team review",
    summary: "Important product feedback for the next pass.",
    priority: "P2",
    created_at_cell: 1_770_100_002_000,
  },
  {
    id: "m9-priority-p3",
    url: "https://pneuma.local/m9/research-backlog",
    title: "Research backlog",
    source: "reading",
    summary: "Useful background item that should not block release.",
    priority: "P3",
    created_at_cell: 1_770_100_001_000,
  },
] as const;

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function requireWorkspace(): string {
  const workspace = argValue("--workspace");
  if (!workspace) throw new Error("--workspace is required");
  return resolve(workspace);
}

function currentBaseUrl(framework: PneumaFramework): string {
  const service = framework.state.dev?.services?.[0]?.url;
  if (!service) throw new Error("M9 runner expected a running Knowledge Inbox service");
  return new URL(service).origin;
}

function definitionFingerprint(config: RuntimeConfigDiscovery): string {
  return JSON.stringify({
    tables: config.tables.map((table) => table.id).sort(),
    table_columns: config.tables
      .flatMap((table) => table.columns.map((column) => `${table.id}.${column.name}`))
      .sort(),
    operations: config.operations.map((operation) => operation.id).sort(),
    views: config.views.map((view) => view.id).sort(),
    policy_rules: config.policy_rules.map((rule) => rule.id).sort(),
    policy_default_posture: config.policy_default_posture.app,
  });
}

async function runTemplateScript(input: {
  readonly script: string;
  readonly env: Record<string, string>;
}): Promise<void> {
  await $`env ${Object.entries(input.env).map(([key, value]) => `${key}=${value}`)} ${input.script}`.quiet();
}

async function seedPriorityRows(workspace: string): Promise<void> {
  process.env.PNEUMA_WORKSPACE = workspace;
  process.env.PNEUMA_DATA_DIR = join(workspace, "data");
  process.env.PNEUMA_SQLITE_PATH = join(workspace, "data", "app.db");
  const { config } = await import("../../templates/knowledge-inbox-core-domain/server/config.js");
  const runtime = await bootAppRuntime(config);
  try {
    for (const item of DEMO_ITEMS) {
      await runtime.storage.saveRow(new Row({
        id: item.id,
        app_id: "knowledge-inbox-core-domain",
        table_id: "inbox_items",
        cells: {
          url: item.url,
          title: item.title,
          source: item.source,
          summary: item.summary,
          status: "pending",
          priority: item.priority,
          created_at_cell: item.created_at_cell,
        },
      }));
    }
  } finally {
    await runtime.close();
  }
}

async function runCheck(name: string, fn: () => Promise<string>): Promise<ReleaseCandidateCheck> {
  try {
    return { name, status: "passed", message: await fn(), at_ms: Date.now() };
  } catch (err) {
    return {
      name,
      status: "failed",
      message: err instanceof Error ? err.message : String(err),
      at_ms: Date.now(),
    };
  }
}

async function assertPriorityConfig(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/config`);
  if (!response.ok) throw new Error(`GET /api/config failed with HTTP ${response.status}`);
  const config = await response.json() as {
    tables?: Array<{ id?: string; columns?: Array<{ name?: string }> }>;
    operations?: Array<{ id?: string; invocation_method?: string }>;
    views?: Array<{ id?: string }>;
    policy_rules?: Array<{ actions?: string[]; resource?: unknown }>;
  };
  const inbox = config.tables?.find((table) => table.id === "inbox_items");
  if (!inbox?.columns?.some((column) => column.name === "priority")) {
    throw new Error("config missing inbox_items.priority");
  }
  if (!config.operations?.some((operation) =>
    operation.id === "list_priority_queue" && operation.invocation_method === "GET"
  )) {
    throw new Error("config missing GET list_priority_queue");
  }
  if (!config.views?.some((view) => view.id === "priority_queue")) {
    throw new Error("config missing priority_queue view");
  }
  if (!config.policy_rules?.some((rule) =>
    rule.actions?.includes("read") && JSON.stringify(rule.resource ?? {}).includes("priority_queue")
  )) {
    throw new Error("config missing priority_queue read policy");
  }
  return "GET /api/config exposes Priority Queue definition";
}

async function assertPriorityApi(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/operations/list_priority_queue`);
  if (!response.ok) throw new Error(`GET list_priority_queue failed with HTTP ${response.status}`);
  const body = await response.json() as { rows?: Array<Record<string, unknown>> };
  const priorities = new Set((body.rows ?? []).map((row) => row.priority));
  for (const priority of ["P1", "P2", "P3"]) {
    if (!priorities.has(priority)) throw new Error(`priority queue missing ${priority}`);
  }
  return "GET list_priority_queue returned P1/P2/P3";
}

async function createVerifiedReleaseCandidate(input: {
  readonly workspace: string;
  readonly baseUrl: string;
  readonly definition_fingerprint: string;
}): Promise<ReleaseCandidate> {
  const buildDir = join(input.workspace, ".pneuma-build", "m9");
  const manifestPath = join(buildDir, "build.manifest.json");
  await runTemplateScript({
    script: join(TEMPLATE, "scripts", "build.sh"),
    env: {
      PNEUMA_BUILD_DIR: buildDir,
      PNEUMA_ARTIFACT_MANIFEST_PATH: manifestPath,
    },
  });

  let candidate = createReleaseCandidate({
    id: "rc-m9-priority-queue",
    source_workspace: input.workspace,
    definition_fingerprint: input.definition_fingerprint,
  });
  candidate = markReleaseCandidateBuilding(candidate, {
    build_manifest_path: manifestPath,
    image_tag: "pneuma-knowledge-inbox:m9-local-candidate",
  });
  candidate = markReleaseCandidateVerifying(candidate);
  for (const check of [
    await runCheck("health", async () => {
      const response = await fetch(`${input.baseUrl}/healthz`);
      if (!response.ok) throw new Error(`GET /healthz failed with HTTP ${response.status}`);
      return "GET /healthz passed";
    }),
    await runCheck("config", () => assertPriorityConfig(input.baseUrl)),
    await runCheck("api", () => assertPriorityApi(input.baseUrl)),
  ]) {
    candidate = recordReleaseCandidateCheck(candidate, check);
  }
  return finalizeReleaseCandidate(candidate, {
    required_checks: ["health", "config", "api"],
  });
}

async function runSuccessPath(workspace: string): Promise<CreationToReleaseEvidence> {
  mkdirSync(join(workspace, "data"), { recursive: true });
  await runTemplateScript({
    script: join(TEMPLATE, "scripts", "migrate.sh"),
    env: { PNEUMA_WORKSPACE: workspace },
  });

  const evidence = createCreationToReleaseEvidence({
    run_id: "m9-success",
    builder_request: "Add a Priority Queue to Knowledge Inbox and prepare it as a release candidate.",
  });
  recordCreationProposal(evidence, {
    intent: "Review inbox items by priority",
    summary: "Add Priority Queue",
    tool: "definition.apply_change_set",
    changes: priorityCapabilityChanges,
  });

  const framework = createPneumaFramework({
    templateDir: TEMPLATE,
    workspace,
    portHint: 0,
    authorization: {
      appId: "knowledge-inbox-core-domain",
      workspaceId: workspace,
    },
  });
  framework.orchestrator.setPermissionPromptPushHook((env) => {
    recordCreationApproval(evidence, {
      prompt_id: env.prompt.id,
      decision: "allow",
    });
    queueMicrotask(() => {
      framework.orchestrator.handleFrameworkPermissionResponse(env.prompt.id, "allow");
    });
  });

  try {
    const start = await framework.toolRegistry.call("lifecycle.dev.start", {});
    if (!start.ok) throw new Error(`lifecycle.dev.start failed: ${JSON.stringify(start)}`);
    const apply = await framework.toolRegistry.call("definition.apply_change_set", {
      intent: "Review inbox items by priority",
      summary: "Add Priority Queue",
      changes: priorityCapabilityChanges,
      acceptance_checks: [
        "inbox_items.priority exists",
        "list_priority_queue is available",
        "priority_queue view is visible",
      ],
      require_approval: true,
    });
    if (!apply.ok) throw new Error(`definition.apply_change_set failed: ${JSON.stringify(apply)}`);
    const state = apply.state as DefinitionChangeSetResult;
    recordCreationExecution(evidence, {
      change_set_id: state.change_set_id,
      status: state.status,
      child_progress: state.execution?.child_progress ?? [],
      failed_change_index: state.failed_change_index,
    });

    const stopBeforeSeed = await framework.toolRegistry.call("lifecycle.dev.stop", {});
    if (!stopBeforeSeed.ok) throw new Error(`lifecycle.dev.stop failed: ${JSON.stringify(stopBeforeSeed)}`);
    await seedPriorityRows(workspace);
    const restart = await framework.toolRegistry.call("lifecycle.dev.start", {});
    if (!restart.ok) throw new Error(`lifecycle.dev.start after seed failed: ${JSON.stringify(restart)}`);

    const baseUrl = currentBaseUrl(framework);
    const config = state.after;
    const candidate = await createVerifiedReleaseCandidate({
      workspace,
      baseUrl,
      definition_fingerprint: definitionFingerprint(config),
    });
    recordCreationReleaseCandidate(evidence, candidate);
    finalizeCreationToReleaseEvidence(evidence, candidate.status === "ready" ? "release_candidate_ready" : "failed_repair_required");
    return evidence;
  } finally {
    await framework.close();
  }
}

function runFailurePath(): CreationToReleaseEvidence {
  const evidence = createCreationToReleaseEvidence({
    run_id: "m9-failure",
    builder_request: "Add a Priority Queue to Knowledge Inbox and prepare it as a release candidate.",
  });
  recordCreationProposal(evidence, {
    intent: "Review inbox items by priority",
    summary: "Add Priority Queue",
    tool: "definition.apply_change_set",
    changes: priorityCapabilityChanges,
  });
  recordCreationApproval(evidence, {
    prompt_id: "m9-simulated-failure-approval",
    decision: "allow",
  });
  recordCreationExecution(evidence, {
    change_set_id: "m9-simulated-failure-change-set",
    status: "failed",
    failed_change_index: 1,
    child_progress: [
      { index: 0, operation_id: "add_table_column", status: "applied" },
      {
        index: 1,
        operation_id: "add_operation",
        status: "failed",
        failure: {
          category: "operation_failed",
          message: "definition.apply operation returned HTTP 500",
        },
      },
      { index: 2, operation_id: "add_view", status: "pending" },
      { index: 3, operation_id: "add_policy_rule", status: "pending" },
    ],
  });
  recordCreationRecovery(evidence, {
    status: "manual_repair_required",
    strategy: "manual_repair",
    reason: "A child mutation completed before the change set failed.",
    options: ["definition.repair.status", "definition.repair.reset_to_last_good"],
  });
  finalizeCreationToReleaseEvidence(evidence, "failed_repair_required");
  return evidence;
}

async function main(): Promise<void> {
  const workspace = requireWorkspace();
  const evidenceDir = join(workspace, ".pneuma", "m9");
  mkdirSync(evidenceDir, { recursive: true });

  const success = await runSuccessPath(workspace);
  const failure = runFailurePath();
  const successPath = join(evidenceDir, "success-evidence.json");
  const failurePath = join(evidenceDir, "failure-evidence.json");
  writeFileSync(successPath, serializeCreationToReleaseEvidence(success));
  writeFileSync(failurePath, serializeCreationToReleaseEvidence(failure));

  console.log("M9 Creation-to-Release Integrity ready:");
  console.log(`success final: ${success.final_status}`);
  console.log(`failure final: ${failure.final_status}`);
  console.log(`success evidence: ${successPath}`);
  console.log(`failure evidence: ${failurePath}`);
}

await main();
