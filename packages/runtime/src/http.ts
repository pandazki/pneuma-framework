// HTTP 层 — 把 AppRuntime 的 Operations 暴露成 REST 风格端点.
//
// 端点:
//   GET  /api/health                  — readiness + app metadata
//   GET  /api/operations              — 列所有 operation (id, name, reads_only, destructive)
//   GET  /api/operations/:id          — 执行 query-backed Operation (query string = input)
//   POST /api/operations/:id          — 执行 code handler Operation (body = { input, confirmed? })
//   GET  /api/events?...              — audit 查询 (仅 ndjson sink)
//
// 身份: HTTP header `X-Pneuma-User-Id` 决定 ctx.user.id
//       (MVP; 真 auth = 阶段 B3 再加). 无 header = 匿名.
//
// 错误映射:
//   PolicyDeniedError          → 403 + JSON
//   ConfirmationRequiredError  → 428 + JSON (impact disclosure)
//   OperationExecutionError    → 400/500 按 kind
//   QueryExecutionError        → 400
//   AdapterInvocationError     → 502
//   其它                         → 500

import {
  ConfirmationRequiredError,
  PolicyDeniedError,
  OperationExecutionError,
  QueryExecutionError,
  AdapterInvocationError,
  NdjsonAuditReader,
  Resources,
  deriveSpan,
  buildRootContext,
  hydrateUserContext,
  IdentityRegistry,
  type PermissionContext,
  type PolicyDecision,
  type View,
} from "@pneuma-framework/core-domain";
import type { AppRuntime } from "./runtime.js";
import { cellTypeToJsonSchema, inputSchemaToJsonSchema } from "./operation-to-jsonschema.js";
import { outputSchemaToJsonSchema } from "./output-schema-to-jsonschema.js";

export interface HttpRequestContext {
  readonly method: string;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
  readonly headers: Headers;
  readonly readBody: () => Promise<unknown>;
}

export interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}


export async function handleHttp(
  runtime: AppRuntime,
  req: HttpRequestContext
): Promise<HttpResponse> {
  try {
    return await route(runtime, req);
  } catch (err) {
    return errorToResponse(err);
  }
}

async function route(
  runtime: AppRuntime,
  req: HttpRequestContext
): Promise<HttpResponse> {
  const { method, pathname } = req;

  if (pathname === "/api/health" && method === "GET") {
    return healthResponse(runtime);
  }

  if (pathname === "/api/operations" && method === "GET") {
    return listOperationsResponse(runtime);
  }

  if (pathname === "/api/config") {
    if (method !== "GET") return { status: 405, body: { error: "method_not_allowed" } };
    return await configResponse(runtime, req);
  }

  if (pathname === "/api/events" && method === "GET") {
    return await auditQueryResponse(runtime, req);
  }

  const opMatch = /^\/api\/operations\/([^/]+)$/.exec(pathname);
  if (opMatch) {
    const opId = decodeURIComponent(opMatch[1]!);
    if (method === "GET") return await getOperation(runtime, opId, req);
    if (method === "POST") return await postOperation(runtime, opId, req);
    return { status: 405, body: { error: "method_not_allowed" } };
  }

  return { status: 404, body: { error: "not_found", pathname } };
}

// ---------- handlers ----------

function healthResponse(runtime: AppRuntime): HttpResponse {
  return {
    status: 200,
    body: {
      ok: true,
      app_id: runtime.app_id,
      operation_count: runtime.listOperations().length,
      overlay_warning_count: runtime.overlayWarnings.length,
      overlay_warnings: runtime.overlayWarnings,
    },
  };
}

function listOperationsResponse(runtime: AppRuntime): HttpResponse {
  return {
    status: 200,
    body: {
      operations: runtime.listOperations().map((op) => ({
        id: op.id,
        name: op.name,
        description: op.description,
        reads_only: op.affects.reads_only,
        destructive: op.affects.destructive,
        surface: op.surface,
      })),
    },
  };
}

async function configResponse(
  runtime: AppRuntime,
  req: HttpRequestContext
): Promise<HttpResponse> {
  const ctx = await buildCtx(runtime, req);
  const tables = (await runtime.tables.list()).map((table) => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    const columns = table.columns.map((column) => {
      properties[column.name] = cellTypeToJsonSchema(column.type);
      if (column.nullable !== true) required.push(column.name);
      return {
        name: column.name,
        type: column.type,
        nullable: column.nullable === true,
        default_access: column.default_access,
        cascade_on_target_delete: column.cascade_on_target_delete,
        schema: properties[column.name],
      };
    });
    return {
      id: table.id,
      source: table.source,
      system_owned: table.system_owned,
      columns,
      row_schema: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    };
  });

  const operations = runtime.listOperations().map((op) => {
    // Derive action from affects + handler shape
    let action: string;
    if (op.affects.reads_only) {
      action = "read";
    } else if (op.affects.destructive) {
      action = "delete";
    } else {
      action = "write";
    }

    // Derive resource from handler / affects
    let resource: unknown;
    if (op.handler.kind === "query") {
      resource = { kind: "table", table: op.handler.on };
    } else if (op.affects.mutations.length === 1) {
      resource = { kind: "table", table: op.affects.mutations[0] };
    } else if (op.affects.mutations.length > 1) {
      resource = { kind: "multi", tables: op.affects.mutations };
    } else {
      resource = { kind: "none" };
    }

    return {
      id: op.id,
      action,
      resource,
      input: op.input,
      input_schema: inputSchemaToJsonSchema(op.input),
      output: op.output,
      output_schema: outputSchemaToJsonSchema(op.output),
      affects: op.affects,
      handler_kind: op.handler.kind,
      invocation_method: operationInvocationMethod(op),
      surface: op.surface,
    };
  });

  const views = runtime
    .listViews()
    .map((view) => ({ view, visibility: viewVisibility(runtime, view, ctx) }))
    .filter((entry) => entry.visibility.visible)
    .map(({ view, visibility }) => ({
      id: view.id,
      name: view.name,
      description: view.description,
      kind: view.kind,
      source: view.source,
      presentation: view.presentation,
      visibility,
    }));

  const policy_rules = runtime.listPolicyRules().map((rule) => ({
    id: rule.id,
    allow: rule.allow,
    actions: rule.do,
    resource: rule.on,
    ...(rule.when !== undefined ? { when: rule.when } : {}),
  }));

  return {
    status: 200,
    body: {
      app_id: runtime.app_id,
      tables,
      operations,
      views,
      policy_rules,
    },
  };
}

async function auditQueryResponse(
  runtime: AppRuntime,
  req: HttpRequestContext
): Promise<HttpResponse> {
  const ndjsonPath = runtime.config.audit?.ndjson_path;
  if (!ndjsonPath) {
    return {
      status: 501,
      body: {
        error: "audit_sink_not_persistent",
        hint: "configure config.audit.ndjson_path to enable /api/events",
      },
    };
  }
  const reader = new NdjsonAuditReader(ndjsonPath);
  const filter: Parameters<typeof reader.queryEvents>[0] = {};
  const category = req.searchParams.get("category");
  if (category)
    filter.category = category as Parameters<typeof reader.queryEvents>[0] extends { category?: infer T } ? T : never;
  const user_id = req.searchParams.get("user_id");
  if (user_id) filter.user_id = user_id;
  const tag = req.searchParams.get("tag");
  if (tag) filter.tag = tag;
  const events = await reader.queryEvents(filter);
  const limit = Number(req.searchParams.get("limit") ?? "100");
  return {
    status: 200,
    body: { events: events.slice(-Math.max(1, Math.min(limit, 1000))) },
  };
}

function operationInvocationMethod(op: { isQuery(): boolean }): "GET" | "POST" {
  return op.isQuery() ? "GET" : "POST";
}

function sseStreamResponse(runtime: AppRuntime): { response: Response } {
  // Keepalive interval: 15 seconds. Avoids proxy-induced connection timeouts.
  const KEEPALIVE_MS = 15_000;

  let unsubscribe: (() => void) | undefined;
  let keepaliveTimer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();

      // Send initial keepalive comment so the client knows the connection is live.
      try {
        controller.enqueue(enc.encode(": keepalive\n\n"));
      } catch {
        return;
      }

      unsubscribe = runtime.broadcaster.subscribe((evt) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(evt)}\n\n`));
        } catch {
          // Stream already closed; unsubscribe will clean up.
        }
      });

      keepaliveTimer = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": keepalive\n\n"));
        } catch {
          cleanup();
        }
      }, KEEPALIVE_MS);
    },
    cancel() {
      cleanup();
    },
  });

  function cleanup() {
    if (keepaliveTimer !== undefined) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = undefined;
    }
    unsubscribe?.();
    unsubscribe = undefined;
  }

  return {
    response: new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-accel-buffering": "no", // nginx: disable proxy buffering
      },
    }),
  };
}

async function getOperation(
  runtime: AppRuntime,
  opId: string,
  req: HttpRequestContext
): Promise<HttpResponse> {
  const op = runtime.getOperation(opId);
  if (!op) return { status: 404, body: { error: "operation_not_found", id: opId } };
  if (!op.isQuery()) {
    return {
      status: 405,
      body: {
        error: "method_not_allowed",
        hint: `operation "${opId}" is not query-backed; use POST`,
      },
    };
  }
  const input = queryParamsToInput(req.searchParams);
  const ctx = await buildCtx(runtime, req);
  await assertOperationInvokable(runtime, op.id, input, ctx);
  const result = await runtime.queryExec.run(op, input, ctx);
  return { status: 200, body: { rows: result.rows } };
}

async function postOperation(
  runtime: AppRuntime,
  opId: string,
  req: HttpRequestContext
): Promise<HttpResponse> {
  const op = runtime.getOperation(opId);
  if (!op) return { status: 404, body: { error: "operation_not_found", id: opId } };
  if (op.isQuery()) {
    return {
      status: 405,
      body: {
        error: "method_not_allowed",
        hint: `operation "${opId}" is reads_only; use GET`,
      },
    };
  }
  const body = (await req.readBody()) as { input?: unknown; confirmed?: boolean } | undefined;
  const input = (body?.input as unknown) ?? {};
  const confirmed = body?.confirmed === true;
  const ctx = await buildCtx(runtime, req);
  const result = await runtime.executor.invoke(op, input, ctx, { confirmed });
  return {
    status: 200,
    body: {
      output: result.output,
      impact: result.impact,
      events: result.events,
    },
  };
}

// ---------- helpers ----------

async function buildCtx(
  runtime: AppRuntime,
  req: HttpRequestContext
): Promise<PermissionContext> {
  const userId = req.headers.get("x-pneuma-user-id");
  if (!userId) {
    return buildRootContext({
      app_id: runtime.app_id,
      invoked_via: "ui",
    });
  }
  // 若 users 表有这个 row, hydrate 它的 attrs / roles; 否则给个 minimal user
  const registry = new IdentityRegistry(runtime.storage);
  const hydrated = await hydrateUserContext(registry, userId);
  return buildRootContext({
    app_id: runtime.app_id,
    invoked_via: "ui",
    user: hydrated ?? { id: userId, attrs: {}, roles: [] },
  });
}

interface ViewVisibility {
  readonly visible: boolean;
  readonly view_read: PolicyDecision;
  readonly source_operation_invoke:
    | PolicyDecision
    | {
        readonly decision: "deny";
        readonly reason: "source_operation_not_found";
        readonly matched_rule_ids: readonly string[];
      };
}

function viewVisibility(
  runtime: AppRuntime,
  view: View,
  ctx: PermissionContext
): ViewVisibility {
  const viewRead = runtime.policyEvaluator.check(
    "read",
    Resources.view(view.id),
    ctx
  );
  const source = runtime.getOperation(view.source.operation_id);
  const sourceInvoke = source
    ? operationInvokeDecision(runtime, source.id, view.source.params ?? {}, ctx)
    : {
        decision: "deny" as const,
        reason: "source_operation_not_found" as const,
        matched_rule_ids: [],
      };

  return {
    visible:
      viewRead.decision === "allow" && sourceInvoke.decision === "allow",
    view_read: viewRead,
    source_operation_invoke: sourceInvoke,
  };
}

async function assertOperationInvokable(
  runtime: AppRuntime,
  opId: string,
  input: unknown,
  ctx: PermissionContext
): Promise<PolicyDecision> {
  const childCtx = deriveSpan(ctx);
  const decision = operationInvokeDecision(runtime, opId, input, childCtx);
  if (decision.decision === "deny") {
    await runtime.events.append({
      id: newEventId(),
      ts: Date.now(),
      category: "access",
      ctx: childCtx,
      trace_id: childCtx.trace_id,
      span_id: childCtx.span_id,
      parent_span_id: childCtx.parent_span_id,
      payload: {
        decision: "deny",
        reason: decision.reason,
        action: "invoke",
        resource: { kind: "operation", id: opId },
        matched_rule_ids: decision.matched_rule_ids,
      },
      audit: true,
    });
    throw new PolicyDeniedError(decision);
  }
  return decision;
}

function operationInvokeDecision(
  runtime: AppRuntime,
  opId: string,
  input: unknown,
  ctx: PermissionContext
): PolicyDecision {
  return runtime.policyEvaluator.check(
    "invoke",
    Resources.operation(opId),
    ctx,
    { input: (input as Record<string, unknown>) ?? undefined }
  );
}

function queryParamsToInput(params: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of params) {
    // 尝试 number / boolean 解析; 否则当字符串
    if (v === "true") out[k] = true;
    else if (v === "false") out[k] = false;
    else if (v !== "" && !isNaN(Number(v))) out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

function newEventId(): string {
  return `ev-${Math.random().toString(16).slice(2, 10)}-${Date.now()}`;
}

function errorToResponse(err: unknown): HttpResponse {
  if (err instanceof PolicyDeniedError) {
    return {
      status: 403,
      body: {
        error: "policy_denied",
        reason: err.decision.reason,
        matched_rule_ids: err.decision.matched_rule_ids,
      },
    };
  }
  if (err instanceof ConfirmationRequiredError) {
    return {
      status: 428,
      body: {
        error: "confirmation_required",
        impact: {
          disclosure: err.impact.disclosure,
          details: err.impact.details,
        },
        hint: "POST again with body { input, confirmed: true } to proceed",
      },
    };
  }
  if (err instanceof OperationExecutionError) {
    const status = err.kind === "handler_not_registered" ? 500 : 500;
    return {
      status,
      body: { error: "operation_execution_error", kind: err.kind, message: err.message },
    };
  }
  if (err instanceof QueryExecutionError) {
    return {
      status: 400,
      body: { error: "query_execution_error", kind: err.kind, message: err.message },
    };
  }
  if (err instanceof AdapterInvocationError) {
    return {
      status: 502,
      body: { error: "adapter_invocation_error", kind: err.kind, message: err.message },
    };
  }
  if (err instanceof SyntaxError) {
    return { status: 400, body: { error: "bad_json", message: err.message } };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { status: 500, body: { error: "internal_error", message: msg } };
}

// ---------- Bun.serve adapter ----------

/**
 * 把 handleHttp 包成 Bun Request → Response 的形状.
 * 给 runtime 的消费者用:
 *   Bun.serve({ fetch: asBunFetch(runtime), port: 3000 });
 */
export function asBunFetch(runtime: AppRuntime): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    // SSE streaming endpoint — intercept before the normal JSON pipeline.
    if (url.pathname === "/api/events/stream" && req.method === "GET") {
      return sseStreamResponse(runtime).response;
    }

    const bodyText = req.method === "POST" ? await req.text() : "";
    const resp = await handleHttp(runtime, {
      method: req.method,
      pathname: url.pathname,
      searchParams: url.searchParams,
      headers: req.headers,
      readBody: async () => (bodyText ? JSON.parse(bodyText) : undefined),
    });
    return new Response(JSON.stringify(resp.body, null, 2), {
      status: resp.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(resp.headers ?? {}),
      },
    });
  };
}
