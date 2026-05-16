import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BuildChangeReviewPacket, DataEvolutionReceipt, PreparedCodeChangeProposal } from "@pneuma-framework/core";
import type { HostKitCodeAgentDraftReceipt } from "@pneuma-framework/host-kit";
import type { TeamNoteV0, TeamNoteV1 } from "../domain/team-notes.js";

export interface PendingEvolutionRecord {
  readonly proposal_id: string;
  readonly build_change_id: string;
  readonly proposal: PreparedCodeChangeProposal;
  readonly review_packet: BuildChangeReviewPacket;
  readonly code_agent_receipt?: HostKitCodeAgentDraftReceipt;
  readonly decisions: readonly {
    readonly subject: string;
    readonly decision: "approved" | "denied";
    readonly decided_at_ms: number;
    readonly reason?: string;
  }[];
}

export type ReferenceAgentLogKind = "host" | "session" | "assistant" | "tool" | "permission" | "error";

export interface ReferenceAgentLogEntry {
  readonly id: string;
  readonly at_ms: number;
  readonly kind: ReferenceAgentLogKind;
  readonly text: string;
}

export interface ReferenceProjectRecord {
  readonly app_id: string;
  readonly builder_user_id: string;
  readonly thread_id: string;
  readonly version_id: "v0" | "v1";
  readonly active_version_id: "v0" | "v1";
  readonly status:
    | "created"
    | "awaiting_reviewer_approval"
    | "blocked"
    | "ready_to_preview"
    | "previewing"
    | "published"
    | "rolled_back";
  readonly notes_v0: readonly TeamNoteV0[];
  readonly notes_v1?: readonly TeamNoteV1[];
  readonly pending_evolution?: PendingEvolutionRecord;
  readonly data_receipt?: DataEvolutionReceipt;
  readonly preview_url?: string;
  readonly published_url?: string;
  readonly last_block_reason?: string;
  readonly agent_logs?: readonly ReferenceAgentLogEntry[];
}

export interface ReferenceHostState {
  readonly projects: Record<string, ReferenceProjectRecord>;
}

export function projectDir(workspace: string, appId: string): string {
  return join(resolve(workspace), "projects", appId);
}

export function statePath(workspace: string): string {
  return join(resolve(workspace), ".pneuma", "reference-host-state.json");
}

export function sourceRoot(workspace: string, appId: string): string {
  return join(projectDir(workspace, appId), "source");
}

export function draftRoot(workspace: string, appId: string): string {
  return join(projectDir(workspace, appId), "draft");
}

export function dataDir(workspace: string, appId: string, versionId: string): string {
  return join(projectDir(workspace, appId), "published", versionId);
}

export function loadState(workspace: string): ReferenceHostState {
  const path = statePath(workspace);
  if (!existsSync(path)) return { projects: {} };
  return JSON.parse(readFileSync(path, "utf8")) as ReferenceHostState;
}

export function saveState(workspace: string, state: ReferenceHostState): void {
  const path = statePath(workspace);
  mkdirSync(join(resolve(workspace), ".pneuma"), { recursive: true });
  const tmpPath = `${path}.${process.hrtime.bigint().toString(36)}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(tmpPath, path);
}

export function updateProject(
  workspace: string,
  appId: string,
  update: (project: ReferenceProjectRecord) => ReferenceProjectRecord,
): ReferenceProjectRecord {
  const state = loadState(workspace);
  const project = state.projects[appId];
  if (!project) throw new Error(`Project ${appId} does not exist.`);
  const updated = update(project);
  saveState(workspace, {
    projects: {
      ...state.projects,
      [appId]: updated,
    },
  });
  return updated;
}

export function appendProjectAgentLog(
  workspace: string,
  appId: string,
  entry: Omit<ReferenceAgentLogEntry, "id" | "at_ms"> & { readonly at_ms?: number },
  options: { readonly merge_with_previous?: boolean } = {},
): ReferenceAgentLogEntry {
  const atMs = entry.at_ms ?? Date.now();
  const nextEntry: ReferenceAgentLogEntry = {
    id: `alog-${atMs}-${Math.random().toString(36).slice(2, 8)}`,
    at_ms: atMs,
    kind: entry.kind,
    text: entry.text,
  };
  updateProject(workspace, appId, (project) => {
    const logs = [...(project.agent_logs ?? [])];
    const last = logs.at(-1);
    if (last?.kind === nextEntry.kind && last.text === nextEntry.text) {
      return project;
    }
    if (options.merge_with_previous && last?.kind === nextEntry.kind) {
      logs[logs.length - 1] = {
        ...last,
        at_ms: nextEntry.at_ms,
        text: `${last.text}${nextEntry.text}`,
      };
    } else {
      logs.push(nextEntry);
    }
    return {
      ...project,
      agent_logs: logs.slice(-80),
    };
  });
  return nextEntry;
}

export function writeProjectSource(root: string, fields: readonly string[]): void {
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src/app.ts"),
    `export const teamNotesFields = ${JSON.stringify(fields)};\n`,
    "utf8",
  );
}

export function createProjectState(
  workspace: string,
  project: ReferenceProjectRecord,
): ReferenceProjectRecord {
  mkdirSync(projectDir(workspace, project.app_id), { recursive: true });
  writeProjectSource(sourceRoot(workspace, project.app_id), ["title", "body", "owner", "status"]);
  saveState(workspace, {
    projects: {
      ...loadState(workspace).projects,
      [project.app_id]: project,
    },
  });
  return project;
}
