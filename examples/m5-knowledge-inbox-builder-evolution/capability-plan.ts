import type { DefinitionApplyChange } from "@pneuma-framework/core";
import { Resources, Subjects } from "@pneuma-framework/core-domain";

const TEXT = { kind: "primitive", of: "Text" } as const;

export const builderRequest =
  "I want to review inbox items by priority, so urgent links do not get buried.";

export const agentProposal = {
  title: "Priority review capability",
  summary: "Add a Priority Queue to Knowledge Inbox.",
  steps: [
    "Add a nullable priority column to inbox_items.",
    "Add a query-backed list_priority_queue Operation.",
    "Allow end users to invoke the new read Operation.",
    "Allow end users to read the new View.",
    "Mount the Operation as a priority_queue View.",
  ],
} as const;

export const priorityCapabilityChanges = [
  {
    kind: "add_table_column",
    table_id: "inbox_items",
    column_name: "priority",
    cell_type: TEXT,
    nullable: true,
  },
  {
    kind: "add_operation",
    operation_id: "list_priority_queue",
    name: "List priority queue",
    description: "List Knowledge Inbox items for priority review.",
    output: { kind: "row-list", row_type: "inbox_items" },
    handler: {
      kind: "query",
      on: "inbox_items",
      fields: ["id", "url", "title", "source", "summary", "status", "priority", "created_at_cell"],
      sort: [
        { column: "priority", dir: "asc" },
        { column: "created_at_cell", dir: "desc" },
      ],
      pagination: { kind: "cursor", size: 100 },
    },
  },
  {
    kind: "add_policy_rule",
    rule_id: "anyone-invoke-list-priority-queue",
    allow: [Subjects.anyone(), Subjects.anonymous()],
    actions: ["invoke"],
    resource: Resources.operation("list_priority_queue"),
  },
  {
    kind: "add_policy_rule",
    rule_id: "anyone-read-priority-queue",
    allow: [Subjects.anyone(), Subjects.anonymous()],
    actions: ["read"],
    resource: Resources.view("priority_queue"),
  },
  {
    kind: "add_view",
    view_id: "priority_queue",
    name: "Priority Queue",
    description: "Review inbox items through the Builder-created priority capability.",
    view_kind: "table",
    source: { kind: "operation", operation_id: "list_priority_queue" },
    presentation: {
      title: "Priority Queue",
      empty_state: "No priority items yet.",
      columns: [
        { field: "priority", label: "Priority", role: "metadata" },
        { field: "title", label: "Title", role: "title" },
        { field: "url", label: "URL", role: "url" },
        { field: "status", label: "Status", role: "metadata" },
        { field: "source", label: "Source", role: "metadata" },
      ],
    },
  },
] as const satisfies readonly DefinitionApplyChange[];

export const demoTimeline = [
  {
    id: "before",
    label: "Before",
    detail: "Knowledge Inbox supports capture, list, and status triage; no priority review surface exists.",
  },
  {
    id: "request",
    label: "Builder request",
    detail: builderRequest,
  },
  {
    id: "proposal",
    label: "Agent proposal",
    detail: agentProposal.summary,
  },
  {
    id: "approval",
    label: "Governed approval",
    detail: "Framework asks the Builder to approve definition changes before execution.",
  },
  {
    id: "after",
    label: "After restart",
    detail: "The app rediscovers priority column, query Operation, View, and PolicyRule.",
  },
] as const;
