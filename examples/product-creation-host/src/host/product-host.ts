import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  FileReleaseRolloutStore,
  createFileBuildThreadStore,
  type BuildChangeGovernanceDecisionInput,
  type BuildChangeGovernancePolicy,
  type DataEvolutionReceipt,
} from "@pneuma-framework/core";
import {
  applyApprovedHostKitCodeChange,
  evaluateHostKitApproval,
  publishVerifiedVersion,
  rollbackPublishedVersion,
  runPreviewDataRehearsal,
  type DataEvolutionAdapter,
  type HostRuntimeAdapter,
} from "@pneuma-framework/host-kit";
import {
  createInitialDevBoard,
  migrateItemsForDefinition,
  mentionsBlockerTriage,
  mentionsCiHealth,
  mentionsDeliveryTimeline,
  mentionsDependencyMap,
  mentionsGitHubAttention,
  mentionsPriorityLane,
  mentionsReviewQueue,
  moduleSummary,
  type DevBoardDefinition,
  type DevBoardItem,
  type DevBoardTemplateId,
} from "../domain/dev-board.js";
import {
  defaultDevBoardRuntimeExtension,
  mentionsDirectOwnerEditing,
} from "../domain/runtime-extension.js";
import { createDeterministicDevBoardDraftAgent, type DevBoardDraftAgent } from "./code-agent.js";
import { devBoardScaffoldManifest } from "./scaffold.js";
import {
  ProductHostStore,
  readBoardDefinition,
  readRuntimeExtension,
  type ProductHostSnapshot,
  type ProductProjectRecord,
  type ProductShareArtifactRecord,
} from "./store.js";

export interface ProductCreationHostOptions {
  readonly workspace: string;
  readonly base_url: string;
  readonly draft_agent?: DevBoardDraftAgent;
}

export interface CreateProjectInput {
  readonly name: string;
  readonly goal: string;
  readonly template_id: DevBoardTemplateId;
  readonly builder_subject: string;
}

export interface RequestEvolutionInput {
  readonly app_id: string;
  readonly builder_subject: string;
  readonly message: string;
}

export interface ApproveEvolutionInput {
  readonly app_id: string;
  readonly subject: string;
  readonly decision?: "approved" | "denied";
  readonly reason?: string;
}

export interface ProductCreationHost {
  createProject(input: CreateProjectInput): Promise<ProductProjectRecord>;
  requestEvolution(input: RequestEvolutionInput): Promise<{ readonly proposal_id: string; readonly status: "awaiting_builder_confirmation" }>;
  approveEvolution(input: ApproveEvolutionInput): Promise<
    | { readonly status: "blocked"; readonly reason: string }
    | { readonly status: "ready_to_preview"; readonly version_id: string; readonly data_receipt: DataEvolutionReceipt }
  >;
  startPreview(input: { readonly app_id: string }): Promise<{ readonly url: string }>;
  publish(input: { readonly app_id: string }): Promise<{ readonly url: string; readonly version_id: string }>;
  rollback(input: { readonly app_id: string }): Promise<{ readonly active_version_id: string }>;
  share(input: { readonly app_id: string }): Promise<ProductShareArtifactRecord>;
  fork(input: { readonly artifact_id: string; readonly name: string; readonly builder_subject: string }): Promise<ProductProjectRecord>;
  snapshot(): ProductHostSnapshot;
  store: ProductHostStore;
  close(): Promise<void>;
}

export function createProductCreationHost(options: ProductCreationHostOptions): ProductCreationHost {
  const workspace = resolve(options.workspace);
  mkdirSync(workspace, { recursive: true });
  const store = new ProductHostStore({ workspace });
  const threadStore = createFileBuildThreadStore({ workspace: join(workspace, ".threads") });
  const runtime = createRouteRuntimeAdapter(options.base_url);
  const draftAgent = options.draft_agent ?? createDeterministicDevBoardDraftAgent();

  function rolloutStore(appId: string): FileReleaseRolloutStore {
    return new FileReleaseRolloutStore({ workspace: join(workspace, "rollout", appId) });
  }

  return {
    store,

    async createProject(input) {
      const appId = uniqueAppId(store, slugify(input.name || input.template_id));
      const now = Date.now();
      const thread = await threadStore.startThread({
        profile_id: "local-bun-sqlite",
        app_id: appId,
        builder_user_id: input.builder_subject,
      });
      const initial = createInitialDevBoard({
        app_id: appId,
        name: input.name,
        goal: input.goal,
        template_id: input.template_id,
      });
      const project: ProductProjectRecord = {
        app_id: appId,
        name: input.name,
        goal: input.goal,
        template_id: input.template_id,
        profile_id: "local-bun-sqlite",
        builder_subject: input.builder_subject,
        confirmation_subject: input.builder_subject,
        status: "draft",
        thread_id: thread.thread_id,
        current_version_id: "v0",
        created_at_ms: now,
        updated_at_ms: now,
      };
      const created = store.createProject(project, {
        app_id: appId,
        version_id: "v0",
        definition: initial.definition,
        runtime_extension: defaultDevBoardRuntimeExtension(),
        items: initial.items,
        created_at_ms: now,
      });
      store.appendAgentLog(appId, {
        kind: "host",
        text: `Project created with ${moduleSummary(initial.definition)} modules.`,
      });
      return created;
    },

    async requestEvolution(input) {
      const project = store.getProject(input.app_id);
      await threadStore.appendTurn(project.thread_id, {
        kind: "user",
        text: input.message,
      });
      store.appendAgentLog(input.app_id, {
        kind: "host",
        text: `Builder request received: ${input.message}`,
      });
      const currentVersion = store.latestVersion(input.app_id);
      const proposal = proposalFor(input.app_id, input.message);
      let draftResult;
      try {
        draftResult = await draftAgent.produceDraft({
          app_id: input.app_id,
          thread_id: project.thread_id,
          builder_subject: input.builder_subject,
          builder_message: input.message,
          proposal_id: proposal.proposal_id,
          build_change_id: proposal.build_change_id,
          source_root: currentVersion.source_root,
          draft_root: currentVersion.draft_root,
          thread_store: threadStore,
          context_snapshot: {
            app_id: input.app_id,
            version_id: currentVersion.version_id,
            definition: currentVersion.definition,
            runtime_extension: currentVersion.runtime_extension,
            items: currentVersion.items.slice(0, 3),
          },
          append_log: (entry, opts) => store.appendAgentLog(input.app_id, entry, opts),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        store.appendAgentLog(input.app_id, {
          kind: "error",
          text: `Draft generation blocked: ${message}`,
        });
        store.updateProject(input.app_id, {
          status: "blocked",
          last_block_reason: "draft_generation_blocked",
        });
        throw err;
      }
      const review = await import("@pneuma-framework/host-kit").then((hostKit) =>
        hostKit.prepareHostKitCodeChangeReview({
          manifest: devBoardScaffoldManifest(),
          source_root: draftResult.source,
          draft_root: draftResult.draft,
          proposal_id: proposal.proposal_id,
          build_change_id: proposal.build_change_id,
          app_id: input.app_id,
          thread_id: project.thread_id,
          builder_subject: input.builder_subject,
          summary: proposal.summary,
          rationale: proposal.rationale,
          risks: ["source_code_change", "data_migration"],
          migration_mode: "carry_forward_with_receipt",
          command_runner: async () => ({ ok: true, output: "ok" }),
        })
      );
      if (!review.ok) {
        store.updateProject(input.app_id, {
          status: "blocked",
          last_block_reason: "pre_proposal_guardrail_failed",
        });
        throw new Error("Proposal failed pre-proposal guardrails.");
      }
      await threadStore.appendTurn(project.thread_id, {
        kind: "agent_proposal",
        proposal_id: review.proposal.proposal_id,
        summary: review.proposal.summary,
        rationale: review.proposal.rationale,
        tool_calls: [{ name: "code_change.apply", arguments: { changed_files: review.proposal.evidence.changed_files } }],
      });
      store.savePendingEvolution({
        app_id: input.app_id,
        proposal_id: review.proposal.proposal_id,
        build_change_id: proposal.build_change_id,
        builder_message: input.message,
        proposal: review.proposal,
        review_packet: review.review_packet,
        code_agent_receipt: draftResult.receipt,
        decisions: [],
        created_at_ms: Date.now(),
      });
      store.updateProject(input.app_id, { status: "awaiting_builder_confirmation", last_block_reason: undefined });
      return { proposal_id: review.proposal.proposal_id, status: "awaiting_builder_confirmation" };
    },

    async approveEvolution(input) {
      const project = store.getProject(input.app_id);
      const pending = store.getPendingEvolution(input.app_id);
      if (!pending) throw new Error("No pending evolution exists.");
      const decisions: readonly BuildChangeGovernanceDecisionInput[] = [
        ...pending.decisions,
        {
          subject: input.subject,
          decision: input.decision ?? "approved",
          decided_at_ms: Date.now(),
          reason: input.reason,
        },
      ];
      const approval = evaluateHostKitApproval({
        app_id: input.app_id,
        build_change_id: pending.build_change_id,
        builder_subject: project.builder_subject,
        risks: pending.review_packet.risk_classification,
        evidence_refs: pending.review_packet.evidence_refs,
        policy: governancePolicy(input.app_id, project.builder_subject),
        decisions,
      });
      store.savePendingEvolution({ ...pending, decisions });

      if (!approval.allowed) {
        store.updateProject(input.app_id, {
          status: "blocked",
          last_block_reason: approval.reason_code,
        });
        store.appendAgentLog(input.app_id, { kind: "host", text: `Approval blocked: ${approval.reason_code}` });
        return { status: "blocked", reason: approval.reason_code };
      }

      const currentVersion = store.latestVersion(input.app_id);
      const applied = await applyApprovedHostKitCodeChange({
        manifest: devBoardScaffoldManifest(),
        source_root: currentVersion.source_root,
        draft_root: currentVersion.draft_root,
        proposal: pending.proposal,
        approval,
        command_runner: async () => ({ ok: true, output: "ok" }),
      });
      if (!applied.ok) {
        store.updateProject(input.app_id, {
          status: "blocked",
          last_block_reason: applied.phase,
        });
        store.appendAgentLog(input.app_id, { kind: "host", text: `Code apply failed: ${applied.phase}` });
        return { status: "blocked", reason: applied.phase };
      }

      const nextDefinition = readBoardDefinition(currentVersion.source_root);
      const nextRuntimeExtension = readRuntimeExtension(currentVersion.source_root);
      const nextVersionId = store.nextVersionId(input.app_id);
      const rehearsal = await runPreviewDataRehearsal({
        app_id: input.app_id,
        source_version_id: currentVersion.version_id,
        target_version_id: nextVersionId,
        provider_profile_id: "local-sqlite",
        policy: "carry-forward-with-receipt",
        adapter: dataEvolutionAdapter(currentVersion.items, nextDefinition),
      });
      if (!rehearsal.ok) {
        store.updateProject(input.app_id, {
          status: "blocked",
          last_block_reason: rehearsal.reason,
        });
        return { status: "blocked", reason: rehearsal.reason };
      }

      const evolvedItems = migrateItemsForDefinition(currentVersion.items, nextDefinition);
      const saved = store.saveVersion({
        app_id: input.app_id,
        version_id: nextVersionId,
        definition: nextDefinition,
        runtime_extension: nextRuntimeExtension,
        items: evolvedItems,
        source_root: currentVersion.source_root,
        draft_root: currentVersion.draft_root,
        data_dir: store.dataDir(input.app_id, nextVersionId),
        created_at_ms: Date.now(),
      });
      store.savePendingEvolution({ ...pending, decisions, data_receipt: rehearsal.receipt });
      store.updateProject(input.app_id, {
        status: "ready_to_preview",
        current_version_id: saved.version_id,
        last_block_reason: undefined,
      });
      await threadStore.appendTurn(project.thread_id, {
        kind: "user_decision",
        proposal_id: pending.proposal_id,
        decision: "approved",
        reason: "Builder confirmed the proposal and approved source/data evolution.",
      });
      await threadStore.appendTurn(project.thread_id, {
        kind: "host_execution_receipt",
        proposal_id: pending.proposal_id,
        status: "completed",
        evidence: {
          data_receipt_id: rehearsal.receipt.receipt_id,
          code_change_receipt: applied.receipt.proposal_id,
          version_id: saved.version_id,
        },
      });
      store.appendAgentLog(input.app_id, {
        kind: "host",
        text: `Approved and applied. ${input.app_id}@${saved.version_id} is ready to preview.`,
      });
      return { status: "ready_to_preview", version_id: saved.version_id, data_receipt: rehearsal.receipt };
    },

    async startPreview(input) {
      const project = store.getProject(input.app_id);
      const version = store.getVersion(input.app_id, project.current_version_id);
      const handle = await runtime.startPreview({
        app_id: input.app_id,
        version_id: version.version_id,
        workspace,
      });
      store.updateProject(input.app_id, { status: "previewing", preview_url: handle.url });
      return { url: handle.url };
    },

    async publish(input) {
      const project = store.getProject(input.app_id);
      const version = store.getVersion(input.app_id, project.current_version_id);
      const pending = store.getPendingEvolution(input.app_id);
      const dataReceiptRequired = version.version_id !== "v0";
      const published = await publishVerifiedVersion({
        app_id: input.app_id,
        version_id: version.version_id,
        build_change_id: pending?.build_change_id ?? `initial-${version.version_id}`,
        runtime_intent_id: `publish-${input.app_id}-${version.version_id}`,
        data_dir: version.data_dir,
        runtime,
        rollout_store: rolloutStore(input.app_id),
        data_receipt: pending?.data_receipt,
        data_receipt_required: dataReceiptRequired,
      });
      if (!published.ok) throw new Error(`Publish failed: ${published.reason}`);
      store.updateProject(input.app_id, {
        status: "published",
        active_version_id: version.version_id,
        published_url: published.url,
        preview_url: undefined,
      });
      return { url: published.url, version_id: version.version_id };
    },

    async rollback(input) {
      const pending = store.getPendingEvolution(input.app_id);
      const rolledBack = await rollbackPublishedVersion({
        app_id: input.app_id,
        build_change_id: pending?.build_change_id ?? "rollback",
        runtime_intent_id: `rollback-${input.app_id}`,
        runtime,
        rollout_store: rolloutStore(input.app_id),
        reason: "Builder requested rollback.",
      });
      if (!rolledBack.ok) throw new Error(`Rollback failed: ${rolledBack.reason}`);
      store.updateProject(input.app_id, {
        status: "published",
        active_version_id: rolledBack.active_version_id,
        published_url: `${options.base_url}/app/${input.app_id}`,
        preview_url: undefined,
      });
      return { active_version_id: rolledBack.active_version_id };
    },

    async share(input) {
      const project = store.getProject(input.app_id);
      if (!project.active_version_id) throw new Error("Publish before sharing.");
      const version = store.getVersion(input.app_id, project.active_version_id);
      const artifactId = `share-${input.app_id}-${version.version_id}-${Date.now().toString(36)}`;
      return store.saveShareArtifact({
        artifact_id: artifactId,
        app_id: input.app_id,
        version_id: version.version_id,
        created_at_ms: Date.now(),
        manifest: {
          schema_version: 1,
          artifact_id: artifactId,
          app_id: input.app_id,
          app_name: project.name,
          version_id: version.version_id,
          source_snapshot: {
            definition: version.definition,
            runtime_extension: version.runtime_extension,
          },
          init_recipe: {
            steps: [
              {
                id: "seed-dev-board-items",
                kind: "semantic-operation",
                operation_id: "seed_items",
                payload: { items: version.items },
              },
            ],
          },
          provider_requirements: [
            { provider_id: "github-public", purpose: "Optional public GitHub issue/PR attention cards." },
            { provider_id: "manual", purpose: "Manual notes and release checklist data." },
          ],
          fork_policy: { allow_fork: true, requires_credential_rebinding: false },
        },
      });
    },

    async fork(input) {
      const artifact = store.getShareArtifact(input.artifact_id);
      const sourceProject = store.getProject(artifact.app_id);
      const appId = uniqueAppId(store, slugify(input.name || `${sourceProject.name}-fork`));
      const now = Date.now();
      const thread = await threadStore.startThread({
        profile_id: "local-bun-sqlite",
        app_id: appId,
        builder_user_id: input.builder_subject,
      });
      const seedItems = extractSeedItems(artifact.manifest);
      const project: ProductProjectRecord = {
        app_id: appId,
        name: input.name,
        goal: `Forked from ${sourceProject.name}.`,
        template_id: "fork",
        profile_id: "local-bun-sqlite",
        builder_subject: input.builder_subject,
        confirmation_subject: input.builder_subject,
        status: "forked",
        thread_id: thread.thread_id,
        current_version_id: "v0",
        source_app_id: artifact.app_id,
        created_at_ms: now,
        updated_at_ms: now,
      };
      const created = store.createProject(project, {
        app_id: appId,
        version_id: "v0",
        definition: {
          ...artifact.manifest.source_snapshot.definition,
          board_id: appId,
          title: input.name,
          description: `Forked from ${sourceProject.name}.`,
        },
        runtime_extension: artifact.manifest.source_snapshot.runtime_extension ?? defaultDevBoardRuntimeExtension(),
        items: seedItems,
        created_at_ms: now,
      });
      store.appendAgentLog(appId, {
        kind: "host",
        text: `Forked from ${artifact.app_id}@${artifact.version_id} via ${artifact.artifact_id}.`,
      });
      return created;
    },

    snapshot() {
      return store.snapshot();
    },

    async close() {
      await draftAgent.close?.();
      store.close();
    },
  };
}

function governancePolicy(appId: string, builderSubject: string): BuildChangeGovernancePolicy {
  return {
    policy_id: "dev-board-builder-confirmation",
    app_id: appId,
    role_assignments: [
      { subject: builderSubject, role: "builder" },
    ],
    routes: [
      {
        route_id: "source-data-builder-confirmation",
        risks: ["source_code_change", "data_migration"],
        required_roles: ["builder"],
      },
    ],
  };
}

function dataEvolutionAdapter(
  items: readonly DevBoardItem[],
  nextDefinition: DevBoardDefinition,
): DataEvolutionAdapter {
  return {
    cloneForPreview: async (input) => ({
      target_id: `${input.app_id}-preview-${input.target_version_id}`,
      source_version_id: input.source_version_id,
      target_version_id: input.target_version_id,
      provider_profile_id: input.provider_profile_id,
    }),
    rehearse: async (input) => receiptFor(
      input.app_id,
      items,
      nextDefinition,
      input.policy,
      input.preview_target.target_version_id,
      input.preview_target.source_version_id,
    ),
    applyForPublish: async (input) => receiptFor(
      input.app_id,
      items,
      nextDefinition,
      input.policy,
      input.target_version_id,
      input.source_version_id,
    ),
  };
}

function receiptFor(
  appId: string,
  items: readonly DevBoardItem[],
  definition: DevBoardDefinition,
  policy: "carry-forward-with-receipt",
  targetVersionId: string,
  sourceVersionId?: string,
): DataEvolutionReceipt {
  const migrated = migrateItemsForDefinition(items, definition);
  return {
    receipt_id: `data-rehearsal-${appId}-${targetVersionId}`,
    app_id: appId,
    source_version_id: sourceVersionId ?? "unknown",
    target_version_id: targetVersionId,
    provider_profile_id: "local-sqlite",
    policy,
    status: "completed",
    created_at_ms: Date.now(),
    steps: [
      {
        id: "carry-forward-dev-board-items",
        status: "passed",
        message: `Carried ${migrated.length} items into ${moduleSummary(definition)} schema.`,
      },
    ],
    evidence_refs: [{ kind: "host_check", check_id: "carry-forward-dev-board-items", status: "passed" }],
  };
}

function createRouteRuntimeAdapter(baseUrl: string): HostRuntimeAdapter {
  return {
    startPreview: async (input) => ({
      runtime_generation_id: `preview-${input.app_id}-${input.version_id}`,
      url: `${baseUrl}/preview/${input.app_id}`,
    }),
    stopPreview: async () => undefined,
    startPublished: async (input) => ({
      runtime_generation_id: `published-${input.app_id}-${input.version_id}`,
      url: `${baseUrl}/app/${input.app_id}`,
    }),
    stopPublished: async () => undefined,
    waitUntilReady: async (input) => ({
      ok: true,
      checks: [{ name: "health", status: "passed", message: `ready ${input.url}`, at_ms: Date.now() }],
    }),
  };
}

function proposalFor(appId: string, message: string): {
  readonly proposal_id: string;
  readonly build_change_id: string;
  readonly summary: string;
  readonly rationale: string;
} {
  const suffix = Date.now().toString(36);
  return {
    proposal_id: `proposal-${appId}-${suffix}`,
    build_change_id: `change-${appId}-${suffix}`,
    summary: summarizeIntent(message),
    rationale: "The change updates the generated Dev Board source, then the Host rehearses data carry-forward before publish.",
  };
}

function summarizeIntent(message: string): string {
  const lower = message.toLowerCase();
  const requested: string[] = [];
  if (mentionsReviewQueue(lower)) requested.push("review queue");
  if (mentionsGitHubAttention(lower)) requested.push("GitHub attention");
  if (mentionsPriorityLane(lower)) requested.push("priority lane");
  if (mentionsDependencyMap(lower)) requested.push("dependency map");
  if (mentionsBlockerTriage(lower)) requested.push("blocker triage");
  if (mentionsCiHealth(lower)) requested.push("CI health");
  if (mentionsDeliveryTimeline(lower)) requested.push("delivery timeline");
  if (mentionsDirectOwnerEditing(lower)) requested.push("direct owner editing");
  if (requested.length === 1) {
    if (requested[0] === "review queue") return "Add a review queue to the Dev Board.";
    if (requested[0] === "GitHub attention") return "Add GitHub attention to the Dev Board.";
    if (requested[0] === "priority lane") return "Add a priority lane to the Dev Board.";
    if (requested[0] === "dependency map") return "Add a dependency map to the Dev Board.";
    if (requested[0] === "blocker triage") return "Add blocker triage to the Dev Board.";
    if (requested[0] === "CI health") return "Add CI health to the Dev Board.";
    if (requested[0] === "direct owner editing") return "Add direct owner editing to the Dev Board.";
    return "Add a delivery timeline to the Dev Board.";
  }
  if (requested.length > 1) return `Add ${joinReadable(requested)} to the Dev Board.`;
  return "Refine the Dev Board modules.";
}

function joinReadable(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function extractSeedItems(manifest: ProductShareArtifactRecord["manifest"]): readonly DevBoardItem[] {
  const step = manifest.init_recipe.steps.find((item) => item.operation_id === "seed_items");
  const payload = step?.payload as { items?: unknown } | undefined;
  return Array.isArray(payload?.items) ? payload.items as readonly DevBoardItem[] : [];
}

function uniqueAppId(store: ProductHostStore, base: string): string {
  let candidate = base || "dev-board";
  let index = 1;
  while (store.listProjects().some((project) => project.app_id === candidate)) {
    index += 1;
    candidate = `${base}-${index}`;
  }
  return candidate;
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 44);
  return slug || "dev-board";
}
