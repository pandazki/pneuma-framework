import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  loadSessionIndex,
  saveSessionIndex,
  recordSession,
  touchSession,
  findLatestSession,
  listSessions,
  type SessionRecord,
} from "../src/session-index.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "pneuma-session-index-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

// 1. loadSessionIndex on missing file → [].
test("loadSessionIndex returns [] when file does not exist", async () => {
  const records = await loadSessionIndex(workspace);
  expect(records).toEqual([]);
});

// 2. saveSessionIndex then loadSessionIndex round-trips records exactly.
test("saveSessionIndex + loadSessionIndex round-trips records", async () => {
  const now = Date.now();
  const rec: SessionRecord = {
    id: "sess-12345-abcd",
    backend_session_id: "ses_test001",
    app_id: "test-app",
    builder_id: "default",
    created_at: now,
    last_resumed_at: now,
    initial_prompt: "Hello world",
  };
  await saveSessionIndex(workspace, [rec]);
  const loaded = await loadSessionIndex(workspace);
  expect(loaded.length).toBe(1);
  expect(loaded[0]).toEqual(rec);
});

// 3. recordSession creates a new record with all fields populated; idempotent re-record returns existing unchanged.
test("recordSession creates a record and is idempotent", async () => {
  const rec = await recordSession({
    workspace,
    backend_session_id: "ses_abc123",
    app_id: "my-app",
    initial_prompt: "Do something useful",
  });

  expect(rec.backend_session_id).toBe("ses_abc123");
  expect(rec.app_id).toBe("my-app");
  expect(rec.builder_id).toBe("default");
  expect(rec.initial_prompt).toBe("Do something useful");
  expect(typeof rec.id).toBe("string");
  expect(rec.id).toMatch(/^sess-\d+-[0-9a-f]+$/);
  expect(rec.created_at).toBeGreaterThan(0);
  expect(rec.last_resumed_at).toBe(rec.created_at);

  // Idempotent re-record: same record returned, file not mutated
  const rec2 = await recordSession({
    workspace,
    backend_session_id: "ses_abc123",
    app_id: "my-app",
    initial_prompt: "A different prompt",
  });
  expect(rec2).toEqual(rec);
  const all = await loadSessionIndex(workspace);
  expect(all.length).toBe(1);
});

// 4. touchSession bumps last_resumed_at; created_at unchanged.
test("touchSession bumps last_resumed_at and preserves created_at", async () => {
  const rec = await recordSession({
    workspace,
    backend_session_id: "ses_touch1",
    app_id: "app",
    initial_prompt: "hi",
  });
  const originalCreatedAt = rec.created_at;
  const originalLastResumed = rec.last_resumed_at;

  // Small delay to ensure timestamp changes
  await Bun.sleep(5);

  const updated = await touchSession(workspace, "ses_touch1");
  expect(updated).toBeDefined();
  expect(updated!.last_resumed_at).toBeGreaterThanOrEqual(originalLastResumed);
  expect(updated!.created_at).toBe(originalCreatedAt);
});

// 5. touchSession on missing backend_session_id returns undefined and doesn't change file.
test("touchSession on missing id returns undefined without modifying file", async () => {
  await recordSession({
    workspace,
    backend_session_id: "ses_existing",
    app_id: "app",
    initial_prompt: "hi",
  });

  const result = await touchSession(workspace, "ses_nonexistent");
  expect(result).toBeUndefined();

  const all = await loadSessionIndex(workspace);
  expect(all.length).toBe(1);
  expect(all[0]!.backend_session_id).toBe("ses_existing");
});

// 6. findLatestSession returns the record with the largest last_resumed_at; with app_id filter applied.
test("findLatestSession returns most recent by last_resumed_at, respects app_id filter", async () => {
  const now = Date.now();
  const r1: SessionRecord = {
    id: "sess-1-aaa",
    backend_session_id: "ses_r1",
    app_id: "app-a",
    builder_id: "default",
    created_at: now - 2000,
    last_resumed_at: now - 2000,
    initial_prompt: "first",
  };
  const r2: SessionRecord = {
    id: "sess-2-bbb",
    backend_session_id: "ses_r2",
    app_id: "app-a",
    builder_id: "default",
    created_at: now - 1000,
    last_resumed_at: now - 1000,
    initial_prompt: "second",
  };
  const r3: SessionRecord = {
    id: "sess-3-ccc",
    backend_session_id: "ses_r3",
    app_id: "app-b",
    builder_id: "default",
    created_at: now,
    last_resumed_at: now,
    initial_prompt: "third — different app",
  };
  await saveSessionIndex(workspace, [r1, r2, r3]);

  const latest = await findLatestSession(workspace);
  expect(latest?.backend_session_id).toBe("ses_r3"); // highest last_resumed_at

  const latestA = await findLatestSession(workspace, "app-a");
  expect(latestA?.backend_session_id).toBe("ses_r2");

  const latestB = await findLatestSession(workspace, "app-b");
  expect(latestB?.backend_session_id).toBe("ses_r3");

  const missingApp = await findLatestSession(workspace, "app-z");
  expect(missingApp).toBeUndefined();
});

// 7. listSessions returns in descending last_resumed_at order, filter combinations work.
test("listSessions returns DESC order and filters correctly", async () => {
  const now = Date.now();
  const records: SessionRecord[] = [
    {
      id: "sess-a",
      backend_session_id: "ses_a",
      app_id: "app-x",
      builder_id: "alice",
      created_at: now - 3000,
      last_resumed_at: now - 3000,
      initial_prompt: "a",
    },
    {
      id: "sess-b",
      backend_session_id: "ses_b",
      app_id: "app-x",
      builder_id: "bob",
      created_at: now - 1000,
      last_resumed_at: now - 1000,
      initial_prompt: "b",
    },
    {
      id: "sess-c",
      backend_session_id: "ses_c",
      app_id: "app-y",
      builder_id: "alice",
      created_at: now - 2000,
      last_resumed_at: now - 2000,
      initial_prompt: "c",
    },
  ];
  await saveSessionIndex(workspace, records);

  const all = await listSessions(workspace);
  expect(all.map((r) => r.id)).toEqual(["sess-b", "sess-c", "sess-a"]);

  const xOnly = await listSessions(workspace, { app_id: "app-x" });
  expect(xOnly.map((r) => r.id)).toEqual(["sess-b", "sess-a"]);

  const aliceOnly = await listSessions(workspace, { builder_id: "alice" });
  expect(aliceOnly.map((r) => r.id)).toEqual(["sess-c", "sess-a"]);

  const both = await listSessions(workspace, { app_id: "app-x", builder_id: "alice" });
  expect(both.map((r) => r.id)).toEqual(["sess-a"]);
});

// 8. Corrupted JSON → loadSessionIndex returns [] (don't throw).
test("loadSessionIndex on corrupted JSON returns [] without throwing", async () => {
  const dir = join(workspace, ".pneuma");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "sessions.json"), "this is { not valid json ]]]", "utf-8");

  const records = await loadSessionIndex(workspace);
  expect(records).toEqual([]);
});

// 9. initial_prompt longer than 160 chars is truncated at record time.
test("recordSession truncates initial_prompt to 160 chars", async () => {
  const longPrompt = "x".repeat(300);
  const rec = await recordSession({
    workspace,
    backend_session_id: "ses_trunc",
    app_id: "app",
    initial_prompt: longPrompt,
  });
  expect(rec.initial_prompt.length).toBe(160);
});

// Bonus: saveSessionIndex creates .pneuma/ directory if it does not exist.
test("saveSessionIndex creates .pneuma/ dir if missing", async () => {
  const now = Date.now();
  const rec: SessionRecord = {
    id: "sess-new",
    backend_session_id: "ses_new",
    app_id: "app",
    builder_id: "default",
    created_at: now,
    last_resumed_at: now,
    initial_prompt: "new",
  };
  // workspace exists but .pneuma/ does not
  await saveSessionIndex(workspace, [rec]);
  const loaded = await loadSessionIndex(workspace);
  expect(loaded.length).toBe(1);
});

// Bonus: builder_id defaults to "default" when not specified.
test("recordSession defaults builder_id to 'default'", async () => {
  const rec = await recordSession({
    workspace,
    backend_session_id: "ses_dflt",
    app_id: "app",
    initial_prompt: "test",
  });
  expect(rec.builder_id).toBe("default");
});
