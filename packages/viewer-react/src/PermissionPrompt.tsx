import { usePneumaState, usePermissionResponder } from "./index.js";
import type { PermissionPrompt as PermissionPromptShape } from "@pneuma-framework/core";

/**
 * Renders a dismissible banner whenever the agent backend has requested
 * permission to run a tool. Calling Allow or Deny sends a permission-response
 * envelope back and clears the pending prompt.
 */
export function PermissionPrompt() {
  const { pendingPrompt, clearPendingPrompt } = usePneumaState();
  const respond = usePermissionResponder();
  if (!pendingPrompt) return null;
  const view = promptView(pendingPrompt);

  const answer = (decision: "allow" | "deny"): void => {
    respond(pendingPrompt.id, decision);
    clearPendingPrompt();
  };

  return (
    <div
      className="pneuma-prompt"
      role="alertdialog"
      aria-live="assertive"
      style={{
        position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
        width: "min(680px, calc(100vw - 32px))",
        zIndex: 10, background: "var(--paper, #fff)",
        border: "1px solid var(--rule-strong, #bbb)",
        borderRadius: 8, boxShadow: "0 12px 32px rgba(0,0,0,.14)",
        padding: "14px 16px", fontFamily: "var(--type-sans, system-ui)",
        fontSize: 13, color: "var(--ink, #171717)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 650, marginBottom: 4 }}>{view.title}</div>
          <div style={{ color: "var(--ink-muted, #666)", lineHeight: 1.45 }}>{view.subtitle}</div>
        </div>
        <code style={{ fontSize: 12, whiteSpace: "nowrap", color: "var(--ink-muted, #666)" }}>
          {pendingPrompt.tool}
        </code>
      </div>

      {view.items.length > 0 && (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.5 }}>
          {view.items.map((item, index) => (
            <li key={`${index}:${item}`}>{item}</li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button
          data-permission="deny"
          onClick={() => answer("deny")}
          style={{
            padding: "6px 12px",
            border: "1px solid var(--rule, #ccc)",
            background: "var(--paper, #fff)",
            cursor: "pointer",
            borderRadius: 6,
          }}
        >Deny · 拒绝</button>
        <button
          data-permission="allow"
          onClick={() => answer("allow")}
          style={{
            padding: "6px 12px",
            border: "1px solid var(--accent, #8d3b2f)",
            background: "var(--accent-soft, #fff4f1)",
            cursor: "pointer",
            borderRadius: 6,
            fontWeight: 600,
          }}
        >Allow · 允许</button>
      </div>
    </div>
  );
}

interface PromptView {
  readonly title: string;
  readonly subtitle: string;
  readonly items: readonly string[];
}

function promptView(prompt: PermissionPromptShape): PromptView {
  if (prompt.tool === "definition.apply") {
    return definitionApplyView(prompt.detail);
  }
  if (prompt.tool === "definition.rollback.validate" || prompt.tool === "definition.rollback") {
    return definitionRollbackView(prompt.detail);
  }
  const keys = Object.keys(prompt.detail);
  return {
    title: "Permission request · 权限请求",
    subtitle: `Agent wants to run ${prompt.tool}.`,
    items: keys.length > 0 ? [`Details: ${keys.join(", ")}`] : [],
  };
}

function definitionApplyView(detail: Record<string, unknown>): PromptView {
  const change = object(detail.change);
  const impact = object(detail.impact);
  const operationId = stringValue(detail.operation_id) ?? "definition change";
  const restartRequired = detail.restart_required === true;
  const items: string[] = [];

  if (change?.kind === "add_table") {
    const tableId = stringValue(change.table_id) ?? "(unknown table)";
    const columns = Array.isArray(change.columns)
      ? change.columns.map((c) => stringValue(object(c)?.name)).filter(isString)
      : [];
    items.push(`Add table: ${tableId}`);
    if (columns.length > 0) items.push(`Columns: ${columns.join(", ")}`);
  } else if (change?.kind === "add_table_column") {
    const tableId = stringValue(change.table_id) ?? "(unknown table)";
    const columnName = stringValue(change.column_name) ?? "(unknown column)";
    items.push(`Add column: ${tableId}.${columnName}`);
    const cellType = formatCellType(change.cell_type);
    if (cellType) items.push(`Type: ${cellType}`);
    items.push(`Nullable: ${change.nullable === true ? "yes" : "no"}`);
  } else if (change?.kind === "add_operation") {
    const declaredOperationId = stringValue(change.operation_id) ?? "(unknown operation)";
    items.push(`Add operation: ${declaredOperationId}`);
    const name = stringValue(change.name);
    if (name) items.push(`Name: ${name}`);
    const handler = object(change.handler);
    const handlerKind = stringValue(handler?.kind);
    if (handler && handlerKind) items.push(`Handler: ${formatOperationHandler(handler)}`);
    const fields = Array.isArray(handler?.fields) ? handler.fields.filter(isString) : [];
    if (fields.length > 0) items.push(`Fields: ${fields.join(", ")}`);
    const output = formatOperationOutput(change.output, stringValue(handler?.on));
    if (output) items.push(`Output: ${output}`);
    items.push("Capability surface: agent/client Operation");
  } else {
    items.push(`Operation: ${operationId}`);
  }

  for (const line of impactLines(impact)) items.push(line);
  items.push(`Restart required: ${restartRequired ? "yes" : "no"}`);

  return {
    title: "App definition change request · 应用定义变更审批",
    subtitle: "Review the proposed schema impact before the framework applies and restarts the app.",
    items,
  };
}

function impactLines(impact: Record<string, unknown> | undefined): string[] {
  if (!impact) return [];
  const out: string[] = [];
  const addedTables = Array.isArray(impact.added_tables) ? impact.added_tables : [];
  for (const raw of addedTables) {
    const table = object(raw);
    const tableId = stringValue(table?.table_id);
    const columns = Array.isArray(table?.columns) ? table.columns.filter(isString) : [];
    if (tableId) out.push(`Impact: new table ${tableId}${columns.length > 0 ? ` (${columns.join(", ")})` : ""}`);
  }
  const changedTables = Array.isArray(impact.changed_tables) ? impact.changed_tables : [];
  for (const raw of changedTables) {
    const table = object(raw);
    const tableId = stringValue(table?.table_id);
    const added = Array.isArray(table?.added_columns) ? table.added_columns.filter(isString) : [];
    if (tableId && added.length > 0) out.push(`Impact: ${tableId} +${added.join(", +")}`);
  }
  const addedOperations = Array.isArray(impact.added_operations) ? impact.added_operations : [];
  for (const raw of addedOperations) {
    const operation = object(raw);
    const operationId = stringValue(operation?.operation_id);
    if (!operationId) continue;
    const action = stringValue(operation?.action);
    const handlerKind = stringValue(operation?.handler_kind);
    const parts = [action, handlerKind].filter(isString);
    out.push(`Impact: new operation ${operationId}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`);
  }
  return out;
}

function definitionRollbackView(detail: Record<string, unknown>): PromptView {
  const impact = object(detail.impact);
  const currentVersion = numberValue(detail.current_history_version);
  const targetVersion = numberValue(detail.target_history_version);
  const destructive = detail.destructive === true;
  const requiresApproval = detail.requires_approval === true;
  const items: string[] = [];

  if (targetVersion !== undefined) items.push(`Target history version: ${targetVersion}`);
  if (currentVersion !== undefined) items.push(`Current history version: ${currentVersion}`);

  const impactItems = rollbackImpactLines(impact);
  if (impactItems.length > 0) {
    items.push(...impactItems);
  } else {
    items.push("No schema removals detected");
  }

  items.push(`Destructive: ${destructive ? "yes" : "no"}`);
  items.push(`Approval required: ${requiresApproval ? "yes" : "no"}`);

  const warnings = Array.isArray(detail.warnings) ? detail.warnings.filter(isString) : [];
  for (const warning of warnings) items.push(`Warning: ${warning}`);

  return {
    title: "Definition rollback impact · 应用定义回滚影响审批",
    subtitle: "Review the schema and data impact before rollback execution is allowed.",
    items,
  };
}

function rollbackImpactLines(impact: Record<string, unknown> | undefined): string[] {
  if (!impact) return [];
  const out: string[] = [];

  const removedTables = Array.isArray(impact.removed_tables) ? impact.removed_tables : [];
  for (const raw of removedTables) {
    const table = object(raw);
    const tableId = stringValue(table?.table_id);
    if (!tableId) continue;
    const rowCount = numberValue(table?.row_count);
    const columns = Array.isArray(table?.columns) ? table.columns.filter(isString) : [];
    const rowImpact = rowCount === undefined
      ? "unknown rows affected"
      : `${rowCount} ${plural(rowCount, "row")} affected`;
    out.push(
      `Remove table: ${tableId} (${rowImpact}${columns.length > 0 ? `; columns: ${columns.join(", ")}` : ""})`,
    );
  }

  const removedColumns = Array.isArray(impact.removed_columns) ? impact.removed_columns : [];
  for (const raw of removedColumns) {
    const column = object(raw);
    const tableId = stringValue(column?.table_id);
    const columnName = stringValue(column?.column_name);
    if (!tableId || !columnName) continue;
    const affected = numberValue(column?.affected_row_count);
    const impactText = affected === undefined
      ? "unknown rows with values"
      : `${affected} ${plural(affected, "row")} with values`;
    out.push(`Remove column: ${tableId}.${columnName} (${impactText})`);
  }

  const restoredTables = Array.isArray(impact.restored_tables) ? impact.restored_tables : [];
  for (const raw of restoredTables) {
    const table = object(raw);
    const tableId = stringValue(table?.table_id);
    if (!tableId) continue;
    const columns = Array.isArray(table?.columns) ? table.columns.filter(isString) : [];
    out.push(`Restore table: ${tableId}${columns.length > 0 ? ` (columns: ${columns.join(", ")})` : ""}`);
  }

  const restoredColumns = Array.isArray(impact.restored_columns) ? impact.restored_columns : [];
  for (const raw of restoredColumns) {
    const column = object(raw);
    const tableId = stringValue(column?.table_id);
    const columnName = stringValue(column?.column_name);
    if (tableId && columnName) out.push(`Restore column: ${tableId}.${columnName}`);
  }

  const removedOperations = Array.isArray(impact.removed_operations) ? impact.removed_operations : [];
  for (const raw of removedOperations) {
    const operation = object(raw);
    const operationId = stringValue(operation?.operation_id);
    if (!operationId) continue;
    const handlerKind = stringValue(operation?.handler_kind);
    out.push(`Remove operation: ${operationId}${handlerKind ? ` (${handlerKind})` : ""}`);
  }

  const restoredOperations = Array.isArray(impact.restored_operations) ? impact.restored_operations : [];
  for (const raw of restoredOperations) {
    const operation = object(raw);
    const operationId = stringValue(operation?.operation_id);
    if (!operationId) continue;
    const handlerKind = stringValue(operation?.handler_kind);
    out.push(`Restore operation: ${operationId}${handlerKind ? ` (${handlerKind})` : ""}`);
  }

  return out;
}

function formatOperationHandler(handler: Record<string, unknown>): string {
  const kind = stringValue(handler.kind) ?? "unknown";
  if (kind !== "query") return kind;
  const tableId = stringValue(handler.on);
  return tableId ? `query on ${tableId}` : "query";
}

function formatOperationOutput(value: unknown, defaultRowType: string | undefined): string | undefined {
  if (value === undefined) return defaultRowType ? `row-list(${defaultRowType})` : undefined;
  const output = object(value);
  if (!output) return formatCellType(value);
  if (output.kind === "row-list") {
    return `row-list(${stringValue(output.row_type) ?? defaultRowType ?? "rows"})`;
  }
  if (typeof output.kind === "string") return output.kind;
  return undefined;
}

function formatCellType(value: unknown): string | undefined {
  const v = object(value);
  if (!v) return undefined;
  if (v.kind === "primitive") return stringValue(v.of);
  if (typeof v.kind === "string") return v.kind;
  return undefined;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
