export type WorkflowTemplateId = "vendor_intake" | "incident_review" | "hiring_loop";
export type WorkflowFieldType = "text" | "long_text" | "number" | "date" | "select" | "user" | "url";
export type WorkflowViewKind = "form" | "queue" | "detail";

export interface WorkflowField {
  readonly id: string;
  readonly label: string;
  readonly type: WorkflowFieldType;
  readonly required?: boolean;
  readonly options?: readonly string[];
  readonly helper_text?: string;
}

export interface WorkflowStage {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly terminal?: boolean;
}

export interface WorkflowAction {
  readonly id: string;
  readonly label: string;
  readonly from_stage: string;
  readonly to_stage: string;
  readonly required_role: string;
  readonly requires_comment?: boolean;
}

export interface WorkflowView {
  readonly id: string;
  readonly label: string;
  readonly kind: WorkflowViewKind;
  readonly fields: readonly string[];
  readonly stage_filter?: readonly string[];
}

export interface WorkflowAppDefinition {
  readonly schema_version: 1;
  readonly app_id: string;
  readonly title: string;
  readonly purpose: string;
  readonly entity: {
    readonly singular: string;
    readonly plural: string;
  };
  readonly roles: readonly string[];
  readonly fields: readonly WorkflowField[];
  readonly stages: readonly WorkflowStage[];
  readonly actions: readonly WorkflowAction[];
  readonly views: readonly WorkflowView[];
  readonly theme: {
    readonly accent: "teal" | "indigo" | "slate";
    readonly density: "comfortable" | "compact";
  };
}

export interface WorkflowRecord {
  readonly id: string;
  readonly title: string;
  readonly stage: string;
  readonly owner: string;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
  readonly values: Record<string, string | number | null>;
  readonly history: readonly WorkflowHistoryEntry[];
}

export interface WorkflowHistoryEntry {
  readonly at_ms: number;
  readonly action_id: string;
  readonly actor_subject: string;
  readonly actor_role: string;
  readonly from_stage: string;
  readonly to_stage: string;
  readonly comment?: string;
}

export interface WorkflowAppSeed {
  readonly definition: WorkflowAppDefinition;
  readonly records: readonly WorkflowRecord[];
}

export function createInitialWorkflowApp(input: {
  readonly app_id: string;
  readonly title: string;
  readonly purpose: string;
  readonly template_id: WorkflowTemplateId;
}): WorkflowAppSeed {
  if (input.template_id === "vendor_intake") return createVendorIntake(input);
  if (input.template_id === "incident_review") return createIncidentReview(input);
  return createHiringLoop(input);
}

export function evolveWorkflowForIntent(
  definition: WorkflowAppDefinition,
  builderMessage: string,
): WorkflowAppDefinition {
  const lower = builderMessage.toLowerCase();
  let next = definition;
  if (mentionsLegalReview(lower)) next = withLegalReview(next);
  if (mentionsSla(lower)) next = withSlaTracking(next);
  return next;
}

export function validateWorkflowAppDefinition(value: unknown):
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly string[] } {
  const issues: string[] = [];
  const definition = value as Partial<WorkflowAppDefinition> | undefined;
  if (!definition || typeof definition !== "object") issues.push("definition must be an object");
  if (definition?.schema_version !== 1) issues.push("schema_version must be 1");
  if (!isId(definition?.app_id)) issues.push(`invalid app_id: ${String(definition?.app_id)}`);
  if (!nonEmpty(definition?.title)) issues.push("title is required");
  if (!nonEmpty(definition?.purpose)) issues.push("purpose is required");
  if (!definition?.entity || !nonEmpty(definition.entity.singular) || !nonEmpty(definition.entity.plural)) {
    issues.push("entity singular and plural are required");
  }
  if (!Array.isArray(definition?.roles) || definition.roles.length === 0) issues.push("roles are required");
  if (!Array.isArray(definition?.fields) || definition.fields.length === 0) issues.push("fields are required");
  if (!Array.isArray(definition?.stages) || definition.stages.length === 0) issues.push("stages are required");
  if (!Array.isArray(definition?.actions)) issues.push("actions must be an array");
  if (!Array.isArray(definition?.views) || definition.views.length === 0) issues.push("views are required");

  const roles = new Set<string>();
  for (const role of definition?.roles ?? []) {
    if (!isId(role)) issues.push(`invalid role: ${String(role)}`);
    roles.add(role);
  }

  const fields = new Set<string>();
  for (const field of definition?.fields ?? []) {
    if (!isId(field.id)) issues.push(`invalid field id: ${String(field.id)}`);
    if (fields.has(field.id)) issues.push(`duplicate field id: ${field.id}`);
    fields.add(field.id);
    if (!nonEmpty(field.label)) issues.push(`field ${String(field.id)} label is required`);
    if (!fieldTypes.has(field.type)) issues.push(`unknown field type for ${String(field.id)}: ${String(field.type)}`);
    if (field.type === "select" && (!Array.isArray(field.options) || field.options.length === 0)) {
      issues.push(`select field ${String(field.id)} requires options`);
    }
  }

  const stages = new Set<string>();
  for (const stage of definition?.stages ?? []) {
    if (!isId(stage.id)) issues.push(`invalid stage id: ${String(stage.id)}`);
    if (stages.has(stage.id)) issues.push(`duplicate stage id: ${stage.id}`);
    stages.add(stage.id);
    if (!nonEmpty(stage.label)) issues.push(`stage ${String(stage.id)} label is required`);
  }

  for (const action of definition?.actions ?? []) {
    if (!isId(action.id)) issues.push(`invalid action id: ${String(action.id)}`);
    if (!stages.has(action.from_stage)) {
      issues.push(`action ${String(action.id)} references missing from_stage: ${String(action.from_stage)}`);
    }
    if (!stages.has(action.to_stage)) {
      issues.push(`action ${String(action.id)} references missing to_stage: ${String(action.to_stage)}`);
    }
    if (!roles.has(action.required_role)) {
      issues.push(`action ${String(action.id)} references missing role: ${String(action.required_role)}`);
    }
  }

  for (const view of definition?.views ?? []) {
    if (!isId(view.id)) issues.push(`invalid view id: ${String(view.id)}`);
    if (!viewKinds.has(view.kind)) issues.push(`unknown view kind for ${String(view.id)}: ${String(view.kind)}`);
    for (const fieldId of view.fields ?? []) {
      if (!fields.has(fieldId)) issues.push(`view ${String(view.id)} references missing field: ${fieldId}`);
    }
    for (const stageId of view.stage_filter ?? []) {
      if (!stages.has(stageId)) issues.push(`view ${String(view.id)} references missing stage: ${stageId}`);
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function migrateRecordsForDefinition(
  records: readonly WorkflowRecord[],
  definition: WorkflowAppDefinition,
): readonly WorkflowRecord[] {
  const fieldDefaults = Object.fromEntries(
    definition.fields.map((field) => [field.id, defaultValueForField(field)]),
  ) as Record<string, string | number | null>;
  const stageIds = new Set(definition.stages.map((stage) => stage.id));
  const fallbackStage = definition.stages[0]?.id ?? "submitted";
  return records.map((record) => ({
    ...record,
    stage: stageIds.has(record.stage) ? record.stage : fallbackStage,
    updated_at_ms: Date.now(),
    values: {
      ...fieldDefaults,
      ...record.values,
    },
  }));
}

export function transitionWorkflowRecord(
  definition: WorkflowAppDefinition,
  record: WorkflowRecord,
  input: {
    readonly action_id: string;
    readonly actor_subject: string;
    readonly actor_role: string;
    readonly comment?: string;
  },
): WorkflowRecord {
  const action = definition.actions.find((candidate) => candidate.id === input.action_id);
  if (!action) throw new Error(`unknown action: ${input.action_id}`);
  if (action.required_role !== input.actor_role) throw new Error(`action ${action.id} requires role: ${action.required_role}`);
  if (action.from_stage !== record.stage) throw new Error(`cannot run action ${action.id} from stage ${record.stage}`);
  if (action.requires_comment && !input.comment?.trim()) throw new Error(`action ${action.id} requires a comment`);
  const now = Date.now();
  return {
    ...record,
    stage: action.to_stage,
    updated_at_ms: now,
    history: [
      ...record.history,
      {
        at_ms: now,
        action_id: action.id,
        actor_subject: input.actor_subject,
        actor_role: input.actor_role,
        from_stage: action.from_stage,
        to_stage: action.to_stage,
        comment: input.comment,
      },
    ],
  };
}

function createVendorIntake(input: {
  readonly app_id: string;
  readonly title: string;
  readonly purpose: string;
}): WorkflowAppSeed {
  const definition: WorkflowAppDefinition = {
    schema_version: 1,
    app_id: input.app_id,
    title: input.title,
    purpose: input.purpose,
    entity: { singular: "Vendor request", plural: "Vendor requests" },
    roles: ["requester", "operations", "approver", "legal"],
    fields: [
      { id: "vendor_name", label: "Vendor name", type: "text", required: true },
      { id: "requestor", label: "Requestor", type: "user", required: true },
      { id: "category", label: "Category", type: "select", options: ["software", "services", "finance"], required: true },
      { id: "risk_level", label: "Risk", type: "select", options: ["low", "medium", "high"], required: true },
      { id: "notes", label: "Notes", type: "long_text" },
    ],
    stages: [
      { id: "submitted", label: "Submitted" },
      { id: "business_review", label: "Business review" },
      { id: "approved", label: "Approved", terminal: true },
      { id: "rejected", label: "Rejected", terminal: true },
    ],
    actions: [
      {
        id: "submit_for_business_review",
        label: "Send to business review",
        from_stage: "submitted",
        to_stage: "business_review",
        required_role: "operations",
      },
      {
        id: "approve_vendor",
        label: "Approve vendor",
        from_stage: "business_review",
        to_stage: "approved",
        required_role: "approver",
        requires_comment: true,
      },
      {
        id: "reject_vendor",
        label: "Reject vendor",
        from_stage: "business_review",
        to_stage: "rejected",
        required_role: "approver",
        requires_comment: true,
      },
    ],
    views: [
      { id: "intake_form", label: "Intake form", kind: "form", fields: ["vendor_name", "requestor", "category", "risk_level", "notes"] },
      { id: "review_queue", label: "Review queue", kind: "queue", fields: ["vendor_name", "category", "risk_level"], stage_filter: ["submitted", "business_review"] },
      { id: "record_detail", label: "Record detail", kind: "detail", fields: ["vendor_name", "requestor", "category", "risk_level", "notes"] },
    ],
    theme: { accent: "teal", density: "comfortable" },
  };
  return {
    definition,
    records: [
      createRecord("rec-security-tool", "Security scanner renewal", "submitted", "Bob", {
        vendor_name: "Sentry",
        requestor: "Bob",
        category: "software",
        risk_level: "medium",
        notes: "Renew annual security monitoring.",
      }),
      createRecord("rec-data-vendor", "Data enrichment trial", "business_review", "Charlie", {
        vendor_name: "Clearbit",
        requestor: "Charlie",
        category: "services",
        risk_level: "high",
        notes: "Needs privacy review before onboarding.",
      }),
    ],
  };
}

function createIncidentReview(input: { readonly app_id: string; readonly title: string; readonly purpose: string }): WorkflowAppSeed {
  const seed = createVendorIntake(input);
  return {
    definition: {
      ...seed.definition,
      entity: { singular: "Incident", plural: "Incidents" },
      fields: [
        { id: "title", label: "Incident", type: "text", required: true },
        { id: "severity", label: "Severity", type: "select", options: ["sev1", "sev2", "sev3"], required: true },
        { id: "owner", label: "Owner", type: "user", required: true },
        { id: "summary", label: "Summary", type: "long_text" },
      ],
      views: [
        { id: "incident_form", label: "Incident form", kind: "form", fields: ["title", "severity", "owner", "summary"] },
        { id: "incident_queue", label: "Incident queue", kind: "queue", fields: ["title", "severity", "owner"] },
        { id: "incident_detail", label: "Incident detail", kind: "detail", fields: ["title", "severity", "owner", "summary"] },
      ],
    },
    records: [],
  };
}

function createHiringLoop(input: { readonly app_id: string; readonly title: string; readonly purpose: string }): WorkflowAppSeed {
  const seed = createVendorIntake(input);
  return {
    definition: {
      ...seed.definition,
      entity: { singular: "Candidate", plural: "Candidates" },
      fields: [
        { id: "candidate_name", label: "Candidate", type: "text", required: true },
        { id: "role", label: "Role", type: "text", required: true },
        { id: "recruiter", label: "Recruiter", type: "user", required: true },
        { id: "notes", label: "Notes", type: "long_text" },
      ],
      views: [
        { id: "candidate_form", label: "Candidate form", kind: "form", fields: ["candidate_name", "role", "recruiter", "notes"] },
        { id: "candidate_queue", label: "Candidate queue", kind: "queue", fields: ["candidate_name", "role", "recruiter"] },
        { id: "candidate_detail", label: "Candidate detail", kind: "detail", fields: ["candidate_name", "role", "recruiter", "notes"] },
      ],
    },
    records: [],
  };
}

function withLegalReview(definition: WorkflowAppDefinition): WorkflowAppDefinition {
  const fields = ensureFields(definition.fields, [
    { id: "contract_value", label: "Contract value", type: "number", required: true, helper_text: "Used to route high-risk vendors." },
  ]);
  const stages = ensureStages(definition.stages, [
    { id: "legal_review", label: "Legal review", description: "Legal reviews high-risk or high-value requests." },
  ], "approved");
  const actions = ensureActions(
    definition.actions.filter((action) => action.id !== "approve_vendor"),
    [
      {
        id: "send_to_legal_review",
        label: "Send to legal review",
        from_stage: "business_review",
        to_stage: "legal_review",
        required_role: "approver",
        requires_comment: true,
      },
      {
        id: "legal_approve",
        label: "Legal approve",
        from_stage: "legal_review",
        to_stage: "approved",
        required_role: "legal",
        requires_comment: true,
      },
    ],
  );
  return {
    ...definition,
    fields,
    stages,
    actions,
    views: definition.views.map((view) => ({
      ...view,
      fields: ensureFieldIds(view.fields, ["contract_value"], view.kind === "detail" || view.kind === "queue"),
      stage_filter: view.stage_filter ? ensureFieldIds(view.stage_filter, ["legal_review"], true) : view.stage_filter,
    })),
  };
}

function withSlaTracking(definition: WorkflowAppDefinition): WorkflowAppDefinition {
  return {
    ...definition,
    fields: ensureFields(definition.fields, [
      { id: "due_date", label: "Due date", type: "date", required: true },
      { id: "sla_status", label: "SLA", type: "select", options: ["on_track", "at_risk", "breached"], required: true },
    ]),
    views: ensureViews(definition.views, [
      {
        id: "sla_watch",
        label: "SLA watch",
        kind: "queue",
        fields: ["vendor_name", "due_date", "sla_status"],
        stage_filter: definition.stages.filter((stage) => !stage.terminal).map((stage) => stage.id),
      },
    ]),
  };
}

function createRecord(
  id: string,
  title: string,
  stage: string,
  owner: string,
  values: Record<string, string | number | null>,
): WorkflowRecord {
  const now = Date.now();
  return {
    id,
    title,
    stage,
    owner,
    created_at_ms: now,
    updated_at_ms: now,
    values,
    history: [],
  };
}

function mentionsLegalReview(lower: string): boolean {
  return lower.includes("legal") || lower.includes("contract") || lower.includes("法务") || lower.includes("合同");
}

function mentionsSla(lower: string): boolean {
  return lower.includes("sla") || lower.includes("due date") || lower.includes("overdue") || lower.includes("时限");
}

function ensureFields(existing: readonly WorkflowField[], additions: readonly WorkflowField[]): readonly WorkflowField[] {
  const ids = new Set(existing.map((field) => field.id));
  return [...existing, ...additions.filter((field) => !ids.has(field.id))];
}

function ensureStages(existing: readonly WorkflowStage[], additions: readonly WorkflowStage[], beforeStageId: string): readonly WorkflowStage[] {
  const ids = new Set(existing.map((stage) => stage.id));
  const fresh = additions.filter((stage) => !ids.has(stage.id));
  if (fresh.length === 0) return existing;
  const index = existing.findIndex((stage) => stage.id === beforeStageId);
  if (index < 0) return [...existing, ...fresh];
  return [...existing.slice(0, index), ...fresh, ...existing.slice(index)];
}

function ensureActions(existing: readonly WorkflowAction[], additions: readonly WorkflowAction[]): readonly WorkflowAction[] {
  const ids = new Set(existing.map((action) => action.id));
  return [...existing, ...additions.filter((action) => !ids.has(action.id))];
}

function ensureViews(existing: readonly WorkflowView[], additions: readonly WorkflowView[]): readonly WorkflowView[] {
  const ids = new Set(existing.map((view) => view.id));
  return [...existing, ...additions.filter((view) => !ids.has(view.id))];
}

function ensureFieldIds(existing: readonly string[], additions: readonly string[], shouldAdd: boolean): readonly string[] {
  if (!shouldAdd) return existing;
  const ids = new Set(existing);
  return [...existing, ...additions.filter((id) => !ids.has(id))];
}

function defaultValueForField(field: WorkflowField): string | number | null {
  if (field.type === "number") return 0;
  if (field.type === "select") return field.options?.[0] ?? null;
  return "";
}

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{1,62}$/.test(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const fieldTypes = new Set<WorkflowFieldType>(["date", "long_text", "number", "select", "text", "url", "user"]);
const viewKinds = new Set<WorkflowViewKind>(["detail", "form", "queue"]);
