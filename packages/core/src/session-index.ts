/**
 * session-index.ts — thin JSON index mapping pneuma-local session IDs to
 * backend (opencode) session IDs, stored at workspace/.pneuma/sessions.json.
 *
 * Opencode remains the source of truth for conversation content; pneuma only
 * persists the pointer so Builders can resume by latest/filter without
 * remembering opaque ses_xxx IDs.
 */

import { mkdirSync, renameSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export interface SessionRecord {
  readonly id: string;                  // pneuma-local ID, e.g. `sess-${ts}-${rand}`
  readonly backend_session_id: string;  // opencode's "ses_xxx" id
  readonly app_id: string;              // e.g. "ai-bookmarks-core-domain"
  readonly builder_id: string;          // MVP: "default" everywhere
  readonly created_at: number;          // epoch ms
  readonly last_resumed_at: number;     // epoch ms (equals created_at on first record)
  readonly initial_prompt: string;      // first user message, trimmed to ≤160 chars
}

const PNEUMA_DIR = ".pneuma";
const SESSIONS_FILE = "sessions.json";
const MAX_PROMPT_LEN = 160;

function sessionsFilePath(workspace: string): string {
  return join(workspace, PNEUMA_DIR, SESSIONS_FILE);
}

function generateId(): string {
  const ts = Date.now();
  const rand = randomBytes(2).toString("hex");
  return `sess-${ts}-${rand}`;
}

/**
 * Load all session records for a workspace. Missing file → [].
 * Never throws on corruption; logs + returns [] instead.
 */
export async function loadSessionIndex(workspace: string): Promise<readonly SessionRecord[]> {
  const filePath = sessionsFilePath(workspace);
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      process.stderr.write(`[session-index] warning: ${filePath} is not an array — resetting to []\n`);
      return [];
    }
    // Accept whatever extra fields might exist in the JSON; only validate that
    // required fields are present to keep it forward-compatible.
    return parsed as SessionRecord[];
  } catch (err) {
    process.stderr.write(`[session-index] warning: failed to load ${filePath}: ${err} — returning []\n`);
    return [];
  }
}

/**
 * Persist the full index (overwrites). Creates `.pneuma/` if missing.
 * Writes atomically (temp + rename). May throw if the filesystem is unwritable.
 */
export async function saveSessionIndex(workspace: string, records: readonly SessionRecord[]): Promise<void> {
  const dir = join(workspace, PNEUMA_DIR);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, SESSIONS_FILE);
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(records, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
}

/**
 * Record a newly-created session.
 * Idempotent: if backend_session_id already exists, returns the existing
 * record unchanged (does NOT bump last_resumed_at — that's touchSession's job).
 */
export async function recordSession(params: {
  workspace: string;
  backend_session_id: string;
  app_id: string;
  builder_id?: string;
  initial_prompt: string;
}): Promise<SessionRecord> {
  const { workspace, backend_session_id, app_id, initial_prompt } = params;
  const builder_id = params.builder_id ?? "default";

  const records = await loadSessionIndex(workspace);

  // Idempotency check
  const existing = records.find((r) => r.backend_session_id === backend_session_id);
  if (existing) return existing;

  const now = Date.now();
  const newRecord: SessionRecord = {
    id: generateId(),
    backend_session_id,
    app_id,
    builder_id,
    created_at: now,
    last_resumed_at: now,
    initial_prompt: initial_prompt.slice(0, MAX_PROMPT_LEN),
  };

  await saveSessionIndex(workspace, [...records, newRecord]);
  return newRecord;
}

/**
 * Bump last_resumed_at to Date.now().
 * No-op if not found. Returns the updated record (or undefined).
 */
export async function touchSession(
  workspace: string,
  backend_session_id: string,
): Promise<SessionRecord | undefined> {
  const records = await loadSessionIndex(workspace);
  const idx = records.findIndex((r) => r.backend_session_id === backend_session_id);
  if (idx === -1) return undefined;

  const updated: SessionRecord = {
    ...(records[idx] as SessionRecord),
    last_resumed_at: Date.now(),
  };

  const newRecords = [
    ...records.slice(0, idx),
    updated,
    ...records.slice(idx + 1),
  ];
  await saveSessionIndex(workspace, newRecords);
  return updated;
}

/**
 * Most recent session by last_resumed_at, filterable by app_id.
 * Undefined if none.
 */
export async function findLatestSession(
  workspace: string,
  app_id?: string,
): Promise<SessionRecord | undefined> {
  const records = await loadSessionIndex(workspace);
  const filtered = app_id ? records.filter((r) => r.app_id === app_id) : records;
  if (filtered.length === 0) return undefined;
  return filtered.reduce((best, curr) =>
    curr.last_resumed_at > best.last_resumed_at ? curr : best,
  );
}

/**
 * All sessions, sorted by last_resumed_at DESC, optionally filtered.
 */
export async function listSessions(
  workspace: string,
  opts?: { app_id?: string; builder_id?: string },
): Promise<readonly SessionRecord[]> {
  const records = await loadSessionIndex(workspace);
  let filtered = records;
  if (opts?.app_id) {
    filtered = filtered.filter((r) => r.app_id === opts.app_id);
  }
  if (opts?.builder_id) {
    filtered = filtered.filter((r) => r.builder_id === opts.builder_id);
  }
  return [...filtered].sort((a, b) => b.last_resumed_at - a.last_resumed_at);
}
