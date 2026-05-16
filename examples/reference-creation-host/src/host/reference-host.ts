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
import { evolveNotesForReviewQueue, seedTeamNotes, type TeamNote, type TeamNoteV0, type TeamNoteV1 } from "../domain/team-notes.js";
import { createDeterministicReviewQueueDraftAgent, type ReviewQueueDraftAgent } from "./code-agent.js";
import { proposeReviewQueueFeature } from "./deterministic-agent.js";
import { teamNotesScaffoldManifest } from "./review-queue-tool.js";
import {
  createProjectState,
  appendProjectAgentLog,
  dataDir,
  loadState,
  projectDir,
  updateProject,
  type ReferenceProjectRecord,
} from "./workspace.js";

export interface ReferenceHostOptions {
  readonly workspace: string;
  readonly draft_agent?: ReviewQueueDraftAgent;
}

export interface ProjectState {
  readonly app_id: string;
  readonly version_id: "v0" | "v1";
  readonly notes: readonly TeamNote[];
}

export interface EvolutionState {
  readonly status: "awaiting_reviewer_approval";
  readonly proposal_id: string;
  readonly review_packet: ReferenceProjectRecord["pending_evolution"] extends infer Pending
    ? Pending extends { readonly review_packet: infer Packet }
      ? Packet
      : never
    : never;
}

export type EvolutionDecisionState =
  | { readonly status: "blocked"; readonly reason: string }
  | { readonly status: "ready_to_preview"; readonly data_receipt: DataEvolutionReceipt };

export interface PublishedState {
  readonly status: "published";
  readonly url: string;
  readonly notes: readonly TeamNoteV1[];
}

export interface ReferenceHost {
  createProject(input: { readonly app_id: string; readonly builder_user_id: string }): Promise<ProjectState>;
  requestReviewQueueEvolution(input: {
    readonly app_id: string;
    readonly builder_subject: string;
    readonly message: string;
  }): Promise<EvolutionState>;
  approveEvolution(input: {
    readonly app_id: string;
    readonly proposal_id: string;
    readonly subject: string;
  }): Promise<EvolutionDecisionState>;
  startPreview(input: { readonly app_id: string }): Promise<{ readonly url: string }>;
  publish(input: { readonly app_id: string }): Promise<PublishedState>;
  rollback(input: { readonly app_id: string }): Promise<{ readonly status: "rolled_back"; readonly active_version_id: string }>;
  state(): ReferenceProjectRecord | undefined;
  close(): Promise<void>;
}

export function createReferenceHost(options: ReferenceHostOptions): ReferenceHost {
  const workspace = resolve(options.workspace);
  const threadStore = createFileBuildThreadStore({ workspace });
  const runtime = createDeterministicRuntimeAdapter();
  const draftAgent = options.draft_agent ?? createDeterministicReviewQueueDraftAgent();

  function rolloutStore(appId: string): FileReleaseRolloutStore {
    return new FileReleaseRolloutStore({ workspace: join(workspace, "rollout", appId) });
  }

  function project(appId: string): ReferenceProjectRecord {
    const record = loadState(workspace).projects[appId];
    if (!record) throw new Error(`Project ${appId} does not exist.`);
    return record;
  }

  return {
    async createProject(input) {
      mkdirSync(projectDir(workspace, input.app_id), { recursive: true });
      const thread = await threadStore.startThread({
        profile_id: "local-bun-sqlite",
        app_id: input.app_id,
        builder_user_id: input.builder_user_id,
      });
      const notes = seedTeamNotes();
      createProjectState(workspace, {
        app_id: input.app_id,
        builder_user_id: input.builder_user_id,
        thread_id: thread.thread_id,
        version_id: "v0",
        active_version_id: "v0",
        status: "created",
        notes_v0: notes,
      });

      await publishVerifiedVersion({
        app_id: input.app_id,
        version_id: "v0",
        build_change_id: "change-initial",
        runtime_intent_id: "intent-publish-v0",
        data_dir: dataDir(workspace, input.app_id, "v0"),
        runtime,
        rollout_store: rolloutStore(input.app_id),
        data_receipt_required: false,
      });

      return { app_id: input.app_id, version_id: "v0", notes };
    },

    async requestReviewQueueEvolution(input) {
      const current = project(input.app_id);
      await threadStore.appendTurn(current.thread_id, {
        kind: "user",
        text: input.message,
      });
      const deterministicProposal = proposeReviewQueueFeature();
      const draftResult = await draftAgent.produceDraft({
        workspace,
        app_id: input.app_id,
        thread_id: current.thread_id,
        builder_subject: input.builder_subject,
        builder_message: input.message,
        proposal_id: deterministicProposal.proposal_id,
        build_change_id: deterministicProposal.build_change_id,
        thread_store: threadStore,
        context_snapshot: {
          app_id: input.app_id,
          current_version_id: current.version_id,
          fields: ["title", "body", "owner", "status"],
          requested_field: "review_status",
        },
        append_log: (entry, options) => appendProjectAgentLog(workspace, input.app_id, entry, options),
      });
      const review = await import("@pneuma-framework/host-kit").then((hostKit) =>
        hostKit.prepareHostKitCodeChangeReview({
          manifest: teamNotesScaffoldManifest(),
          source_root: draftResult.source,
          draft_root: draftResult.draft,
          proposal_id: deterministicProposal.proposal_id,
          build_change_id: deterministicProposal.build_change_id,
          app_id: input.app_id,
          thread_id: current.thread_id,
          builder_subject: input.builder_subject,
          summary: deterministicProposal.summary,
          rationale: deterministicProposal.rationale,
          risks: ["source_code_change", "data_migration"],
          migration_mode: "carry_forward_with_receipt",
          command_runner: async () => ({ ok: true, output: "ok" }),
        })
      );
      if (!review.ok) throw new Error("Review queue proposal failed pre-proposal guardrails.");
      await threadStore.appendTurn(current.thread_id, {
        kind: "agent_proposal",
        proposal_id: review.proposal.proposal_id,
        summary: review.proposal.summary,
        rationale: review.proposal.rationale,
        tool_calls: [{ name: "add_review_queue_feature", arguments: { app_id: input.app_id } }],
      });
      const updated = updateProject(workspace, input.app_id, (record) => ({
        ...record,
        status: "awaiting_reviewer_approval",
          pending_evolution: {
            proposal_id: review.proposal.proposal_id,
            build_change_id: deterministicProposal.build_change_id,
            proposal: review.proposal,
            review_packet: review.review_packet,
            code_agent_receipt: draftResult.receipt,
            decisions: [],
          },
      }));

      return {
        status: "awaiting_reviewer_approval",
        proposal_id: review.proposal.proposal_id,
        review_packet: updated.pending_evolution!.review_packet,
      };
    },

    async approveEvolution(input) {
      const current = project(input.app_id);
      const pending = current.pending_evolution;
      if (!pending) throw new Error("No pending evolution exists.");
      const decisions: readonly BuildChangeGovernanceDecisionInput[] = [
        ...pending.decisions,
        { subject: input.subject, decision: "approved", decided_at_ms: Date.now() },
      ];
      const approval = evaluateHostKitApproval({
        app_id: input.app_id,
        build_change_id: pending.build_change_id,
        builder_subject: current.builder_user_id,
        risks: pending.review_packet.risk_classification,
        evidence_refs: pending.review_packet.evidence_refs,
        policy: governancePolicy(input.app_id, current.builder_user_id),
        decisions,
      });

      if (!approval.allowed) {
        updateProject(workspace, input.app_id, (record) => ({
          ...record,
          status: "blocked",
          last_block_reason: approval.reason_code,
          pending_evolution: pending ? { ...pending, decisions } : undefined,
        }));
        return { status: "blocked", reason: approval.reason_code };
      }

      const source = join(projectDir(workspace, input.app_id), "source");
      const draft = join(projectDir(workspace, input.app_id), "draft");
      const applied = await applyApprovedHostKitCodeChange({
        manifest: teamNotesScaffoldManifest(),
        source_root: source,
        draft_root: draft,
        proposal: pending.proposal,
        approval,
        command_runner: async () => ({ ok: true, output: "ok" }),
      });
      if (!applied.ok) {
        updateProject(workspace, input.app_id, (record) => ({
          ...record,
          status: "blocked",
          last_block_reason: applied.phase,
        }));
        return { status: "blocked", reason: applied.phase };
      }

      const rehearsal = await runPreviewDataRehearsal({
        app_id: input.app_id,
        source_version_id: "v0",
        target_version_id: "v1",
        provider_profile_id: "local-sqlite",
        policy: "carry-forward-with-receipt",
        adapter: dataEvolutionAdapter(current.notes_v0),
      });
      if (!rehearsal.ok) {
        updateProject(workspace, input.app_id, (record) => ({
          ...record,
          status: "blocked",
          last_block_reason: rehearsal.reason,
        }));
        return { status: "blocked", reason: rehearsal.reason };
      }

      await threadStore.appendTurn(current.thread_id, {
        kind: "user_decision",
        proposal_id: pending.proposal_id,
        decision: "approved",
        reason: "Reviewer approved source and data evolution.",
      });
      await threadStore.appendTurn(current.thread_id, {
        kind: "host_execution_receipt",
        proposal_id: pending.proposal_id,
        status: "completed",
        evidence: {
          data_receipt_id: rehearsal.receipt.receipt_id,
          code_change_receipt: applied.receipt.proposal_id,
        },
      });

      const evolvedNotes = evolveNotesForReviewQueue(current.notes_v0);
      updateProject(workspace, input.app_id, (record) => ({
        ...record,
        version_id: "v1",
        status: "ready_to_preview",
        notes_v1: evolvedNotes,
        data_receipt: rehearsal.receipt,
        pending_evolution: { ...pending, decisions },
      }));
      return { status: "ready_to_preview", data_receipt: rehearsal.receipt };
    },

    async startPreview(input) {
      const current = project(input.app_id);
      const handle = await runtime.startPreview({
        app_id: input.app_id,
        version_id: current.version_id,
        workspace,
      });
      updateProject(workspace, input.app_id, (record) => ({
        ...record,
        status: "previewing",
        preview_url: handle.url,
      }));
      return { url: handle.url };
    },

    async publish(input) {
      const current = project(input.app_id);
      if (!current.data_receipt || !current.notes_v1) {
        throw new Error("Project is not ready to publish.");
      }
      const published = await publishVerifiedVersion({
        app_id: input.app_id,
        version_id: "v1",
        build_change_id: current.pending_evolution?.build_change_id ?? "change-review-queue",
        runtime_intent_id: "intent-publish-v1",
        data_dir: dataDir(workspace, input.app_id, "v1"),
        runtime,
        rollout_store: rolloutStore(input.app_id),
        data_receipt: current.data_receipt,
        data_receipt_required: true,
      });
      if (!published.ok) throw new Error(`Publish failed: ${published.reason}`);
      const updated = updateProject(workspace, input.app_id, (record) => ({
        ...record,
        status: "published",
        active_version_id: "v1",
        published_url: published.url,
      }));
      return {
        status: "published",
        url: published.url,
        notes: updated.notes_v1 ?? [],
      };
    },

    async rollback(input) {
      const rolledBack = await rollbackPublishedVersion({
        app_id: input.app_id,
        build_change_id: "change-review-queue",
        runtime_intent_id: "intent-rollback-v1",
        runtime,
        rollout_store: rolloutStore(input.app_id),
        reason: "Builder requested rollback.",
      });
      if (!rolledBack.ok) throw new Error(`Rollback failed: ${rolledBack.reason}`);
      updateProject(workspace, input.app_id, (record) => ({
        ...record,
        status: "rolled_back",
        active_version_id: "v0",
      }));
      return { status: "rolled_back", active_version_id: rolledBack.active_version_id };
    },

    state() {
      const projects = Object.values(loadState(workspace).projects);
      return projects[0];
    },

    async close() {
      await draftAgent.close?.();
    },
  };
}

function governancePolicy(appId: string, builderSubject: string): BuildChangeGovernancePolicy {
  return {
    policy_id: "team-notes-governance",
    app_id: appId,
    role_assignments: [
      { subject: builderSubject, role: "builder" },
      { subject: "user:alice", role: "reviewer" },
    ],
    routes: [
      {
        route_id: "source-and-data-review",
        risks: ["source_code_change", "data_migration"],
        required_roles: ["reviewer"],
      },
    ],
  };
}

function dataEvolutionAdapter(notes: readonly TeamNoteV0[]): DataEvolutionAdapter {
  return {
    cloneForPreview: async (input) => ({
      target_id: `${input.app_id}-preview-${input.target_version_id}`,
      source_version_id: input.source_version_id,
      target_version_id: input.target_version_id,
      provider_profile_id: input.provider_profile_id,
    }),
    rehearse: async (input) => receiptFor(input.app_id, notes, input.policy, "receipt-preview-v1"),
    applyForPublish: async (input) => receiptFor(input.app_id, notes, input.policy, "receipt-publish-v1"),
  };
}

function receiptFor(
  appId: string,
  notes: readonly TeamNoteV0[],
  policy: "carry-forward-with-receipt",
  receiptId: string,
): DataEvolutionReceipt {
  return {
    receipt_id: receiptId,
    app_id: appId,
    source_version_id: "v0",
    target_version_id: "v1",
    provider_profile_id: "local-sqlite",
    policy,
    status: "completed",
    created_at_ms: Date.now(),
    steps: [
      {
        id: "default-review-status",
        status: "passed",
        message: `Assigned review_status=not_required to ${notes.length} existing notes.`,
      },
    ],
    evidence_refs: [{ kind: "host_check", check_id: "default-review-status", status: "passed" }],
  };
}

function createDeterministicRuntimeAdapter(): HostRuntimeAdapter {
  return {
    startPreview: async (input) => ({
      runtime_generation_id: `preview-${input.app_id}-${input.version_id}`,
      url: `http://127.0.0.1:9300/preview/${input.app_id}`,
    }),
    stopPreview: async () => undefined,
    startPublished: async (input) => ({
      runtime_generation_id: `published-${input.app_id}-${input.version_id}`,
      url: `http://127.0.0.1:${input.version_id === "v0" ? "9400" : "9401"}/app/${input.app_id}`,
    }),
    stopPublished: async () => undefined,
    waitUntilReady: async (input) => ({
      ok: true,
      checks: [{ name: "health", status: "passed", message: `ready ${input.url}`, at_ms: Date.now() }],
    }),
  };
}
