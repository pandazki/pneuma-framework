import {
  DefinitionApplyError,
  DefinitionRollbackExecuteError,
  DefinitionRollbackPrepareError,
  type DefinitionApplyChange,
  type DefinitionApplyOptions,
  type DefinitionRollbackExecuteOptions,
  type DefinitionRollbackPrepareOptions,
  type LifecycleOrchestrator,
} from "../lifecycle.js";
import type {
  AuthorizationDecision,
  AuthorizationTarget,
  Capability,
  Principal,
} from "@pneuma-framework/core-domain";
import type { ToolContext, ToolRegistry, ToolResult } from "./types.js";
import {
  buildToolAuthorizationContext,
  defaultToolPrincipal,
  definitionApplyTarget,
  definitionRollbackTarget,
} from "./authorization-context.js";

const READY = Symbol("ready");
const EXITED = Symbol("exited");

type ParsedDefinitionApplyChange =
  | { ok: true; change: DefinitionApplyChange; options: DefinitionApplyOptions }
  | { ok: false; error: string };

type ParsedDefinitionRollbackPrepare =
  | { ok: true; target_history_version: number; options: DefinitionRollbackPrepareOptions }
  | { ok: false; error: string };

type ParsedDefinitionRollbackExecute =
  | { ok: true; target_history_version: number; options: DefinitionRollbackExecuteOptions }
  | { ok: false; error: string };

function parseDefinitionApplyChange(params: Record<string, unknown>): ParsedDefinitionApplyChange {
  if (params.approval_token_id !== undefined && typeof params.approval_token_id !== "string") {
    return { ok: false, error: "definition.apply approval_token_id must be a string when provided" };
  }
  if (
    params.kind !== "add_table"
    && params.kind !== "add_table_column"
    && params.kind !== "add_operation"
    && params.kind !== "add_view"
    && params.kind !== "add_policy_rule"
  ) {
    return { ok: false, error: "definition.apply currently supports kind='add_table', kind='add_table_column', kind='add_operation', kind='add_view', or kind='add_policy_rule'" };
  }
  if (params.mode !== undefined && params.mode !== "apply" && params.mode !== "validate") {
    return { ok: false, error: "definition.apply mode must be 'apply' or 'validate' when provided" };
  }
  if (params.require_approval !== undefined && typeof params.require_approval !== "boolean") {
    return { ok: false, error: "definition.apply require_approval must be a boolean when provided" };
  }
  if (params.kind === "add_operation") {
    if (typeof params.operation_id !== "string" || params.operation_id.length === 0) {
      return { ok: false, error: "definition.apply add_operation requires a non-empty operation_id" };
    }
    if (typeof params.handler !== "object" || params.handler === null || Array.isArray(params.handler)) {
      return { ok: false, error: "definition.apply add_operation requires handler to be an object" };
    }
    return {
      ok: true,
      change: {
        kind: "add_operation",
        operation_id: params.operation_id,
        name: typeof params.name === "string" ? params.name : undefined,
        description: typeof params.description === "string" ? params.description : undefined,
        input: params.input,
        output: params.output,
        handler: params.handler,
        ui_binding: params.ui_binding,
        agent_tool: params.agent_tool,
        surface: params.surface,
      },
      options: {
        mode: params.mode === "validate" ? "validate" : "apply",
        requireApproval: params.require_approval === true,
      },
    };
  }
  if (params.kind === "add_view") {
    if (typeof params.view_id !== "string" || params.view_id.length === 0) {
      return { ok: false, error: "definition.apply add_view requires a non-empty view_id" };
    }
    if (
      params.view_kind !== "table"
      && params.view_kind !== "list"
      && params.view_kind !== "detail"
      && params.view_kind !== "custom"
    ) {
      return { ok: false, error: "definition.apply add_view requires view_kind to be table, list, detail, or custom" };
    }
    if (typeof params.source !== "object" || params.source === null || Array.isArray(params.source)) {
      return { ok: false, error: "definition.apply add_view requires source to be an object" };
    }
    if (
      params.presentation !== undefined
      && (typeof params.presentation !== "object" || params.presentation === null || Array.isArray(params.presentation))
    ) {
      return { ok: false, error: "definition.apply add_view presentation must be an object when provided" };
    }
    return {
      ok: true,
      change: {
        kind: "add_view",
        view_id: params.view_id,
        name: typeof params.name === "string" ? params.name : undefined,
        description: typeof params.description === "string" ? params.description : undefined,
        view_kind: params.view_kind,
        source: params.source,
        presentation: params.presentation,
      },
      options: {
        mode: params.mode === "validate" ? "validate" : "apply",
        requireApproval: params.require_approval === true,
      },
    };
  }
  if (params.kind === "add_policy_rule") {
    if (typeof params.rule_id !== "string" || params.rule_id.length === 0) {
      return { ok: false, error: "definition.apply add_policy_rule requires a non-empty rule_id" };
    }
    if (!Array.isArray(params.allow)) {
      return { ok: false, error: "definition.apply add_policy_rule requires allow to be an array" };
    }
    if (!Array.isArray(params.actions) || !params.actions.every((action) => typeof action === "string")) {
      return { ok: false, error: "definition.apply add_policy_rule requires actions to be an array of strings" };
    }
    if (typeof params.resource !== "object" || params.resource === null || Array.isArray(params.resource)) {
      return { ok: false, error: "definition.apply add_policy_rule requires resource to be an object" };
    }
    if (
      params.when !== undefined
      && (typeof params.when !== "object" || params.when === null || Array.isArray(params.when))
    ) {
      return { ok: false, error: "definition.apply add_policy_rule when must be an object when provided" };
    }
    return {
      ok: true,
      change: {
        kind: "add_policy_rule",
        rule_id: params.rule_id,
        allow: params.allow,
        actions: params.actions as string[],
        resource: params.resource,
        when: params.when,
      },
      options: {
        mode: params.mode === "validate" ? "validate" : "apply",
        requireApproval: params.require_approval === true,
      },
    };
  }
  if (typeof params.table_id !== "string" || params.table_id.length === 0) {
    return { ok: false, error: "definition.apply requires a non-empty table_id" };
  }
  if (params.kind === "add_table") {
    if (params.columns !== undefined && !Array.isArray(params.columns)) {
      return { ok: false, error: "definition.apply columns must be an array when provided" };
    }
    return {
      ok: true,
      change: {
        kind: "add_table",
        table_id: params.table_id,
        columns: params.columns as unknown[] | undefined,
      },
      options: {
        mode: params.mode === "validate" ? "validate" : "apply",
        requireApproval: params.require_approval === true,
      },
    };
  }
  if (typeof params.column_name !== "string" || params.column_name.length === 0) {
    return { ok: false, error: "definition.apply requires a non-empty column_name" };
  }
  if (
    typeof params.cell_type !== "object"
    || params.cell_type === null
    || Array.isArray(params.cell_type)
  ) {
    return { ok: false, error: "definition.apply requires cell_type to be an object" };
  }
  if (params.nullable !== undefined && typeof params.nullable !== "boolean") {
    return { ok: false, error: "definition.apply nullable must be a boolean when provided" };
  }
  return {
    ok: true,
    change: {
      kind: "add_table_column",
      table_id: params.table_id,
      column_name: params.column_name,
      cell_type: params.cell_type,
      nullable: params.nullable,
      default_value: params.default_value,
    },
    options: {
      mode: params.mode === "validate" ? "validate" : "apply",
      requireApproval: params.require_approval === true,
    },
  };
}

function parseDefinitionRollbackPrepare(params: Record<string, unknown>): ParsedDefinitionRollbackPrepare {
  if (!Number.isInteger(params.target_history_version) || (params.target_history_version as number) < 0) {
    return {
      ok: false,
      error: "definition.rollback.prepare requires a non-negative integer target_history_version",
    };
  }
  if (params.require_approval !== undefined && typeof params.require_approval !== "boolean") {
    return {
      ok: false,
      error: "definition.rollback.prepare require_approval must be a boolean when provided",
    };
  }
  return {
    ok: true,
    target_history_version: params.target_history_version as number,
    options: { requireApproval: params.require_approval as boolean | undefined },
  };
}

function parseDefinitionRollbackExecute(params: Record<string, unknown>): ParsedDefinitionRollbackExecute {
  if (!Number.isInteger(params.target_history_version) || (params.target_history_version as number) < 0) {
    return {
      ok: false,
      error: "definition.rollback.execute requires a non-negative integer target_history_version",
    };
  }
  if (params.require_approval !== undefined && typeof params.require_approval !== "boolean") {
    return {
      ok: false,
      error: "definition.rollback.execute require_approval must be a boolean when provided",
    };
  }
  if (params.approval_token_id !== undefined && typeof params.approval_token_id !== "string") {
    return {
      ok: false,
      error: "definition.rollback.execute approval_token_id must be a string when provided",
    };
  }
  return {
    ok: true,
    target_history_version: params.target_history_version as number,
    options: { requireApproval: params.require_approval as boolean | undefined },
  };
}

function definitionApplyFailureResult(err: DefinitionApplyError): ToolResult {
  return {
    ok: false,
    error: err.message,
    state: {
      status: "failed",
      change_id: err.change_id,
      failure: {
        category: err.category,
        message: err.message,
      },
      timeline: err.timeline,
    },
  };
}

function definitionRollbackPrepareFailureResult(err: DefinitionRollbackPrepareError): ToolResult {
  return {
    ok: false,
    error: err.message,
    state: {
      status: "failed",
      rollback_id: err.rollback_id,
      target_history_version: err.target_history_version,
      failure: {
        category: err.category,
        message: err.message,
      },
      timeline: err.timeline,
    },
  };
}

function definitionRollbackExecuteFailureResult(err: DefinitionRollbackExecuteError): ToolResult {
  return {
    ok: false,
    error: err.message,
    state: {
      status: "failed",
      rollback_id: err.rollback_id,
      target_history_version: err.target_history_version,
      failure: {
        category: err.category,
        message: err.message,
      },
      timeline: err.timeline,
    },
  };
}

type ToolAuthorizationResult =
  | { ok: true }
  | { ok: false; result: ToolResult };

function authorizeDefinitionApplyTool(
  ctx: ToolContext,
  params: Record<string, unknown>,
  change: DefinitionApplyChange,
  options: DefinitionApplyOptions,
): ToolAuthorizationResult {
  const mode = options.mode ?? "apply";
  if (mode === "validate") {
    return authorizeToolCapability(
      ctx,
      params,
      "definition.apply",
      change.kind === "add_policy_rule" ? "policy:propose" : "definition:propose",
      definitionApplyTarget(change),
    );
  }

  const principal = activePrincipal(ctx);
  if (principal.kind === "build_agent" && options.requireApproval === true) {
    return authorizeToolCapability(
      ctx,
      params,
      "definition.apply",
      change.kind === "add_policy_rule" ? "policy:propose" : "definition:propose",
      definitionApplyTarget(change),
    );
  }

  return authorizeToolCapability(
    ctx,
    params,
    "definition.apply",
    change.kind === "add_policy_rule" ? "policy:mutate" : "definition:apply",
    definitionApplyTarget(change),
  );
}

function authorizeRollbackPrepareTool(
  ctx: ToolContext,
  params: Record<string, unknown>,
  targetHistoryVersion: number,
): ToolAuthorizationResult {
  return authorizeToolCapability(
    ctx,
    params,
    "definition.rollback.prepare",
    "definition:rollback:validate",
    definitionRollbackTarget(targetHistoryVersion),
  );
}

function authorizeRollbackExecuteTool(
  ctx: ToolContext,
  params: Record<string, unknown>,
  targetHistoryVersion: number,
): ToolAuthorizationResult {
  return authorizeToolCapability(
    ctx,
    params,
    "definition.rollback.execute",
    "definition:rollback:execute",
    definitionRollbackTarget(targetHistoryVersion),
  );
}

function authorizeToolCapability(
  ctx: ToolContext,
  params: Record<string, unknown>,
  tool: string,
  capability: Capability,
  target: AuthorizationTarget,
): ToolAuthorizationResult {
  if (!ctx.authorizationKernel) return { ok: true };

  const principal = activePrincipal(ctx);
  const decision = ctx.authorizationKernel.authorize(principal, capability, buildToolAuthorizationContext({
    app_id: ctx.appId,
    workspace_id: ctx.workspaceId ?? ctx.orchestrator.workspace,
    target,
    approval_token: approvalTokenForAuthorization(ctx, params, principal),
  }));
  if (decision.decision === "allow" || decision.decision === "defer") return { ok: true };
  return { ok: false, result: authorizationDeniedResult(tool, decision) };
}

function activePrincipal(ctx: ToolContext): Principal {
  return ctx.principal ?? defaultToolPrincipal();
}

function approvalTokenForAuthorization(
  ctx: ToolContext,
  params: Record<string, unknown>,
  principal: Principal,
) {
  const id = params.approval_token_id;
  if (typeof id !== "string") return undefined;
  if (principal.kind === "framework_system") return ctx.approvalTokens?.consume(id);
  return ctx.approvalTokens?.peek(id);
}

function authorizationDeniedResult(tool: string, decision: AuthorizationDecision): ToolResult {
  return {
    ok: false,
    error: `${tool} denied by authorization`,
    state: { authorization: decision },
  };
}

async function startDevAwaitReady(orch: LifecycleOrchestrator, port: number | undefined): Promise<ToolResult> {
  if (orch.state.dev && orch.state.dev.state === "running") {
    return { ok: false, error: "dev is already running; call lifecycle.dev.stop or lifecycle.dev.restart first" };
  }
  const running = orch.runDev(port);
  // runDev resolves on dev EXIT. Race ready-vs-exit so an early crash surfaces as
  // an actionable error instead of hanging on awaitDevReady forever.
  const first = await Promise.race([
    orch.awaitDevReady().then(() => READY),
    running.then(() => EXITED),
  ]);
  if (first === EXITED) {
    const code = orch.state.dev?.exitCode ?? -1;
    return { ok: false, error: `dev exited before ready (exit code ${code})` };
  }
  return { ok: true, state: orch.state.dev };
}

export function registerActionTools(reg: ToolRegistry): void {
  reg.register(
    {
      name: "definition.apply",
      description: "Apply an app-definition change through the running dev service, restart dev, and return the before/after definition diff.",
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["add_table", "add_table_column", "add_operation", "add_view", "add_policy_rule"] },
          table_id: { type: "string" },
          operation_id: { type: "string" },
          view_id: { type: "string" },
          rule_id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          view_kind: { type: "string", enum: ["table", "list", "detail", "custom"] },
          columns: { type: "array" },
          column_name: { type: "string" },
          cell_type: { type: "object" },
          input: { type: "object" },
          output: { type: "object" },
          handler: { type: "object" },
          source: { type: "object" },
          allow: { type: "array" },
          actions: { type: "array", items: { type: "string" } },
          resource: { type: "object" },
          when: { type: "object" },
          ui_binding: { type: "object" },
          agent_tool: { type: "object" },
          presentation: { type: "object" },
          nullable: { type: "boolean" },
          default_value: {},
          mode: { type: "string", enum: ["apply", "validate"] },
          require_approval: { type: "boolean" },
          approval_token_id: { type: "string" },
        },
        required: ["kind"],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const parsed = parseDefinitionApplyChange(params);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const authorization = authorizeDefinitionApplyTool(ctx, params, parsed.change, parsed.options);
      if (!authorization.ok) return authorization.result;
      let result;
      try {
        result = await ctx.orchestrator.runDefinitionApply(parsed.change, parsed.options);
      } catch (err) {
        if (err instanceof DefinitionApplyError) return definitionApplyFailureResult(err);
        throw err;
      }
      if (result.status === "denied") {
        return { ok: false, error: "definition.apply denied by builder", state: result };
      }
      return { ok: true, state: result };
    },
  );

  reg.register(
    {
      name: "definition.rollback.prepare",
      description:
        "Validate a rollback target, show rollback impact through the framework approval prompt when required, and stop at ready_to_execute without mutating app data.",
      inputSchema: {
        type: "object",
        properties: {
          target_history_version: { type: "number" },
          require_approval: { type: "boolean" },
        },
        required: ["target_history_version"],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const parsed = parseDefinitionRollbackPrepare(params);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const authorization = authorizeRollbackPrepareTool(ctx, params, parsed.target_history_version);
      if (!authorization.ok) return authorization.result;
      let result;
      try {
        result = await ctx.orchestrator.runDefinitionRollbackPrepare(
          { target_history_version: parsed.target_history_version },
          parsed.options,
        );
      } catch (err) {
        if (err instanceof DefinitionRollbackPrepareError) return definitionRollbackPrepareFailureResult(err);
        throw err;
      }
      if (result.status === "denied") {
        return { ok: false, error: "definition.rollback.prepare denied by builder", state: result };
      }
      return { ok: true, state: result };
    },
  );

  reg.register(
    {
      name: "definition.rollback.execute",
      description:
        "Run the governed rollback path: prepare + approval, execute the table-only destructive rollback, restart dev, and verify removed Tables are gone.",
      inputSchema: {
        type: "object",
        properties: {
          target_history_version: { type: "number" },
          require_approval: { type: "boolean" },
          approval_token_id: { type: "string" },
        },
        required: ["target_history_version"],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const parsed = parseDefinitionRollbackExecute(params);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const authorization = authorizeRollbackExecuteTool(ctx, params, parsed.target_history_version);
      if (!authorization.ok) return authorization.result;
      let result;
      try {
        result = await ctx.orchestrator.runDefinitionRollbackExecute(
          { target_history_version: parsed.target_history_version },
          parsed.options,
        );
      } catch (err) {
        if (err instanceof DefinitionRollbackExecuteError) return definitionRollbackExecuteFailureResult(err);
        throw err;
      }
      if (result.status === "denied") {
        return { ok: false, error: "definition.rollback.execute denied by builder", state: result };
      }
      return { ok: true, state: result };
    },
  );

  reg.register(
    {
      name: "lifecycle.dev.start",
      description: "Start the dev-mode process group. Waits for ##pneuma:ready before returning.",
      inputSchema: {
        type: "object",
        properties: { port: { type: "number" } },
        required: [],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const port = typeof params.port === "number" ? params.port : undefined;
      return startDevAwaitReady(ctx.orchestrator, port);
    },
  );

  reg.register(
    {
      name: "lifecycle.dev.stop",
      description: "Stop the dev-mode process group (runs stop.sh if present, then SIGTERM/SIGKILL ladder).",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (ctx): Promise<ToolResult> => {
      await ctx.orchestrator.runStop();
      return { ok: true, state: ctx.orchestrator.state.dev };
    },
  );

  reg.register(
    {
      name: "lifecycle.dev.restart",
      description: "Stop then start dev.",
      inputSchema: {
        type: "object",
        properties: { port: { type: "number" } },
        required: [],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      await ctx.orchestrator.runStop();
      const port = typeof params.port === "number" ? params.port : undefined;
      return startDevAwaitReady(ctx.orchestrator, port);
    },
  );

  reg.register(
    {
      name: "lifecycle.setup.run",
      description: "Run setup.sh (one-time workspace initialization).",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (ctx): Promise<ToolResult> => {
      const res = await ctx.orchestrator.runSetup();
      if (res.exitCode !== 0) return { ok: false, error: `setup exited with code ${res.exitCode}` };
      return { ok: true, state: { exitCode: 0 } };
    },
  );

  reg.register(
    {
      name: "lifecycle.build.run",
      description: "Run build.sh. Returns manifest path on success.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (ctx): Promise<ToolResult> => {
      const res = await ctx.orchestrator.runBuild();
      if (res.exitCode !== 0) return { ok: false, error: `build exited with code ${res.exitCode}` };
      return { ok: true, state: { manifestPath: res.manifestPath, exitCode: 0 } };
    },
  );

  reg.register(
    {
      name: "lifecycle.deploy.run",
      description: "Run deploy.sh. Uses most recent build manifest by default.",
      inputSchema: {
        type: "object",
        properties: { manifestPath: { type: "string" } },
        required: [],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const manifestPath = typeof params.manifestPath === "string" ? params.manifestPath : undefined;
      const res = await ctx.orchestrator.runDeploy({ manifestPath });
      if (res.exitCode === 2) return { ok: false, error: "no build manifest available; run lifecycle.build.run first" };
      if (res.exitCode !== 0) return { ok: false, error: `deploy exited with code ${res.exitCode}` };
      return { ok: true, state: { exitCode: 0 } };
    },
  );

  reg.register(
    {
      name: "lifecycle.migrate.run",
      description: "Run migrate.sh (data migration). Accepts direction: up|down (default: up).",
      inputSchema: { type: "object", properties: { direction: { type: "string" }, target: { type: "string" } }, required: [] },
    },
    async (ctx, params): Promise<ToolResult> => {
      const dir = params.direction === "down" ? "down" : "up";
      const res = await ctx.orchestrator.runMigrate({ direction: dir });
      if (res.exitCode !== 0) return { ok: false, error: `migrate exited with code ${res.exitCode}` };
      return { ok: true, state: { direction: res.direction } };
    },
  );

  reg.register(
    {
      name: "lifecycle.fork.run",
      description: "Run fork.sh (produce a fresh workspace from a source). Source defaults to the current workspace.",
      inputSchema: {
        type: "object",
        properties: { source: { type: "string" }, target: { type: "string" } },
        required: ["target"],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const source = typeof params.source === "string" ? params.source : ctx.orchestrator.workspace;
      const target = params.target;
      if (typeof target !== "string" || target.length === 0) {
        return { ok: false, error: "lifecycle.fork.run requires a non-empty target" };
      }
      const res = await ctx.orchestrator.runFork({ sourceWorkspace: source, targetWorkspace: target });
      if (res.exitCode !== 0) return { ok: false, error: `fork exited with code ${res.exitCode}` };
      return { ok: true, state: { targetWorkspace: res.targetWorkspace } };
    },
  );

  reg.register(
    {
      name: "lifecycle.confirm",
      description: "Respond to a pending ##pneuma:needs-confirm marker.",
      inputSchema: {
        type: "object",
        properties: {
          verb: { type: "string" },
          label: { type: "string" },
          decision: { type: "string", enum: ["yes", "no"] },
        },
        required: ["verb", "label", "decision"],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const verb = params.verb as string;
      const label = params.label as string;
      const decision = params.decision as "yes" | "no";
      await ctx.orchestrator.resolveConfirm(verb as never, label, decision);
      return { ok: true };
    },
  );
}
