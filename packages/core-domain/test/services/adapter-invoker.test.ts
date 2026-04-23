import { describe, test, expect } from "bun:test";
import {
  Adapter,
  type AdapterInit,
  type Capabilities,
  type ExternalTypeDef,
  type IdentityBinding,
} from "../../src/aggregates/adapter.js";
import {
  AdapterInvoker,
  AdapterInvocationError,
  InMemoryCredentialStore,
  applyLocalFilter,
  type AdapterImpl,
  type ExternalRow,
  type PushableLeaf,
} from "../../src/services/adapter-invoker.js";
import type { CellType } from "../../src/value-objects/cell-type.js";
import type { WhereClause } from "../../src/value-objects/where-clause.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";

const TEXT: CellType = { kind: "primitive", of: "Text" };
const DATE_T: CellType = { kind: "primitive", of: "Date" };

const ISSUE: ExternalTypeDef = {
  name: "Issue",
  columns: [
    { name: "id", type: TEXT },
    { name: "title", type: TEXT },
    { name: "state", type: TEXT },
    { name: "assignee_id", type: TEXT },
    { name: "completed_at", type: DATE_T },
  ],
};

const binding: IdentityBinding = {
  strategy: "email_match",
  store_at: "user.attrs.linear_user_id",
};

function mkLinearAdapter(mode: "shared" | "admin_delegated" | "per-user" = "shared"): Adapter {
  const caps: Capabilities =
    mode === "admin_delegated"
      ? {
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
        }
      : {
          list: true,
          read: true,
          insert: false,
          update: false,
          delete: false,
          filter_pushdown: {
            supported_ops: {
              assignee_id: ["eq", "in"],
              state: ["eq"],
            },
          },
        };

  const init: AdapterInit = {
    id: "linear",
    app_id: "app",
    externalTypes: [ISSUE],
    auth: { kind: "oauth2" },
    capabilities: caps,
    credential_mode: mode,
    supported_credential_modes: ["shared", "per-user", "admin_delegated"],
    identity_binding: mode === "admin_delegated" ? binding : undefined,
  };
  return new Adapter(init);
}

function fakeLinearImpl(storage: ExternalRow[]): AdapterImpl {
  return {
    async list(query) {
      // naive: apply pushable filters in order
      return storage.filter((row) => {
        for (const leaf of query.where) {
          const rv = row[leaf.column];
          if (leaf.op === "eq" && rv !== leaf.value) return false;
          if (leaf.op === "in" && Array.isArray(leaf.value) && !leaf.value.includes(rv as never)) return false;
          if (leaf.op === "gte" && typeof rv === "number" && typeof leaf.value === "number" && rv < leaf.value) return false;
          if (leaf.op === "lte" && typeof rv === "number" && typeof leaf.value === "number" && rv > leaf.value) return false;
        }
        return true;
      });
    },
  };
}

const FIXTURE_ISSUES: ExternalRow[] = [
  { id: "LIN-1", title: "Refactor storage", state: "closed", assignee_id: "LIN-alice", completed_at: 1700000000000 },
  { id: "LIN-2", title: "Add query DSL", state: "closed", assignee_id: "LIN-alice", completed_at: 1700086400000 },
  { id: "LIN-3", title: "Fix cache bug", state: "closed", assignee_id: "LIN-bob", completed_at: 1700172800000 },
  { id: "LIN-4", title: "Design review", state: "open", assignee_id: "LIN-alice", completed_at: 1700259200000 },
];

// ---------- tests ----------

describe("AdapterInvoker · list dispatch", () => {
  test("shared mode: uses shared credential and returns rows", async () => {
    const adapter = mkLinearAdapter("shared");
    const store = new InMemoryCredentialStore();
    store.setShared("linear", "APP-TOKEN");
    const invoker = new AdapterInvoker(
      store,
      new Map([["linear", fakeLinearImpl([...FIXTURE_ISSUES])]])
    );

    const ctx = buildRootContext({ app_id: "app", invoked_via: "ui" });
    const result = await invoker.list(adapter, ctx);
    expect(result.rows).toHaveLength(4);
  });

  test("shared mode without credential configured → throws", async () => {
    const adapter = mkLinearAdapter("shared");
    const store = new InMemoryCredentialStore();
    const invoker = new AdapterInvoker(
      store,
      new Map([["linear", fakeLinearImpl([])]])
    );
    const ctx = buildRootContext({ app_id: "app", invoked_via: "ui" });
    await expect(invoker.list(adapter, ctx)).rejects.toBeInstanceOf(AdapterInvocationError);
  });

  test("adapter without registered impl → throws", async () => {
    const adapter = mkLinearAdapter("shared");
    const store = new InMemoryCredentialStore();
    store.setShared("linear", "x");
    const invoker = new AdapterInvoker(store, new Map());
    const ctx = buildRootContext({ app_id: "app", invoked_via: "ui" });
    await expect(invoker.list(adapter, ctx)).rejects.toBeInstanceOf(AdapterInvocationError);
  });

  test("per-user mode missing ctx.user → throws", async () => {
    const adapter = mkLinearAdapter("per-user");
    const store = new InMemoryCredentialStore();
    const invoker = new AdapterInvoker(
      store,
      new Map([["linear", fakeLinearImpl([])]])
    );
    const ctx = buildRootContext({ app_id: "app", invoked_via: "ui" }); // anonymous
    await expect(invoker.list(adapter, ctx)).rejects.toBeInstanceOf(AdapterInvocationError);
  });

  test("per-user mode missing credential for user → throws", async () => {
    const adapter = mkLinearAdapter("per-user");
    const store = new InMemoryCredentialStore();
    // store.setPerUser NOT called for alice
    const invoker = new AdapterInvoker(
      store,
      new Map([["linear", fakeLinearImpl([])]])
    );
    const ctx = buildRootContext({
      app_id: "app",
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: [] },
    });
    await expect(invoker.list(adapter, ctx)).rejects.toBeInstanceOf(AdapterInvocationError);
  });
});

describe("AdapterInvoker · filter pushdown splitting", () => {
  test("AND of pushable leaves: all push down, no local filter", async () => {
    const adapter = mkLinearAdapter("shared");
    const store = new InMemoryCredentialStore();
    store.setShared("linear", "t");

    // impl: just echoes back what it was asked — we inspect the query it received
    let received: readonly PushableLeaf[] = [];
    const impl: AdapterImpl = {
      async list(q) {
        received = q.where;
        return FIXTURE_ISSUES;
      },
    };
    const invoker = new AdapterInvoker(store, new Map([["linear", impl]]));

    const ctx = buildRootContext({
      app_id: "app",
      invoked_via: "ui",
      user: { id: "alice", attrs: { linear_user_id: "LIN-alice" }, roles: [] },
    });

    const filter: WhereClause = {
      kind: "branch",
      logical_op: "and",
      children: [
        {
          kind: "leaf",
          subject: { ns: "row", path: ["assignee_id"] },
          op: "eq",
          value: "LIN-alice",
        },
        {
          kind: "leaf",
          subject: { ns: "row", path: ["state"] },
          op: "eq",
          value: "closed",
        },
      ],
    };
    const result = await invoker.list(adapter, ctx, { filter });
    expect(received).toHaveLength(2);
    expect(received.map((l) => l.column).sort()).toEqual(["assignee_id", "state"]);
    expect(result.local_filter).toBeUndefined();
  });

  test("Leaf with unsupported op → goes to local filter", async () => {
    const adapter = mkLinearAdapter("shared");
    const store = new InMemoryCredentialStore();
    store.setShared("linear", "t");
    const impl: AdapterImpl = { async list() { return FIXTURE_ISSUES; } };
    const invoker = new AdapterInvoker(store, new Map([["linear", impl]]));
    const ctx = buildRootContext({ app_id: "app", invoked_via: "ui" });

    const filter: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["title"] },
      op: "like",
      value: "Refactor",
    };
    const result = await invoker.list(adapter, ctx, { filter });
    // title doesn't have pushdown → entire leaf is local
    expect(result.local_filter).toEqual(filter);

    const filtered = applyLocalFilter(result.rows, result.local_filter, ctx);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe("LIN-1");
  });

  test("user value ref resolved before push: LIN-alice injected into query", async () => {
    const adapter = mkLinearAdapter("shared");
    const store = new InMemoryCredentialStore();
    store.setShared("linear", "t");

    let received: readonly PushableLeaf[] = [];
    const impl: AdapterImpl = {
      async list(q) {
        received = q.where;
        return FIXTURE_ISSUES.filter((r) => {
          for (const l of q.where) {
            if (l.op === "eq" && r[l.column] !== l.value) return false;
          }
          return true;
        });
      },
    };
    const invoker = new AdapterInvoker(store, new Map([["linear", impl]]));

    const ctx = buildRootContext({
      app_id: "app",
      invoked_via: "agent",
      user: { id: "alice", attrs: { linear_user_id: "LIN-alice" }, roles: [] },
    });

    const filter: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["assignee_id"] },
      op: "eq",
      value: { ref: "user", path: ["attrs", "linear_user_id"] },
    };
    const result = await invoker.list(adapter, ctx, { filter });
    expect(received).toHaveLength(1);
    expect(received[0]!.value).toBe("LIN-alice");
    // every returned row should be alice's
    for (const r of result.rows) expect(r.assignee_id).toBe("LIN-alice");
  });
});

describe("AdapterInvoker · admin_delegated safety contract (ADR-0021)", () => {
  test("missing required user binding filter → fail-closed (AdapterInvocationError)", async () => {
    const adapter = mkLinearAdapter("admin_delegated");
    const store = new InMemoryCredentialStore();
    store.setAdmin("linear", "ADMIN-TOKEN");

    const impl: AdapterImpl = { async list() { return FIXTURE_ISSUES; } };
    const invoker = new AdapterInvoker(store, new Map([["linear", impl]]));

    const ctx = buildRootContext({
      app_id: "app",
      invoked_via: "agent",
      user: { id: "alice", attrs: { linear_user_id: "LIN-alice" }, roles: [] },
    });

    // filter does NOT include assignee_id binding
    const filter: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["state"] },
      op: "eq",
      value: "closed",
    };
    await expect(
      invoker.list(adapter, ctx, { filter })
    ).rejects.toThrow(/admin_delegated safety contract violated/);
  });

  test("user binding filter present → runs normally, admin token used", async () => {
    const adapter = mkLinearAdapter("admin_delegated");
    const store = new InMemoryCredentialStore();
    store.setAdmin("linear", "ADMIN-TOKEN");

    let capturedInvCtx: unknown;
    const impl: AdapterImpl = {
      async list(q, invCtx) {
        capturedInvCtx = invCtx;
        return FIXTURE_ISSUES.filter((r) => {
          for (const l of q.where) {
            if (l.op === "eq" && r[l.column] !== l.value) return false;
          }
          return true;
        });
      },
    };
    const invoker = new AdapterInvoker(store, new Map([["linear", impl]]));

    const ctx = buildRootContext({
      app_id: "app",
      invoked_via: "agent",
      user: { id: "alice", attrs: { linear_user_id: "LIN-alice" }, roles: [] },
    });

    const filter: WhereClause = {
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
      ],
    };
    const result = await invoker.list(adapter, ctx, { filter });

    // Everyone returned is alice's + closed
    for (const r of result.rows) {
      expect(r.assignee_id).toBe("LIN-alice");
      expect(r.state).toBe("closed");
    }
    const captured = capturedInvCtx as {
      credential: unknown;
      credential_mode: string;
      user_binding_value: unknown;
    };
    expect(captured.credential).toBe("ADMIN-TOKEN");
    expect(captured.credential_mode).toBe("admin_delegated");
    expect(captured.user_binding_value).toBe("LIN-alice");
  });

  test("admin_delegated without admin credential → throws", async () => {
    const adapter = mkLinearAdapter("admin_delegated");
    const store = new InMemoryCredentialStore();
    // NOT setAdmin
    const invoker = new AdapterInvoker(
      store,
      new Map([["linear", fakeLinearImpl([])]])
    );
    const ctx = buildRootContext({
      app_id: "app",
      invoked_via: "agent",
      user: { id: "alice", attrs: { linear_user_id: "LIN-alice" }, roles: [] },
    });
    const filter: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["assignee_id"] },
      op: "eq",
      value: "LIN-alice",
    };
    await expect(
      invoker.list(adapter, ctx, { filter })
    ).rejects.toBeInstanceOf(AdapterInvocationError);
  });
});
