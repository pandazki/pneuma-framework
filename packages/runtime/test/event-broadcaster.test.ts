import { describe, test, expect } from "bun:test";
import { EventBroadcaster, type RuntimeEvent } from "../src/event-broadcaster.js";

const sampleEvent = (): RuntimeEvent => ({
  type: "operation-executed",
  operation_id: "add_bookmark",
  app_id: "test-app",
  ts: Date.now(),
  success: true,
});

describe("EventBroadcaster · subscribe / emit / unsubscribe", () => {
  test("starts with zero subscribers", () => {
    const b = new EventBroadcaster();
    expect(b.subscriberCount()).toBe(0);
  });

  test("subscriberCount increments on subscribe", () => {
    const b = new EventBroadcaster();
    const unsub1 = b.subscribe(() => {});
    expect(b.subscriberCount()).toBe(1);
    const unsub2 = b.subscribe(() => {});
    expect(b.subscriberCount()).toBe(2);
    unsub1();
    unsub2();
  });

  test("unsubscribe removes listener from count", () => {
    const b = new EventBroadcaster();
    const unsub = b.subscribe(() => {});
    expect(b.subscriberCount()).toBe(1);
    unsub();
    expect(b.subscriberCount()).toBe(0);
  });

  test("unsubscribe is idempotent", () => {
    const b = new EventBroadcaster();
    const unsub = b.subscribe(() => {});
    unsub();
    unsub(); // second call must not throw
    expect(b.subscriberCount()).toBe(0);
  });

  test("emit delivers event to all subscribers", () => {
    const b = new EventBroadcaster();
    const received1: RuntimeEvent[] = [];
    const received2: RuntimeEvent[] = [];
    const unsub1 = b.subscribe((e) => received1.push(e));
    const unsub2 = b.subscribe((e) => received2.push(e));
    const evt = sampleEvent();
    b.emit(evt);
    expect(received1).toHaveLength(1);
    expect(received1[0]).toBe(evt);
    expect(received2).toHaveLength(1);
    expect(received2[0]).toBe(evt);
    unsub1();
    unsub2();
  });

  test("emit does not deliver to unsubscribed listeners", () => {
    const b = new EventBroadcaster();
    const received: RuntimeEvent[] = [];
    const unsub = b.subscribe((e) => received.push(e));
    b.emit(sampleEvent());
    expect(received).toHaveLength(1);
    unsub();
    b.emit(sampleEvent());
    expect(received).toHaveLength(1); // still 1, not 2
  });

  test("a throwing subscriber does not prevent other subscribers from receiving", () => {
    const b = new EventBroadcaster();
    const received: RuntimeEvent[] = [];
    const unsub1 = b.subscribe(() => { throw new Error("boom"); });
    const unsub2 = b.subscribe((e) => received.push(e));
    b.emit(sampleEvent()); // must not throw
    expect(received).toHaveLength(1);
    unsub1();
    unsub2();
  });

  test("emit with no subscribers is a no-op", () => {
    const b = new EventBroadcaster();
    expect(() => b.emit(sampleEvent())).not.toThrow();
  });

  test("multiple emits are received in order", () => {
    const b = new EventBroadcaster();
    const ops: string[] = [];
    const unsub = b.subscribe((e) => ops.push(e.operation_id));
    b.emit({ ...sampleEvent(), operation_id: "op_1" });
    b.emit({ ...sampleEvent(), operation_id: "op_2" });
    b.emit({ ...sampleEvent(), operation_id: "op_3" });
    expect(ops).toEqual(["op_1", "op_2", "op_3"]);
    unsub();
  });
});
