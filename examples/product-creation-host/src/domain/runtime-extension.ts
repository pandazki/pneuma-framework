import type { DevBoardItem } from "./dev-board.js";

export type DevBoardRuntimeEditableField = "owner" | "status" | "priority" | "ci_status" | "blocked_reason";

export interface DevBoardRuntimeItemAction {
  readonly id: string;
  readonly kind: "edit_field";
  readonly field: DevBoardRuntimeEditableField;
  readonly label: RuntimeLabel;
  readonly control: "text" | "select";
  readonly options?: readonly string[];
  readonly placement?: "table" | "card";
  readonly helper_text?: RuntimeLabel;
}

export interface DevBoardRuntimeExtension {
  readonly schema_version: 1;
  readonly item_actions: readonly DevBoardRuntimeItemAction[];
}

export type RuntimeLabel = string | {
  readonly en: string;
  readonly zh: string;
};

export function defaultDevBoardRuntimeExtension(): DevBoardRuntimeExtension {
  return {
    schema_version: 1,
    item_actions: [],
  };
}

export function withOwnerEditor(extension: DevBoardRuntimeExtension): DevBoardRuntimeExtension {
  if (hasEditableRuntimeField(extension, "owner")) return extension;
  return {
    ...extension,
    item_actions: [
      ...extension.item_actions,
      {
        id: "edit_owner",
        kind: "edit_field",
        field: "owner",
        label: { en: "Edit owner", zh: "编辑负责人" },
        control: "select",
        options: ["Bob", "Charlie", "Alice", "Dave", "End User"],
        placement: "table",
      },
    ],
  };
}

export function parseDevBoardRuntimeExtension(text: string): DevBoardRuntimeExtension {
  const value = JSON.parse(text) as DevBoardRuntimeExtension;
  const validation = validateDevBoardRuntimeExtension(value);
  if (!validation.ok) throw new Error(validation.issues.join("; "));
  return value;
}

export function validateDevBoardRuntimeExtension(value: unknown):
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly string[] } {
  const issues: string[] = [];
  const record = value as Partial<DevBoardRuntimeExtension> | undefined;
  if (!record || typeof record !== "object") issues.push("runtime extension must be an object");
  if (record?.schema_version !== 1) issues.push("runtime extension schema_version must be 1");
  if (!Array.isArray(record?.item_actions)) issues.push("runtime extension item_actions must be an array");

  const actionIds = new Set<string>();
  for (const action of record?.item_actions ?? []) {
    if (!action || typeof action !== "object") {
      issues.push("runtime action must be an object");
      continue;
    }
    if (typeof action.id !== "string" || !/^[a-z][a-z0-9_-]{1,62}$/.test(action.id)) {
      issues.push(`runtime action id is invalid: ${String(action.id)}`);
    }
    if (actionIds.has(action.id)) issues.push(`duplicate runtime action id: ${action.id}`);
    actionIds.add(action.id);
    if (action.kind !== "edit_field") issues.push(`unsupported runtime action kind: ${String(action.kind)}`);
    if (!editableFields.has(action.field as DevBoardRuntimeEditableField)) {
      issues.push(`unsupported runtime action field: ${String(action.field)}`);
    }
    if (!isRuntimeLabel(action.label)) issues.push(`runtime action label is invalid: ${String(action.id)}`);
    if (action.helper_text !== undefined && !isRuntimeLabel(action.helper_text)) {
      issues.push(`runtime action helper_text is invalid: ${String(action.id)}`);
    }
    if (action.control !== "text" && action.control !== "select") {
      issues.push(`unsupported runtime action control: ${String(action.control)}`);
    }
    if (action.control === "select") {
      if (!Array.isArray(action.options) || action.options.length < 1) {
        issues.push(`select runtime action requires options: ${String(action.id)}`);
      } else if (action.options.some((option) => typeof option !== "string" || option.length < 1)) {
        issues.push(`runtime action options must be non-empty strings: ${String(action.id)}`);
      }
    }
    if (action.placement !== undefined && action.placement !== "table" && action.placement !== "card") {
      issues.push(`unsupported runtime action placement: ${String(action.placement)}`);
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function hasEditableRuntimeField(
  extension: DevBoardRuntimeExtension,
  field: DevBoardRuntimeEditableField,
): boolean {
  return extension.item_actions.some((action) => action.kind === "edit_field" && action.field === field);
}

export function actionForRuntimeField(
  extension: DevBoardRuntimeExtension,
  field: DevBoardRuntimeEditableField,
): DevBoardRuntimeItemAction | undefined {
  return extension.item_actions.find((action) => action.kind === "edit_field" && action.field === field);
}

export function localizeRuntimeLabel(label: RuntimeLabel, lang: "en" | "zh"): string {
  return typeof label === "string" ? label : label[lang];
}

export function applyRuntimeItemPatch(
  item: DevBoardItem,
  patch: Partial<Pick<DevBoardItem, DevBoardRuntimeEditableField>>,
  extension: DevBoardRuntimeExtension,
): DevBoardItem {
  if (patch.owner !== undefined && !hasEditableRuntimeField(extension, "owner")) {
    throw new Error("runtime extension does not allow editing owner");
  }
  return {
    ...item,
    blocked_reason: patch.blocked_reason ?? item.blocked_reason,
    ci_status: patch.ci_status ?? item.ci_status,
    owner: hasEditableRuntimeField(extension, "owner") ? patch.owner?.trim() || item.owner : item.owner,
    priority: patch.priority ?? item.priority,
    status: patch.status ?? item.status,
  };
}

export function mentionsDirectOwnerEditing(lowercaseMessage: string): boolean {
  const mentionsOwner = lowercaseMessage.includes("owner")
    || lowercaseMessage.includes("assignee")
    || lowercaseMessage.includes("负责人")
    || lowercaseMessage.includes("指派");
  const mentionsEdit = lowercaseMessage.includes("edit")
    || lowercaseMessage.includes("editable")
    || lowercaseMessage.includes("change")
    || lowercaseMessage.includes("修改")
    || lowercaseMessage.includes("改")
    || lowercaseMessage.includes("编辑")
    || lowercaseMessage.includes("直接");
  return mentionsOwner && mentionsEdit;
}

function isRuntimeLabel(value: unknown): value is RuntimeLabel {
  if (typeof value === "string") return value.length > 0;
  if (!value || typeof value !== "object") return false;
  const record = value as { readonly en?: unknown; readonly zh?: unknown };
  return typeof record.en === "string" && record.en.length > 0
    && typeof record.zh === "string" && record.zh.length > 0;
}

const editableFields = new Set<DevBoardRuntimeEditableField>([
  "blocked_reason",
  "ci_status",
  "owner",
  "priority",
  "status",
]);
