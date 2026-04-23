// Step 6 integration — weekly-linear-digest 端到端.
//
// 真的把 pneuma 的 8 个 primitives 拼出一个有意义的 "AI-native app":
//   - Adapter (Linear, admin_delegated)
//   - Transform (linear_issues_to_digest, prompt impl via mock LLM)
//   - 2 个 Query Operations (my_closed_issues_this_week / my_digests, reads_only)
//   - 1 个 Code Operation (generate_weekly_digest, code handler chains query→transform→insert)
//   - 3 个 Tables (users / digests stored + linear_issues adapter-backed)
//   - PolicySet row-level filter on digests (user 只能看自己的)
//   - IdentityRegistry (alice ↔ LIN-alice binding)
//
// 验证:
//   1. admin_delegated 安全契约:alice / bob 的 query 都带上自己 linear_user_id 的下推过滤,各自只拿到自己的 issues
//   2. Transform (prompt) 返回 canned 结果,存进 digests 表
//   3. digests 的 row-level policy 起作用:bob 查 my_digests 拿不到 alice 的
//   4. Operation pipeline 全程走 policy → handler → event(audit),trace_id 一致
//   5. 跨 user 调用同一个 Operation,output 按各自绑定分离——ADR-0020 cache key 不串

import { describe, test, expect, beforeEach } from "bun:test";
import { Table } from "../../src/aggregates/table.js";
import { Row } from "../../src/aggregates/row.js";
import {
  Operation,
  type QueryBody,
} from "../../src/aggregates/operation.js";
import {
  PolicySet,
  Subjects,
  Resources,
} from "../../src/aggregates/policy-set.js";
import { EventStream, InMemoryEventSink } from "../../src/aggregates/event-stream.js";
import { Adapter, type IdentityBinding } from "../../src/aggregates/adapter.js";
import { Transform } from "../../src/aggregates/transform.js";
import { InMemoryRepository } from "../../src/repositories/types.js";
import { StorageService } from "../../src/services/storage-service.js";
import { PolicyEvaluator } from "../../src/services/policy-evaluator.js";
import {
  OperationExecutor,
  HandlerRegistry,
  type HandlerFn,
} from "../../src/services/operation-executor.js";
import {
  AdapterInvoker,
  InMemoryCredentialStore,
  type AdapterImpl,
  type ExternalRow,
} from "../../src/services/adapter-invoker.js";
import {
  TransformRegistry,
  TransformRunner,
  MockLLMProvider,
} from "../../src/services/transform-runner.js";
import { QueryExecutor } from "../../src/services/query-executor.js";
import {
  createIdentitySystemTables,
  IdentityRegistry,
  hydrateUserContext,
  userRef,
} from "../../src/services/identity-registry.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";
import type { CellType } from "../../src/value-objects/cell-type.js";
import type { Ref } from "../../src/value-objects/ref.js";
import type { WhereClause } from "../../src/value-objects/where-clause.js";

const APP = "weekly-linear-digest";
const TEXT: CellType = { kind: "primitive", of: "Text" };
const RICH: CellType = { kind: "primitive", of: "RichText" };
const NUM: CellType = { kind: "primitive", of: "Number" };
const DATE_T: CellType = { kind: "primitive", of: "Date" };

// 固定 now 让 date sub_op 可预测
const NOW = new Date(2026, 3, 24, 12, 0, 0).getTime();
const ONE_DAY = 86_400_000;

interface Harness {
  tables: InMemoryRepository<Table>;
  rows: InMemoryRepository<Row>;
  adapters: InMemoryRepository<Adapter>;
  storage: StorageService;
  invoker: AdapterInvoker;
  registry: IdentityRegistry;
  events: EventStream;
  auditSink: InMemoryEventSink;
  debugSink: InMemoryEventSink;
  policy: PolicySet;
  queryExec: QueryExecutor;
  executor: OperationExecutor;
  transformRunner: TransformRunner;
  myClosedIssuesOp: Operation;
  generateDigestOp: Operation;
  myDigestsOp: Operation;
  linearIssuesToDigest: Transform;
  linearAdapter: Adapter;
  linearImpl: AdapterImpl;
  fakeLinearStore: ExternalRow[];
}

async function buildHarness(): Promise<Harness> {
  // --- repositories
  const tables = new InMemoryRepository<Table>((t) => t.id);
  const rows = new InMemoryRepository<Row>((r) => r.id);
  const adapters = new InMemoryRepository<Adapter>((a) => a.id);

  // --- identity system tables
  const { users, roles, memberships } = createIdentitySystemTables(APP);
  await tables.save(users);
  await tables.save(roles);
  await tables.save(memberships);

  // --- app-specific tables
  const linearIssues = new Table({
    id: "linear_issues",
    app_id: APP,
    columns: [
      // 'id' is a reserved column name; use external_id for the Linear row id
      { name: "external_id", type: TEXT },
      { name: "title", type: TEXT },
      { name: "state", type: TEXT },
      { name: "assignee_id", type: TEXT },
      { name: "completed_at", type: DATE_T },
    ],
    source: {
      kind: "adapter-backed",
      adapter: "linear",
      config: {},
      externalType: "Issue",
    },
  });
  await tables.save(linearIssues);

  const digests = new Table({
    id: "digests",
    app_id: APP,
    columns: [
      { name: "user_id", type: { kind: "ref-row", table: "users" } },
      { name: "body", type: RICH },
      { name: "generated_at", type: DATE_T },
      { name: "source_issue_count", type: NUM },
    ],
    source: { kind: "stored" },
  });
  await tables.save(digests);

  // --- Linear adapter (admin_delegated)
  const binding: IdentityBinding = {
    strategy: "email_match",
    store_at: "user.attrs.linear_user_id",
  };
  const linearAdapter = new Adapter({
    id: "linear",
    app_id: APP,
    externalTypes: [
      {
        name: "Issue",
        columns: [
          { name: "external_id", type: TEXT },
          { name: "title", type: TEXT },
          { name: "state", type: TEXT },
          { name: "assignee_id", type: TEXT },
          { name: "completed_at", type: DATE_T },
        ],
      },
    ],
    auth: { kind: "oauth2", scopes: ["read:issues"] },
    credential_mode: "admin_delegated",
    supported_credential_modes: ["shared", "admin_delegated"],
    identity_binding: binding,
    capabilities: {
      list: true,
      read: true,
      insert: false,
      update: false,
      delete: false,
      filter_pushdown: {
        supported_ops: {
          assignee_id: ["eq", "in"],
          state: ["eq"],
          completed_at: ["gte", "lte", "date"],
        },
        required_for_admin_delegated: [
          { column: "assignee_id", required_ops: ["eq"] },
        ],
      },
    },
  });
  await adapters.save(linearAdapter);

  // --- Fake Linear store + impl
  const fakeLinearStore: ExternalRow[] = [
    {
      external_id: "LIN-1",
      title: "Refactor storage layer",
      state: "closed",
      assignee_id: "LIN-alice",
      completed_at: NOW - ONE_DAY, // yesterday
    },
    {
      external_id: "LIN-2",
      title: "Add query DSL",
      state: "closed",
      assignee_id: "LIN-alice",
      completed_at: NOW - 3 * ONE_DAY, // 3 days ago
    },
    {
      external_id: "LIN-3",
      title: "Fix cascade bug",
      state: "closed",
      assignee_id: "LIN-bob",
      completed_at: NOW - 2 * ONE_DAY,
    },
    {
      external_id: "LIN-4",
      title: "Design review",
      state: "open", // should be filtered out by state
      assignee_id: "LIN-alice",
      completed_at: NOW - ONE_DAY,
    },
    {
      external_id: "LIN-5",
      title: "Last quarter epic",
      state: "closed",
      assignee_id: "LIN-alice",
      completed_at: NOW - 60 * ONE_DAY, // too old
    },
  ];

  const linearImpl: AdapterImpl = {
    async list(query) {
      return fakeLinearStore.filter((r) => {
        for (const leaf of query.where) {
          const rv = r[leaf.column];
          if (leaf.op === "eq" && rv !== leaf.value) return false;
          if (leaf.op === "in" && Array.isArray(leaf.value) && !leaf.value.includes(rv as never)) return false;
          if (leaf.op === "date" && leaf.sub_op === "last_n_days" && typeof rv === "number") {
            const cutoff = NOW - (Number(leaf.value) + 0) * ONE_DAY;
            if (rv < cutoff) return false;
          }
        }
        return true;
      });
    },
  };

  const credentials = new InMemoryCredentialStore();
  credentials.setAdmin("linear", "ADMIN-LINEAR-TOKEN");
  const invoker = new AdapterInvoker(credentials, new Map([["linear", linearImpl]]));

  // --- Storage + Identity
  const storage = new StorageService(tables, rows);
  const registry = new IdentityRegistry(storage);

  // --- Event stream + policy
  const debugSink = new InMemoryEventSink();
  const auditSink = new InMemoryEventSink();
  const events = new EventStream(APP, debugSink, auditSink);

  // --- PolicySet
  const policy = new PolicySet({ app_id: APP });
  // Any authenticated user can invoke these operations
  policy.addRule({
    id: "invoke-my-closed-issues",
    allow: [Subjects.anyone()],
    do: ["invoke"],
    on: Resources.operation("my_closed_issues_this_week"),
  });
  policy.addRule({
    id: "invoke-gen-digest",
    allow: [Subjects.anyone()],
    do: ["invoke"],
    on: Resources.operation("generate_weekly_digest"),
  });
  policy.addRule({
    id: "invoke-my-digests",
    allow: [Subjects.anyone()],
    do: ["invoke"],
    on: Resources.operation("my_digests"),
  });
  // digests row-level read: only your own
  const digestRowFilter: WhereClause = {
    kind: "leaf",
    subject: { ns: "row", path: ["user_id", "id"] },
    op: "eq",
    value: { ref: "user", path: ["id"] },
  };
  policy.addRule({
    id: "digests-self-read",
    allow: [Subjects.self()],
    do: ["read"],
    on: Resources.tableRow("digests"),
    when: digestRowFilter,
  });

  // --- Transform
  const llm = new MockLLMProvider();
  // MVP: MockLLM 默认返回一个包含 issue 标题的 canned digest, 足够让 assertion 验到.
  llm.defaultResponse =
    "Weekly digest: closed 2 issues — Refactor storage layer; Add query DSL.";

  const transformRegistry = new TransformRegistry();
  const transformRunner = new TransformRunner(transformRegistry, llm);

  const linearIssuesToDigest = new Transform({
    id: "linear_issues_to_digest",
    app_id: APP,
    in: { kind: "row-list", table: "linear_issues" },
    out: RICH,
    impl: {
      kind: "prompt",
      model: "anthropic/claude-haiku",
      system: "Summarize these Linear issues into a 1-2 sentence weekly digest.",
    },
    purity: "pure",
  });

  // --- Operations
  const myClosedIssuesQuery: QueryBody = {
    kind: "query",
    on: "linear_issues",
    filter: {
      kind: "branch",
      logical_op: "and",
      children: [
        {
          kind: "leaf",
          subject: { ns: "row", path: ["assignee_id"] },
          op: "eq",
          value: { ref: "user", path: ["attrs", "linear_user_id"] },
        },
        {
          kind: "leaf",
          subject: { ns: "row", path: ["state"] },
          op: "eq",
          value: "closed",
        },
        {
          kind: "leaf",
          subject: { ns: "row", path: ["completed_at"] },
          op: "date",
          sub_op: "last_n_days",
          value: 7,
        },
      ],
    },
    sort: [{ column: "completed_at", dir: "desc" }],
    pagination: { kind: "cursor", size: 25 },
  };

  const myClosedIssuesOp = new Operation({
    id: "my_closed_issues_this_week",
    app_id: APP,
    name: "我本周关闭的 Linear issue",
    description: "过去 7 天内由当前 user 关闭的 Linear issue",
    input: { type: "record", fields: {} },
    output: { kind: "row-list", row_type: "linear_issues" },
    affects: { mutations: [], adapter_writes: [], reads_only: true, destructive: false },
    handler: myClosedIssuesQuery,
  });

  const myDigestsQuery: QueryBody = {
    kind: "query",
    on: "digests",
    filter: {
      kind: "leaf",
      subject: { ns: "row", path: ["user_id", "id"] },
      op: "eq",
      value: { ref: "user", path: ["id"] },
    },
    sort: [{ column: "generated_at", dir: "desc" }],
    pagination: { kind: "cursor", size: 25 },
  };

  const myDigestsOp = new Operation({
    id: "my_digests",
    app_id: APP,
    name: "我的周报",
    description: "查看自己历史的周报",
    input: { type: "record", fields: {} },
    output: { kind: "row-list", row_type: "digests" },
    affects: { mutations: [], adapter_writes: [], reads_only: true, destructive: false },
    handler: myDigestsQuery,
  });

  const generateDigestOp = new Operation({
    id: "generate_weekly_digest",
    app_id: APP,
    name: "生成本周报",
    description: "拉出本周自己关闭的 Linear issues,由 LLM 总结,存入 digests 表",
    input: { type: "record", fields: {} },
    output: { kind: "void" },
    affects: {
      mutations: ["digests"],
      adapter_writes: [],
      reads_only: false,
      destructive: false,
    },
    handler: { kind: "code", ref: "./ops/generate_weekly_digest.ts" },
  });

  // --- PolicyEvaluator + QueryExecutor + OperationExecutor
  const evaluator = new PolicyEvaluator(policy.compile());
  const queryExec = new QueryExecutor(storage, invoker, adapters);

  const handlers = new HandlerRegistry();
  const generateDigestFn: HandlerFn = async ({ ctx, storage: sto }) => {
    // 1. 查本周自己 closed issues
    const qResult = await queryExec.run(myClosedIssuesOp, {}, ctx);
    // 2. Transform 成 digest body
    const body = (await transformRunner.apply(
      linearIssuesToDigest,
      qResult.rows,
      ctx
    )) as string;
    // 3. 存入 digests (user_id 指向当前 user row)
    if (!ctx.user) throw new Error("user required");
    const digest = new Row({
      id: `digest-${ctx.user.id}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      table_id: "digests",
      app_id: APP,
      owner_id: ctx.user.id,
      cells: {
        user_id: userRef(ctx.user.id) satisfies Ref,
        body,
        generated_at: Date.now(),
        source_issue_count: qResult.rows.length,
      },
    });
    await sto.saveRow(digest);
    return { digest_id: digest.id, source_issue_count: qResult.rows.length, body };
  };
  handlers.registerHandler("./ops/generate_weekly_digest.ts", generateDigestFn);

  const executor = new OperationExecutor(evaluator, events, storage, handlers);

  return {
    tables, rows, adapters,
    storage, invoker, registry, events, auditSink, debugSink, policy,
    queryExec, executor, transformRunner,
    myClosedIssuesOp, generateDigestOp, myDigestsOp,
    linearIssuesToDigest, linearAdapter, linearImpl, fakeLinearStore,
  };
}

/** 注册 alice / bob 到 IdentityRegistry 并把 attrs.linear_user_id 绑定 */
async function seedUsers(h: Harness): Promise<{ alice: Row; bob: Row }> {
  const alice = new Row({
    id: "alice",
    table_id: "users",
    app_id: APP,
    cells: { email: "alice@co", attrs: "" },
  });
  const bob = new Row({
    id: "bob",
    table_id: "users",
    app_id: APP,
    cells: { email: "bob@co", attrs: "" },
  });
  await h.storage.saveRow(alice);
  await h.storage.saveRow(bob);
  await h.registry.bindAttribute("alice", "linear_user_id", "LIN-alice");
  await h.registry.bindAttribute("bob", "linear_user_id", "LIN-bob");
  return { alice, bob };
}

async function ctxFor(h: Harness, user_id: string) {
  const hydrated = await hydrateUserContext(h.registry, user_id);
  return buildRootContext({
    app_id: APP,
    invoked_via: "ui",
    user: hydrated,
  });
}

// ---------- tests ----------

describe("Integration · weekly-linear-digest (step 6)", () => {
  describe("admin_delegated + pushdown", () => {
    test("alice generate_weekly_digest: pushdown filters to LIN-alice, digest saved", async () => {
      const h = await buildHarness();
      await seedUsers(h);
      const ctx = await ctxFor(h, "alice");

      const result = await h.executor.invoke(h.generateDigestOp, {}, ctx, {
        confirmed: false, // non-destructive → no confirm needed
      });

      const out = result.output as { digest_id: string; source_issue_count: number; body: string };
      expect(out.source_issue_count).toBe(2); // LIN-1 + LIN-2 (LIN-4 open, LIN-5 too old)
      expect(out.body).toContain("Refactor");

      // digest row persisted
      const saved = await h.storage.getRow(out.digest_id);
      expect(saved).toBeDefined();
      const userIdCell = saved!.getCell("user_id") as { id: string };
      expect(userIdCell.id).toBe("alice");
      expect(saved!.getCell("source_issue_count")).toBe(2);

      // audit trail: access-allow + operation-started + operation-completed
      const phases = h.auditSink.events.map(
        (e) => (e.payload as { phase?: string; decision?: string }).phase ?? (e.payload as { decision?: string }).decision
      );
      expect(phases.some((p) => p === "started")).toBe(true);
      expect(phases.some((p) => p === "completed")).toBe(true);
    });

    test("bob: same operation returns bob's issues (isolation through admin_delegated)", async () => {
      const h = await buildHarness();
      await seedUsers(h);
      const ctx = await ctxFor(h, "bob");

      const result = await h.executor.invoke(h.generateDigestOp, {}, ctx);
      const out = result.output as { source_issue_count: number };
      // bob only has LIN-3 (closed, 2 days ago, assignee=LIN-bob)
      expect(out.source_issue_count).toBe(1);
    });

    test("admin_delegated contract: removing user binding from filter → fail-closed at invoker", async () => {
      const h = await buildHarness();
      await seedUsers(h);
      const ctx = await ctxFor(h, "alice");

      // 手动构造一个"忘了加 user 绑定"的 query (模拟 Builder 写错 policy/query)
      const buggy: WhereClause = {
        kind: "leaf",
        subject: { ns: "row", path: ["state"] },
        op: "eq",
        value: "closed",
      };
      await expect(
        h.invoker.list(h.linearAdapter, ctx, { filter: buggy })
      ).rejects.toThrow(/admin_delegated safety contract violated/);
    });
  });

  describe("digests row-level policy", () => {
    test("alice can see her own digest; bob cannot see alice's", async () => {
      const h = await buildHarness();
      await seedUsers(h);

      const aliceCtx = await ctxFor(h, "alice");
      const bobCtx = await ctxFor(h, "bob");

      // alice generates her digest
      await h.executor.invoke(h.generateDigestOp, {}, aliceCtx);

      // bob also generates his
      await h.executor.invoke(h.generateDigestOp, {}, bobCtx);

      // alice query my_digests → 1 row, her own
      const aliceResult = await h.queryExec.run(h.myDigestsOp, {}, aliceCtx);
      expect(aliceResult.rows).toHaveLength(1);
      expect((aliceResult.rows[0]!.user_id as { id: string }).id).toBe("alice");

      // bob query my_digests → 1 row, his own
      const bobResult = await h.queryExec.run(h.myDigestsOp, {}, bobCtx);
      expect(bobResult.rows).toHaveLength(1);
      expect((bobResult.rows[0]!.user_id as { id: string }).id).toBe("bob");
    });

    test("my_digests filter evaluates user binding via WhereClause ref path", async () => {
      const h = await buildHarness();
      await seedUsers(h);
      const aliceCtx = await ctxFor(h, "alice");
      await h.executor.invoke(h.generateDigestOp, {}, aliceCtx);

      // Switch to bob's context and query alice's digest table → filter excludes
      const bobCtx = await ctxFor(h, "bob");
      const result = await h.queryExec.run(h.myDigestsOp, {}, bobCtx);
      // bob has no digest of his own yet
      expect(result.rows).toHaveLength(0);
    });
  });

  describe("primitives cooperation (ADR-0018 composition)", () => {
    test("single Operation chains Query + Transform + Storage write atomically", async () => {
      const h = await buildHarness();
      await seedUsers(h);
      const ctx = await ctxFor(h, "alice");

      const result = await h.executor.invoke(h.generateDigestOp, {}, ctx);
      // ALL of the following happened in one OperationExecutor.invoke call:
      // 1. Policy check (invoke operation:generate_weekly_digest)
      // 2. Handler executed
      //    2a. QueryExecutor run my_closed_issues_this_week → AdapterInvoker.list with pushdown
      //    2b. TransformRunner apply linear_issues_to_digest (prompt → mock LLM)
      //    2c. StorageService.saveRow into digests
      // 3. Event stream: operation.started, operation.completed (audit)
      // The test just verifies the chain held:
      const out = result.output as { digest_id: string };
      const saved = await h.storage.getRow(out.digest_id);
      expect(saved).toBeDefined();
      expect(saved!.getCell("body")).toBeTruthy();

      // single trace_id threads through all audit events
      const traces = new Set(h.auditSink.events.map((e) => e.trace_id));
      expect(traces.size).toBe(1);
    });

    test("transform cache hit: second invocation with same issues reuses LLM output", async () => {
      // Build a stable dataset that gives same input to Transform each time
      const h = await buildHarness();
      await seedUsers(h);
      const ctx = await ctxFor(h, "alice");

      // First call
      await h.executor.invoke(h.generateDigestOp, {}, ctx);
      // Swap in a fresh LLM call counter
      let llmCalls = 0;
      const realLLM = (h.transformRunner as unknown as { llm: MockLLMProvider }).llm;
      const orig = realLLM.complete.bind(realLLM);
      realLLM.complete = async (...args) => {
        llmCalls++;
        return orig(...args) as Promise<string>;
      };

      // Second call — issues from fake Linear are the same (it's fixture-driven),
      // so transform input hash matches → cache hit → 0 LLM calls
      await h.executor.invoke(h.generateDigestOp, {}, ctx);
      expect(llmCalls).toBe(0);
    });
  });
});
