import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createFileBuildThreadStore } from "@pneuma-framework/core";
import {
  applyApprovedHostKitCodeChange,
  prepareHostKitCodeChangeReview,
} from "@pneuma-framework/host-kit";
import {
  createInitialWorkflowApp,
  migrateRecordsForDefinition,
  validateWorkflowAppDefinition,
  type WorkflowRecord,
  type WorkflowTemplateId,
} from "../domain/workflow-app.js";
import {
  defaultWorkflowAppModuleSource,
  expectedPatchEvidenceForIntent,
  materializeWorkflowFromSourceRoot,
} from "./generated-app-module.js";
import { workflowAppScaffoldManifest } from "./scaffold.js";
import {
  WorkflowStudioStore,
  defaultRuntimeSource,
  defaultThemeSource,
  readWorkflowSource,
  writeWorkflowSource,
  type WorkflowProjectRecord,
  type WorkflowAgentLogEntry,
  type WorkflowShareArtifactRecord,
  type WorkflowSourceSnapshot,
  type WorkflowStudioSnapshot,
} from "./store.js";
import {
  createDeterministicWorkflowDraftAgent,
  type WorkflowDraftAgent,
} from "./workflow-code-agent.js";

export interface WorkflowAppStudioOptions {
  readonly workspace: string;
  readonly base_url: string;
  readonly draft_agent?: WorkflowDraftAgent;
}

export interface CreateWorkflowProjectInput {
  readonly name: string;
  readonly goal: string;
  readonly template_id: WorkflowTemplateId;
  readonly builder_subject: string;
}

export interface RequestWorkflowEvolutionInput {
  readonly app_id: string;
  readonly builder_subject: string;
  readonly message: string;
}

export interface ApproveWorkflowEvolutionInput {
  readonly app_id: string;
  readonly subject: string;
  readonly decision?: "approved" | "denied";
}

export interface WorkflowAppStudio {
  readonly store: WorkflowStudioStore;
  createProject(input: CreateWorkflowProjectInput): Promise<WorkflowProjectRecord>;
  requestEvolution(input: RequestWorkflowEvolutionInput): Promise<{ readonly proposal_id: string; readonly status: "awaiting_builder_confirmation" }>;
  approveEvolution(input: ApproveWorkflowEvolutionInput): Promise<
    | { readonly status: "blocked"; readonly reason: string }
    | { readonly status: "ready_to_preview"; readonly version_id: string; readonly migrated_records: number }
  >;
  startPreview(input: { readonly app_id: string; readonly preview_id: string }): Promise<{ readonly url: string }>;
  publish(input: { readonly app_id: string }): Promise<{ readonly url: string; readonly version_id: string }>;
  rollback(input: { readonly app_id: string }): Promise<{ readonly active_version_id: string }>;
  share(input: { readonly app_id: string }): Promise<WorkflowShareArtifactRecord>;
  fork(input: { readonly artifact_id: string; readonly name: string; readonly builder_subject: string }): Promise<WorkflowProjectRecord>;
  snapshot(): WorkflowStudioSnapshot;
  close(): Promise<void>;
}

export function createWorkflowAppStudio(options: WorkflowAppStudioOptions): WorkflowAppStudio {
  const workspace = resolve(options.workspace);
  mkdirSync(workspace, { recursive: true });
  const store = new WorkflowStudioStore({ workspace });
  const threadStore = createFileBuildThreadStore({ workspace });
  const draftAgent = options.draft_agent ?? createDeterministicWorkflowDraftAgent();
  const scaffoldManifest = workflowAppScaffoldManifest();

  return {
    store,

    async createProject(input) {
      const appId = uniqueAppId(store, slugify(input.name || input.template_id));
      const now = Date.now();
      const seed = createInitialWorkflowApp({
        app_id: appId,
        title: input.name,
        purpose: input.goal,
        template_id: input.template_id,
      });
      const project: WorkflowProjectRecord = {
        app_id: appId,
        name: input.name,
        goal: input.goal,
        template_id: input.template_id,
        builder_subject: input.builder_subject,
        status: "draft",
        current_version_id: "v0",
        created_at_ms: now,
        updated_at_ms: now,
      };
      return store.createProject(project, {
        app_id: appId,
        version_id: "v0",
        source: {
          workflow: seed.definition,
          runtime: defaultRuntimeSource(),
          theme: defaultThemeSource(),
          app_code: defaultWorkflowAppModuleSource(),
        },
        records: seed.records,
        created_at_ms: now,
      });
    },

    async requestEvolution(input) {
      const project = store.getProject(input.app_id);
      const current = store.currentVersion(input.app_id);
      store.resetDraftFromSource(input.app_id);
      const thread = await threadStore.startThread({
        profile_id: project.template_id,
        app_id: input.app_id,
        builder_user_id: input.builder_subject,
      });
      await threadStore.appendTurn(thread.thread_id, {
        kind: "user",
        text: input.message,
      });
      const proposalId = `proposal-${input.app_id}-${Date.now().toString(36)}`;
      const buildChangeId = `build-change-${proposalId}`;
      const agentLogs: WorkflowAgentLogEntry[] = [];
      const appendLog = (
        entry: Omit<WorkflowAgentLogEntry, "at_ms">,
        options?: { readonly merge_with_previous?: boolean },
      ): void => {
        const at_ms = Date.now();
        if (options?.merge_with_previous) {
          const prior = agentLogs.at(-1);
          if (prior && prior.kind === entry.kind) {
            agentLogs[agentLogs.length - 1] = {
              ...prior,
              text: `${prior.text}${entry.text}`,
              at_ms,
            };
            return;
          }
        }
        agentLogs.push({ ...entry, at_ms });
      };

      let draftResult;
      try {
        draftResult = await draftAgent.produceDraft({
          app_id: input.app_id,
          thread_id: thread.thread_id,
          builder_subject: input.builder_subject,
          builder_message: input.message,
          proposal_id: proposalId,
          build_change_id: buildChangeId,
          source_root: store.sourceRoot(input.app_id),
          draft_root: store.draftRoot(input.app_id),
          thread_store: threadStore,
          context_snapshot: {
            project,
            current_version_id: current.version_id,
            current_workflow: current.source.workflow,
            scaffold_manifest: scaffoldManifest,
          },
          append_log: appendLog,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        store.updateProject(input.app_id, {
          status: "blocked",
          last_block_reason: message,
        });
        throw err;
      }

      const nextWorkflow = await materializeWorkflowFromSourceRoot(store.draftRoot(input.app_id));
      const validation = validateWorkflowAppDefinition(nextWorkflow);
      if (!validation.ok) {
        store.updateProject(input.app_id, {
          status: "blocked",
          last_block_reason: validation.issues.join("; "),
        });
        throw new Error(validation.issues.join("; "));
      }
      const draftSource = readWorkflowSource(store.draftRoot(input.app_id));
      const nextSource: WorkflowSourceSnapshot = { ...draftSource, workflow: nextWorkflow };
      const evidence = expectedPatchEvidenceForIntent(input.message);
      const summary = summarizeProposal(current.source.workflow, nextWorkflow, evidence.summary);
      const review = await prepareHostKitCodeChangeReview({
        manifest: scaffoldManifest,
        source_root: store.sourceRoot(input.app_id),
        draft_root: store.draftRoot(input.app_id),
        proposal_id: proposalId,
        build_change_id: buildChangeId,
        app_id: input.app_id,
        thread_id: thread.thread_id,
        builder_subject: project.builder_subject,
        summary,
        rationale: "The Build-phase Agent edits only src/app.ts. The Host materializes and validates the workflow before asking the Builder to approve.",
        risks: ["source_code_change", "definition_additive", "data_migration"],
        migration_mode: "carry_forward_with_receipt",
      });
      if (!review.ok) {
        const reason = review.proposal_result.checks.map((check) => `${check.id}: ${check.message}`).join("; ");
        store.updateProject(input.app_id, {
          status: "blocked",
          last_block_reason: reason,
        });
        throw new Error(reason);
      }
      await threadStore.appendTurn(thread.thread_id, {
        kind: "agent_proposal",
        proposal_id: review.proposal.proposal_id,
        summary: review.proposal.summary,
        rationale: review.proposal.rationale,
        tool_calls: [
          {
            name: "code_change.apply",
            arguments: {
              changed_files: review.proposal.evidence.changed_files,
            },
          },
        ],
      });
      store.savePendingEvolution({
        app_id: input.app_id,
        proposal_id: proposalId,
        thread_id: thread.thread_id,
        builder_message: input.message,
        interpretation: summarizeInterpretation(input.message),
        summary,
        highlights: summarizeHighlights(current.source.workflow, nextWorkflow),
        changed_files: review.proposal.evidence.changed_files,
        diff: review.proposal.evidence.diff || sourceDiff(current.source, nextSource),
        data_impact: "Existing records will be carried forward. New fields receive safe defaults. Stage ids are preserved unless the new workflow explicitly adds stages.",
        agent_mode: draftResult.mode,
        agent_logs: agentLogs,
        code_change_proposal: review.proposal,
        review_packet: review.review_packet,
        code_agent_receipt: draftResult.receipt,
        created_at_ms: Date.now(),
      });
      store.updateProject(project.app_id, {
        status: "awaiting_builder_confirmation",
        last_block_reason: undefined,
      });
      return { proposal_id: proposalId, status: "awaiting_builder_confirmation" };
    },

    async approveEvolution(input) {
      const project = store.getProject(input.app_id);
      const pending = store.getPendingEvolution(input.app_id);
      if (!pending) return { status: "blocked", reason: "No pending proposal." };
      if (input.decision === "denied") {
        store.clearPendingEvolution(input.app_id);
        store.updateProject(input.app_id, {
          status: "blocked",
          last_block_reason: "Builder denied the proposal.",
        });
        return { status: "blocked", reason: "Builder denied the proposal." };
      }
      if (input.subject !== project.builder_subject) {
        return { status: "blocked", reason: `Approval must come from ${project.builder_subject}.` };
      }
      await threadStore.appendTurn(pending.thread_id, {
        kind: "user_decision",
        proposal_id: pending.proposal_id,
        decision: "approved",
        reason: "builder-approved",
      });
      const applied = await applyApprovedHostKitCodeChange({
        manifest: scaffoldManifest,
        source_root: store.sourceRoot(input.app_id),
        draft_root: store.draftRoot(input.app_id),
        proposal: pending.code_change_proposal,
        approval: { allowed: true, reason_code: "builder-approved" },
      });
      if (!applied.ok) {
        const reason = applied.receipt.evidence.message
          ?? applied.receipt.evidence.checks.map((check) => `${check.id}: ${check.message}`).join("; ");
        store.updateProject(input.app_id, {
          status: "blocked",
          last_block_reason: reason,
        });
        return { status: "blocked", reason };
      }
      await threadStore.appendTurn(pending.thread_id, {
        kind: "host_execution_receipt",
        proposal_id: pending.proposal_id,
        status: applied.receipt.status,
        evidence: applied.receipt.evidence,
      });
      const materializedWorkflow = await materializeWorkflowFromSourceRoot(store.sourceRoot(input.app_id));
      const appliedSource = readWorkflowSource(store.sourceRoot(input.app_id));
      const draft: WorkflowSourceSnapshot = {
        ...appliedSource,
        workflow: materializedWorkflow,
      };
      writeWorkflowSource(store.sourceRoot(input.app_id), draft);
      writeWorkflowSource(store.draftRoot(input.app_id), draft);
      const validation = validateWorkflowAppDefinition(draft.workflow);
      if (!validation.ok) {
        store.updateProject(input.app_id, {
          status: "blocked",
          last_block_reason: validation.issues.join("; "),
        });
        return { status: "blocked", reason: validation.issues.join("; ") };
      }
      const current = store.currentVersion(input.app_id);
      const migrated = migrateRecordsForDefinition(current.records, draft.workflow);
      const versionId = nextVersionId(project.current_version_id);
      store.saveVersion({
        app_id: input.app_id,
        version_id: versionId,
        source: draft,
        records: migrated,
        source_root: store.sourceRoot(input.app_id),
        draft_root: store.draftRoot(input.app_id),
        data_dir: store.dataDir(input.app_id, versionId),
        created_at_ms: Date.now(),
      });
      store.clearPendingEvolution(input.app_id);
      store.updateProject(input.app_id, {
        current_version_id: versionId,
        status: "ready_to_preview",
        preview_url: undefined,
        last_block_reason: undefined,
      });
      return { status: "ready_to_preview", version_id: versionId, migrated_records: migrated.length };
    },

    async startPreview(input) {
      const url = `${options.base_url}/preview/${input.app_id}?preview_id=${input.preview_id}`;
      store.updateProject(input.app_id, { status: "previewing", preview_url: url });
      return { url };
    },

    async publish(input) {
      const project = store.getProject(input.app_id);
      const url = `${options.base_url}/app/${input.app_id}`;
      store.updateProject(input.app_id, {
        active_version_id: project.current_version_id,
        published_url: url,
        preview_url: undefined,
        status: "published",
      });
      return { url, version_id: project.current_version_id };
    },

    async rollback(input) {
      const project = store.getProject(input.app_id);
      const versions = store.listVersions(input.app_id);
      if (versions.length < 2) throw new Error("No previous version to roll back to.");
      const activeIndex = versions.findIndex((version) => version.version_id === project.active_version_id);
      const fallbackIndex = activeIndex > 0 ? activeIndex - 1 : versions.length - 2;
      const previous = versions[fallbackIndex];
      if (!previous) throw new Error("No previous version to roll back to.");
      store.updateProject(input.app_id, {
        active_version_id: previous.version_id,
        current_version_id: previous.version_id,
        status: "published",
        preview_url: undefined,
        published_url: `${options.base_url}/app/${input.app_id}`,
      });
      return { active_version_id: previous.version_id };
    },

    async share(input) {
      const project = store.getProject(input.app_id);
      const versionId = project.active_version_id ?? project.current_version_id;
      const version = store.getVersion(input.app_id, versionId);
      const artifactId = `artifact-${input.app_id}-${versionId}-${Date.now().toString(36)}`;
      return store.createShareArtifact({
        artifact_id: artifactId,
        app_id: input.app_id,
        version_id: versionId,
        manifest: {
          schema_version: 1,
          artifact_id: artifactId,
          app_id: input.app_id,
          app_name: project.name,
          version_id: versionId,
          source_snapshot: version.source,
          seed_records: version.records,
          provider_requirements: [
            { provider_id: "manual", purpose: "Workflow records are local/manual in this example." },
          ],
          fork_policy: {
            allow_fork: true,
            requires_credential_rebinding: false,
          },
        },
        created_at_ms: Date.now(),
      });
    },

    async fork(input) {
      const share = store.getShareArtifact(input.artifact_id);
      const appId = uniqueAppId(store, slugify(input.name));
      const now = Date.now();
      return store.createProject({
        app_id: appId,
        name: input.name,
        goal: `Forked from ${share.manifest.app_name}.`,
        template_id: "vendor_intake",
        builder_subject: input.builder_subject,
        status: "draft",
        current_version_id: "v0",
        source_app_id: share.app_id,
        created_at_ms: now,
        updated_at_ms: now,
      }, {
        app_id: appId,
        version_id: "v0",
        source: {
          ...share.manifest.source_snapshot,
          workflow: {
            ...share.manifest.source_snapshot.workflow,
            app_id: appId,
            title: input.name,
          },
          app_code: share.manifest.source_snapshot.app_code,
        },
        records: share.manifest.seed_records.map((record) => ({ ...record, id: `${appId}-${record.id}` })),
        created_at_ms: now,
      });
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

export function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "workflow-app";
}

export function nextVersionId(versionId: string): string {
  const current = Number(versionId.replace(/^v/, ""));
  return `v${Number.isFinite(current) ? current + 1 : 1}`;
}

export function sourceDiff(before: WorkflowSourceSnapshot, after: WorkflowSourceSnapshot): string {
  const chunks: string[] = [];
  for (const file of ["workflow", "runtime", "theme", "app_code"] as const) {
    const previous = file === "app_code" ? before.app_code : JSON.stringify(before[file], null, 2);
    const next = file === "app_code" ? after.app_code : JSON.stringify(after[file], null, 2);
    if (previous !== next) {
      const filename = file === "app_code" ? "app.ts" : `${file}.json`;
      chunks.push(`--- a/src/${filename}`);
      chunks.push(`+++ b/src/${filename}`);
      chunks.push(previous);
      chunks.push(next);
    }
  }
  return chunks.join("\n");
}

export function createWorkflowRecord(
  source: WorkflowSourceSnapshot,
  input: { readonly title: string; readonly owner: string; readonly values?: Record<string, string | number | null> },
): WorkflowRecord {
  const now = Date.now();
  const firstStage = source.workflow.stages[0]?.id ?? "submitted";
  const defaults = Object.fromEntries(source.workflow.fields.map((field) => [field.id, field.options?.[0] ?? ""])) as Record<string, string | number | null>;
  return {
    id: `rec-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: input.title,
    stage: firstStage,
    owner: input.owner,
    created_at_ms: now,
    updated_at_ms: now,
    values: {
      ...defaults,
      ...input.values,
    },
    history: [],
  };
}

function uniqueAppId(store: WorkflowStudioStore, base: string): string {
  let candidate = base;
  let index = 2;
  while (true) {
    try {
      store.getProject(candidate);
      candidate = `${base}-${index++}`;
    } catch {
      return candidate;
    }
  }
}

function changedSourceFiles(before: WorkflowSourceSnapshot, after: WorkflowSourceSnapshot): readonly string[] {
  return (["workflow", "runtime", "theme", "app_code"] as const)
    .filter((file) => {
      if (file === "app_code") return before.app_code !== after.app_code;
      return JSON.stringify(before[file]) !== JSON.stringify(after[file]);
    })
    .map((file) => file === "app_code" ? "src/app.ts" : `src/${file}.json`);
}

function summarizeInterpretation(message: string): string {
  return `The Builder wants to change the generated workflow app: ${message}`;
}

function summarizeProposal(before: WorkflowAppDefinition, after: WorkflowAppDefinition, fallback?: string): string {
  const addedStages = after.stages.filter((stage) => !before.stages.some((candidate) => candidate.id === stage.id));
  const addedFields = after.fields.filter((field) => !before.fields.some((candidate) => candidate.id === field.id));
  if (addedStages.some((stage) => stage.id === "legal_review")) {
    return "Add legal review to the workflow before approval.";
  }
  if (addedFields.some((field) => field.id === "due_date" || field.id === "sla_status")) {
    return "Add SLA tracking to the workflow.";
  }
  return fallback ?? "Refine the workflow application definition.";
}

function summarizeHighlights(before: WorkflowAppDefinition, after: WorkflowAppDefinition): readonly string[] {
  const highlights: string[] = [];
  const addedStages = after.stages.filter((stage) => !before.stages.some((candidate) => candidate.id === stage.id));
  const addedFields = after.fields.filter((field) => !before.fields.some((candidate) => candidate.id === field.id));
  const addedActions = after.actions.filter((action) => !before.actions.some((candidate) => candidate.id === action.id));
  if (addedStages.length > 0) highlights.push(`Add stages: ${addedStages.map((stage) => stage.label).join(", ")}.`);
  if (addedFields.length > 0) highlights.push(`Add fields: ${addedFields.map((field) => field.label).join(", ")}.`);
  if (addedActions.length > 0) highlights.push(`Add actions: ${addedActions.map((action) => action.label).join(", ")}.`);
  highlights.push("Carry existing records forward with defaults for new fields.");
  return highlights;
}
