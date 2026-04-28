// weekly-linear-digest / config.ts
//
// 一个 pneuma-app 的声明形态. 构造 AppConfig 的时候需要注入:
//   - LinearClient (带 admin API key) — 用于 adapter IO + bind handler 里 findUserByEmail
//   - LLMProvider (带 OpenRouter key) — transform prompt impl
//
// app.ts 在 boot 时从 env 读 key, 构造这两个实例, 调 `buildConfig(...)`.

import { join } from "node:path";
import {
  Operation,
  PolicySet,
  Resources,
  Row,
  Subjects,
  Table,
  Transform,
  createIdentitySystemTables,
  type AdapterImpl,
  type CellType,
  type HandlerFn,
  type ImpactComputeFn,
  type LLMProvider,
  type PermissionContext,
  type QueryBody,
  type Ref,
  type WhereClause,
} from "@pneuma-framework/core-domain";
import { createLinearAdapter, type LinearClient } from "@pneuma-framework/adapter-linear";
import type { AppConfig } from "@pneuma-framework/runtime";

export const APP_ID = "weekly-linear-digest";

// ---------- storage paths ----------

const workspaceRoot =
  process.env.PNEUMA_WORKSPACE ?? join(process.cwd(), ".pneuma-workspace");
const dataDir = join(workspaceRoot, "data");

// ---------- CellTypes ----------

const TEXT: CellType = { kind: "primitive", of: "Text" };
const RICH: CellType = { kind: "primitive", of: "RichText" };
const NUM: CellType = { kind: "primitive", of: "Number" };
const DATE_T: CellType = { kind: "primitive", of: "Date" };

// ---------- Tables ----------

function buildTables(): { users: Table; roles: Table; memberships: Table; linearIssues: Table; digests: Table } {
  const { users, roles, memberships } = createIdentitySystemTables(APP_ID);

  // linear_issues — adapter-backed, schema must match adapter externalTypes.Issue
  const linearIssues = new Table({
    id: "linear_issues",
    app_id: APP_ID,
    columns: [
      { name: "id", type: TEXT },
      { name: "identifier", type: TEXT },
      { name: "title", type: TEXT },
      { name: "description", type: TEXT, nullable: true },
      { name: "priority", type: NUM },
      { name: "state_name", type: TEXT },
      { name: "state_type", type: TEXT },
      { name: "assignee_id", type: TEXT, nullable: true },
      { name: "assignee_email", type: TEXT, nullable: true },
      { name: "creator_id", type: TEXT },
      { name: "creator_email", type: TEXT, nullable: true },
      { name: "team_id", type: TEXT },
      { name: "team_key", type: TEXT },
      { name: "created_at", type: DATE_T },
      { name: "updated_at", type: DATE_T },
      { name: "completed_at", type: DATE_T, nullable: true },
    ],
    source: {
      kind: "adapter-backed",
      adapter: "linear",
      config: {},
      externalType: "Issue",
    },
  });

  // digests — stored
  const digests = new Table({
    id: "digests",
    app_id: APP_ID,
    columns: [
      {
        name: "user_id",
        type: { kind: "ref-row", table: "users" },
        cascade_on_target_delete: true,
      },
      { name: "body", type: RICH },
      { name: "generated_at", type: DATE_T },
      { name: "source_count", type: NUM },
      { name: "window_days", type: NUM },
    ],
    source: { kind: "stored" },
  });

  return { users, roles, memberships, linearIssues, digests };
}

// ---------- Transform: linear_issues → markdown digest ----------

export const linearIssuesToDigest = new Transform({
  id: "linear_issues_to_digest",
  app_id: APP_ID,
  in: { kind: "row-list", table: "linear_issues" },
  out: RICH,
  impl: {
    kind: "prompt",
    model: "anthropic/claude-sonnet-4.6",
    system: [
      "You are generating a concise weekly digest from a developer's Linear activity.",
      "Input: a JSON array of Linear issues they created or touched in the last week.",
      "Output: ONLY the markdown digest — no preamble, no wrapping fences.",
      "",
      "Structure:",
      "1. A 1-2 sentence opening about the week's focus (inferred from titles).",
      "2. A `## Issues` section: each bullet is `- **IDENT** *(state)* title`. Use the `identifier` field for IDENT. Group by state_type when there are > 5 issues.",
      "3. A `## Themes` section with 2-4 short bullet points summarizing themes you detected from titles + descriptions. Be specific; avoid generic platitudes like \"user made progress\".",
      "4. A `## Next` section with 1-2 concrete-looking suggestions if the input hints at obvious gaps (e.g. lots of backlog + no in-progress → \"start prioritising what to pick up next\").",
      "",
      "Tone: lucid, brief, factual. No filler. Use the user's language (Chinese / English / mixed — follow the issue titles).",
    ].join("\n"),
  },
  purity: "pure",
});

// ---------- Operations ----------

const bindLinearIdentityOp = new Operation({
  id: "bind_linear_identity",
  app_id: APP_ID,
  name: "Bind Linear Identity",
  description: "输入自己的 email, 查 Linear 找到你的 user, 保存 linear_user_id 进 pneuma 的 users.attrs. 第一次使用必须走这一步.",
  input: {
    type: "record",
    fields: {
      email: { type: TEXT, required: true },
    },
  },
  output: {
    kind: "object",
    schema: {
      type: "object",
      properties: {
        pneuma_user_id: { type: "string" },
        linear_user_id: { type: "string" },
        linear_name: { type: "string" },
        note: { type: "string" },
      },
      required: ["pneuma_user_id", "linear_user_id", "linear_name", "note"],
      additionalProperties: false,
    },
  },
  affects: {
    mutations: ["users"],
    adapter_writes: [],
    reads_only: false,
    destructive: false,
  },
  handler: { kind: "code", ref: "./ops/bind_linear_identity.ts" },
});

const listMyRecentIssuesQuery: QueryBody = {
  kind: "query",
  on: "linear_issues",
  filter: {
    kind: "branch",
    logical_op: "and",
    children: [
      {
        kind: "leaf",
        subject: { ns: "row", path: ["creator_id"] },
        op: "eq",
        value: { ref: "user", path: ["attrs", "linear_user_id"] },
      },
      {
        kind: "leaf",
        subject: { ns: "row", path: ["updated_at"] },
        op: "date",
        sub_op: "last_n_days",
        value: 7,
      },
    ],
  },
  sort: [{ column: "updated_at", dir: "desc" }],
  pagination: { kind: "cursor", size: 50 },
};

const listMyRecentIssuesOp = new Operation({
  id: "list_my_recent_issues",
  app_id: APP_ID,
  name: "My recent Linear issues",
  description: "过去 7 天内我创建/更新的 Linear issue. admin_delegated adapter 强制要求 filter 里 creator_id 绑定到当前 user, 否则 fail-closed.",
  input: { type: "record", fields: {} },
  output: { kind: "row-list", row_type: "linear_issues" },
  affects: {
    mutations: [],
    adapter_writes: [],
    reads_only: true,
    destructive: false,
  },
  handler: listMyRecentIssuesQuery,
});

const generateDigestOp = new Operation({
  id: "generate_weekly_digest",
  app_id: APP_ID,
  name: "Generate weekly digest",
  description: "跑 list_my_recent_issues → Sonnet 4.6 总结 → 存入 digests 表. 单 Operation 串 Query + Transform + Storage.",
  input: { type: "record", fields: {} },
  output: {
    kind: "object",
    schema: {
      type: "object",
      properties: {
        digest_id: { type: "string" },
        source_count: { type: "number" },
        body: { type: "string" },
      },
      required: ["digest_id", "source_count", "body"],
      additionalProperties: false,
    },
  },
  affects: {
    mutations: ["digests"],
    adapter_writes: [],
    reads_only: false,
    destructive: false,
  },
  handler: { kind: "code", ref: "./ops/generate_weekly_digest.ts" },
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
  pagination: { kind: "cursor", size: 50 },
};

const myDigestsOp = new Operation({
  id: "my_digests",
  app_id: APP_ID,
  name: "My digests",
  description: "列出历史周报 (row-level filter: 只自己的).",
  input: { type: "record", fields: {} },
  output: { kind: "row-list", row_type: "digests" },
  affects: {
    mutations: [],
    adapter_writes: [],
    reads_only: true,
    destructive: false,
  },
  handler: myDigestsQuery,
});

const deleteDigestOp = new Operation({
  id: "delete_digest",
  app_id: APP_ID,
  name: "Delete digest",
  description: "删除一条历史周报. destructive — 需要 confirmed=true.",
  input: {
    type: "record",
    fields: {
      digest_id: { type: { kind: "ref-row", table: "digests" }, required: true },
    },
  },
  output: {
    kind: "object",
    schema: {
      type: "object",
      properties: {
        deleted: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["deleted"],
      additionalProperties: false,
    },
  },
  affects: {
    mutations: ["digests"],
    adapter_writes: [],
    reads_only: false,
    destructive: true,
  },
  handler: { kind: "code", ref: "./ops/delete_digest.ts" },
  impact: {
    compute: { kind: "code", ref: "./ops/delete_digest.impact.ts" },
    disclosure_template: "Will permanently delete digest generated {{generated_at}}",
  },
});

export const operations = [
  bindLinearIdentityOp,
  listMyRecentIssuesOp,
  generateDigestOp,
  myDigestsOp,
  deleteDigestOp,
];

// ---------- Policy ----------

function buildPolicy(): PolicySet {
  const p = new PolicySet({ app_id: APP_ID });
  // All invokes open (MVP; real auth = 阶段 C)
  for (const op of operations) {
    p.addRule({
      id: `any-${op.id}`,
      allow: [Subjects.anyone(), Subjects.anonymous()],
      do: ["invoke"],
      on: Resources.operation(op.id),
    });
  }
  // digests row-level self read
  const selfRead: WhereClause = {
    kind: "leaf",
    subject: { ns: "row", path: ["user_id", "id"] },
    op: "eq",
    value: { ref: "user", path: ["id"] },
  };
  p.addRule({
    id: "digests-self-read",
    allow: [Subjects.self()],
    do: ["read"],
    on: Resources.tableRow("digests"),
    when: selfRead,
  });
  return p;
}

// ---------- Handlers (closure-DI with LinearClient + TransformRunner access) ----------

interface HandlerDeps {
  readonly linearClient: LinearClient;
}

function buildHandlers(deps: HandlerDeps): {
  handlers: Record<string, HandlerFn>;
  impacts: Record<string, ImpactComputeFn>;
} {
  const { linearClient } = deps;

  const bindLinearIdentity: HandlerFn = async (args) => {
    const { input, storage, ctx } = args;
    const email = (input as { email: string }).email;
    if (!email) throw new Error("email required");

    // 1. Query Linear for the user with that email (admin API key, we have read:users scope)
    const linearUser = await linearClient.findUserByEmail(email);
    if (!linearUser) {
      throw new Error(`No Linear user with email "${email}". Are you in the right workspace?`);
    }

    // 2. pneuma user id: use email as the canonical id (simple, stable)
    const pneumaUserId = email;

    // 3. create / update users row
    let userRow = await storage.getRow(pneumaUserId);
    const now = Date.now();
    if (!userRow) {
      userRow = new Row({
        id: pneumaUserId,
        table_id: "users",
        app_id: APP_ID,
        cells: { email, attrs: "" },
        created_at: now,
        updated_at: now,
      });
    }
    // set attrs = { linear_user_id, linear_name }
    const attrs = { linear_user_id: linearUser.id, linear_name: linearUser.name };
    userRow.setCell("attrs", JSON.stringify(attrs), now);
    userRow.setCell("email", email, now);
    await storage.saveRow(userRow, { checkRefIntegrity: false });

    // Note: handler returns plain object — surfaced as HTTP response.output
    return {
      pneuma_user_id: pneumaUserId,
      linear_user_id: linearUser.id,
      linear_name: linearUser.name,
      note: "Save pneuma_user_id in your session; send as X-Pneuma-User-Id header on subsequent requests.",
    };
  };

  const generateWeeklyDigest: HandlerFn = async (args) => {
    const { ctx, storage, services } = args;
    if (!ctx.user) throw new Error("user required (bind first)");
    if (!services?.queryExec) throw new Error("QueryExecutor not injected into runtime");
    if (!services.transformRunner) throw new Error("TransformRunner not injected");

    const queryExec = services.queryExec as {
      run(op: Operation, input: unknown, c: PermissionContext): Promise<{ rows: Array<Record<string, unknown>> }>;
    };
    const transformRunner = services.transformRunner as {
      apply(tx: Transform, input: unknown, c: PermissionContext): Promise<unknown>;
    };

    // 1. Query my recent issues
    const qResult = await queryExec.run(listMyRecentIssuesOp, {}, ctx);
    const issues = qResult.rows;
    if (issues.length === 0) {
      // Return a "no activity" digest without calling LLM
      const body = "# This week\n\nNo Linear activity in the last 7 days — maybe a quiet week!";
      const id = `digest-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
      await storage.saveRow(
        new Row({
          id,
          table_id: "digests",
          app_id: APP_ID,
          owner_id: ctx.user.id,
          cells: {
            user_id: { kind: "row", table: "users", id: ctx.user.id } satisfies Ref,
            body,
            generated_at: Date.now(),
            source_count: 0,
            window_days: 7,
          },
        })
      );
      return { digest_id: id, source_count: 0, body };
    }

    // 2. Transform via prompt (Sonnet 4.6)
    // Pass a lean, readable payload — don't overwhelm LLM with full raw rows
    const leanIssues = issues.map((r) => ({
      identifier: r.identifier,
      title: r.title,
      description: r.description,
      priority: r.priority,
      state: r.state_name,
      state_type: r.state_type,
      created_at: r.created_at ? new Date(r.created_at as number).toISOString() : null,
      updated_at: r.updated_at ? new Date(r.updated_at as number).toISOString() : null,
      completed_at: r.completed_at ? new Date(r.completed_at as number).toISOString() : null,
    }));
    const body = (await transformRunner.apply(linearIssuesToDigest, leanIssues, ctx)) as string;

    // 3. Save digest row
    const id = `digest-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    await storage.saveRow(
      new Row({
        id,
        table_id: "digests",
        app_id: APP_ID,
        owner_id: ctx.user.id,
        cells: {
          user_id: { kind: "row", table: "users", id: ctx.user.id } satisfies Ref,
          body,
          generated_at: Date.now(),
          source_count: issues.length,
          window_days: 7,
        },
      })
    );
    return { digest_id: id, source_count: issues.length, body };
  };

  const deleteDigest: HandlerFn = async (args) => {
    const { input, storage } = args;
    const i = input as { digest_id: Ref | string };
    const id =
      typeof i.digest_id === "object" && i.digest_id !== null && "id" in i.digest_id
        ? (i.digest_id as Extract<Ref, { kind: "row" }>).id
        : String(i.digest_id);
    const result = await storage.deleteRow(id);
    return { deleted: result.deleted };
  };

  const deleteDigestImpact: ImpactComputeFn = async (args) => {
    const i = args.input as { digest_id: Ref | string };
    const id =
      typeof i.digest_id === "object" && i.digest_id !== null && "id" in i.digest_id
        ? (i.digest_id as Extract<Ref, { kind: "row" }>).id
        : String(i.digest_id);
    const row = await args.storage.getRow(id);
    const genAt = row?.getCell("generated_at");
    const when = typeof genAt === "number" ? new Date(genAt).toISOString() : "(unknown)";
    return {
      disclosure: `Will permanently delete digest generated at ${when}.`,
      details: { digest_id: id, generated_at: genAt },
    };
  };

  return {
    handlers: {
      "./ops/bind_linear_identity.ts": bindLinearIdentity,
      "./ops/generate_weekly_digest.ts": generateWeeklyDigest,
      "./ops/delete_digest.ts": deleteDigest,
    },
    impacts: {
      "./ops/delete_digest.impact.ts": deleteDigestImpact,
    },
  };
}

// ---------- Top-level builder ----------

export interface BuildConfigDeps {
  readonly linearClient: LinearClient;
  readonly linearAdapterImpl: AdapterImpl;
  readonly llmProvider: LLMProvider;
  /**
   * Linear 的 admin API key — 被注册到 framework 的 CredentialStore 作为
   * admin_delegated 模式的前置. 必须跟 linearClient 内部携带的 key 一致.
   * (架构上 framework 要知道凭证存在; 实际调用 HTTP 时 LinearAdapterImpl
   *  用它内部的 client, 所以这份 key 对 framework 只是 "是否配置" 的标记.)
   */
  readonly linearApiKey: string;
}

export function buildConfig(deps: BuildConfigDeps): AppConfig {
  const { users, roles, memberships, linearIssues, digests } = buildTables();
  const policy = buildPolicy();
  const { handlers, impacts } = buildHandlers({ linearClient: deps.linearClient });
  const adapter = createLinearAdapter({ app_id: APP_ID });

  return {
    app_id: APP_ID,
    storage: { sqlite_path: join(dataDir, "rows.db") },
    audit: { ndjson_path: join(dataDir, "audit.ndjson") },
    history: { sqlite_path: join(dataDir, "app-history.db") },
    tables: [users, roles, memberships, linearIssues, digests],
    operations,
    adapters: [adapter],
    transforms: [linearIssuesToDigest],
    policy,
    handlers,
    impacts,
    adapterImpls: { linear: deps.linearAdapterImpl },
    credentials: {
      admin: { linear: deps.linearApiKey },
    },
    llmProvider: deps.llmProvider,
  };
}
