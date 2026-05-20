import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validateWorkflowAppDefinition,
  type WorkflowAction,
  type WorkflowAppDefinition,
  type WorkflowField,
  type WorkflowStage,
  type WorkflowView,
} from "../domain/workflow-app.js";

export interface WorkflowAppPatch {
  readonly fields?: readonly WorkflowField[];
  readonly stages?: readonly WorkflowStage[];
  readonly actions?: readonly WorkflowAction[];
  readonly views?: readonly WorkflowView[];
  readonly purpose_suffix?: string;
}

export interface WorkflowAppModule {
  readonly workflowPatch: WorkflowAppPatch;
}

export async function materializeWorkflowFromSourceRoot(
  root: string,
): Promise<WorkflowAppDefinition> {
  const sourceDir = existsSync(join(root, "src")) ? join(root, "src") : root;
  const base = JSON.parse(readFileSync(join(sourceDir, "workflow.json"), "utf8")) as WorkflowAppDefinition;
  const module = await importWorkflowAppModule(join(sourceDir, "app.ts"));
  const next = applyWorkflowAppPatch(base, module.workflowPatch);
  const validation = validateWorkflowAppDefinition(next);
  if (!validation.ok) {
    throw new Error(`Generated app source is invalid: ${validation.issues.join("; ")}`);
  }
  return next;
}

export function applyWorkflowAppPatch(
  base: WorkflowAppDefinition,
  patch: WorkflowAppPatch,
): WorkflowAppDefinition {
  const normalized = normalizeWorkflowAppPatch(patch);
  const fields = upsertById(base.fields, normalized.fields ?? []);
  const stages = insertBeforeTerminalApproved(base.stages, normalized.stages ?? []);
  const actions = upsertById(base.actions, normalized.actions ?? []);
  const views = upsertById(base.views, normalized.views ?? []);
  return {
    ...base,
    purpose: normalized.purpose_suffix && !base.purpose.includes(normalized.purpose_suffix)
      ? `${base.purpose} ${normalized.purpose_suffix}`.trim()
      : base.purpose,
    fields,
    stages,
    actions,
    views,
  };
}

export function defaultWorkflowAppModuleSource(): string {
  return `export const workflowPatch = {
  fields: [],
  stages: [],
  actions: [],
  views: [],
};
`;
}

export function legalReviewWorkflowAppModuleSource(): string {
  return `export const workflowPatch = {
  purpose_suffix: "Routes high-risk contracts through legal review before final approval.",
  fields: [
    {
      id: "contract_value",
      label: "Contract value",
      type: "number",
      required: true,
      helper_text: "Estimated annual contract value used for legal and risk review."
    }
  ],
  stages: [
    {
      id: "legal_review",
      label: "Legal review",
      description: "Legal team reviews contract risk before final approval."
    }
  ],
  actions: [
    {
      id: "send_to_legal_review",
      label: "Send to legal review",
      from_stage: "business_review",
      to_stage: "legal_review",
      required_role: "operations",
      requires_comment: true
    },
    {
      id: "legal_approve",
      label: "Legal approve",
      from_stage: "legal_review",
      to_stage: "approved",
      required_role: "legal",
      requires_comment: true
    }
  ],
  views: [
    {
      id: "legal_queue",
      label: "Legal review queue",
      kind: "queue",
      fields: ["vendor_name", "risk_level", "contract_value", "notes"],
      stage_filter: ["legal_review"]
    }
  ]
};
`;
}

export function slaWorkflowAppModuleSource(): string {
  return `export const workflowPatch = {
  purpose_suffix: "Tracks due dates and SLA status so owners can see aging work before it slips.",
  fields: [
    {
      id: "due_date",
      label: "Due date",
      type: "date",
      required: true,
      helper_text: "Target completion date for this item."
    },
    {
      id: "sla_status",
      label: "SLA status",
      type: "select",
      options: ["on_track", "at_risk", "breached"],
      required: true,
      helper_text: "Current service-level health."
    }
  ],
  stages: [],
  actions: [],
  views: [
    {
      id: "sla_watch",
      label: "SLA watch",
      kind: "queue",
      fields: ["vendor_name", "requestor", "due_date", "sla_status", "risk_level"],
      stage_filter: ["submitted", "business_review"]
    }
  ]
};
`;
}

export function classifyWorkflowIntent(message: string): "legal_review" | "sla_tracking" | "unknown" {
  const lower = message.toLowerCase();
  if (lower.includes("legal") || lower.includes("contract")) return "legal_review";
  if (lower.includes("sla") || lower.includes("deadline") || lower.includes("due date") || lower.includes("overdue")) return "sla_tracking";
  return "unknown";
}

export function expectedPatchEvidenceForIntent(message: string): {
  readonly summary: string;
  readonly required_ids: readonly string[];
} {
  const intent = classifyWorkflowIntent(message);
  if (intent === "legal_review") {
    return {
      summary: "Add legal review to the workflow before approval.",
      required_ids: ["contract_value", "legal_review", "send_to_legal_review", "legal_approve", "legal_queue"],
    };
  }
  if (intent === "sla_tracking") {
    return {
      summary: "Add SLA tracking to the workflow.",
      required_ids: ["due_date", "sla_status", "sla_watch"],
    };
  }
  return {
    summary: "Refine the workflow application source.",
    required_ids: [],
  };
}

async function importWorkflowAppModule(path: string): Promise<WorkflowAppModule> {
  if (!existsSync(path)) throw new Error(`Generated app module is missing: ${path}`);
  const source = readFileSync(path, "utf8");
  const workflowPatch = evaluateWorkflowPatchLiteral(source);
  if (!workflowPatch || typeof workflowPatch !== "object") {
    throw new Error("src/app.ts must export workflowPatch.");
  }
  validatePatchShape(workflowPatch);
  return { workflowPatch: normalizeWorkflowAppPatch(workflowPatch) };
}

function evaluateWorkflowPatchLiteral(source: string): WorkflowAppPatch {
  const trimmed = source.trim();
  const prefix = "export const workflowPatch =";
  const start = trimmed.indexOf(prefix);
  if (start < 0) throw new Error("src/app.ts must contain `export const workflowPatch =`.");
  const expression = trimmed.slice(start + prefix.length).trim().replace(/;\s*$/, "");
  // The scaffold contract intentionally limits src/app.ts to a literal patch.
  // This avoids long-lived module-cache bugs when a Builder evolves the same app
  // several times in one Host process.
  return Function(`"use strict"; return (${expression});`)() as WorkflowAppPatch;
}

function validatePatchShape(patch: WorkflowAppPatch): void {
  for (const [key, value] of Object.entries(patch)) {
    if (key === "purpose_suffix") {
      if (typeof value !== "string") throw new Error("workflowPatch.purpose_suffix must be a string.");
      continue;
    }
    if (!["fields", "stages", "actions", "views"].includes(key)) {
      throw new Error(`workflowPatch has unsupported key: ${key}`);
    }
    if (!Array.isArray(value)) throw new Error(`workflowPatch.${key} must be an array.`);
  }
  normalizeWorkflowAppPatch(patch);
}

function normalizeWorkflowAppPatch(patch: WorkflowAppPatch): WorkflowAppPatch {
  return {
    ...patch,
    views: patch.views?.map((view) => normalizeWorkflowViewPatch(view)),
  };
}

function normalizeWorkflowViewPatch(view: WorkflowView): WorkflowView {
  const raw = view as WorkflowView & {
    readonly fields?: unknown;
    readonly stage_filter?: unknown;
  };
  return {
    ...view,
    fields: normalizeStringList(raw.fields, `workflowPatch.views.${String(view.id)}.fields`),
    ...(raw.stage_filter === undefined
      ? {}
      : { stage_filter: normalizeStringList(raw.stage_filter, `workflowPatch.views.${String(view.id)}.stage_filter`) }),
  };
}

function normalizeStringList(value: unknown, label: string): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  throw new Error(`${label} must be a string or string array.`);
}

function upsertById<T extends { readonly id: string }>(
  base: readonly T[],
  additions: readonly T[],
): readonly T[] {
  const output = [...base];
  for (const addition of additions) {
    const existingIndex = output.findIndex((candidate) => candidate.id === addition.id);
    if (existingIndex >= 0) {
      output[existingIndex] = addition;
    } else {
      output.push(addition);
    }
  }
  return output;
}

function insertBeforeTerminalApproved(
  base: readonly WorkflowStage[],
  additions: readonly WorkflowStage[],
): readonly WorkflowStage[] {
  let output = [...base];
  for (const addition of additions) {
    const existingIndex = output.findIndex((candidate) => candidate.id === addition.id);
    if (existingIndex >= 0) {
      output[existingIndex] = addition;
      continue;
    }
    const approvedIndex = output.findIndex((stage) => stage.id === "approved");
    if (approvedIndex >= 0) {
      output = [
        ...output.slice(0, approvedIndex),
        addition,
        ...output.slice(approvedIndex),
      ];
    } else {
      output.push(addition);
    }
  }
  return output;
}
