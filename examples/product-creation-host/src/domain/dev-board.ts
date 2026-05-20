export type DevBoardTemplateId = "engineering" | "personal";

export type DevBoardModuleKind =
  | "watchlist"
  | "notes"
  | "review_queue"
  | "github_attention"
  | "priority_lane"
  | "release_checklist"
  | "daily_plan"
  | "dependency_map"
  | "blocker_triage"
  | "ci_health"
  | "delivery_timeline";

export interface DevBoardModule {
  readonly id: string;
  readonly kind: DevBoardModuleKind;
  readonly title: string;
  readonly description: string;
}

export interface DevBoardField {
  readonly id: string;
  readonly label: string;
  readonly type: "text" | "status" | "priority" | "url" | "date" | "signal";
}

export interface DevBoardDefinition {
  readonly schema_version: 1;
  readonly board_id: string;
  readonly title: string;
  readonly description: string;
  readonly modules: readonly DevBoardModule[];
  readonly fields: readonly DevBoardField[];
  readonly theme: {
    readonly accent: string;
    readonly density: "compact" | "comfortable";
  };
}

export interface DevBoardItem {
  readonly id: string;
  readonly title: string;
  readonly owner: string;
  readonly status: "todo" | "doing" | "needs_review" | "approved" | "blocked";
  readonly priority?: "P1" | "P2" | "P3";
  readonly url?: string;
  readonly notes?: string;
  readonly reviewer?: string;
  readonly due_date?: string;
  readonly depends_on?: string;
  readonly blocked_reason?: string;
  readonly ci_status?: "passing" | "running" | "failing" | "unknown";
  readonly effort?: "S" | "M" | "L";
}

export interface DevBoardCreateInput {
  readonly app_id: string;
  readonly name: string;
  readonly goal: string;
  readonly template_id: DevBoardTemplateId;
}

export function createInitialDevBoard(input: DevBoardCreateInput): {
  readonly definition: DevBoardDefinition;
  readonly items: readonly DevBoardItem[];
} {
  if (input.template_id === "personal") {
    return {
      definition: {
        schema_version: 1,
        board_id: input.app_id,
        title: input.name,
        description: input.goal,
        modules: [
          module("daily_plan", "Daily plan", "Plan the next work block without opening a full project tracker."),
          module("notes", "Working notes", "Capture small implementation observations before they become tasks."),
        ],
        fields: [
          field("title", "Title", "text"),
          field("owner", "Owner", "text"),
          field("status", "Status", "status"),
        ],
        theme: { accent: "fern", density: "comfortable" },
      },
      items: [
        item("focus-auth", "Untangle OAuth callback edge case", "Charlie", "doing", "P1"),
        item("read-issues", "Review recent GitHub issue attention", "Charlie", "todo", "P2"),
        item("notes-cleanup", "Prune outdated implementation notes", "Charlie", "todo", "P3"),
      ],
    };
  }

  return {
    definition: {
      schema_version: 1,
      board_id: input.app_id,
      title: input.name,
      description: input.goal,
      modules: [
        module("watchlist", "Engineering watchlist", "Keep the highest-risk project items visible."),
        module("release_checklist", "Release checklist", "Track readiness checks before publishing a version."),
      ],
      fields: [
        field("title", "Title", "text"),
        field("owner", "Owner", "text"),
        field("status", "Status", "status"),
      ],
      theme: { accent: "indigo", density: "compact" },
    },
    items: [
      item("ci-flake", "Investigate CI flake in preview publish", "Bob", "doing", "P1"),
      item("pr-review", "Review pending dashboard PR", "Bob", "todo", "P2"),
      item("release-notes", "Prepare release notes for Friday", "Bob", "todo", "P3"),
    ],
  };
}

export function evolveDefinitionForIntent(
  definition: DevBoardDefinition,
  message: string,
): DevBoardDefinition {
  const lower = message.toLowerCase();
  let next = definition;
  if (mentionsReviewQueue(lower)) {
    next = addModule(next, module("review_queue", "Review queue", "Move items through needs_review and approved states."));
    next = addField(next, field("review_status", "Review status", "status"));
  }
  if (mentionsGitHubAttention(lower)) {
    next = addModule(next, module("github_attention", "GitHub attention", "Surface issues and pull requests that need action."));
    next = addField(next, field("url", "Link", "url"));
  }
  if (mentionsPriorityLane(lower)) {
    next = addModule(next, module("priority_lane", "Priority lane", "Separate P1/P2/P3 work so the next action is obvious."));
    next = addField(next, field("priority", "Priority", "priority"));
  }
  if (mentionsDependencyMap(lower)) {
    next = addModule(next, module("dependency_map", "Dependency map", "Show which items depend on other work before they can move."));
    next = addField(next, field("depends_on", "Depends on", "text"));
  }
  if (mentionsBlockerTriage(lower)) {
    next = addModule(next, module("blocker_triage", "Blocker triage", "Keep blocked work visible with a reason and recovery path."));
    next = addField(next, field("blocked_reason", "Blocked reason", "text"));
  }
  if (mentionsCiHealth(lower)) {
    next = addModule(next, module("ci_health", "CI health", "Track build, test, and integration signal beside the work item."));
    next = addField(next, field("ci_status", "CI status", "signal"));
  }
  if (mentionsDeliveryTimeline(lower)) {
    next = addModule(next, module("delivery_timeline", "Delivery timeline", "Keep due dates and delivery pressure visible during planning."));
    next = addField(next, field("due_date", "Due date", "date"));
    next = addField(next, field("effort", "Effort", "text"));
  }
  if (next === definition) {
    next = addModule(next, module("notes", "Working notes", "Capture context while the board evolves."));
  }
  return next;
}

export function migrateItemsForDefinition(
  items: readonly DevBoardItem[],
  definition: DevBoardDefinition,
): readonly DevBoardItem[] {
  const hasReview = hasModule(definition, "review_queue");
  const hasPriority = hasModule(definition, "priority_lane");
  const hasGitHub = hasModule(definition, "github_attention");
  const hasDependency = hasModule(definition, "dependency_map");
  const hasBlockers = hasModule(definition, "blocker_triage");
  const hasCi = hasModule(definition, "ci_health");
  const hasTimeline = hasModule(definition, "delivery_timeline");
  return items.map((item, index) => ({
    ...item,
    status: hasReview && item.status === "todo" && index === 1 ? "needs_review" : item.status,
    priority: hasPriority ? item.priority ?? (index === 0 ? "P1" : index === 1 ? "P2" : "P3") : item.priority,
    url: hasGitHub ? item.url ?? `https://github.com/pandazki/pneuma-framework/issues/${101 + index}` : item.url,
    reviewer: hasReview ? item.reviewer ?? (index === 0 ? "Alice" : "Bob") : item.reviewer,
    depends_on: hasDependency ? item.depends_on ?? (index === 0 ? "" : items[index - 1]?.id ?? "") : item.depends_on,
    blocked_reason: hasBlockers && item.status === "blocked" ? item.blocked_reason ?? "Needs owner decision" : item.blocked_reason,
    ci_status: hasCi ? item.ci_status ?? (index === 0 ? "failing" : index === 1 ? "running" : "passing") : item.ci_status,
    due_date: hasTimeline ? item.due_date ?? dueDateForIndex(index) : item.due_date,
    effort: hasTimeline ? item.effort ?? (index === 0 ? "M" : index === 1 ? "S" : "L") : item.effort,
  }));
}

export function parseDevBoardDefinition(text: string): DevBoardDefinition {
  const value = JSON.parse(text) as DevBoardDefinition;
  const validation = validateDevBoardDefinition(value);
  if (!validation.ok) {
    throw new Error(validation.issues.join("; "));
  }
  return value;
}

export function validateDevBoardDefinition(value: unknown): { readonly ok: true } | { readonly ok: false; readonly issues: readonly string[] } {
  const issues: string[] = [];
  const record = value as Partial<DevBoardDefinition> | undefined;
  if (!record || typeof record !== "object") issues.push("definition must be an object");
  if (record?.schema_version !== 1) issues.push("schema_version must be 1");
  if (typeof record?.board_id !== "string" || record.board_id.length < 2) issues.push("board_id is required");
  if (typeof record?.title !== "string" || record.title.length < 2) issues.push("title is required");
  if (!Array.isArray(record?.modules) || record.modules.length < 1) issues.push("modules must be a non-empty array");
  if (!Array.isArray(record?.fields) || record.fields.length < 3) issues.push("fields must include base app fields");
  const moduleIds = new Set<string>();
  const moduleKinds = new Set<DevBoardModuleKind>();
  for (const mod of record?.modules ?? []) {
    if (!mod || typeof mod !== "object") {
      issues.push("module must be an object");
      continue;
    }
    if (typeof mod.id !== "string" || mod.id.length < 2) issues.push("module.id is required");
    if (moduleIds.has(mod.id)) issues.push(`duplicate module id: ${mod.id}`);
    moduleIds.add(mod.id);
    if (!knownModuleKinds.has(mod.kind as DevBoardModuleKind)) {
      issues.push(`unknown module kind: ${String(mod.kind)}`);
    } else {
      moduleKinds.add(mod.kind as DevBoardModuleKind);
    }
  }
  const fieldIds = new Set<string>();
  const fieldTypes = new Map<string, DevBoardField["type"]>();
  for (const nextField of record?.fields ?? []) {
    if (!nextField || typeof nextField !== "object") {
      issues.push("field must be an object");
      continue;
    }
    if (typeof nextField.id !== "string" || nextField.id.length < 2) {
      issues.push("field.id is required");
      continue;
    }
    if (fieldIds.has(nextField.id)) issues.push(`duplicate field id: ${nextField.id}`);
    fieldIds.add(nextField.id);
    if (typeof nextField.label !== "string" || nextField.label.length < 1) issues.push(`field.label is required: ${nextField.id}`);
    if (!knownFieldTypes.has(nextField.type as DevBoardField["type"])) {
      issues.push(`unknown field type for ${nextField.id}: ${String(nextField.type)}`);
    } else {
      fieldTypes.set(nextField.id, nextField.type as DevBoardField["type"]);
    }
  }
  for (const base of ["title", "owner", "status"]) {
    if (!fieldIds.has(base)) issues.push(`missing base field: ${base}`);
  }
  const requiredFields: Record<DevBoardModuleKind, readonly [string, DevBoardField["type"]][] | undefined> = {
    daily_plan: undefined,
    blocker_triage: [["blocked_reason", "text"]],
    ci_health: [["ci_status", "signal"]],
    delivery_timeline: [["due_date", "date"], ["effort", "text"]],
    dependency_map: [["depends_on", "text"]],
    github_attention: [["url", "url"]],
    notes: undefined,
    priority_lane: [["priority", "priority"]],
    release_checklist: undefined,
    review_queue: [["review_status", "status"]],
    watchlist: undefined,
  };
  for (const kind of moduleKinds) {
    for (const [fieldId, type] of requiredFields[kind] ?? []) {
      if (!fieldIds.has(fieldId)) issues.push(`missing field for ${kind}: ${fieldId}`);
      if (fieldTypes.has(fieldId) && fieldTypes.get(fieldId) !== type) {
        issues.push(`field ${fieldId} must use type ${type}`);
      }
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function moduleSummary(definition: DevBoardDefinition): string {
  return definition.modules.map((mod) => mod.kind).join(", ");
}

export function hasModule(definition: DevBoardDefinition, kind: DevBoardModuleKind): boolean {
  return definition.modules.some((mod) => mod.kind === kind);
}

export function mentionsGitHubAttention(lowercaseMessage: string): boolean {
  return lowercaseMessage.includes("github")
    || lowercaseMessage.includes("issue")
    || lowercaseMessage.includes("pull request")
    || /\bpr\b/.test(lowercaseMessage)
    || lowercaseMessage.includes("议题")
    || lowercaseMessage.includes("拉取请求")
    || lowercaseMessage.includes("关注项");
}

export function mentionsReviewQueue(lowercaseMessage: string): boolean {
  return lowercaseMessage.includes("review")
    || lowercaseMessage.includes("评审")
    || lowercaseMessage.includes("审核")
    || lowercaseMessage.includes("批准");
}

export function mentionsPriorityLane(lowercaseMessage: string): boolean {
  return lowercaseMessage.includes("priority")
    || lowercaseMessage.includes("focus")
    || /\bp[123]\b/.test(lowercaseMessage)
    || lowercaseMessage.includes("优先级")
    || lowercaseMessage.includes("重点");
}

export function mentionsDependencyMap(lowercaseMessage: string): boolean {
  return lowercaseMessage.includes("dependency")
    || lowercaseMessage.includes("dependencies")
    || lowercaseMessage.includes("depends")
    || lowercaseMessage.includes("dependency map")
    || lowercaseMessage.includes("依赖")
    || lowercaseMessage.includes("前置");
}

export function mentionsBlockerTriage(lowercaseMessage: string): boolean {
  return lowercaseMessage.includes("blocker")
    || lowercaseMessage.includes("blocked")
    || lowercaseMessage.includes("blocking")
    || lowercaseMessage.includes("triage blockers")
    || lowercaseMessage.includes("阻塞")
    || lowercaseMessage.includes("卡住");
}

export function mentionsCiHealth(lowercaseMessage: string): boolean {
  return lowercaseMessage.includes("ci")
    || lowercaseMessage.includes("build health")
    || lowercaseMessage.includes("test signal")
    || lowercaseMessage.includes("pipeline")
    || lowercaseMessage.includes("checks")
    || lowercaseMessage.includes("测试信号")
    || lowercaseMessage.includes("构建")
    || lowercaseMessage.includes("流水线");
}

export function mentionsDeliveryTimeline(lowercaseMessage: string): boolean {
  return lowercaseMessage.includes("due date")
    || lowercaseMessage.includes("deadline")
    || lowercaseMessage.includes("timeline")
    || lowercaseMessage.includes("delivery")
    || lowercaseMessage.includes("eta")
    || lowercaseMessage.includes("排期")
    || lowercaseMessage.includes("截止")
    || lowercaseMessage.includes("交付")
    || lowercaseMessage.includes("时间线");
}

function addModule(definition: DevBoardDefinition, mod: DevBoardModule): DevBoardDefinition {
  if (definition.modules.some((item) => item.kind === mod.kind || item.id === mod.id)) return definition;
  return { ...definition, modules: [...definition.modules, mod] };
}

function addField(definition: DevBoardDefinition, nextField: DevBoardField): DevBoardDefinition {
  if (definition.fields.some((item) => item.id === nextField.id)) return definition;
  return { ...definition, fields: [...definition.fields, nextField] };
}

function module(kind: DevBoardModuleKind, title: string, description: string): DevBoardModule {
  return { id: kind, kind, title, description };
}

function field(id: string, label: string, type: DevBoardField["type"]): DevBoardField {
  return { id, label, type };
}

function item(
  id: string,
  title: string,
  owner: string,
  status: DevBoardItem["status"],
  priority: DevBoardItem["priority"],
): DevBoardItem {
  return { id, title, owner, status, priority };
}

const knownModuleKinds = new Set<DevBoardModuleKind>([
  "watchlist",
  "notes",
  "review_queue",
  "github_attention",
  "priority_lane",
  "release_checklist",
  "daily_plan",
  "dependency_map",
  "blocker_triage",
  "ci_health",
  "delivery_timeline",
]);

const knownFieldTypes = new Set<DevBoardField["type"]>(["date", "priority", "signal", "status", "text", "url"]);

function dueDateForIndex(index: number): string {
  const dates = ["2026-05-22", "2026-05-24", "2026-05-27"];
  return dates[index] ?? "2026-05-30";
}
