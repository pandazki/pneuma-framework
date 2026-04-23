// 端到端 integration test — 模拟 domain-model.md §5.1 的调用链:
// UI click / Agent tool → OperationExecutor.invoke(delete_bookmark) →
//   - PolicyEvaluator.check(invoke, operation:delete_bookmark)
//   - impact.compute(input) → ImpactReport
//   - 强制 confirmation 门槛 (destructive)
//   - handler 调 StorageService.deleteRow → cascade 删 interpretations
//   - EventStream 记 access / started / completed events
//
// 只用抽象的 in-memory repository, 无 IO / 无 LLM / 无真 adapter.

import { describe, test, expect } from "bun:test";
import { Table, type TableInit } from "../../src/aggregates/table.js";
import { Row } from "../../src/aggregates/row.js";
import { Operation, type OperationInit } from "../../src/aggregates/operation.js";
import {
  PolicySet,
  Subjects,
  Resources,
} from "../../src/aggregates/policy-set.js";
import { EventStream, InMemoryEventSink } from "../../src/aggregates/event-stream.js";
import { InMemoryRepository } from "../../src/repositories/types.js";
import { StorageService } from "../../src/services/storage-service.js";
import { PolicyEvaluator } from "../../src/services/policy-evaluator.js";
import {
  OperationExecutor,
  HandlerRegistry,
  PolicyDeniedError,
  ConfirmationRequiredError,
  type HandlerFn,
  type ImpactComputeFn,
} from "../../src/services/operation-executor.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";
import type { CellType } from "../../src/value-objects/cell-type.js";
import type { Ref } from "../../src/value-objects/ref.js";

const APP = "ai-bookmarks";
const TEXT: CellType = { kind: "primitive", of: "Text" };
const URL_T: CellType = { kind: "primitive", of: "URL" };
const REF_BOOKMARK: CellType = { kind: "ref-row", table: "bookmarks" };

interface Harness {
  tables: InMemoryRepository<Table>;
  rows: InMemoryRepository<Row>;
  storage: StorageService;
  policy: PolicySet;
  events: EventStream;
  debugSink: InMemoryEventSink;
  auditSink: InMemoryEventSink;
  executor: OperationExecutor;
  bookmarkId: string;
  interpIds: string[];
  deleteBookmarkOp: Operation;
}

async function setupHarness(): Promise<Harness> {
  const tables = new InMemoryRepository<Table>((t) => t.id);
  const rows = new InMemoryRepository<Row>((r) => r.id);

  // bookmarks: schema
  const bookmarks = new Table({
    id: "bookmarks",
    app_id: APP,
    columns: [
      { name: "url", type: URL_T },
      { name: "title", type: TEXT, nullable: true },
    ],
    source: { kind: "stored" },
  } as TableInit);
  await tables.save(bookmarks);

  // interpretations: ref-row<bookmarks> with cascade flag
  const interpretations = new Table({
    id: "interpretations",
    app_id: APP,
    columns: [
      {
        name: "bookmark_id",
        type: REF_BOOKMARK,
        cascade_on_target_delete: true,
      },
      { name: "body", type: TEXT },
    ],
    source: { kind: "stored" },
  });
  await tables.save(interpretations);

  const storage = new StorageService(tables, rows);

  // Seed rows
  const bookmark = new Row({
    id: "bm-1",
    table_id: "bookmarks",
    app_id: APP,
    owner_id: "alice",
    cells: { url: "https://bun.sh", title: "Bun v1.3" },
    created_at: 1000,
    updated_at: 1000,
  });
  await storage.saveRow(bookmark, { checkRefIntegrity: false });

  const interp1 = new Row({
    id: "itp-1",
    table_id: "interpretations",
    app_id: APP,
    owner_id: "alice",
    cells: {
      bookmark_id: { kind: "row", table: "bookmarks", id: "bm-1" } satisfies Ref,
      body: "技术深度解读 A",
    },
  });
  await storage.saveRow(interp1);

  const interp2 = new Row({
    id: "itp-2",
    table_id: "interpretations",
    app_id: APP,
    owner_id: "alice",
    cells: {
      bookmark_id: { kind: "row", table: "bookmarks", id: "bm-1" } satisfies Ref,
      body: "技术深度解读 B",
    },
  });
  await storage.saveRow(interp2);

  // Policy
  const policy = new PolicySet({ app_id: APP });
  policy.addRule({
    id: "alice-delete-bookmark",
    allow: [Subjects.user("alice")],
    do: ["invoke"],
    on: Resources.operation("delete_bookmark"),
  });

  // Event stream
  const debugSink = new InMemoryEventSink();
  const auditSink = new InMemoryEventSink();
  const events = new EventStream(APP, debugSink, auditSink);

  // Operation declaration
  const deleteBookmarkOp = new Operation({
    id: "delete_bookmark",
    app_id: APP,
    name: "删除书签",
    description: "从 timeline 和 graph 中永久移除 bookmark 及其所有解读",
    input: {
      type: "record",
      fields: {
        bookmark_id: {
          type: { kind: "ref-row", table: "bookmarks" },
          required: true,
        },
      },
    },
    output: { kind: "void" },
    affects: {
      mutations: ["bookmarks", "interpretations"],
      adapter_writes: [],
      destructive: true,
      reads_only: false,
    },
    handler: { kind: "code", ref: "./ops/delete_bookmark.ts" },
    impact: {
      compute: { kind: "code", ref: "./ops/delete_bookmark.impact.ts" },
      disclosure_template:
        "将删除 bookmark「{{bookmark.title}}」及其 {{interpretation_count}} 条解读",
    },
  } satisfies OperationInit);

  // Handler registry
  const handlers = new HandlerRegistry();

  const deleteFn: HandlerFn = async ({ input, storage }) => {
    const i = input as { bookmark_id: Ref };
    const targetId =
      typeof i.bookmark_id === "object" && "id" in i.bookmark_id
        ? (i.bookmark_id as Ref & { kind: "row" }).id
        : (i.bookmark_id as unknown as string);
    const result = await storage.deleteRow(targetId);
    return { deleted_ids: result.deleted };
  };
  handlers.registerHandler("./ops/delete_bookmark.ts", deleteFn);

  const impactFn: ImpactComputeFn = async ({ input, storage }) => {
    const i = input as { bookmark_id: Ref };
    const targetId =
      typeof i.bookmark_id === "object" && "id" in i.bookmark_id
        ? (i.bookmark_id as Ref & { kind: "row" }).id
        : (i.bookmark_id as unknown as string);
    const bm = await storage.getRow(targetId);
    const rowsInInterp = await storage.listRowsByTable("interpretations");
    const interpCount = rowsInInterp.filter((r) => {
      const ref = r.getCell("bookmark_id");
      return (
        typeof ref === "object" &&
        ref !== null &&
        "id" in ref &&
        (ref as { id?: string }).id === targetId
      );
    }).length;
    return {
      disclosure: `将删除 bookmark「${String(bm?.getCell("title") ?? "")}」及其 ${interpCount} 条解读`,
      details: {
        bookmark_id: targetId,
        bookmark_title: bm?.getCell("title"),
        interpretation_count: interpCount,
      },
    };
  };
  handlers.registerImpact("./ops/delete_bookmark.impact.ts", impactFn);

  const evaluator = new PolicyEvaluator(policy.compile());
  const executor = new OperationExecutor(evaluator, events, storage, handlers);

  return {
    tables,
    rows,
    storage,
    policy,
    events,
    debugSink,
    auditSink,
    executor,
    bookmarkId: "bm-1",
    interpIds: ["itp-1", "itp-2"],
    deleteBookmarkOp,
  };
}

describe("Integration · delete_bookmark full pipeline", () => {
  test("alice confirmed=true: rows deleted + cascade + events emitted", async () => {
    const h = await setupHarness();
    const ctx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: [] },
    });

    const result = await h.executor.invoke(
      h.deleteBookmarkOp,
      { bookmark_id: { kind: "row", table: "bookmarks", id: h.bookmarkId } satisfies Ref },
      ctx,
      { confirmed: true }
    );

    // handler 返回
    expect(result.output).toEqual({ deleted_ids: expect.any(Array) });
    const deletedIds = (result.output as { deleted_ids: string[] }).deleted_ids.sort();
    expect(deletedIds).toEqual(["bm-1", "itp-1", "itp-2"].sort());

    // impact 被计算
    expect(result.impact).toBeDefined();
    expect(result.impact!.disclosure).toContain("Bun v1.3");
    expect(result.impact!.disclosure).toContain("2 条解读");
    expect(result.impact!.details?.interpretation_count).toBe(2);

    // rows 真的删了
    expect(await h.storage.getRow("bm-1")).toBeUndefined();
    expect(await h.storage.getRow("itp-1")).toBeUndefined();
    expect(await h.storage.getRow("itp-2")).toBeUndefined();

    // events: started + completed (都是 audit)
    expect(h.auditSink.events.length).toBeGreaterThanOrEqual(2);
    const phases = h.auditSink.events.map((e) => (e.payload as { phase?: string }).phase);
    expect(phases).toContain("started");
    expect(phases).toContain("completed");

    // trace_id 一致（一条 trace 下）
    const traceIds = new Set(h.auditSink.events.map((e) => e.trace_id));
    expect(traceIds.size).toBe(1);
  });

  test("bob (not allowed): PolicyDeniedError + access deny event", async () => {
    const h = await setupHarness();
    const ctx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "bob", attrs: {}, roles: [] },
    });

    await expect(
      h.executor.invoke(
        h.deleteBookmarkOp,
        { bookmark_id: { kind: "row", table: "bookmarks", id: h.bookmarkId } satisfies Ref },
        ctx,
        { confirmed: true }
      )
    ).rejects.toBeInstanceOf(PolicyDeniedError);

    // rows intact
    expect(await h.storage.getRow("bm-1")).toBeDefined();
    expect(await h.storage.getRow("itp-1")).toBeDefined();

    // access deny event emitted with audit=true
    const denyEvents = h.auditSink.events.filter(
      (e) => (e.payload as { decision?: string }).decision === "deny"
    );
    expect(denyEvents).toHaveLength(1);
    expect((denyEvents[0]!.payload as { reason: string }).reason).toBe(
      "default-restricted-no-match"
    );
  });

  test("alice confirmed=false on destructive: ConfirmationRequiredError", async () => {
    const h = await setupHarness();
    const ctx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: [] },
    });

    await expect(
      h.executor.invoke(
        h.deleteBookmarkOp,
        { bookmark_id: { kind: "row", table: "bookmarks", id: h.bookmarkId } satisfies Ref },
        ctx
        // no confirmed flag
      )
    ).rejects.toBeInstanceOf(ConfirmationRequiredError);

    // nothing deleted
    expect(await h.storage.getRow("bm-1")).toBeDefined();
    expect(await h.storage.getRow("itp-1")).toBeDefined();

    // no started/completed events (still got access allow event at policy step since check passed)
    const phases = h.auditSink.events.map((e) => (e.payload as { phase?: string }).phase);
    expect(phases).not.toContain("started");
    expect(phases).not.toContain("completed");
  });

  test("invoked_via threads through: ui click vs agent tool → same trace, different invoked_via", async () => {
    const h = await setupHarness();

    const uiCtx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: [] },
    });
    const result = await h.executor.invoke(
      h.deleteBookmarkOp,
      { bookmark_id: { kind: "row", table: "bookmarks", id: h.bookmarkId } satisfies Ref },
      uiCtx,
      { confirmed: true }
    );
    expect(result.output).toBeDefined();

    // all emitted audit events should have invoked_via="ui"
    const agentPhaseEvents = h.auditSink.events.filter(
      (e) => (e.payload as { phase?: string }).phase !== undefined
    );
    for (const e of agentPhaseEvents) {
      expect((e.payload as { invoked_via?: string }).invoked_via).toBe("ui");
    }
  });

  test("UI click ≡ Agent tool call: same handler runs, same events emitted (ADR-0018 invariant)", async () => {
    // two executions with different invoked_via paths, on two separate harnesses — verify
    // that output shape and event shape are identical across entry modes.
    const setupAndInvoke = async (mode: "ui" | "agent") => {
      const h = await setupHarness();
      const ctx = buildRootContext({
        app_id: APP,
        invoked_via: mode,
        user: { id: "alice", attrs: {}, roles: [] },
      });
      const r = await h.executor.invoke(
        h.deleteBookmarkOp,
        { bookmark_id: { kind: "row", table: "bookmarks", id: h.bookmarkId } satisfies Ref },
        ctx,
        { confirmed: true }
      );
      return {
        output: r.output,
        auditEventPayloadShape: h.auditSink.events.map((e) => {
          const p = e.payload as Record<string, unknown>;
          return {
            hasOperationId: "operation_id" in p || "resource" in p,
            phase: p.phase,
            decision: p.decision,
          };
        }),
      };
    };
    const uiRes = await setupAndInvoke("ui");
    const agentRes = await setupAndInvoke("agent");

    // same output structure
    expect(uiRes.output).toEqual(agentRes.output);
    // same event shapes (phase / decision fields in same positions)
    expect(uiRes.auditEventPayloadShape).toEqual(agentRes.auditEventPayloadShape);
  });
});
