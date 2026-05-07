/**
 * BuildThread is the framework-owned semantic transcript for Builder-phase app
 * creation. Backend-native sessions may cache context, but this store is the
 * portable source of truth for proposal / decision / execution receipt turns.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

export type BuildThreadStatus = "open" | "closed";

export interface BuildThread {
  readonly thread_id: string;
  readonly profile_id: string;
  readonly app_id: string;
  readonly builder_user_id: string;
  readonly status: BuildThreadStatus;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
  readonly closed_at_ms?: number;
}

export interface BuildToolCall {
  readonly name: string;
  readonly arguments: unknown;
}

interface BuildTurnBase {
  readonly turn_id: string;
  readonly thread_id: string;
  readonly turn_index: number;
  readonly ts_ms: number;
}

export type BuildTurn =
  | (BuildTurnBase & { readonly kind: "user"; readonly text: string })
  | (BuildTurnBase & { readonly kind: "agent_text"; readonly text: string })
  | (BuildTurnBase & { readonly kind: "agent_clarification"; readonly question: string })
  | (BuildTurnBase & {
      readonly kind: "agent_proposal";
      readonly proposal_id: string;
      readonly summary: string;
      readonly rationale: string;
      readonly tool_calls: readonly BuildToolCall[];
    })
  | (BuildTurnBase & {
      readonly kind: "user_decision";
      readonly proposal_id: string;
      readonly decision: "approved" | "rejected";
      readonly reason?: string;
    })
  | (BuildTurnBase & {
      readonly kind: "host_execution_receipt";
      readonly proposal_id: string;
      readonly status:
        | "completed"
        | "failed_framework"
        | "failed_host_rolled_back"
        | "failed_validate_rolled_back";
      readonly evidence: unknown;
    })
  | (BuildTurnBase & {
      readonly kind: "host_event";
      readonly label: string;
      readonly payload: unknown;
    });

export type BuildTurnInput =
  | { readonly kind: "user"; readonly text: string; readonly ts_ms?: number }
  | { readonly kind: "agent_text"; readonly text: string; readonly ts_ms?: number }
  | { readonly kind: "agent_clarification"; readonly question: string; readonly ts_ms?: number }
  | {
      readonly kind: "agent_proposal";
      readonly proposal_id: string;
      readonly summary: string;
      readonly rationale: string;
      readonly tool_calls: readonly BuildToolCall[];
      readonly ts_ms?: number;
    }
  | {
      readonly kind: "user_decision";
      readonly proposal_id: string;
      readonly decision: "approved" | "rejected";
      readonly reason?: string;
      readonly ts_ms?: number;
    }
  | {
      readonly kind: "host_execution_receipt";
      readonly proposal_id: string;
      readonly status:
        | "completed"
        | "failed_framework"
        | "failed_host_rolled_back"
        | "failed_validate_rolled_back";
      readonly evidence: unknown;
      readonly ts_ms?: number;
    }
  | {
      readonly kind: "host_event";
      readonly label: string;
      readonly payload: unknown;
      readonly ts_ms?: number;
    };

export interface BuildThreadStore {
  startThread(opts: {
    readonly profile_id: string;
    readonly app_id: string;
    readonly builder_user_id: string;
  }): Promise<BuildThread>;
  appendTurn(threadId: string, turn: BuildTurnInput): Promise<BuildTurn>;
  listTurns(threadId: string): Promise<readonly BuildTurn[]>;
  listThreads(opts?: {
    readonly app_id?: string;
    readonly builder_user_id?: string;
    readonly status?: BuildThreadStatus;
  }): Promise<readonly BuildThread[]>;
  closeThread(threadId: string): Promise<BuildThread | undefined>;
}

export type ConversationStore = BuildThreadStore;

export interface FileBuildThreadStoreOptions {
  readonly workspace: string;
}

interface BuildThreadFileState {
  readonly threads: readonly BuildThread[];
  readonly turns: readonly BuildTurn[];
}

export interface PackedAgentMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export type AnthropicMessage = PackedAgentMessage;
export type OpencodeMessage = PackedAgentMessage;

export interface BuildTurnPackingOptions {
  readonly capTurns?: number;
  readonly alwaysKeepAnchor?: boolean;
}

const PNEUMA_DIR = ".pneuma";
const BUILD_THREADS_FILE = "build-threads.json";

export function createFileBuildThreadStore(
  options: FileBuildThreadStoreOptions,
): BuildThreadStore {
  return new FileBuildThreadStore(options.workspace);
}

export function buildThreadsFilePath(workspace: string): string {
  return join(workspace, PNEUMA_DIR, BUILD_THREADS_FILE);
}

export function pneumaTurnsToAnthropicMessages(
  turns: readonly BuildTurn[],
  opts?: BuildTurnPackingOptions,
): readonly AnthropicMessage[] {
  return selectTurnsForPacking(turns, opts).map(turnToMessage);
}

export function pneumaTurnsToOpencodeMessages(
  turns: readonly BuildTurn[],
  opts?: BuildTurnPackingOptions,
): readonly OpencodeMessage[] {
  return selectTurnsForPacking(turns, opts).map(turnToMessage);
}

class FileBuildThreadStore implements BuildThreadStore {
  constructor(private readonly workspace: string) {}

  async startThread(opts: {
    readonly profile_id: string;
    readonly app_id: string;
    readonly builder_user_id: string;
  }): Promise<BuildThread> {
    const state = loadState(this.workspace);
    const now = Date.now();
    const thread: BuildThread = {
      thread_id: generateId("bthread"),
      profile_id: opts.profile_id,
      app_id: opts.app_id,
      builder_user_id: opts.builder_user_id,
      status: "open",
      created_at_ms: now,
      updated_at_ms: now,
    };
    saveState(this.workspace, {
      threads: [...state.threads, thread],
      turns: state.turns,
    });
    return thread;
  }

  async appendTurn(threadId: string, input: BuildTurnInput): Promise<BuildTurn> {
    const state = loadState(this.workspace);
    const thread = state.threads.find((candidate) => candidate.thread_id === threadId);
    if (!thread) {
      throw new Error(`BuildThread '${threadId}' was not found`);
    }
    if (thread.status === "closed") {
      throw new Error(`BuildThread '${threadId}' is closed`);
    }

    const priorTurns = state.turns.filter((turn) => turn.thread_id === threadId);
    const ts_ms = input.ts_ms ?? Date.now();
    const turn = enrichTurn(threadId, priorTurns.length, ts_ms, input);
    const updatedThread: BuildThread = { ...thread, updated_at_ms: ts_ms };

    saveState(this.workspace, {
      threads: state.threads.map((candidate) =>
        candidate.thread_id === threadId ? updatedThread : candidate,
      ),
      turns: [...state.turns, turn],
    });
    return turn;
  }

  async listTurns(threadId: string): Promise<readonly BuildTurn[]> {
    const state = loadState(this.workspace);
    return state.turns
      .filter((turn) => turn.thread_id === threadId)
      .sort((left, right) => left.turn_index - right.turn_index);
  }

  async listThreads(opts?: {
    readonly app_id?: string;
    readonly builder_user_id?: string;
    readonly status?: BuildThreadStatus;
  }): Promise<readonly BuildThread[]> {
    const state = loadState(this.workspace);
    let threads = state.threads;
    if (opts?.app_id) {
      threads = threads.filter((thread) => thread.app_id === opts.app_id);
    }
    if (opts?.builder_user_id) {
      threads = threads.filter((thread) => thread.builder_user_id === opts.builder_user_id);
    }
    if (opts?.status) {
      threads = threads.filter((thread) => thread.status === opts.status);
    }
    return [...threads].sort((left, right) => right.updated_at_ms - left.updated_at_ms);
  }

  async closeThread(threadId: string): Promise<BuildThread | undefined> {
    const state = loadState(this.workspace);
    const thread = state.threads.find((candidate) => candidate.thread_id === threadId);
    if (!thread) return undefined;
    if (thread.status === "closed") return thread;

    const now = Date.now();
    const updated: BuildThread = {
      ...thread,
      status: "closed",
      updated_at_ms: now,
      closed_at_ms: now,
    };
    saveState(this.workspace, {
      threads: state.threads.map((candidate) =>
        candidate.thread_id === threadId ? updated : candidate,
      ),
      turns: state.turns,
    });
    return updated;
  }
}

function enrichTurn(
  threadId: string,
  turnIndex: number,
  ts_ms: number,
  input: BuildTurnInput,
): BuildTurn {
  const base = {
    turn_id: generateId("bturn"),
    thread_id: threadId,
    turn_index: turnIndex,
    ts_ms,
  };
  switch (input.kind) {
    case "user":
      return { ...base, kind: "user", text: input.text };
    case "agent_text":
      return { ...base, kind: "agent_text", text: input.text };
    case "agent_clarification":
      return { ...base, kind: "agent_clarification", question: input.question };
    case "agent_proposal":
      return {
        ...base,
        kind: "agent_proposal",
        proposal_id: input.proposal_id,
        summary: input.summary,
        rationale: input.rationale,
        tool_calls: input.tool_calls,
      };
    case "user_decision":
      return {
        ...base,
        kind: "user_decision",
        proposal_id: input.proposal_id,
        decision: input.decision,
        reason: input.reason,
      };
    case "host_execution_receipt":
      return {
        ...base,
        kind: "host_execution_receipt",
        proposal_id: input.proposal_id,
        status: input.status,
        evidence: input.evidence,
      };
    case "host_event":
      return {
        ...base,
        kind: "host_event",
        label: input.label,
        payload: input.payload,
      };
  }
}

function loadState(workspace: string): BuildThreadFileState {
  const filePath = buildThreadsFilePath(workspace);
  if (!existsSync(filePath)) {
    return { threads: [], turns: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    if (!isStateLike(parsed)) {
      process.stderr.write(`[build-thread] warning: ${filePath} has invalid shape — resetting to empty state\n`);
      return { threads: [], turns: [] };
    }
    return parsed;
  } catch (err) {
    process.stderr.write(`[build-thread] warning: failed to load ${filePath}: ${err} — returning empty state\n`);
    return { threads: [], turns: [] };
  }
}

function saveState(workspace: string, state: BuildThreadFileState): void {
  const dir = join(workspace, PNEUMA_DIR);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, BUILD_THREADS_FILE);
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
}

function isStateLike(value: unknown): value is BuildThreadFileState {
  return typeof value === "object"
    && value !== null
    && Array.isArray((value as { threads?: unknown }).threads)
    && Array.isArray((value as { turns?: unknown }).turns);
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(2).toString("hex")}`;
}

function selectTurnsForPacking(
  turns: readonly BuildTurn[],
  opts?: BuildTurnPackingOptions,
): readonly BuildTurn[] {
  const cap = opts?.capTurns;
  if (cap === undefined || cap <= 0 || turns.length <= cap) {
    return turns;
  }
  if (opts?.alwaysKeepAnchor && cap > 1 && turns.length > 0) {
    const tail = turns.slice(-(cap - 1));
    return [turns[0]!, ...tail];
  }
  if (opts?.alwaysKeepAnchor && cap === 1 && turns.length > 0) {
    return [turns[0]!];
  }
  return turns.slice(-cap);
}

function turnToMessage(turn: BuildTurn): PackedAgentMessage {
  switch (turn.kind) {
    case "user":
      return { role: "user", content: turn.text };
    case "agent_text":
      return { role: "assistant", content: turn.text };
    case "agent_clarification":
      return {
        role: "assistant",
        content: [
          "[pneuma:agent_clarification]",
          turn.question,
        ].join("\n"),
      };
    case "agent_proposal":
      return {
        role: "assistant",
        content: [
          `[pneuma:agent_proposal proposal_id=${turn.proposal_id}]`,
          `Summary: ${turn.summary}`,
          `Rationale: ${turn.rationale}`,
          "Tool calls:",
          stringifyUnknown(turn.tool_calls),
        ].join("\n"),
      };
    case "user_decision":
      return {
        role: "user",
        content: [
          `[pneuma:user_decision proposal_id=${turn.proposal_id} decision=${turn.decision}]`,
          ...(turn.reason ? [`Reason: ${turn.reason}`] : []),
        ].join("\n"),
      };
    case "host_execution_receipt":
      return {
        role: "user",
        content: [
          `[pneuma:host_execution_receipt proposal_id=${turn.proposal_id} status=${turn.status}]`,
          "Evidence:",
          stringifyUnknown(turn.evidence),
        ].join("\n"),
      };
    case "host_event":
      return {
        role: "user",
        content: [
          `[pneuma:host_event label=${turn.label}]`,
          "Payload:",
          stringifyUnknown(turn.payload),
        ].join("\n"),
      };
  }
}

function stringifyUnknown(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "undefined";
  } catch (err) {
    return `[unserializable: ${err instanceof Error ? err.message : String(err)}]`;
  }
}
