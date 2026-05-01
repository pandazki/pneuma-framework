import { test, expect } from "bun:test";
import { AuthorizationKernel } from "@pneuma-framework/core-domain";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefinitionApplyError, LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createToolRegistry } from "../../src/tools/registry.js";
import { registerActionTools } from "../../src/tools/action.js";
import { InMemoryApprovalTokenStore } from "../../src/tools/approval-token-store.js";
import { defaultToolPrincipal } from "../../src/tools/authorization-context.js";
import { InMemoryPermissionLedgerStore } from "../../src/permission-ledger.js";

const TEMPLATE = join(import.meta.dir, "../fixtures/templates/fixture-api-config-happy");

function makeRestartCrashTemplate(): string {
  const dir = mkdtempSync(join(tmpdir(), "pneuma-def-apply-restart-template-"));
  const scripts = join(dir, "scripts");
  mkdirSync(scripts, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    name: "fixture-definition-apply-restart-crashes",
    version: "0.0.1",
    displayName: "Fixture Definition Apply Restart Crashes",
    description: "First dev run becomes ready; second dev run exits before ready.",
    backends: { supported: ["claude-code"] },
    runtimeAgent: "none",
    scripts: { dev: "scripts/dev.sh" },
  }, null, 2));
  const dev = join(scripts, "dev.sh");
  writeFileSync(dev, `#!/bin/sh
COUNT_FILE="$PNEUMA_WORKSPACE/.restart-count"
COUNT="$(cat "$COUNT_FILE" 2>/dev/null || echo 0)"
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNT_FILE"
if [ "$COUNT" -ge 2 ]; then
  echo "restart crash" 1>&2
  exit 7
fi
trap 'echo "##pneuma:stopping"; exit 0' TERM INT
PORT="\${PNEUMA_PORT_HINT:-0}"
echo "##pneuma:service-ready app http://127.0.0.1:$PORT"
echo "##pneuma:ready"
while true; do sleep 0.1; done
`);
  chmodSync(dev, 0o755);
  return dir;
}

type Column = {
  readonly name: string;
  readonly type: unknown;
  readonly nullable: boolean;
  readonly schema: unknown;
};

type TableFixture = {
  readonly id: string;
  readonly source: unknown;
  readonly system_owned: boolean;
  readonly columns: readonly Column[];
};

type OperationFixture = {
  readonly id: string;
  readonly action: string;
  readonly resource: unknown;
  readonly input: unknown;
  readonly output: unknown;
  readonly affects: unknown;
  readonly handler_kind: "code" | "query";
  readonly surface?: {
    readonly agent_callable: boolean;
    readonly public_surface: boolean;
    readonly view_mountable: boolean;
    readonly framework_internal: boolean;
  };
};

type ViewFixture = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: "table" | "list" | "detail" | "custom";
  readonly source: unknown;
  readonly presentation?: unknown;
};

type PolicyRuleFixture = {
  readonly id: string;
  readonly effect?: "allow" | "deny";
  readonly allow: readonly unknown[];
  readonly actions: readonly string[];
  readonly resource: unknown;
  readonly when?: unknown;
};

type DefinitionServerMode =
  | "normal"
  | "operation-fails"
  | "no-schema-change"
  | "first-no-schema-change"
  | "slow-config";
type DefinitionServerScenario =
  | DefinitionServerMode
  | "rollback-table-only"
  | "rollback-column"
  | "rollback-operation"
  | "rollback-execute-fails"
  | "rollback-no-schema-change";

type DefinitionServerStats = {
  readonly postCount: number;
  readonly rollbackValidateCount: number;
  readonly rollbackExecuteCount: number;
  readonly lastOperationUserId: string | null;
  readonly columns: readonly Column[];
  readonly tables: readonly TableFixture[];
  readonly operations: readonly OperationFixture[];
  readonly views: readonly ViewFixture[];
  readonly policyRules: readonly PolicyRuleFixture[];
  readonly policyDefaultPosture: { readonly app: "public" | "restricted" };
};

function rowSchema(columns: readonly Column[]): Record<string, unknown> {
  return {
    type: "object",
    properties: Object.fromEntries(columns.map((c) => [c.name, c.schema])),
    required: columns.filter((c) => !c.nullable).map((c) => c.name),
    additionalProperties: false,
  };
}

function schemaForType(type: unknown): unknown {
  if (typeof type !== "object" || type === null || Array.isArray(type)) return {};
  const t = type as { kind?: unknown; of?: unknown };
  if (t.kind === "primitive" && t.of === "Number") return { type: "number" };
  if (t.kind === "primitive" && t.of === "Bool") return { type: "boolean" };
  if (t.kind === "json") return {};
  return { type: "string" };
}

function normalizeColumn(input: unknown): Column | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const c = input as { name?: unknown; type?: unknown; nullable?: unknown };
  if (typeof c.name !== "string" || c.name.length === 0) return undefined;
  if (typeof c.type !== "object" || c.type === null || Array.isArray(c.type)) return undefined;
  return {
    name: c.name,
    type: c.type,
    nullable: c.nullable === true,
    schema: schemaForType(c.type),
  };
}

function configBody(
  tables: readonly TableFixture[],
  operations: readonly OperationFixture[],
  views: readonly ViewFixture[],
  policyRules: readonly PolicyRuleFixture[],
  policyDefaultPosture: { readonly app: "public" | "restricted" },
): Record<string, unknown> {
  const frameworkSurface = {
    agent_callable: true,
    public_surface: false,
    view_mountable: false,
    framework_internal: true,
  };
  const defaultSurface = (op: OperationFixture) => ({
    agent_callable: true,
    public_surface: true,
    view_mountable: (op.affects as { reads_only?: unknown }).reads_only === true,
    framework_internal: false,
  });
  return {
    app_id: "definition-apply-test",
    operations: [
      {
        id: "add_table",
        action: "write",
        resource: { kind: "app_definition", component: "table" },
        input: {},
        output: {},
        affects: { reads_only: false, destructive: false, mutations: ["pneuma_tables"] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "add_table_column",
        action: "write",
        resource: { kind: "app_definition", component: "table_column" },
        input: {},
        output: {},
        affects: { reads_only: false, destructive: false, mutations: ["pneuma_table_columns"] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "add_operation",
        action: "write",
        resource: { kind: "app_definition", component: "operation" },
        input: {},
        output: {},
        affects: { reads_only: false, destructive: false, mutations: ["pneuma_operations"] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "add_view",
        action: "write",
        resource: { kind: "app_definition", component: "view" },
        input: {},
        output: {},
        affects: { reads_only: false, destructive: false, mutations: ["pneuma_views"] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "add_policy_rule",
        action: "write",
        resource: { kind: "app_definition", component: "policy_rule" },
        input: {},
        output: {},
        affects: { reads_only: false, destructive: false, mutations: ["pneuma_policy_rules"] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "update_policy_rule",
        action: "write",
        resource: { kind: "app_definition", component: "policy_rule" },
        input: {},
        output: {},
        affects: { reads_only: false, destructive: false, mutations: ["pneuma_policy_rules"] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "delete_policy_rule",
        action: "write",
        resource: { kind: "app_definition", component: "policy_rule" },
        input: {},
        output: {},
        affects: { reads_only: false, destructive: false, mutations: ["pneuma_policy_rules"] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "set_default_posture",
        action: "write",
        resource: { kind: "app_definition", component: "policy_setting" },
        input: {},
        output: {},
        affects: { reads_only: false, destructive: false, mutations: ["pneuma_policy_settings"] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "definition.rollback.validate",
        action: "read",
        resource: { kind: "app_definition", component: "rollback" },
        input: {},
        output: {},
        affects: { reads_only: true, destructive: false, mutations: [] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "definition.rollback.execute",
        action: "write",
        resource: { kind: "app_definition", component: "rollback" },
        input: {},
        output: {},
        affects: {
          reads_only: false,
          destructive: true,
          mutations: ["pneuma_tables", "pneuma_table_columns"],
        },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      ...operations.map((op) => ({ ...op, surface: op.surface ?? defaultSurface(op) })),
    ],
    tables: tables.map((table) => ({
      id: table.id,
      source: table.source,
      system_owned: table.system_owned,
      columns: table.columns,
      row_schema: rowSchema(table.columns),
    })),
    views,
    policy_rules: policyRules,
    policy_default_posture: policyDefaultPosture,
  };
}

async function withDefinitionServer(
  fn: (port: number, stats: DefinitionServerStats) => Promise<void>,
  mode: DefinitionServerScenario = "normal",
): Promise<void> {
  let tables: TableFixture[] = [
    {
      id: "bookmarks",
      source: { kind: "stored" },
      system_owned: false,
      columns: [
        {
          name: "url",
          type: { kind: "primitive", of: "URL" },
          nullable: false,
          schema: { type: "string" },
        },
      ],
    },
  ];
  let operations: OperationFixture[] = [];
  let views: ViewFixture[] = [];
  let policyRules: PolicyRuleFixture[] = [];
  let policyDefaultPosture: { app: "public" | "restricted" } = { app: "public" };
  let postCount = 0;
  let rollbackValidateCount = 0;
  let rollbackExecuteCount = 0;
  let lastOperationUserId: string | null = null;
  const bookmarks = () => tables.find((t) => t.id === "bookmarks")!;
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/api/config") {
        if (mode === "slow-config") {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return Response.json(configBody(tables, operations, views, policyRules, policyDefaultPosture));
      }
      if (req.method === "POST" && url.pathname === "/api/operations/add_table") {
        lastOperationUserId = req.headers.get("x-pneuma-user-id");
        postCount += 1;
        if (mode === "operation-fails") {
          return Response.json({ error: "boom" }, { status: 500 });
        }
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const input = body?.input;
        if (typeof input?.table_id !== "string") {
          return Response.json({ error: "invalid_input" }, { status: 400 });
        }
        if (tables.some((t) => t.id === input.table_id)) {
          return Response.json({ error: "already_exists" }, { status: 409 });
        }
        if (!Array.isArray(input.columns)) {
          return Response.json({ error: "invalid_columns" }, { status: 400 });
        }
        const newColumns = input.columns.map(normalizeColumn);
        if (newColumns.some((c) => c === undefined)) {
          return Response.json({ error: "invalid_columns" }, { status: 400 });
        }
        if (mode !== "no-schema-change") {
          tables = [
            ...tables,
            {
              id: input.table_id,
              source: { kind: "stored" },
              system_owned: false,
              columns: newColumns as Column[],
            },
          ];
        }
        return Response.json({
          output: { entry_id: `pt-${input.table_id}`, definition_version: tables.length - 1 },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/add_table_column") {
        lastOperationUserId = req.headers.get("x-pneuma-user-id");
        postCount += 1;
        if (mode === "operation-fails") {
          return Response.json({ error: "boom" }, { status: 500 });
        }
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const input = body?.input;
        if (
          typeof input?.table_id !== "string"
          || typeof input.column_name !== "string"
          || typeof input.cell_type !== "object"
          || input.cell_type === null
        ) {
          return Response.json({ error: "invalid_input" }, { status: 400 });
        }
        if (input.table_id !== "bookmarks") {
          return Response.json({ error: "not_found" }, { status: 404 });
        }
        const current = bookmarks();
        const skipSchemaChange =
          mode === "no-schema-change"
          || (mode === "first-no-schema-change" && postCount === 1);
        if (!skipSchemaChange && !current.columns.some((c) => c.name === input.column_name)) {
          const nextColumn = {
            name: input.column_name,
            type: input.cell_type,
            nullable: input.nullable === true,
            schema: schemaForType(input.cell_type),
          };
          tables = tables.map((table) =>
            table.id === "bookmarks"
              ? { ...table, columns: [...table.columns, nextColumn] }
              : table,
          );
        }
        return Response.json({
          output: { entry_id: "ptc-tags", definition_version: bookmarks().columns.length - 1 },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/add_operation") {
        lastOperationUserId = req.headers.get("x-pneuma-user-id");
        postCount += 1;
        if (mode === "operation-fails") {
          return Response.json({ error: "boom" }, { status: 500 });
        }
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const input = body?.input;
        if (typeof input?.operation_id !== "string" || input.operation_id.length === 0) {
          return Response.json({ error: "invalid_operation_id" }, { status: 400 });
        }
        if (operations.some((op) => op.id === input.operation_id)) {
          return Response.json({ error: "already_exists" }, { status: 409 });
        }
        if (typeof input.handler !== "object" || input.handler === null || Array.isArray(input.handler)) {
          return Response.json({ error: "invalid_handler" }, { status: 400 });
        }
        const handler = input.handler as { kind?: unknown; on?: unknown };
        if (handler.kind !== "query" || typeof handler.on !== "string" || handler.on.length === 0) {
          return Response.json({ error: "unsupported_handler" }, { status: 400 });
        }
        if (!tables.some((table) => table.id === handler.on)) {
          return Response.json({ error: "target_table_not_found" }, { status: 404 });
        }
        if (mode !== "no-schema-change") {
          operations = [
            ...operations,
            {
              id: input.operation_id,
              action: "read",
              resource: { kind: "table", table: handler.on },
              input: input.input ?? { type: "record", fields: {} },
              output: input.output ?? { kind: "row-list", row_type: handler.on },
              affects: { reads_only: true, destructive: false, mutations: [], adapter_writes: [] },
              handler_kind: "query",
              surface: typeof input.surface === "object" && input.surface !== null && !Array.isArray(input.surface)
                ? input.surface as OperationFixture["surface"]
                : {
                    agent_callable: true,
                    public_surface: true,
                    view_mountable: true,
                    framework_internal: false,
                  },
            },
          ];
        }
        return Response.json({
          output: { entry_id: `po-${input.operation_id}`, definition_version: operations.length },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/add_view") {
        lastOperationUserId = req.headers.get("x-pneuma-user-id");
        postCount += 1;
        if (mode === "operation-fails") {
          return Response.json({ error: "boom" }, { status: 500 });
        }
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const input = body?.input;
        if (typeof input?.view_id !== "string" || input.view_id.length === 0) {
          return Response.json({ error: "invalid_view_id" }, { status: 400 });
        }
        if (input.view_kind !== "table" && input.view_kind !== "list" && input.view_kind !== "detail" && input.view_kind !== "custom") {
          return Response.json({ error: "invalid_view_kind" }, { status: 400 });
        }
        if (typeof input.source !== "object" || input.source === null || Array.isArray(input.source)) {
          return Response.json({ error: "invalid_source" }, { status: 400 });
        }
        const source = input.source as { kind?: unknown; operation_id?: unknown };
        if (source.kind !== "operation" || typeof source.operation_id !== "string") {
          return Response.json({ error: "unsupported_source" }, { status: 400 });
        }
        const sourceOperation = operations.find((op) => op.id === source.operation_id);
        if (!sourceOperation) {
          return Response.json({ error: "source_operation_not_found" }, { status: 404 });
        }
        if ((sourceOperation.affects as { reads_only?: unknown }).reads_only !== true) {
          return Response.json({ error: "source_operation_not_readable" }, { status: 400 });
        }
        if (sourceOperation.surface?.view_mountable === false || sourceOperation.surface?.public_surface === false || sourceOperation.surface?.framework_internal === true) {
          return Response.json({ error: "source_operation_not_mountable" }, { status: 400 });
        }
        if (views.some((view) => view.id === input.view_id)) {
          return Response.json({ error: "already_exists" }, { status: 409 });
        }
        if (mode !== "no-schema-change") {
          views = [
            ...views,
            {
              id: input.view_id,
              name: typeof input.name === "string" ? input.name : input.view_id,
              description: typeof input.description === "string" ? input.description : "",
              kind: input.view_kind,
              source: input.source,
              presentation: input.presentation,
            },
          ];
        }
        return Response.json({
          output: { entry_id: `pv-${input.view_id}`, definition_version: views.length, view_id: input.view_id },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/add_policy_rule") {
        lastOperationUserId = req.headers.get("x-pneuma-user-id");
        postCount += 1;
        if (mode === "operation-fails") {
          return Response.json({ error: "boom" }, { status: 500 });
        }
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const input = body?.input;
        if (typeof input?.rule_id !== "string" || input.rule_id.length === 0) {
          return Response.json({ error: "invalid_rule_id" }, { status: 400 });
        }
        if (!Array.isArray(input.allow) || !Array.isArray(input.actions)) {
          return Response.json({ error: "invalid_policy_rule" }, { status: 400 });
        }
        if (typeof input.resource !== "object" || input.resource === null || Array.isArray(input.resource)) {
          return Response.json({ error: "invalid_policy_resource" }, { status: 400 });
        }
        if (policyRules.some((rule) => rule.id === input.rule_id)) {
          return Response.json({ error: "already_exists" }, { status: 409 });
        }
        if (mode !== "no-schema-change") {
          policyRules = [
            ...policyRules,
            {
              id: input.rule_id,
              ...(input.effect !== undefined ? { effect: input.effect as "allow" | "deny" } : {}),
              allow: input.allow,
              actions: input.actions,
              resource: input.resource,
              ...(input.when !== undefined ? { when: input.when } : {}),
            },
          ];
        }
        return Response.json({
          output: {
            entry_id: `ppr-${input.rule_id}`,
            definition_version: policyRules.length,
            rule_id: input.rule_id,
          },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/update_policy_rule") {
        lastOperationUserId = req.headers.get("x-pneuma-user-id");
        postCount += 1;
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const input = body?.input;
        if (typeof input?.rule_id !== "string" || input.rule_id.length === 0) {
          return Response.json({ error: "invalid_rule_id" }, { status: 400 });
        }
        const index = policyRules.findIndex((rule) => rule.id === input.rule_id);
        if (index === -1) {
          return Response.json({ error: "not_found" }, { status: 404 });
        }
        const before = policyRules[index]!;
        const after: PolicyRuleFixture = {
          ...before,
          ...(input.effect !== undefined ? { effect: input.effect as "allow" | "deny" } : {}),
          ...(input.allow !== undefined ? { allow: input.allow as readonly unknown[] } : {}),
          ...(input.actions !== undefined ? { actions: input.actions as readonly string[] } : {}),
          ...(input.resource !== undefined ? { resource: input.resource } : {}),
        };
        if (Object.prototype.hasOwnProperty.call(input, "when")) {
          if (input.when === null || input.when === undefined) {
            delete (after as { when?: unknown }).when;
          } else {
            (after as { when?: unknown }).when = input.when;
          }
        }
        const changed_fields = [
          JSON.stringify(before.allow) !== JSON.stringify(after.allow) ? "allow" : undefined,
          JSON.stringify(before.effect ?? "allow") !== JSON.stringify(after.effect ?? "allow") ? "effect" : undefined,
          JSON.stringify(before.actions) !== JSON.stringify(after.actions) ? "actions" : undefined,
          JSON.stringify(before.resource) !== JSON.stringify(after.resource) ? "resource" : undefined,
          JSON.stringify(before.when ?? null) !== JSON.stringify(after.when ?? null) ? "when" : undefined,
        ].filter((field): field is string => typeof field === "string");
        policyRules = [
          ...policyRules.slice(0, index),
          after,
          ...policyRules.slice(index + 1),
        ];
        return Response.json({
          output: {
            rule_id: input.rule_id,
            updated: true,
            previous_definition_version: index + 1,
            definition_version: policyRules.length + 1,
            changed_fields,
          },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/delete_policy_rule") {
        lastOperationUserId = req.headers.get("x-pneuma-user-id");
        postCount += 1;
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const input = body?.input;
        if (typeof input?.rule_id !== "string" || input.rule_id.length === 0) {
          return Response.json({ error: "invalid_rule_id" }, { status: 400 });
        }
        const index = policyRules.findIndex((rule) => rule.id === input.rule_id);
        if (index === -1) {
          return Response.json({ error: "not_found" }, { status: 404 });
        }
        policyRules = policyRules.filter((rule) => rule.id !== input.rule_id);
        return Response.json({
          output: {
            rule_id: input.rule_id,
            deleted: true,
            previous_definition_version: index + 1,
            definition_version: policyRules.length + 1,
          },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/set_default_posture") {
        lastOperationUserId = req.headers.get("x-pneuma-user-id");
        postCount += 1;
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const input = body?.input;
        if (input?.app !== "public" && input?.app !== "restricted") {
          return Response.json({ error: "invalid_default_posture" }, { status: 400 });
        }
        const previous = policyDefaultPosture;
        policyDefaultPosture = { app: input.app };
        return Response.json({
          output: {
            setting_id: "default_posture",
            previous_default_posture: previous,
            default_posture: policyDefaultPosture,
            definition_version: 1,
            updated: true,
          },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/definition.rollback.validate") {
        lastOperationUserId = req.headers.get("x-pneuma-user-id");
        rollbackValidateCount += 1;
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const target = body?.input?.target_history_version;
        if (!Number.isInteger(target) || (target as number) < 0) {
          return Response.json({ error: "invalid_target_history_version" }, { status: 400 });
        }
        return Response.json({
          output: {
            target_history_version: target,
            current_history_version: 2,
            destructive: mode !== "rollback-operation",
            requires_approval: true,
            impact: {
              removed_tables: mode === "rollback-column" || mode === "rollback-operation"
                ? []
                : [{ table_id: "notes", row_count: 1, columns: ["title"] }],
              removed_columns: mode === "rollback-table-only" || mode === "rollback-operation"
                ? []
                : [{ table_id: "bookmarks", column_name: "tags", affected_row_count: 1 }],
              removed_operations: mode === "rollback-operation"
                ? [{ operation_id: "list_bookmark_urls", handler_kind: "query" }]
                : [],
              removed_views: [],
              restored_tables: [],
              restored_columns: [],
              restored_operations: [],
              restored_views: [],
            },
            current_overlay: {
              pneuma_tables_count: 1,
              pneuma_table_columns_count: 1,
              pneuma_operations_count: operations.length,
              pneuma_views_count: views.length,
              pneuma_policy_rules_count: policyRules.length,
            },
            target_overlay: {
              pneuma_tables_count: 0,
              pneuma_table_columns_count: 0,
              pneuma_operations_count: 0,
              pneuma_views_count: 0,
              pneuma_policy_rules_count: 0,
            },
            warnings: ["target_history_version=0 means the baseline before any definition overlay history entry"],
          },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/definition.rollback.execute") {
        rollbackExecuteCount += 1;
        const body = await req.json().catch(() => undefined) as {
          input?: Record<string, unknown>;
          confirmed?: boolean;
        } | undefined;
        const target = body?.input?.target_history_version;
        if (body?.confirmed !== true) {
          return Response.json({ error: "confirmation_required" }, { status: 428 });
        }
        if (!Number.isInteger(target) || (target as number) < 0) {
          return Response.json({ error: "invalid_target_history_version" }, { status: 400 });
        }
        if (mode === "rollback-execute-fails") {
          return Response.json({ error: "rollback execute failed" }, { status: 500 });
        }
        if (mode === "rollback-no-schema-change") {
          // Simulate a handler that returns success but leaves the observed definition unchanged.
        } else if (mode === "rollback-operation") {
          operations = [];
        } else if (mode === "rollback-column") {
          tables = tables.map((table) =>
            table.id === "bookmarks"
              ? { ...table, columns: table.columns.filter((column) => column.name !== "tags") }
              : table,
          );
        } else {
          tables = tables.filter((table) => table.id !== "notes");
        }
        return Response.json({
          output: {
            status: "rolled_back",
            target_history_version: target,
            previous_history_version: 2,
            backup_history_version: 3,
            rollback_history_version: 4,
            deleted_rows: mode === "rollback-column" || mode === "rollback-operation"
              ? []
              : [{ table_id: "notes", row_ids: ["note-1"] }],
            cleaned_columns: mode === "rollback-column"
              ? [{ table_id: "bookmarks", column_name: "tags", row_ids: ["bookmark-1"] }]
              : [],
            deleted_definition_rows: mode === "rollback-column"
                ? { pneuma_tables: [], pneuma_table_columns: ["ptc-tags"], pneuma_operations: [] }
              : mode === "rollback-operation"
                ? { pneuma_tables: [], pneuma_table_columns: [], pneuma_operations: ["po-list_bookmark_urls"] }
                : { pneuma_tables: ["pt-notes"], pneuma_table_columns: [], pneuma_operations: [] },
            impact: {
              removed_tables: mode === "rollback-column" || mode === "rollback-operation"
                ? []
                : [{ table_id: "notes", row_count: 1, columns: ["title"] }],
              removed_columns: mode === "rollback-column"
                ? [{ table_id: "bookmarks", column_name: "tags", affected_row_count: 1 }]
                : [],
              removed_operations: mode === "rollback-operation"
                ? [{ operation_id: "list_bookmark_urls", handler_kind: "query" }]
                : [],
              removed_views: [],
              restored_tables: [],
              restored_columns: [],
              restored_operations: [],
              restored_views: [],
            },
            restart_required: true,
          },
          events: [],
        });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  });
  const stats: DefinitionServerStats = {
    get postCount() {
      return postCount;
    },
    get rollbackValidateCount() {
      return rollbackValidateCount;
    },
    get rollbackExecuteCount() {
      return rollbackExecuteCount;
    },
    get lastOperationUserId() {
      return lastOperationUserId;
    },
    get columns() {
      return bookmarks().columns;
    },
    get tables() {
      return tables;
    },
    get operations() {
      return operations;
    },
    get views() {
      return views;
    },
    get policyRules() {
      return policyRules;
    },
    get policyDefaultPosture() {
      return policyDefaultPosture;
    },
  };
  try {
    await fn(server.port, stats);
  } finally {
    server.stop(true);
  }
}

test("definition.apply adds a table column through the running dev service and refreshes state after restart", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const frameworkEvents: Array<{
      event: { type: string; state: { phase: string; status: string } };
    }> = [];
    orch.setFrameworkEventPushHook((env) => frameworkEvents.push(env));

    const start = await reg.call("lifecycle.dev.start", {});
    expect(start.ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      mode: string;
      restart_required: boolean;
      operation_id: string;
      diff: { changed_tables: Array<{ added_columns: string[] }> };
      operation_output: unknown;
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("applied");
    expect(state.mode).toBe("apply");
    expect(state.restart_required).toBe(true);
    expect(state.operation_id).toBe("add_table_column");
    expect(stats.lastOperationUserId).toBe("framework");
    expect(state.diff.changed_tables[0]?.added_columns).toEqual(["tags"]);
    expect(state.operation_output).toEqual({ entry_id: "ptc-tags", definition_version: 1 });
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "applying-definition",
      "stopping-for-definition-apply",
      "starting-after-definition-apply",
      "refreshing-definition",
      "running",
    ]);
    expect(orch.state.dev?.state).toBe("running");
    expect(orch.state.dev?.tables?.[0]?.columns.map((c) => c.name)).toEqual(["url", "tags"]);
    expect(orch.state.definitionApply?.status).toBe("applied");
    expect(orch.state.definitionApply?.phase).toBe("running");
    expect(frameworkEvents.map((env) => env.event.type)).toEqual(
      expect.arrayContaining(["definition-apply-state"])
    );
    expect(frameworkEvents.map((env) => env.event.state.phase)).toEqual([
      "validating",
      "applying-definition",
      "stopping-for-definition-apply",
      "starting-after-definition-apply",
      "refreshing-definition",
      "running",
    ]);
    expect(frameworkEvents.at(-1)?.event.state.status).toBe("applied");

    const stop = await reg.call("lifecycle.dev.stop", {});
    expect(stop.ok).toBe(true);
  });
});

test("definition.repair.status reports clean state before and after successful definition.apply", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-repair-status-clean-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);

    const before = await reg.call("definition.repair.status", {});
    expect(before.ok).toBe(true);
    expect(before.state).toMatchObject({ status: "clean", dirty: false, active: false });

    expect((await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    })).ok).toBe(true);

    const after = await reg.call("definition.repair.status", {});
    expect(after.ok).toBe(true);
    expect(after.state).toMatchObject({ status: "clean", dirty: false, active: false });

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.repair.reset_to_last_good clears dirty guard when observed definition still matches last known good", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-repair-reset-clean-observed-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    })).ok).toBe(false);
    expect((await reg.call("definition.repair.status", {})).state).toMatchObject({ status: "dirty" });

    const reset = await reg.call("definition.repair.reset_to_last_good", {});
    expect(reset.ok).toBe(true);
    expect(reset.state).toMatchObject({
      status: "clean",
      reset: "cleared_dirty_guard",
    });

    const status = await reg.call("definition.repair.status", {});
    expect(status.state).toMatchObject({ status: "clean", dirty: false });

    const apply = await reg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    });
    expect(apply.ok).toBe(true);

    await reg.call("lifecycle.dev.stop", {});
  }, "first-no-schema-change");
});

test("definition.apply adds a stored table through the running dev service and refreshes state after restart", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-table-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    const start = await reg.call("lifecycle.dev.start", {});
    expect(start.ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      mode: string;
      restart_required: boolean;
      operation_id: string;
      diff: { added_tables: Array<{ table_id: string; columns: string[] }>; changed_tables: unknown[] };
      operation_output: unknown;
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("applied");
    expect(state.mode).toBe("apply");
    expect(state.restart_required).toBe(true);
    expect(state.operation_id).toBe("add_table");
    expect(state.diff.added_tables).toEqual([{ table_id: "notes", columns: ["title"] }]);
    expect(state.diff.changed_tables).toEqual([]);
    expect(state.operation_output).toEqual({ entry_id: "pt-notes", definition_version: 1 });
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "applying-definition",
      "stopping-for-definition-apply",
      "starting-after-definition-apply",
      "refreshing-definition",
      "running",
    ]);
    expect(orch.state.dev?.state).toBe("running");
    expect(orch.state.dev?.tables?.map((t) => t.id)).toContain("notes");
    expect(orch.state.definitionApply?.status).toBe("applied");

    const stop = await reg.call("lifecycle.dev.stop", {});
    expect(stop.ok).toBe(true);
  });
});

test("definition.apply adds a query-backed operation through the running dev service and refreshes state after restart", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-operation-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    const start = await reg.call("lifecycle.dev.start", {});
    expect(start.ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
      name: "List bookmark URLs",
      description: "Read bookmark URLs for agent inspection.",
      handler: {
        kind: "query",
        on: "bookmarks",
        fields: ["url"],
        pagination: { kind: "offset", size: 20 },
      },
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      mode: string;
      restart_required: boolean;
      operation_id: string;
      diff: { added_operations: Array<{ operation_id: string; action: string; handler_kind: string }> };
      operation_output: unknown;
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("applied");
    expect(state.mode).toBe("apply");
    expect(state.restart_required).toBe(true);
    expect(state.operation_id).toBe("add_operation");
    expect(state.diff.added_operations).toEqual([{
      operation_id: "list_bookmark_urls",
      action: "read",
      handler_kind: "query",
    }]);
    expect(state.operation_output).toEqual({
      entry_id: "po-list_bookmark_urls",
      definition_version: 1,
    });
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "applying-definition",
      "stopping-for-definition-apply",
      "starting-after-definition-apply",
      "refreshing-definition",
      "running",
    ]);
    expect(stats.operations.map((op) => op.id)).toEqual(["list_bookmark_urls"]);
    expect(orch.state.dev?.state).toBe("running");
    expect(orch.state.dev?.operations?.some((op) => op.id === "list_bookmark_urls")).toBe(true);
    expect(orch.state.definitionApply?.status).toBe("applied");

    const stop = await reg.call("lifecycle.dev.stop", {});
    expect(stop.ok).toBe(true);
  });
});

test("definition.apply adds an Operation-backed view through the running dev service", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-view-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    const start = await reg.call("lifecycle.dev.start", {});
    expect(start.ok).toBe(true);

    const operationResult = await reg.call("definition.apply", {
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
      name: "List bookmark URLs",
      description: "Read bookmark URLs for app views.",
      handler: {
        kind: "query",
        on: "bookmarks",
        fields: ["url"],
        pagination: { kind: "offset", size: 20 },
      },
    });
    expect(operationResult.ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "add_view",
      view_id: "review_queue",
      name: "Review Queue",
      description: "Sources ready for review.",
      view_kind: "table",
      source: { kind: "operation", operation_id: "list_bookmark_urls" },
      presentation: { columns: ["url"] },
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      operation_id: string;
      diff: { added_views: Array<{ view_id: string; kind: string; source_operation_id: string }> };
      operation_output: unknown;
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("applied");
    expect(state.operation_id).toBe("add_view");
    expect(state.diff.added_views).toEqual([{
      view_id: "review_queue",
      kind: "table",
      source_operation_id: "list_bookmark_urls",
    }]);
    expect(state.operation_output).toEqual({
      entry_id: "pv-review_queue",
      definition_version: 1,
      view_id: "review_queue",
    });
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "applying-definition",
      "stopping-for-definition-apply",
      "starting-after-definition-apply",
      "refreshing-definition",
      "running",
    ]);
    expect(stats.views.map((view) => view.id)).toEqual(["review_queue"]);
    expect(orch.state.dev?.views?.some((view) => view.id === "review_queue")).toBe(true);

    const stop = await reg.call("lifecycle.dev.stop", {});
    expect(stop.ok).toBe(true);
  });
  });

test("definition.apply adds a PolicyRule through the running dev service", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-policy-rule-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    const start = await reg.call("lifecycle.dev.start", {});
    expect(start.ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "add_policy_rule",
      rule_id: "reviewers-can-read-review-queue",
      allow: [{ kind: "role", name: "reviewer" }],
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      operation_id: string;
      diff: {
        added_policy_rules: Array<{
          rule_id: string;
          actions: string[];
          resource: unknown;
        }>;
      };
      operation_output: unknown;
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("applied");
    expect(state.operation_id).toBe("add_policy_rule");
    expect(state.diff.added_policy_rules).toEqual([{
      rule_id: "reviewers-can-read-review-queue",
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
    }]);
    expect(state.operation_output).toEqual({
      entry_id: "ppr-reviewers-can-read-review-queue",
      definition_version: 1,
      rule_id: "reviewers-can-read-review-queue",
    });
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "applying-definition",
      "stopping-for-definition-apply",
      "starting-after-definition-apply",
      "refreshing-definition",
      "running",
    ]);
    expect(stats.policyRules.map((rule) => rule.id)).toEqual(["reviewers-can-read-review-queue"]);
    expect(orch.state.dev?.policy_rules?.some((rule) => rule.id === "reviewers-can-read-review-queue")).toBe(true);

    const stop = await reg.call("lifecycle.dev.stop", {});
    expect(stop.ok).toBe(true);
  });
});

test("definition.apply adds an explicit deny PolicyRule through the running dev service", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-policy-deny-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "add_policy_rule",
      rule_id: "contractors-cannot-read-review-queue",
      effect: "deny",
      allow: [{ kind: "role", name: "contractor" }],
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      diff: {
        added_policy_rules: Array<{
          rule_id: string;
          actions: string[];
          resource: unknown;
        }>;
      };
    };
    expect(state.status).toBe("applied");
    expect(state.diff.added_policy_rules).toEqual([{
      rule_id: "contractors-cannot-read-review-queue",
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
    }]);
    expect(stats.policyRules).toEqual([{
      id: "contractors-cannot-read-review-queue",
      effect: "deny",
      allow: [{ kind: "role", name: "contractor" }],
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
    }]);
    expect(orch.state.dev?.policy_rules?.find((rule) => rule.id === "contractors-cannot-read-review-queue"))
      .toMatchObject({ effect: "deny" });

    expect((await reg.call("lifecycle.dev.stop", {})).ok).toBe(true);
  });
});

test("definition.apply updates a PolicyRule through the running dev service", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-policy-update-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_policy_rule",
      rule_id: "reviewers-can-read-review-queue",
      allow: [{ kind: "role", name: "reviewer" }],
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
    })).ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "update_policy_rule",
      rule_id: "reviewers-can-read-review-queue",
      allow: [{ kind: "user", id: "bob" }],
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      operation_id: string;
      diff: {
        updated_policy_rules: Array<{
          rule_id: string;
          changed_fields: string[];
        }>;
      };
      operation_output: unknown;
    };
    expect(state.status).toBe("applied");
    expect(state.operation_id).toBe("update_policy_rule");
    expect(state.diff.updated_policy_rules).toEqual([{
      rule_id: "reviewers-can-read-review-queue",
      changed_fields: ["allow"],
    }]);
    expect(state.operation_output).toMatchObject({
      rule_id: "reviewers-can-read-review-queue",
      updated: true,
      changed_fields: ["allow"],
    });
    expect(stats.policyRules).toEqual([{
      id: "reviewers-can-read-review-queue",
      allow: [{ kind: "user", id: "bob" }],
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
    }]);

    expect((await reg.call("lifecycle.dev.stop", {})).ok).toBe(true);
  });
});

test("definition.apply updates a PolicyRule effect through the running dev service", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-policy-effect-update-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_policy_rule",
      rule_id: "reviewers-can-read-review-queue",
      allow: [{ kind: "role", name: "reviewer" }],
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
    })).ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "update_policy_rule",
      rule_id: "reviewers-can-read-review-queue",
      effect: "deny",
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      diff: {
        updated_policy_rules: Array<{
          rule_id: string;
          changed_fields: string[];
        }>;
      };
      operation_output: unknown;
    };
    expect(state.status).toBe("applied");
    expect(state.diff.updated_policy_rules).toEqual([{
      rule_id: "reviewers-can-read-review-queue",
      changed_fields: ["effect"],
    }]);
    expect(state.operation_output).toMatchObject({
      rule_id: "reviewers-can-read-review-queue",
      changed_fields: ["effect"],
    });
    expect(stats.policyRules).toEqual([{
      id: "reviewers-can-read-review-queue",
      effect: "deny",
      allow: [{ kind: "role", name: "reviewer" }],
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
    }]);

    expect((await reg.call("lifecycle.dev.stop", {})).ok).toBe(true);
  });
});

test("definition.apply clears a PolicyRule when clause through the running dev service", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-policy-update-clear-when-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const ownerIsUser = {
      kind: "leaf",
      subject: { ns: "row", path: ["owner_id"] },
      op: "eq",
      value: { ref: "user", path: ["id"] },
    };

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_policy_rule",
      rule_id: "self-review-queue",
      allow: [{ kind: "user", id: "alice" }],
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
      when: ownerIsUser,
    })).ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "update_policy_rule",
      rule_id: "self-review-queue",
      when: null,
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      diff: {
        updated_policy_rules: Array<{
          rule_id: string;
          changed_fields: string[];
        }>;
      };
      operation_output: unknown;
    };
    expect(state.status).toBe("applied");
    expect(state.diff.updated_policy_rules).toEqual([{
      rule_id: "self-review-queue",
      changed_fields: ["when"],
    }]);
    expect(state.operation_output).toMatchObject({
      rule_id: "self-review-queue",
      updated: true,
      changed_fields: ["when"],
    });
    expect(stats.policyRules).toEqual([{
      id: "self-review-queue",
      allow: [{ kind: "user", id: "alice" }],
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
    }]);

    expect((await reg.call("lifecycle.dev.stop", {})).ok).toBe(true);
  });
});

test("definition.apply sets default policy posture through the running dev service", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-default-posture-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "set_default_posture",
      app: "restricted",
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      operation_id: string;
      diff: {
        updated_policy_settings: Array<{
          setting_id: string;
          before: unknown;
          after: unknown;
        }>;
      };
      operation_output: unknown;
    };
    expect(state.status).toBe("applied");
    expect(state.operation_id).toBe("set_default_posture");
    expect(state.diff.updated_policy_settings).toEqual([{
      setting_id: "default_posture",
      before: { app: "public" },
      after: { app: "restricted" },
    }]);
    expect(state.operation_output).toMatchObject({
      setting_id: "default_posture",
      previous_default_posture: { app: "public" },
      default_posture: { app: "restricted" },
      updated: true,
    });
    expect(stats.policyDefaultPosture).toEqual({ app: "restricted" });
    expect(orch.state.dev?.policy_default_posture).toEqual({ app: "restricted" });

    expect((await reg.call("lifecycle.dev.stop", {})).ok).toBe(true);
  });
});

test("definition.apply deletes a PolicyRule through the running dev service", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-policy-delete-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_policy_rule",
      rule_id: "reviewers-can-read-review-queue",
      allow: [{ kind: "role", name: "reviewer" }],
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
    })).ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "delete_policy_rule",
      rule_id: "reviewers-can-read-review-queue",
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      operation_id: string;
      diff: {
        deleted_policy_rules: Array<{
          rule_id: string;
          actions: string[];
          resource: unknown;
        }>;
      };
      operation_output: unknown;
    };
    expect(state.status).toBe("applied");
    expect(state.operation_id).toBe("delete_policy_rule");
    expect(state.diff.deleted_policy_rules).toEqual([{
      rule_id: "reviewers-can-read-review-queue",
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
    }]);
    expect(state.operation_output).toMatchObject({
      rule_id: "reviewers-can-read-review-queue",
      deleted: true,
    });
    expect(stats.policyRules).toEqual([]);

    expect((await reg.call("lifecycle.dev.stop", {})).ok).toBe(true);
  });
});

  test("definition.apply rejects Views backed by non-view-mountable Operations", async () => {
    await withDefinitionServer(async (port, stats) => {
      const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-view-surface-"));
      const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
      const reg = createToolRegistry({ orchestrator: orch });
      registerActionTools(reg);

      const start = await reg.call("lifecycle.dev.start", {});
      expect(start.ok).toBe(true);

      const addOperation = await reg.call("definition.apply", {
        kind: "add_operation",
        operation_id: "internal_urls",
        name: "Internal URLs",
        handler: { kind: "query", on: "bookmarks", fields: ["url"], pagination: { kind: "offset", size: 10 } },
        surface: {
          agent_callable: true,
          public_surface: true,
          view_mountable: false,
          framework_internal: false,
        },
      });
      expect(addOperation.ok).toBe(true);
      expect(stats.operations.find((op) => op.id === "internal_urls")?.surface?.view_mountable).toBe(false);

      const addView = await reg.call("definition.apply", {
        kind: "add_view",
        view_id: "internal_review_queue",
        name: "Internal Review Queue",
        view_kind: "table",
        source: { kind: "operation", operation_id: "internal_urls" },
      });

      expect(addView.ok).toBe(false);
      const state = addView.state as { failure: { category: string; message: string } };
      expect(state.failure.category).toBe("validation_failed");
      expect(state.failure.message).toMatch(/not view_mountable/);
      expect(stats.views).toHaveLength(0);

      const stop = await reg.call("lifecycle.dev.stop", {});
      expect(stop.ok).toBe(true);
    });
  });

  test("definition.apply rejects Views backed by framework-owned Operations", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-framework-view-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    const start = await reg.call("lifecycle.dev.start", {});
    expect(start.ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "add_view",
      view_id: "rollback_inspector",
      name: "Rollback Inspector",
      view_kind: "table",
      source: { kind: "operation", operation_id: "definition.rollback.validate" },
      presentation: { columns: ["target_history_version"] },
    });

    expect(result.ok).toBe(false);
    const state = result.state as { failure: { category: string; message: string }; timeline: Array<{ phase: string }> };
    expect(state.failure.category).toBe("validation_failed");
    expect(state.failure.message).toMatch(/framework-internal/);
    expect(state.timeline.map((e) => e.phase)).toEqual(["validating", "failed"]);
    expect(stats.postCount).toBe(0);
    expect(stats.views).toHaveLength(0);

    const stop = await reg.call("lifecycle.dev.stop", {});
    expect(stop.ok).toBe(true);
  });
});

test("definition.apply validate mode predicts clearing a PolicyRule when clause", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-validate-policy-clear-when-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const ownerIsUser = {
      kind: "leaf",
      subject: { ns: "row", path: ["owner_id"] },
      op: "eq",
      value: { ref: "user", path: ["id"] },
    };

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_policy_rule",
      rule_id: "self-review-queue",
      allow: [{ kind: "user", id: "alice" }],
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
      when: ownerIsUser,
    })).ok).toBe(true);
    const beforePid = orch.state.dev?.pid;
    const beforePostCount = stats.postCount;

    const result = await reg.call("definition.apply", {
      mode: "validate",
      kind: "update_policy_rule",
      rule_id: "self-review-queue",
      when: null,
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      mode: string;
      diff: {
        updated_policy_rules: Array<{
          rule_id: string;
          changed_fields: string[];
        }>;
      };
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("validated");
    expect(state.mode).toBe("validate");
    expect(state.diff.updated_policy_rules).toEqual([{
      rule_id: "self-review-queue",
      changed_fields: ["when"],
    }]);
    expect(state.timeline.map((e) => e.phase)).toEqual(["validating", "running"]);
    expect(stats.postCount).toBe(beforePostCount);
    expect(stats.policyRules[0]?.when).toEqual(ownerIsUser);
    expect(orch.state.dev?.pid).toBe(beforePid);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply validate mode predicts default posture without mutating or restarting", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-validate-default-posture-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const beforePid = orch.state.dev?.pid;
    const beforePostCount = stats.postCount;

    const result = await reg.call("definition.apply", {
      mode: "validate",
      kind: "set_default_posture",
      app: "restricted",
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      mode: string;
      diff: {
        updated_policy_settings: Array<{
          setting_id: string;
          before: unknown;
          after: unknown;
        }>;
      };
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("validated");
    expect(state.mode).toBe("validate");
    expect(state.diff.updated_policy_settings).toEqual([{
      setting_id: "default_posture",
      before: { app: "public" },
      after: { app: "restricted" },
    }]);
    expect(state.timeline.map((e) => e.phase)).toEqual(["validating", "running"]);
    expect(stats.postCount).toBe(beforePostCount);
    expect(stats.policyDefaultPosture).toEqual({ app: "public" });
    expect(orch.state.dev?.pid).toBe(beforePid);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply validate mode returns a predicted diff without mutating or restarting", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-validate-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const beforePid = orch.state.dev?.pid;

    const result = await reg.call("definition.apply", {
      mode: "validate",
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      mode: string;
      diff: { changed_tables: Array<{ before_columns: string[]; after_columns: string[]; added_columns: string[] }> };
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("validated");
    expect(state.mode).toBe("validate");
    expect(state.diff.changed_tables[0]).toMatchObject({
      before_columns: ["url"],
      after_columns: ["url", "tags"],
      added_columns: ["tags"],
    });
    expect(state.timeline.map((e) => e.phase)).toEqual(["validating", "running"]);
    expect(stats.postCount).toBe(0);
    expect(stats.columns.map((c) => c.name)).toEqual(["url"]);
    expect(orch.state.dev?.pid).toBe(beforePid);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply validate mode predicts add_operation without mutating or restarting", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-validate-operation-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const beforePid = orch.state.dev?.pid;

    const result = await reg.call("definition.apply", {
      mode: "validate",
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
      handler: { kind: "query", on: "bookmarks", fields: ["url"] },
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      mode: string;
      diff: { added_operations: Array<{ operation_id: string; action: string; handler_kind: string }> };
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("validated");
    expect(state.mode).toBe("validate");
    expect(state.diff.added_operations).toEqual([{
      operation_id: "list_bookmark_urls",
      action: "read",
      handler_kind: "query",
    }]);
    expect(state.timeline.map((e) => e.phase)).toEqual(["validating", "running"]);
    expect(stats.postCount).toBe(0);
    expect(stats.operations).toEqual([]);
    expect(orch.state.dev?.pid).toBe(beforePid);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply reports operation_failed when the underlying framework operation fails", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-op-fail-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const beforePid = orch.state.dev?.pid;

    const result = await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    });

    expect(result.ok).toBe(false);
    const state = result.state as { failure: { category: string }; timeline: Array<{ phase: string }> };
    expect(state.failure.category).toBe("operation_failed");
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "applying-definition",
      "failed",
    ]);
    expect(orch.state.dev?.pid).toBe(beforePid);

    await reg.call("lifecycle.dev.stop", {});
  }, "operation-fails");
});

test("definition.apply reports diff_mismatch when schema refresh does not show the requested column", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-diff-mismatch-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const result = await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    });

    expect(result.ok).toBe(false);
    const state = result.state as { failure: { category: string }; timeline: Array<{ phase: string }> };
    expect(state.failure.category).toBe("diff_mismatch");
    expect(state.timeline.map((e) => e.phase)).toContain("refreshing-definition");

    await reg.call("lifecycle.dev.stop", {});
  }, "no-schema-change");
});

test("definition.apply diff mismatch marks dirty and blocks the next mutation before runtime POST", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-dirty-block-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);

    const first = await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    });
    expect(first.ok).toBe(false);
    expect((first.state as { failure: { category: string } }).failure.category).toBe("diff_mismatch");

    const status = await reg.call("definition.repair.status", {});
    expect(status.ok).toBe(true);
    expect(status.state).toMatchObject({
      status: "dirty",
      dirty: true,
      active: false,
      guard: {
        operation_id: "definition.apply",
        target: "add_table_column:bookmarks.tags",
        status: "dirty",
        error: { code: "diff_mismatch" },
      },
    });

    const postCountAfterDirty = stats.postCount;
    const second = await reg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    });
    expect(second.ok).toBe(false);
    expect((second.state as { failure: { category: string } }).failure.category).toBe("dirty_definition_state");
    expect(second.error).toContain("definition mutation blocked");
    expect(stats.postCount).toBe(postCountAfterDirty);

    await reg.call("lifecycle.dev.stop", {});
  }, "no-schema-change");
});

test("definition.apply rejects a concurrent mutation while the first mutation is still validating", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-concurrent-block-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);

    const first = reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    });
    const second = reg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    });

    const results = await Promise.all([first, second]);
    const succeeded = results.filter((result) => result.ok);
    const blocked = results.find((result) => !result.ok);
    expect(succeeded).toHaveLength(1);
    expect(blocked?.ok).toBe(false);
    expect((blocked?.state as { failure: { category: string } }).failure.category).toBe("dirty_definition_state");
    expect(blocked?.error).toContain("definition mutation blocked");
    expect(stats.postCount).toBe(1);

    await reg.call("lifecycle.dev.stop", {});
  }, "slow-config");
});

test("definition mutation guard persists dirty state across orchestrator instances", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-dirty-persist-"));
    const firstOrch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const firstReg = createToolRegistry({ orchestrator: firstOrch });
    registerActionTools(firstReg);

    expect((await firstReg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await firstReg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    })).ok).toBe(false);
    await firstReg.call("lifecycle.dev.stop", {});

    const secondOrch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const secondReg = createToolRegistry({ orchestrator: secondOrch });
    registerActionTools(secondReg);

    expect((await secondReg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const status = await secondReg.call("definition.repair.status", {});
    expect(status.state).toMatchObject({ status: "dirty", dirty: true });

    const postCountBeforeBlocked = stats.postCount;
    const blocked = await secondReg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    });
    expect(blocked.ok).toBe(false);
    expect((blocked.state as { failure: { category: string } }).failure.category).toBe("dirty_definition_state");
    expect(stats.postCount).toBe(postCountBeforeBlocked);

    await secondReg.call("lifecycle.dev.stop", {});
  }, "no-schema-change");
});

test("definition.apply reports restart_failed when dev exits before ready after mutation", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-restart-fail-"));
    const orch = new LifecycleOrchestrator({
      templateDir: makeRestartCrashTemplate(),
      workspace: ws,
      portHint: port,
    });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const result = await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    });

    expect(result.ok).toBe(false);
    const state = result.state as { failure: { category: string }; timeline: Array<{ phase: string }> };
    expect(state.failure.category).toBe("restart_failed");
    expect(state.timeline.map((e) => e.phase)).toContain("starting-after-definition-apply");
  });
});

test("definition.apply approval gate allows an approved definition mutation", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-approval-allow-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string; detail: Record<string, unknown> } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.apply", {
      require_approval: true,
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    });

    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.prompt.tool).toBe("definition.apply");
    expect(prompts[0]!.prompt.detail.restart_required).toBe(true);
    expect(stats.postCount).toBe(0);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(true);
    const state = result.state as { status: string; approval: { required: boolean; decision: string } };
    expect(state.status).toBe("applied");
    expect(state.approval).toMatchObject({ required: true, decision: "allow" });
    expect(stats.postCount).toBe(1);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply approved-mutation authorization denial stops before runtime mutation", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-approved-auth-deny-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const prompts: Array<{ prompt: { id: string; tool: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    const running = orch.runDev();
    await orch.awaitDevReady();
    const pending = orch.runDefinitionApply(
      {
        kind: "add_table_column",
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" },
      },
      {
        requireApproval: true,
        approvedMutationAuthorization: {
          tool: "definition.apply",
          capability: "definition:apply",
          target: { kind: "definition", id: "definition.apply:add_table_column:bookmarks:tags", fingerprint: "test-target" },
          authorize: async () => ({
            ok: false,
            decision: {
              decision: "deny",
              reason_code: "approval_target_mismatch",
              principal: { kind: "framework_system", id: "framework" },
              capability: "definition:apply",
              message: "approval token target mismatch",
            },
          }),
        },
      },
    );

    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);

    await expect(pending).rejects.toBeInstanceOf(DefinitionApplyError);
    await pending.catch((err) => {
      expect((err as DefinitionApplyError).category).toBe("approval_denied");
    });
    expect(stats.postCount).toBe(0);
    await orch.runStop();
    await running;
  });
});

test("definition.apply approval gate returns tokenized framework_system authorization metadata", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-auth-metadata-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({
      orchestrator: orch,
      authorizationKernel: new AuthorizationKernel(),
      approvalTokens: new InMemoryApprovalTokenStore(),
      principal: defaultToolPrincipal(),
      appId: "ai-bookmarks",
      workspaceId: ws,
    });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string; detail: Record<string, unknown> } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.apply", {
      require_approval: true,
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    });

    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(stats.postCount).toBe(0);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      authorization: {
        requested_principal: { kind: string };
        execution_principal: { kind: string };
        capability: string;
        reason_code: string;
        approval_token_id: string;
      };
    };
    expect(state.status).toBe("applied");
    expect(state.authorization).toMatchObject({
      requested_principal: { kind: "build_agent" },
      execution_principal: { kind: "framework_system" },
      capability: "definition:apply",
      reason_code: "allowed",
    });
    expect(state.authorization.approval_token_id).toStartWith("approval-");
    expect(stats.postCount).toBe(1);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply approval gate discloses add_operation impact before mutation", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-operation-approval-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string; detail: Record<string, unknown> } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.apply", {
      require_approval: true,
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
      name: "List bookmark URLs",
      handler: { kind: "query", on: "bookmarks", fields: ["url"] },
    });

    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.prompt.tool).toBe("definition.apply");
    expect(prompts[0]!.prompt.detail.operation_id).toBe("add_operation");
    expect(prompts[0]!.prompt.detail.change).toMatchObject({
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
    });
    expect(prompts[0]!.prompt.detail.impact).toMatchObject({
      added_operations: [{
        operation_id: "list_bookmark_urls",
        action: "read",
        handler_kind: "query",
      }],
    });
    expect(stats.postCount).toBe(0);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      approval: { required: boolean; decision: string };
      diff: { added_operations: Array<{ operation_id: string }> };
    };
    expect(state.status).toBe("applied");
    expect(state.approval).toMatchObject({ required: true, decision: "allow" });
    expect(state.diff.added_operations).toEqual([{ operation_id: "list_bookmark_urls", action: "read", handler_kind: "query" }]);
    expect(stats.postCount).toBe(1);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply approval gate denies without mutating definition storage", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-approval-deny-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string } }> = [];
    const responses: Array<{ id: string; tool: string; decision: "allow" | "deny" | "allow-always" }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));
    orch.setPermissionResponseHook((event) => responses.push(event));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.apply", {
      require_approval: true,
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    });

    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(stats.postCount).toBe(0);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "deny")).toBe(true);
    expect(responses).toEqual([
      {
        id: prompts[0]!.prompt.id,
        tool: "definition.apply",
        decision: "deny",
      },
    ]);

    const result = await pending;
    expect(result.ok).toBe(false);
    const state = result.state as { status: string; approval: { decision: string }; timeline: Array<{ phase: string }> };
    expect(state.status).toBe("denied");
    expect(state.approval.decision).toBe("deny");
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "awaiting-approval",
      "denied",
    ]);
    expect(stats.postCount).toBe(0);
    expect(stats.columns.map((c) => c.name)).toEqual(["url"]);
    expect(orch.state.dev?.state).toBe("running");

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply approval records durable permission request, response, and completion", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-ledger-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const permissionLedger = new InMemoryPermissionLedgerStore();
    orch.setPermissionLedger({
      ledger: permissionLedger,
      appId: "fixture-min",
      workspaceId: ws,
      getRequestedPrincipal: () => ({
        kind: "build_agent",
        id: "opencode",
        acting_for: { kind: "builder", id: "builder:default" },
      }),
    });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
      require_approval: true,
    });

    for (let i = 0; i < 50; i += 1) {
      if (prompts.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(permissionLedger.getRequest(prompts[0]!.prompt.id, {
      livePromptIds: orch.liveFrameworkPermissionPromptIds(),
    })).toMatchObject({
      status: "pending",
      live: true,
      capability: "definition:apply",
      target: {
        kind: "definition",
        id: "definition.apply:add_table_column:bookmarks:tags",
        fingerprint: "definition.apply:add_table_column:bookmarks:tags",
      },
    });

    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(permissionLedger.getRequest(prompts[0]!.prompt.id)).toMatchObject({
      status: "completed",
      live: false,
      decision: "allow",
      capability: "definition:apply",
      target: {
        kind: "definition",
        id: "definition.apply:add_table_column:bookmarks:tags",
        fingerprint: "definition.apply:add_table_column:bookmarks:tags",
      },
    });

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply policy rule approval records policy mutation ledger metadata", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-policy-ledger-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const permissionLedger = new InMemoryPermissionLedgerStore();
    orch.setPermissionLedger({ ledger: permissionLedger, appId: "fixture-min", workspaceId: ws });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.apply", {
      kind: "add_policy_rule",
      rule_id: "reviewers-can-read-review-queue",
      allow: [{ kind: "role", name: "reviewer" }],
      actions: ["read"],
      resource: { kind: "view", id: "review_queue" },
      require_approval: true,
    });

    for (let i = 0; i < 50; i += 1) {
      if (prompts.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(permissionLedger.getRequest(prompts[0]!.prompt.id, {
      livePromptIds: orch.liveFrameworkPermissionPromptIds(),
    })).toMatchObject({
      status: "pending",
      capability: "policy:mutate",
      target: {
        kind: "policy_rule",
        id: "reviewers-can-read-review-queue",
        fingerprint: "policy_rule:reviewers-can-read-review-queue",
      },
    });

    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(permissionLedger.getRequest(prompts[0]!.prompt.id)).toMatchObject({
      status: "completed",
      decision: "allow",
      capability: "policy:mutate",
      target: {
        kind: "policy_rule",
        id: "reviewers-can-read-review-queue",
        fingerprint: "policy_rule:reviewers-can-read-review-queue",
      },
    });

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply denial records response without completion", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-ledger-deny-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const permissionLedger = new InMemoryPermissionLedgerStore();
    orch.setPermissionLedger({ ledger: permissionLedger, appId: "fixture-min", workspaceId: ws });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
      require_approval: true,
    });

    for (let i = 0; i < 50; i += 1) {
      if (prompts.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "deny")).toBe(true);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(permissionLedger.getRequest(prompts[0]!.prompt.id)).toMatchObject({
      status: "denied",
      decision: "deny",
    });

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply fails closed when required approval request cannot be recorded", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-ledger-fail-closed-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    orch.setPermissionLedger({
      ledger: {
        append() { throw new Error("ledger unavailable"); },
        list() { return []; },
        listRequests() { return []; },
        getRequest() { return undefined; },
      },
      appId: "fixture-min",
      workspaceId: ws,
    });
    const prompts: Array<unknown> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    const running = orch.runDev();
    await orch.awaitDevReady();
    await expect(orch.runDefinitionApply({
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    }, { requireApproval: true })).rejects.toThrow(/ledger unavailable/);
    expect(prompts).toHaveLength(0);
    expect(orch.state.definitionApply).toMatchObject({
      status: "failed",
      phase: "failed",
      failure: { category: "approval_unavailable" },
    });

    const recovery = await orch.runDefinitionApply({
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    });
    expect(recovery.status).toBe("applied");

    await orch.runStop();
    await running;
  });
});

test("definition.apply clears live approval prompt state when prompt broadcast throws", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-prompt-throws-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const permissionLedger = new InMemoryPermissionLedgerStore();
    orch.setPermissionLedger({ ledger: permissionLedger, appId: "fixture-min", workspaceId: ws });
    orch.setPermissionPromptPushHook(() => {
      throw new Error("prompt broadcast unavailable");
    });

    const running = orch.runDev();
    await orch.awaitDevReady();
    await expect(orch.runDefinitionApply({
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    }, { requireApproval: true })).rejects.toThrow(/prompt broadcast unavailable/);
    expect([...orch.liveFrameworkPermissionPromptIds()]).toEqual([]);
    expect(permissionLedger.listRequests()).toHaveLength(1);
    expect(permissionLedger.listRequests()[0]).toMatchObject({
      status: "failed",
      live: false,
      message: "prompt broadcast unavailable",
    });
    expect(orch.state.definitionApply).toMatchObject({
      status: "failed",
      phase: "failed",
      failure: { category: "approval_unavailable" },
    });
    await orch.runStop();
    await running;
  });
});

test("definition.rollback.prepare resolves ledger request when prompt broadcast throws", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-prompt-throws-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const permissionLedger = new InMemoryPermissionLedgerStore();
    orch.setPermissionLedger({ ledger: permissionLedger, appId: "fixture-min", workspaceId: ws });
    orch.setPermissionPromptPushHook(() => {
      throw new Error("rollback prompt broadcast unavailable");
    });

    const running = orch.runDev();
    await orch.awaitDevReady();
    await expect(orch.runDefinitionRollbackPrepare(
      { target_history_version: 0 },
      { requireApproval: true },
    )).rejects.toThrow(/rollback prompt broadcast unavailable/);
    expect([...orch.liveFrameworkPermissionPromptIds()]).toEqual([]);
    expect(permissionLedger.listRequests()).toHaveLength(1);
    expect(permissionLedger.listRequests()[0]).toMatchObject({
      status: "failed",
      live: false,
      message: "rollback prompt broadcast unavailable",
    });
    expect(orch.state.definitionRollbackPrepare).toMatchObject({
      status: "failed",
      phase: "failed",
      failure: { category: "approval_unavailable" },
    });
    await orch.runStop();
    await running;
  });
});

test("definition.apply records one metadata-rich execution failure after approval", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-ledger-exec-fail-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const permissionLedger = new InMemoryPermissionLedgerStore();
    orch.setPermissionLedger({ ledger: permissionLedger, appId: "fixture-min", workspaceId: ws });
    const prompts: Array<{ prompt: { id: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    const running = orch.runDev();
    await orch.awaitDevReady();
    const pending = orch.runDefinitionApply({
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    }, { requireApproval: true });

    for (let i = 0; i < 50; i += 1) {
      if (prompts.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);
    await expect(pending).rejects.toBeInstanceOf(DefinitionApplyError);

    const failureEvents = permissionLedger.list().filter((event) => event.event_type === "permission_execution_failed");
    expect(failureEvents).toHaveLength(1);
    expect(failureEvents[0]).toMatchObject({
      prompt_id: prompts[0]!.prompt.id,
      tool: "definition.apply",
      capability: "definition:apply",
      target: { kind: "definition" },
    });

    await orch.runStop();
    await running;
  }, "operation-fails");
});

test("definition.rollback.prepare approval records durable permission request, response, and completion", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-ledger-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const permissionLedger = new InMemoryPermissionLedgerStore();
    orch.setPermissionLedger({ ledger: permissionLedger, appId: "fixture-min", workspaceId: ws });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.rollback.prepare", { target_history_version: 0 });

    for (let i = 0; i < 50; i += 1) {
      if (prompts.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(permissionLedger.getRequest(prompts[0]!.prompt.id, {
      livePromptIds: orch.liveFrameworkPermissionPromptIds(),
    })).toMatchObject({ status: "pending", live: true });

    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(permissionLedger.getRequest(prompts[0]!.prompt.id)).toMatchObject({
      status: "completed",
      decision: "allow",
      capability: "definition:rollback:execute",
      target: { kind: "rollback_target", id: "definition.rollback:0" },
    });

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.rollback.prepare public options cannot defer ledger completion", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-public-options-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const permissionLedger = new InMemoryPermissionLedgerStore();
    orch.setPermissionLedger({ ledger: permissionLedger, appId: "fixture-min", workspaceId: ws });
    const prompts: Array<{ prompt: { id: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    const running = orch.runDev();
    await orch.awaitDevReady();
    const pending = orch.runDefinitionRollbackPrepare(
      { target_history_version: 0 },
      { requireApproval: true, deferPermissionLedgerCompletion: true } as any,
    );
    for (let i = 0; i < 50; i += 1) {
      if (prompts.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);

    const result = await pending;
    expect(result.status).toBe("ready_to_execute");
    expect(permissionLedger.getRequest(prompts[0]!.prompt.id)).toMatchObject({
      status: "completed",
      decision: "allow",
    });

    await orch.runStop();
    await running;
  });
});

test("definition.rollback.execute approval records durable permission ledger chain", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-execute-ledger-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const permissionLedger = new InMemoryPermissionLedgerStore();
    orch.setPermissionLedger({ ledger: permissionLedger, appId: "fixture-min", workspaceId: ws });
    const setupReg = createToolRegistry({ orchestrator: orch });
    registerActionTools(setupReg);
    const reg = createToolRegistry({
      orchestrator: orch,
      authorizationKernel: new AuthorizationKernel(),
      approvalTokens: new InMemoryApprovalTokenStore(),
      permissionLedger,
      principal: defaultToolPrincipal(),
      appId: "fixture-min",
      workspaceId: ws,
    });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await setupReg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await setupReg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    })).ok).toBe(true);
    expect(stats.tables.map((t) => t.id)).toContain("notes");

    const pending = reg.call("definition.rollback.execute", {
      target_history_version: 0,
      require_approval: true,
    });
    for (let i = 0; i < 50; i += 1) {
      if (prompts.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.prompt.tool).toBe("definition.rollback.validate");
    expect(permissionLedger.getRequest(prompts[0]!.prompt.id, {
      livePromptIds: orch.liveFrameworkPermissionPromptIds(),
    })).toMatchObject({ status: "pending", live: true });

    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);
    const result = await pending;
    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      authorization: {
        approval_token_id: string;
        capability: string;
        reason_code: string;
      };
    };
    expect(state.status).toBe("rolled_back");
    expect(state.authorization).toMatchObject({
      capability: "definition:rollback:execute",
      reason_code: "allowed",
    });
    expect(state.authorization.approval_token_id).toStartWith("approval-");
    expect(permissionLedger.getRequest(prompts[0]!.prompt.id)).toMatchObject({
      status: "completed",
      decision: "allow",
      authorization_reason_code: "allowed",
      capability: "definition:rollback:execute",
      target: { kind: "rollback_target", id: "definition.rollback:0" },
    });
    const eventsForPrompt = permissionLedger.list().filter((event) => event.prompt_id === prompts[0]!.prompt.id);
    expect(eventsForPrompt.map((event) => event.event_type)).toEqual([
      "permission_requested",
      "permission_responded",
      "approval_token_issued",
      "permission_execution_authorized",
      "permission_execution_completed",
    ]);
    expect(eventsForPrompt.find((event) => event.event_type === "approval_token_issued")).toMatchObject({
      approval_token_hash: expect.any(String),
      approved_capability: "definition:rollback:execute",
    });
    expect(JSON.stringify(eventsForPrompt)).not.toContain(state.authorization.approval_token_id);
    expect(stats.rollbackExecuteCount).toBe(1);

    await reg.call("lifecycle.dev.stop", {});
  }, "rollback-table-only");
});

test("definition.rollback.execute approval records one terminal failure ledger event", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-execute-ledger-fail-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const permissionLedger = new InMemoryPermissionLedgerStore();
    orch.setPermissionLedger({ ledger: permissionLedger, appId: "fixture-min", workspaceId: ws });
    const reg = createToolRegistry({
      orchestrator: orch,
      authorizationKernel: new AuthorizationKernel(),
      approvalTokens: new InMemoryApprovalTokenStore(),
      permissionLedger,
      principal: defaultToolPrincipal(),
      appId: "fixture-min",
      workspaceId: ws,
    });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.rollback.execute", {
      target_history_version: 0,
      require_approval: true,
    });
    for (let i = 0; i < 50; i += 1) {
      if (prompts.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("definition.rollback.execute returned HTTP 500");
    const failureEvents = permissionLedger.list().filter((event) =>
      event.prompt_id === prompts[0]!.prompt.id && event.event_type === "permission_execution_failed"
    );
    expect(failureEvents).toHaveLength(1);
    expect(failureEvents[0]).toMatchObject({
      tool: "definition.rollback.execute",
      capability: "definition:rollback:execute",
      target: { kind: "rollback_target", id: "definition.rollback:0" },
    });
    expect(failureEvents[0].message).toContain("definition.rollback.execute returned HTTP 500");
    const request = permissionLedger.getRequest(prompts[0]!.prompt.id);
    expect(request).toMatchObject({
      status: "failed",
      decision: "allow",
    });
    expect(stats.rollbackExecuteCount).toBe(1);

    await reg.call("lifecycle.dev.stop", {});
  }, "rollback-execute-fails");
});

test("definition.rollback.prepare validates rollback impact and reaches ready_to_execute after approval", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-prepare-allow-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string; detail: Record<string, unknown> } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const beforePid = orch.state.dev?.pid;
    const pending = reg.call("definition.rollback.prepare", { target_history_version: 0 });

    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.prompt.tool).toBe("definition.rollback.validate");
    expect(prompts[0]!.prompt.detail.target_history_version).toBe(0);
    expect(prompts[0]!.prompt.detail.impact).toMatchObject({
      removed_tables: [{ table_id: "notes", row_count: 1, columns: ["title"] }],
      removed_columns: [{ table_id: "bookmarks", column_name: "tags", affected_row_count: 1 }],
    });
    expect(stats.rollbackValidateCount).toBe(1);
    expect(stats.lastOperationUserId).toBe("framework");
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      operation_id: string;
      destructive: boolean;
      requires_approval: boolean;
      approval: { required: boolean; decision: string };
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("ready_to_execute");
    expect(state.operation_id).toBe("definition.rollback.validate");
    expect(state.destructive).toBe(true);
    expect(state.requires_approval).toBe(true);
    expect(state.approval).toMatchObject({ required: true, decision: "allow" });
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "awaiting-approval",
      "ready-to-execute",
    ]);
    expect(orch.state.dev?.pid).toBe(beforePid);
    expect(orch.state.definitionRollbackPrepare?.status).toBe("ready_to_execute");

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.rollback.prepare denial stops before ready_to_execute", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-prepare-deny-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.rollback.prepare", { target_history_version: 0 });

    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "deny")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(false);
    const state = result.state as {
      status: string;
      approval: { decision: string };
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("denied");
    expect(state.approval.decision).toBe("deny");
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "awaiting-approval",
      "denied",
    ]);
    expect(stats.rollbackValidateCount).toBe(1);
    expect(orch.state.dev?.state).toBe("running");

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.rollback.prepare reports approval_unavailable when destructive validation has no prompt hook", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-prepare-no-hook-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const result = await reg.call("definition.rollback.prepare", { target_history_version: 0 });

    expect(result.ok).toBe(false);
    const state = result.state as { failure: { category: string }; timeline: Array<{ phase: string }> };
    expect(state.failure.category).toBe("approval_unavailable");
    expect(state.timeline.map((e) => e.phase)).toEqual(["validating", "awaiting-approval"]);
    expect(stats.rollbackValidateCount).toBe(1);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.rollback.prepare can bypass approval and still does not restart dev", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-prepare-no-approval-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<unknown> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const beforePid = orch.state.dev?.pid;
    const result = await reg.call("definition.rollback.prepare", {
      target_history_version: 0,
      require_approval: false,
    });

    expect(result.ok).toBe(true);
    const state = result.state as { status: string; approval: { required: boolean }; timeline: Array<{ phase: string }> };
    expect(state.status).toBe("ready_to_execute");
    expect(state.approval.required).toBe(false);
    expect(state.timeline.map((e) => e.phase)).toEqual(["validating", "ready-to-execute"]);
    expect(prompts).toHaveLength(0);
    expect(stats.rollbackValidateCount).toBe(1);
    expect(orch.state.dev?.pid).toBe(beforePid);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.rollback.execute prepares, executes table rollback, restarts, and verifies schema", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-execute-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string; detail: Record<string, unknown> } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    })).ok).toBe(true);
    expect(stats.tables.map((t) => t.id)).toContain("notes");

    const pending = reg.call("definition.rollback.execute", { target_history_version: 0 });
    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.prompt.tool).toBe("definition.rollback.validate");
    expect(prompts[0]!.prompt.detail.impact).toMatchObject({
      removed_tables: [{ table_id: "notes", row_count: 1, columns: ["title"] }],
      removed_columns: [],
    });
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      operation_id: string;
      diff: { removed_tables: string[] };
      operation_output: { status: string; backup_history_version: number; rollback_history_version: number };
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("rolled_back");
    expect(state.operation_id).toBe("definition.rollback.execute");
    expect(state.diff.removed_tables).toEqual(["notes"]);
    expect(state.operation_output).toMatchObject({
      status: "rolled_back",
      backup_history_version: 3,
      rollback_history_version: 4,
    });
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "preparing",
      "executing-rollback",
      "stopping-after-rollback",
      "starting-after-rollback",
      "refreshing-definition",
      "running",
    ]);
    expect(stats.rollbackValidateCount).toBe(1);
    expect(stats.rollbackExecuteCount).toBe(1);
    expect(stats.tables.map((t) => t.id)).not.toContain("notes");
    expect(orch.state.dev?.state).toBe("running");
    expect(orch.state.dev?.tables?.map((t) => t.id)).not.toContain("notes");
    expect(orch.state.definitionRollbackExecute?.status).toBe("rolled_back");

    await reg.call("lifecycle.dev.stop", {});
  }, "rollback-table-only");
});

test("definition.rollback.execute prepares, executes column rollback, restarts, and verifies schema", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-execute-column-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    })).ok).toBe(true);
    expect(stats.columns.map((column) => column.name)).toContain("tags");

    const result = await reg.call("definition.rollback.execute", {
      target_history_version: 0,
      require_approval: false,
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      diff: {
        removed_tables: string[];
        removed_columns: Array<{ table_id: string; column_name: string }>;
      };
      operation_output: {
        status: string;
        cleaned_columns: Array<{ table_id: string; column_name: string; row_ids: string[] }>;
        deleted_definition_rows: { pneuma_tables: string[]; pneuma_table_columns: string[]; pneuma_operations: string[] };
      };
      timeline: Array<{ phase: string; detail?: Record<string, unknown> }>;
    };
    expect(state.status).toBe("rolled_back");
    expect(state.diff.removed_tables).toEqual([]);
    expect(state.diff.removed_columns).toEqual([{ table_id: "bookmarks", column_name: "tags" }]);
    expect(state.operation_output.cleaned_columns).toEqual([
      { table_id: "bookmarks", column_name: "tags", row_ids: ["bookmark-1"] },
    ]);
    expect(state.operation_output.deleted_definition_rows).toEqual({
      pneuma_tables: [],
      pneuma_table_columns: ["ptc-tags"],
      pneuma_operations: [],
    });
    expect(state.timeline.find((entry) => entry.phase === "executing-rollback")?.detail).toMatchObject({
      expected_removed_tables: [],
      expected_removed_columns: [{ table_id: "bookmarks", column_name: "tags" }],
    });
    expect(stats.rollbackValidateCount).toBe(1);
    expect(stats.rollbackExecuteCount).toBe(1);
    expect(stats.columns.map((column) => column.name)).not.toContain("tags");
    expect(orch.state.dev?.state).toBe("running");
    expect(orch.state.dev?.tables?.find((table) => table.id === "bookmarks")?.columns.map((column) => column.name))
      .toEqual(["url"]);

    await reg.call("lifecycle.dev.stop", {});
  }, "rollback-column");
});

test("definition.rollback.execute removes an overlay operation and verifies config", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-execute-operation-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
      name: "List bookmark URLs",
      handler: { kind: "query", on: "bookmarks", fields: ["url"] },
    })).ok).toBe(true);
    expect(stats.operations.map((operation) => operation.id)).toContain("list_bookmark_urls");

    const result = await reg.call("definition.rollback.execute", {
      target_history_version: 0,
      require_approval: false,
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      diff: {
        removed_tables: string[];
        removed_columns: Array<{ table_id: string; column_name: string }>;
        removed_operations: string[];
      };
      operation_output: {
        status: string;
        deleted_definition_rows: { pneuma_tables: string[]; pneuma_table_columns: string[]; pneuma_operations: string[] };
      };
      timeline: Array<{ phase: string; detail?: Record<string, unknown> }>;
    };
    expect(state.status).toBe("rolled_back");
    expect(state.diff.removed_tables).toEqual([]);
    expect(state.diff.removed_columns).toEqual([]);
    expect(state.diff.removed_operations).toEqual(["list_bookmark_urls"]);
    expect(state.operation_output.deleted_definition_rows).toEqual({
      pneuma_tables: [],
      pneuma_table_columns: [],
      pneuma_operations: ["po-list_bookmark_urls"],
    });
    expect(state.timeline.find((entry) => entry.phase === "executing-rollback")?.detail).toMatchObject({
      expected_removed_operations: ["list_bookmark_urls"],
    });
    expect(stats.rollbackValidateCount).toBe(1);
    expect(stats.rollbackExecuteCount).toBe(1);
    expect(stats.operations.map((operation) => operation.id)).not.toContain("list_bookmark_urls");
    expect(orch.state.dev?.state).toBe("running");
    expect(orch.state.dev?.operations?.map((operation) => operation.id)).not.toContain("list_bookmark_urls");

    await reg.call("lifecycle.dev.stop", {});
  }, "rollback-operation");
});

test("definition.rollback.execute verification failure marks dirty and blocks later definition.apply", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-dirty-block-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    })).ok).toBe(true);

    const rollback = await reg.call("definition.rollback.execute", {
      target_history_version: 0,
      require_approval: false,
    });
    expect(rollback.ok).toBe(false);
    expect((rollback.state as { failure: { category: string } }).failure.category).toBe("verification_failed");

    const status = await reg.call("definition.repair.status", {});
    expect(status.state).toMatchObject({
      status: "dirty",
      guard: {
        operation_id: "definition.rollback.execute",
        target: "history:0",
        status: "dirty",
        error: { code: "verification_failed" },
      },
    });

    const postCountAfterDirty = stats.postCount;
    const blocked = await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    });
    expect(blocked.ok).toBe(false);
    expect((blocked.state as { failure: { category: string } }).failure.category).toBe("dirty_definition_state");
    expect(stats.postCount).toBe(postCountAfterDirty);

    await reg.call("lifecycle.dev.stop", {});
  }, "rollback-no-schema-change");
});

test("definition.rollback.execute denial stops before destructive runtime call", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-execute-deny-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.rollback.execute", { target_history_version: 0 });
    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "deny")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(false);
    const state = result.state as { status: string; timeline: Array<{ phase: string }> };
    expect(state.status).toBe("denied");
    expect(state.timeline.map((e) => e.phase)).toEqual(["preparing", "denied"]);
    expect(stats.rollbackValidateCount).toBe(1);
    expect(stats.rollbackExecuteCount).toBe(0);

    await reg.call("lifecycle.dev.stop", {});
  }, "rollback-table-only");
});

test("definition.apply validates the current MVP change shape before invoking lifecycle", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-invalid-"));
  const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws });
  const reg = createToolRegistry({ orchestrator: orch });
  registerActionTools(reg);

  const result = await reg.call("definition.apply", {
    kind: "add_table_column",
    table_id: "bookmarks",
    column_name: "tags",
  });

  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/cell_type/i);
});
