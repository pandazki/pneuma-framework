import { describe, test, expect } from "bun:test";
import {
  EventStream,
  InMemoryEventSink,
  EventStreamError,
  type PneumaEventInput,
} from "../../src/aggregates/event-stream.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";

function mkEvent(app_id: string, overrides: Partial<PneumaEventInput> = {}): PneumaEventInput {
  const ctx = buildRootContext({ app_id, invoked_via: "ui" });
  return {
    id: `ev-${Math.random().toString(16).slice(2, 10)}`,
    ts: Date.now(),
    category: "request",
    ctx,
    trace_id: ctx.trace_id,
    payload: {},
    ...overrides,
  };
}

describe("EventStream · append-only aggregate (ADR-0013/0014)", () => {
  test("sequence is strictly monotonic from 1", async () => {
    const debug = new InMemoryEventSink();
    const audit = new InMemoryEventSink();
    const stream = new EventStream("app", debug, audit);

    const e1 = await stream.append(mkEvent("app"));
    const e2 = await stream.append(mkEvent("app"));
    const e3 = await stream.append(mkEvent("app"));

    expect(e1.sequence).toBe(1);
    expect(e2.sequence).toBe(2);
    expect(e3.sequence).toBe(3);
    expect(debug.events.map((e) => e.sequence)).toEqual([1, 2, 3]);
  });

  test("non-audit event only writes to debug sink", async () => {
    const debug = new InMemoryEventSink();
    const audit = new InMemoryEventSink();
    const stream = new EventStream("app", debug, audit);

    await stream.append(mkEvent("app"));
    await stream.append(mkEvent("app", { audit: false }));

    expect(debug.events).toHaveLength(2);
    expect(audit.events).toHaveLength(0);
  });

  test("audit=true event writes to both sinks", async () => {
    const debug = new InMemoryEventSink();
    const audit = new InMemoryEventSink();
    const stream = new EventStream("app", debug, audit);

    await stream.append(mkEvent("app", { audit: true, category: "mutation" }));

    expect(audit.events).toHaveLength(1);
    expect(debug.events).toHaveLength(1);
  });

  test("ctx.app_id mismatch throws and does not increment sequence", async () => {
    const debug = new InMemoryEventSink();
    const audit = new InMemoryEventSink();
    const stream = new EventStream("app-correct", debug, audit);

    await expect(
      stream.append(mkEvent("app-wrong"))
    ).rejects.toBeInstanceOf(EventStreamError);

    expect(stream.currentSequence).toBe(0);
    expect(debug.events).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });

  test("audit sink failure aborts the append: no debug write, seq not advanced", async () => {
    const debug = new InMemoryEventSink();
    const audit = new InMemoryEventSink();
    const stream = new EventStream("app", debug, audit);

    audit.setFail(true);
    await expect(
      stream.append(mkEvent("app", { audit: true, category: "mutation" }))
    ).rejects.toBeInstanceOf(EventStreamError);

    expect(stream.currentSequence).toBe(0);
    expect(debug.events).toHaveLength(0);
    expect(audit.events).toHaveLength(0);

    // Subsequent successful append should still start at 1
    audit.setFail(false);
    const e1 = await stream.append(mkEvent("app", { audit: true, category: "mutation" }));
    expect(e1.sequence).toBe(1);
  });

  test("interface enforces append-only (no update/delete methods on EventStream)", () => {
    const debug = new InMemoryEventSink();
    const audit = new InMemoryEventSink();
    const stream = new EventStream("app", debug, audit);

    // Compile-time would fail; here we runtime-check the API surface
    expect((stream as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((stream as unknown as Record<string, unknown>).delete).toBeUndefined();
    expect((stream as unknown as Record<string, unknown>).truncate).toBeUndefined();
  });

  test("audit=true failure does not leak event to debug sink (all-or-nothing)", async () => {
    const debug = new InMemoryEventSink();
    const audit = new InMemoryEventSink();
    const stream = new EventStream("app", debug, audit);

    // non-audit event succeeds first
    await stream.append(mkEvent("app"));
    expect(debug.events).toHaveLength(1);

    // audit failure
    audit.setFail(true);
    await expect(
      stream.append(mkEvent("app", { audit: true, category: "access" }))
    ).rejects.toBeInstanceOf(EventStreamError);

    // still only the first event in debug sink
    expect(debug.events).toHaveLength(1);
    expect(stream.currentSequence).toBe(1);
  });
});
