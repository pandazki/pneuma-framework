// Policy 边界场景组 (ADR-0007 / 0009 / 0010):
//   1. 角色授权 (role:admin / role:viewer)
//   2. 列级权限 (column default_access=restricted + self rule)
//   3. 匿名用户对 invoke 的默认 deny
//   4. 规则冲突: 多 allow rule, 任一命中即允许
//   5. default_posture=restricted 时所有未授权 deny

import { describe, test, expect } from "bun:test";
import { Table } from "../../src/aggregates/table.js";
import { Row } from "../../src/aggregates/row.js";
import { Operation } from "../../src/aggregates/operation.js";
import {
  PolicySet,
  Subjects,
  Resources,
} from "../../src/aggregates/policy-set.js";
import {
  EventStream,
  InMemoryEventSink,
} from "../../src/aggregates/event-stream.js";
import { Adapter } from "../../src/aggregates/adapter.js";
import { InMemoryRepository } from "../../src/repositories/types.js";
import { StorageService } from "../../src/services/storage-service.js";
import { PolicyEvaluator } from "../../src/services/policy-evaluator.js";
import {
  OperationExecutor,
  HandlerRegistry,
  PolicyDeniedError,
  type HandlerFn,
} from "../../src/services/operation-executor.js";
import { AdapterInvoker, InMemoryCredentialStore } from "../../src/services/adapter-invoker.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";
import type { CellType } from "../../src/value-objects/cell-type.js";
import type { WhereClause } from "../../src/value-objects/where-clause.js";

const APP = "policy-edge-cases";
const TEXT: CellType = { kind: "primitive", of: "Text" };
const RICH: CellType = { kind: "primitive", of: "RichText" };

// ---------- setup helpers ----------

async function baseHarness() {
  const tables = new InMemoryRepository<Table>((t) => t.id);
  const rows = new InMemoryRepository<Row>((r) => r.id);
  const adapters = new InMemoryRepository<Adapter>((a) => a.id);
  const credentials = new InMemoryCredentialStore();
  const storage = new StorageService(tables, rows);
  const debug = new InMemoryEventSink();
  const audit = new InMemoryEventSink();
  const events = new EventStream(APP, debug, audit);
  return { tables, rows, adapters, credentials, storage, debug, audit, events };
}

// ---------- tests ----------

describe("Policy · role-based access (ADR-0007 + ADR-0010)", () => {
  test("role:admin can invoke operation; role:viewer cannot", async () => {
    const { storage, events } = await baseHarness();

    const policy = new PolicySet({ app_id: APP });
    policy.addRule({
      id: "admin-invoke",
      allow: [Subjects.role("admin")],
      do: ["invoke"],
      on: Resources.operation("dangerous_op"),
    });

    const op = new Operation({
      id: "dangerous_op",
      app_id: APP,
      name: "Dangerous thing",
      description: "sensitive",
      input: { type: "record", fields: {} },
      output: { kind: "void" },
      affects: { mutations: [], adapter_writes: [], reads_only: false, destructive: false },
      handler: { kind: "code", ref: "./ops/dangerous.ts" },
    });

    const handlers = new HandlerRegistry();
    let called = 0;
    handlers.registerHandler("./ops/dangerous.ts", (async () => {
      called++;
      return { ok: true };
    }) as HandlerFn);

    const executor = new OperationExecutor(
      new PolicyEvaluator(policy.compile()),
      events,
      storage,
      handlers
    );

    // admin can
    const adminCtx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: ["admin"] },
    });
    const r = await executor.invoke(op, {}, adminCtx);
    expect((r.output as { ok: boolean }).ok).toBe(true);
    expect(called).toBe(1);

    // viewer cannot
    const viewerCtx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "bob", attrs: {}, roles: ["viewer"] },
    });
    await expect(executor.invoke(op, {}, viewerCtx)).rejects.toBeInstanceOf(
      PolicyDeniedError
    );
    expect(called).toBe(1); // not re-invoked
  });

  test("multiple allow rules: any hit grants access (no deny override in MVP)", async () => {
    const policy = new PolicySet({ app_id: APP });
    policy.addRule({
      id: "admin-read",
      allow: [Subjects.role("admin")],
      do: ["read"],
      on: Resources.tableRow("bookmarks"),
    });
    policy.addRule({
      id: "self-read",
      allow: [Subjects.self()],
      do: ["read"],
      on: Resources.tableRow("bookmarks"),
    });

    const evaluator = new PolicyEvaluator(policy.compile());
    const rowAsAlice = { owner_id: "alice" };

    // alice (owner) — self rule hits
    const aliceCtx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: [] },
    });
    const d1 = evaluator.check(
      "read",
      Resources.tableRow("bookmarks"),
      aliceCtx,
      { rowView: rowAsAlice, resourceDefaultAccess: "restricted" }
    );
    expect(d1.decision).toBe("allow");
    expect(d1.matched_rule_ids).toContain("self-read");

    // bob with admin role — admin rule hits (not owner)
    const bobCtx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "bob", attrs: {}, roles: ["admin"] },
    });
    const d2 = evaluator.check(
      "read",
      Resources.tableRow("bookmarks"),
      bobCtx,
      { rowView: rowAsAlice, resourceDefaultAccess: "restricted" }
    );
    expect(d2.decision).toBe("allow");
    expect(d2.matched_rule_ids).toContain("admin-read");

    // carol (no role, not owner) — no rule hits, default restricted → deny
    const carolCtx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "carol", attrs: {}, roles: [] },
    });
    const d3 = evaluator.check(
      "read",
      Resources.tableRow("bookmarks"),
      carolCtx,
      { rowView: rowAsAlice, resourceDefaultAccess: "restricted" }
    );
    expect(d3.decision).toBe("deny");
    expect(d3.reason).toBe("default-restricted-no-match");
  });
});

describe("Policy · column-level access (ADR-0006 + ADR-0009)", () => {
  test("private_notes column: self allowed, others denied", async () => {
    const policy = new PolicySet({ app_id: APP });
    policy.addRule({
      id: "private-notes-self",
      allow: [Subjects.self()],
      do: ["read"],
      on: Resources.column("bookmarks", "private_notes"),
    });

    const evaluator = new PolicyEvaluator(policy.compile());
    const row = { owner_id: "alice", title: "My bookmark", private_notes: "secret note" };

    // alice reading her own column → allow
    const aliceCtx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: [] },
    });
    const d1 = evaluator.check(
      "read",
      Resources.column("bookmarks", "private_notes"),
      aliceCtx,
      { rowView: row, resourceDefaultAccess: "restricted" }
    );
    expect(d1.decision).toBe("allow");

    // bob reading alice's private_notes → deny
    const bobCtx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "bob", attrs: {}, roles: [] },
    });
    const d2 = evaluator.check(
      "read",
      Resources.column("bookmarks", "private_notes"),
      bobCtx,
      { rowView: row, resourceDefaultAccess: "restricted" }
    );
    expect(d2.decision).toBe("deny");

    // Other columns still public — explicitly test 'title' with default_access=public
    const d3 = evaluator.check(
      "read",
      Resources.column("bookmarks", "title"),
      bobCtx,
      { rowView: row, resourceDefaultAccess: "public" }
    );
    expect(d3.decision).toBe("allow");
    expect(d3.reason).toBe("default-public");
  });
});

describe("Policy · anonymous access", () => {
  test("anonymous user denied on Operation by default (restricted)", async () => {
    const { storage, events } = await baseHarness();

    // Policy allows only authenticated
    const policy = new PolicySet({ app_id: APP });
    policy.addRule({
      id: "auth-only",
      allow: [Subjects.anyone()],
      do: ["invoke"],
      on: Resources.operation("some_op"),
    });

    const op = new Operation({
      id: "some_op",
      app_id: APP,
      name: "Some op",
      description: "x",
      input: { type: "record", fields: {} },
      output: { kind: "void" },
      affects: { mutations: [], adapter_writes: [], reads_only: false, destructive: false },
      handler: { kind: "code", ref: "./ops/x.ts" },
    });
    const handlers = new HandlerRegistry();
    handlers.registerHandler("./ops/x.ts", (async () => ({ ok: true })) as HandlerFn);

    const executor = new OperationExecutor(
      new PolicyEvaluator(policy.compile()),
      events,
      storage,
      handlers
    );
    const anonCtx = buildRootContext({ app_id: APP, invoked_via: "ui" });
    await expect(executor.invoke(op, {}, anonCtx)).rejects.toBeInstanceOf(
      PolicyDeniedError
    );
  });

  test("anonymous explicitly allowed via anonymous subject works", async () => {
    const policy = new PolicySet({ app_id: APP });
    policy.addRule({
      id: "public-read",
      allow: [Subjects.anonymous()],
      do: ["read"],
      on: Resources.tableRow("public_pages"),
    });

    const evaluator = new PolicyEvaluator(policy.compile());
    const anonCtx = buildRootContext({ app_id: APP, invoked_via: "ui" });
    const d = evaluator.check(
      "read",
      Resources.tableRow("public_pages"),
      anonCtx,
      { rowView: {}, resourceDefaultAccess: "restricted" }
    );
    expect(d.decision).toBe("allow");
    expect(d.matched_rule_ids).toContain("public-read");
  });
});

describe("Policy · default posture interaction", () => {
  test("default_posture=public on app-level still lets operations be restricted (operation default invariant)", async () => {
    // Operation default access is forced to 'restricted' in OperationExecutor regardless
    // of app-level default_posture (ADR-0018 security premise).
    const { storage, events } = await baseHarness();

    const policy = new PolicySet({
      app_id: APP,
      default_posture: { app: "public" }, // even with public default
    });
    // no explicit allow rule for invoke operation

    const op = new Operation({
      id: "sensitive",
      app_id: APP,
      name: "s",
      description: "s",
      input: { type: "record", fields: {} },
      output: { kind: "void" },
      affects: { mutations: [], adapter_writes: [], reads_only: false, destructive: false },
      handler: { kind: "code", ref: "./ops/s.ts" },
    });
    const handlers = new HandlerRegistry();
    handlers.registerHandler("./ops/s.ts", (async () => ({ ok: true })) as HandlerFn);
    const executor = new OperationExecutor(
      new PolicyEvaluator(policy.compile()),
      events,
      storage,
      handlers
    );

    const ctx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "anyone", attrs: {}, roles: [] },
    });
    await expect(executor.invoke(op, {}, ctx)).rejects.toBeInstanceOf(
      PolicyDeniedError
    );
    // deny reason: resourceDefaultAccess forced to restricted → default-restricted-no-match
  });

  test("self subject requires matching rowView.owner_id (MVP semantics)", async () => {
    const policy = new PolicySet({ app_id: APP });
    policy.addRule({
      id: "self-edit",
      allow: [Subjects.self()],
      do: ["write"],
      on: Resources.tableRow("bookmarks"),
    });
    const evaluator = new PolicyEvaluator(policy.compile());
    const aliceCtx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: [] },
    });

    // alice editing her own row → allow
    const d1 = evaluator.check(
      "write",
      Resources.tableRow("bookmarks"),
      aliceCtx,
      { rowView: { owner_id: "alice" }, resourceDefaultAccess: "restricted" }
    );
    expect(d1.decision).toBe("allow");

    // alice editing bob's row → deny (self rule doesn't match; no other rule)
    const d2 = evaluator.check(
      "write",
      Resources.tableRow("bookmarks"),
      aliceCtx,
      { rowView: { owner_id: "bob" }, resourceDefaultAccess: "restricted" }
    );
    expect(d2.decision).toBe("deny");
  });
});

describe("Policy · when-clause with input namespace", () => {
  test("when references input.* — evaluator resolves input", async () => {
    const policy = new PolicySet({ app_id: APP });
    const whenClause: WhereClause = {
      kind: "leaf",
      subject: { ns: "input", path: ["priority"] },
      op: "eq",
      value: "high",
    };
    policy.addRule({
      id: "priority-gated",
      allow: [Subjects.anyone()],
      do: ["invoke"],
      on: Resources.operation("priority_op"),
      when: whenClause,
    });

    const evaluator = new PolicyEvaluator(policy.compile());
    const ctx = buildRootContext({
      app_id: APP,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: [] },
    });

    // high priority → allow
    const d1 = evaluator.check("invoke", Resources.operation("priority_op"), ctx, {
      input: { priority: "high" },
      resourceDefaultAccess: "restricted",
    });
    expect(d1.decision).toBe("allow");

    // low priority → deny (rule's when fails)
    const d2 = evaluator.check("invoke", Resources.operation("priority_op"), ctx, {
      input: { priority: "low" },
      resourceDefaultAccess: "restricted",
    });
    expect(d2.decision).toBe("deny");
  });
});
