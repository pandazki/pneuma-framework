import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type RawConfig = {
  tables?: Array<{
    id?: string;
    columns?: Array<{ name?: string }>;
  }>;
  operations?: Array<{ id?: string }>;
  views?: Array<{ id?: string }>;
  policy_rules?: Array<{
    id?: string;
    actions?: string[];
    resource?: unknown;
  }>;
};

export type M6ConfigSnapshot = {
  tableColumns: string[];
  operations: string[];
  views: string[];
  policyRules: string[];
  hasPriorityColumn: boolean;
  hasPriorityOperation: boolean;
  hasPriorityView: boolean;
  hasPriorityReadPolicy: boolean;
};

export type M6EvolutionTrace = {
  version: 1;
  created_at: string;
  session: {
    backend: string;
    model: string;
    appUrl: string;
    frameworkToolUrl: string;
    workspace: string;
    builderRequest: string;
  };
  before: M6ConfigSnapshot;
  after: M6ConfigSnapshot | null;
  diff: string[];
  workLog: Array<{
    kind: string;
    label: string;
    detail: string;
    data?: unknown;
  }>;
  agentConversation: Array<{
    role: "assistant";
    kind: "text";
    messageId: string;
    partId: string;
    text: string;
  }>;
  priorityRows: Array<Record<string, unknown>>;
  summary: {
    status: "running" | "completed";
    agentTextEvents: number;
    agentMessages: number;
    toolCalls: number;
    approvals: number;
    toolResults: number;
    priorityRows: number;
  };
};

export function summarizeM6ConfigSnapshot(config: RawConfig): M6ConfigSnapshot {
  const inboxTable = (config.tables || []).find((table) => table.id === "inbox_items");
  const tableColumns = (inboxTable?.columns || [])
    .map((column) => column.name)
    .filter((name): name is string => typeof name === "string");
  const operations = (config.operations || [])
    .map((operation) => operation.id)
    .filter((id): id is string => typeof id === "string");
  const views = (config.views || [])
    .map((view) => view.id)
    .filter((id): id is string => typeof id === "string");
  const policyRules = (config.policy_rules || [])
    .map((rule) => rule.id)
    .filter((id): id is string => typeof id === "string");
  const hasPriorityReadPolicy = (config.policy_rules || []).some((rule) => {
    const resource = rule.resource as { kind?: string; id?: string } | undefined;
    return rule.id === "anyone-read-priority-queue"
      || (Array.isArray(rule.actions) && rule.actions.includes("read") && resource?.kind === "view" && resource.id === "priority_queue");
  });

  return {
    tableColumns,
    operations,
    views,
    policyRules,
    hasPriorityColumn: tableColumns.includes("priority"),
    hasPriorityOperation: operations.includes("list_priority_queue"),
    hasPriorityView: views.includes("priority_queue"),
    hasPriorityReadPolicy,
  };
}

export function buildM6EvolutionTraceDiff(before: M6ConfigSnapshot, after: M6ConfigSnapshot): string[] {
  const diff: string[] = [];
  if (!before.hasPriorityColumn && after.hasPriorityColumn) diff.push("+ schema: inbox_items.priority");
  if (!before.hasPriorityOperation && after.hasPriorityOperation) {
    diff.push("+ domain service: list_priority_queue");
    diff.push("+ api: GET /api/operations/list_priority_queue");
  }
  if (!before.hasPriorityView && after.hasPriorityView) diff.push("+ view: priority_queue");
  if (!before.hasPriorityReadPolicy && after.hasPriorityReadPolicy) {
    diff.push("+ policy: anyone/anonymous read priority_queue");
  }
  return diff;
}

export function createM6EvolutionTrace(input: {
  backend: string;
  model: string;
  appUrl: string;
  frameworkToolUrl: string;
  workspace: string;
  builderRequest: string;
  before: M6ConfigSnapshot;
}): M6EvolutionTrace {
  return {
    version: 1,
    created_at: new Date().toISOString(),
    session: {
      backend: input.backend,
      model: input.model,
      appUrl: input.appUrl,
      frameworkToolUrl: input.frameworkToolUrl,
      workspace: input.workspace,
      builderRequest: input.builderRequest,
    },
    before: input.before,
    after: null,
    diff: [],
    workLog: [
      {
        kind: "session",
        label: "Before snapshot",
        detail: "Captured app definition before the backend agent started applying changes.",
      },
    ],
    agentConversation: [],
    priorityRows: [],
    summary: {
      status: "running",
      agentTextEvents: 0,
      agentMessages: 0,
      toolCalls: 0,
      approvals: 0,
      toolResults: 0,
      priorityRows: 0,
    },
  };
}

export function recordM6AgentText(
  trace: M6EvolutionTrace,
  text: string,
  input: {
    kind?: string;
    messageId?: string;
    partId?: string;
  } = {},
): void {
  if (!text) return;
  const messageId = input.messageId || "message";
  const partId = input.partId || "part";
  const existing = trace.agentConversation.find((entry) => entry.messageId === messageId && entry.partId === partId);
  if (existing) {
    existing.text = input.kind === "message" ? text.trim() : `${existing.text}${text}`;
  } else {
    const initialText = input.kind === "message" ? text.trim() : text;
    trace.agentConversation.push({
      role: "assistant",
      kind: "text",
      messageId,
      partId,
      text: initialText,
    });
  }
  trace.summary.agentTextEvents += 1;
  trace.summary.agentMessages = trace.agentConversation.length;
}

export function recordM6ToolCall(trace: M6EvolutionTrace, tool: string, input: unknown): void {
  const kind = typeof input === "object" && input !== null && "kind" in input
    ? String((input as { kind?: unknown }).kind)
    : "unknown";
  trace.workLog.push({
    kind: "tool_call",
    label: tool,
    detail: kind,
    data: input,
  });
  trace.summary.toolCalls += 1;
}

export function recordM6Approval(trace: M6EvolutionTrace, tool: string, approvalId: string): void {
  trace.workLog.push({
    kind: "approval",
    label: tool,
    detail: approvalId,
  });
  trace.summary.approvals += 1;
}

export function recordM6ToolResult(trace: M6EvolutionTrace, tool: string, result: unknown): void {
  const ok = typeof result === "object" && result !== null && "ok" in result
    ? String((result as { ok?: unknown }).ok)
    : "unknown";
  trace.workLog.push({
    kind: "tool_result",
    label: tool,
    detail: `ok=${ok}`,
    data: result,
  });
  trace.summary.toolResults += 1;
}

export function recordM6Completion(
  trace: M6EvolutionTrace,
  input: {
    after: M6ConfigSnapshot;
    rows: Array<Record<string, unknown>>;
  },
): void {
  trace.after = input.after;
  trace.diff = buildM6EvolutionTraceDiff(trace.before, input.after);
  trace.priorityRows = input.rows;
  trace.summary.status = "completed";
  trace.summary.priorityRows = input.rows.length;
  trace.workLog.push({
    kind: "completion",
    label: "Completion gate",
    detail: `GET /api/operations/list_priority_queue returned ${input.rows.length} rows.`,
  });
}

export function writeM6EvolutionTrace(workspace: string, trace: M6EvolutionTrace): string {
  const dataDir = join(workspace, "data");
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, "m6-evolution-trace.json");
  writeFileSync(path, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
  return path;
}
