// LinearAdapterImpl — 真 IO.
// AdapterInvoker 调这里的 list(); PushableQuery 里的 leaves 已经是可下推的
// (AdapterInvoker 按 capability.filter_pushdown 切好了), 本类的任务是:
//   1. 把 PushableLeaf[] 翻译成 Linear GraphQL filter shape
//   2. 调 LinearClient.listIssues
//   3. 把 LinearIssue[] 映射成 ExternalRow[] (flat shape 匹配 externalTypes.columns)

import type {
  AdapterImpl,
  AdapterInvocationContext,
  ExternalRow,
  PushableLeaf,
  PushableQuery,
  ComparisonOp,
  DateSubOp,
} from "@pneuma-framework/core-domain";
import {
  LinearClient,
  type LinearClientConfig,
  type LinearIssue,
  type LinearIssueFilter,
} from "./client.js";

export class LinearAdapterImpl implements AdapterImpl {
  private readonly client: LinearClient;

  constructor(configOrClient: LinearClientConfig | LinearClient) {
    this.client =
      configOrClient instanceof LinearClient
        ? configOrClient
        : new LinearClient(configOrClient);
  }

  async list(
    query: PushableQuery,
    _ctx: AdapterInvocationContext
  ): Promise<readonly ExternalRow[]> {
    const filter = buildLinearFilter(query.where);
    const orderBy = pickOrderBy(query.sort);
    const issues = await this.client.listIssues({
      filter,
      first: query.limit ?? 50,
      orderBy,
    });
    return issues.map(issueToRow);
  }
}

// ---------- filter translation ----------

const DAY_MS = 86_400_000;

function buildLinearFilter(leaves: readonly PushableLeaf[]): LinearIssueFilter {
  const out: LinearIssueFilter = {};
  for (const leaf of leaves) {
    mergeLeafIntoFilter(out, leaf);
  }
  return out;
}

function mergeLeafIntoFilter(filter: LinearIssueFilter, leaf: PushableLeaf): void {
  const { column, op, value, sub_op } = leaf;
  switch (column) {
    case "creator_id":
      setNested(filter, ["creator", "id"], opToLinearOp(op, value));
      return;
    case "assignee_id":
      setNested(filter, ["assignee", "id"], opToLinearOp(op, value));
      return;
    case "state_type":
      setNested(filter, ["state", "type"], opToLinearOp(op, value));
      return;
    case "team_id":
      setNested(filter, ["team", "id"], opToLinearOp(op, value));
      return;
    case "team_key":
      setNested(filter, ["team", "key"], opToLinearOp(op, value));
      return;
    case "priority":
      setNested(filter, ["priority"], opToLinearOp(op, value));
      return;
    case "created_at":
    case "updated_at":
    case "completed_at":
      setNested(filter, [camelCaseDate(column)], dateOpToLinear(op, value, sub_op));
      return;
    default:
      // MVP: 未知 column 忽略 — AdapterInvoker 已拒绝本该本地过滤的 leaf
      return;
  }
}

function camelCaseDate(col: "created_at" | "updated_at" | "completed_at"): string {
  if (col === "created_at") return "createdAt";
  if (col === "updated_at") return "updatedAt";
  return "completedAt";
}

function opToLinearOp(op: ComparisonOp, value: unknown): Record<string, unknown> {
  switch (op) {
    case "eq":
      return { eq: value };
    case "neq":
      return { neq: value };
    case "in":
      return { in: value as unknown[] };
    case "nin":
      return { nin: value as unknown[] };
    case "gt":
      return { gt: value };
    case "gte":
      return { gte: value };
    case "lt":
      return { lt: value };
    case "lte":
      return { lte: value };
    default:
      return { eq: value }; // 保守 fallback
  }
}

function dateOpToLinear(
  op: ComparisonOp,
  value: unknown,
  sub_op: DateSubOp | undefined
): Record<string, unknown> {
  if (op !== "date") {
    // Non-date op on date column (e.g. gte with unix-ms number).
    // Linear accepts ISO-8601 strings → convert ms number to ISO.
    const iso = typeof value === "number" ? new Date(value).toISOString() : value;
    return opToLinearOp(op, iso);
  }
  // op === "date", use sub_op
  const now = Date.now();
  const range = resolveDateRange(sub_op, value, now);
  if (!range) return {};
  const out: Record<string, unknown> = {};
  if (range.gte !== undefined) out.gte = new Date(range.gte).toISOString();
  if (range.lt !== undefined) out.lt = new Date(range.lt).toISOString();
  return out;
}

function resolveDateRange(
  subOp: DateSubOp | undefined,
  value: unknown,
  now: number
): { gte?: number; lt?: number } | null {
  if (!subOp) return null;
  const today = startOfDay(now);
  switch (subOp) {
    case "today":
      return { gte: today, lt: today + DAY_MS };
    case "yesterday":
      return { gte: today - DAY_MS, lt: today };
    case "last_n_days":
      if (typeof value !== "number") return null;
      return { gte: today - value * DAY_MS, lt: today + DAY_MS };
    case "before":
      return typeof value === "number" ? { lt: value } : null;
    case "after":
      return typeof value === "number" ? { gte: value } : null;
    case "on":
      if (typeof value !== "number") return null;
      {
        const d = startOfDay(value);
        return { gte: d, lt: d + DAY_MS };
      }
    case "this_week": {
      const d = new Date(now);
      const day = d.getDay();
      const monOffset = (day + 6) % 7;
      const start = today - monOffset * DAY_MS;
      return { gte: start, lt: start + 7 * DAY_MS };
    }
    case "last_week": {
      const d = new Date(now);
      const day = d.getDay();
      const monOffset = (day + 6) % 7;
      const lastMon = today - monOffset * DAY_MS - 7 * DAY_MS;
      return { gte: lastMon, lt: lastMon + 7 * DAY_MS };
    }
    default:
      return null;
  }
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function setNested(
  target: Record<string, unknown>,
  path: string[],
  leaf: Record<string, unknown>
): void {
  if (path.length === 0) return;
  let cur: Record<string, unknown> = target;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]!;
    if (typeof cur[seg] !== "object" || cur[seg] === null || Array.isArray(cur[seg])) {
      cur[seg] = {};
    }
    cur = cur[seg] as Record<string, unknown>;
  }
  const last = path[path.length - 1]!;
  cur[last] = { ...((cur[last] as Record<string, unknown>) ?? {}), ...leaf };
}

function pickOrderBy(
  sort: PushableQuery["sort"]
): "createdAt" | "updatedAt" | undefined {
  if (!sort || sort.length === 0) return undefined;
  const first = sort[0]!;
  if (first.column === "created_at") return "createdAt";
  if (first.column === "updated_at") return "updatedAt";
  return undefined;
}

// ---------- row mapping ----------

function issueToRow(issue: LinearIssue): ExternalRow {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    priority: issue.priority,
    state_name: issue.state.name,
    state_type: issue.state.type,
    assignee_id: issue.assignee?.id ?? null,
    assignee_email: issue.assignee?.email ?? null,
    creator_id: issue.creator?.id ?? "",
    creator_email: issue.creator?.email ?? null,
    team_id: issue.team?.id ?? "",
    team_key: issue.team?.key ?? "",
    created_at: Date.parse(issue.createdAt),
    updated_at: Date.parse(issue.updatedAt),
    completed_at: issue.completedAt ? Date.parse(issue.completedAt) : null,
  };
}
