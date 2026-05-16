export type DevBoardTemplateId = "engineering" | "personal";

export type DevBoardModuleKind =
  | "watchlist"
  | "notes"
  | "review_queue"
  | "github_attention"
  | "priority_lane"
  | "release_checklist"
  | "daily_plan";

export interface DevBoardModule {
  readonly id: string;
  readonly kind: DevBoardModuleKind;
  readonly title: string;
  readonly description: string;
}

export interface DevBoardField {
  readonly id: string;
  readonly label: string;
  readonly type: "text" | "status" | "priority" | "url";
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
  if (lower.includes("review")) {
    next = addModule(next, module("review_queue", "Review queue", "Move items through needs_review and approved states."));
    next = addField(next, field("review_status", "Review status", "status"));
  }
  if (mentionsGitHubAttention(lower)) {
    next = addModule(next, module("github_attention", "GitHub attention", "Surface issues and pull requests that need action."));
    next = addField(next, field("url", "Link", "url"));
  }
  if (lower.includes("priority") || lower.includes("focus") || lower.includes("triage")) {
    next = addModule(next, module("priority_lane", "Priority lane", "Separate P1/P2/P3 work so the next action is obvious."));
    next = addField(next, field("priority", "Priority", "priority"));
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
  return items.map((item, index) => ({
    ...item,
    status: hasReview && item.status === "todo" && index === 1 ? "needs_review" : item.status,
    priority: hasPriority ? item.priority ?? (index === 0 ? "P1" : index === 1 ? "P2" : "P3") : item.priority,
    url: hasGitHub ? item.url ?? `https://github.com/pandazki/pneuma-framework/issues/${101 + index}` : item.url,
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
  for (const mod of record?.modules ?? []) {
    if (!mod || typeof mod !== "object") {
      issues.push("module must be an object");
      continue;
    }
    if (typeof mod.id !== "string" || mod.id.length < 2) issues.push("module.id is required");
    if (moduleIds.has(mod.id)) issues.push(`duplicate module id: ${mod.id}`);
    moduleIds.add(mod.id);
    if (!knownModuleKinds.has(mod.kind as DevBoardModuleKind)) issues.push(`unknown module kind: ${String(mod.kind)}`);
  }
  const fieldIds = new Set((record?.fields ?? []).map((field) => field.id));
  for (const base of ["title", "owner", "status"]) {
    if (!fieldIds.has(base)) issues.push(`missing base field: ${base}`);
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
    || /\bpr\b/.test(lowercaseMessage);
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
]);
