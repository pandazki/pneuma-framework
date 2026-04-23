import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NdjsonAuditSink,
  NdjsonAuditReader,
} from "../../src/sinks/ndjson-audit.js";
import {
  EventStream,
  InMemoryEventSink,
  type PneumaEventInput,
} from "../../src/aggregates/event-stream.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";

const APP = "audit-test";

function mkEvent(overrides: Partial<PneumaEventInput> = {}): PneumaEventInput {
  const ctx = buildRootContext({
    app_id: APP,
    invoked_via: "ui",
    user: { id: "alice", attrs: {}, roles: [] },
  });
  return {
    id: `ev-${Math.random().toString(16).slice(2, 10)}`,
    ts: Date.now(),
    category: "access",
    ctx,
    trace_id: ctx.trace_id,
    payload: { decision: "deny", reason: "test" },
    audit: true,
    ...overrides,
  };
}

describe("NdjsonAuditSink · file append behavior", () => {
  let tmp: string;
  let logPath: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "pneuma-audit-test-"));
    logPath = join(tmp, "nested", "audit.ndjson");
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("auto-creates parent directory", async () => {
    const sink = new NdjsonAuditSink(logPath);
    await sink.write({ ...mkEvent(), sequence: 1 });
    const reader = new NdjsonAuditReader(logPath);
    const got = await reader.events();
    expect(got).toHaveLength(1);
  });

  test("each event becomes one JSON line; file is valid NDJSON", async () => {
    const sink = new NdjsonAuditSink(logPath);
    await sink.write({ ...mkEvent(), sequence: 1 });
    await sink.write({ ...mkEvent(), sequence: 2 });
    await sink.write({ ...mkEvent(), sequence: 3 });

    const raw = readFileSync(logPath, "utf8");
    const lines = raw.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  test("append-only across sink instances (file preserved between runs)", async () => {
    const sink1 = new NdjsonAuditSink(logPath);
    await sink1.write({ ...mkEvent(), sequence: 1 });
    await sink1.write({ ...mkEvent(), sequence: 2 });

    // Simulate process restart: new sink instance targeting same file
    const sink2 = new NdjsonAuditSink(logPath);
    await sink2.write({ ...mkEvent(), sequence: 3 });

    const reader = new NdjsonAuditReader(logPath);
    const all = await reader.events();
    expect(all.map((e) => e.sequence)).toEqual([1, 2, 3]);
  });

  test("Uint8Array payload round-trips through ndjson file via cell-codec", async () => {
    const sink = new NdjsonAuditSink(logPath);
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    await sink.write({
      ...mkEvent({
        payload: {
          mutation: "blob_upload",
          data: bytes,
        },
      }),
      sequence: 1,
    });

    const reader = new NdjsonAuditReader(logPath);
    const [got] = await reader.events();
    const p = got!.payload as { mutation: string; data: Uint8Array };
    expect(p.mutation).toBe("blob_upload");
    expect(p.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(p.data)).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  test("queryEvents filter by category / user_id / tag", async () => {
    const sink = new NdjsonAuditSink(logPath);
    const ev = (cat: "access" | "mutation" | "agent", user: string, tags?: string[]) => ({
      id: `ev-${cat}-${user}`,
      ts: Date.now(),
      sequence: Math.floor(Math.random() * 1e6),
      category: cat,
      ctx: buildRootContext({
        app_id: APP,
        invoked_via: "ui",
        user: { id: user, attrs: {}, roles: [] },
      }),
      trace_id: "t",
      payload: {},
      audit: true,
      tags,
    });

    await sink.write(ev("access", "alice") as never);
    await sink.write(ev("mutation", "alice", ["delete_bookmark"]) as never);
    await sink.write(ev("mutation", "bob") as never);
    await sink.write(ev("agent", "alice", ["operation"]) as never);

    const reader = new NdjsonAuditReader(logPath);
    const accessOnly = await reader.queryEvents({ category: "access" });
    expect(accessOnly).toHaveLength(1);

    const aliceOnly = await reader.queryEvents({ user_id: "alice" });
    expect(aliceOnly).toHaveLength(3);

    const deleteOnly = await reader.queryEvents({ tag: "delete_bookmark" });
    expect(deleteOnly).toHaveLength(1);
    expect(deleteOnly[0]!.ctx.user?.id).toBe("alice");
  });

  test("reader returns [] when file does not exist (no throw)", async () => {
    const nonExistent = join(tmp, "nope", "nowhere.ndjson");
    const reader = new NdjsonAuditReader(nonExistent);
    expect(await reader.events()).toEqual([]);
  });
});

describe("NdjsonAuditSink · EventStream integration", () => {
  let tmp: string;
  let logPath: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "pneuma-audit-int-"));
    logPath = join(tmp, "audit.ndjson");
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("EventStream with NdjsonAuditSink: only audit=true events land in file", async () => {
    const debug = new InMemoryEventSink();
    const audit = new NdjsonAuditSink(logPath);
    const stream = new EventStream(APP, debug, audit);

    await stream.append(mkEvent({ audit: false, payload: { quiet: true } }));
    await stream.append(mkEvent({ audit: true, payload: { important: "yes" } }));
    await stream.append(mkEvent({ audit: false, payload: { quiet: 2 } }));

    expect(debug.events).toHaveLength(3);
    const reader = new NdjsonAuditReader(logPath);
    const audited = await reader.events();
    expect(audited).toHaveLength(1);
    expect((audited[0]!.payload as { important: string }).important).toBe("yes");
  });

  test("audit sink write failure aborts EventStream.append (fail-closed behavior)", async () => {
    // Simulate write failure by pointing at a path that will fail (directory instead of file after creation would fail with EISDIR; simpler: mock by making a read-only parent).
    // We rely on NdjsonAuditSink's appendFile throwing if parent path is unwritable.
    // Easiest: replace sink with a throwing one post-creation.
    const debug = new InMemoryEventSink();
    const audit = new NdjsonAuditSink(logPath);
    // Monkey-patch write to simulate failure
    audit.write = async () => {
      throw new Error("disk full (simulated)");
    };

    const stream = new EventStream(APP, debug, audit);
    await expect(
      stream.append(mkEvent({ audit: true, payload: { critical: true } }))
    ).rejects.toThrow();

    // debug sink did NOT receive the event (atomicity preserved)
    expect(debug.events).toHaveLength(0);
    expect(stream.currentSequence).toBe(0);
  });
});
