import type {
  DiscoveredViewPresentation,
  DiscoveredViewPresentationColumnRole,
} from "@pneuma-framework/core";

export interface NormalizedViewColumn {
  readonly field: string;
  readonly label: string;
  readonly role?: DiscoveredViewPresentationColumnRole;
}

export interface NormalizedViewPresentation {
  readonly title: string;
  readonly columns: readonly NormalizedViewColumn[];
  readonly emptyState: string;
}

export interface ViewPresentationFallbacks {
  readonly title?: string;
  readonly columns?: readonly string[];
  readonly rows?: readonly Record<string, unknown>[];
  readonly emptyState?: string;
}

export function normalizeViewPresentationForRender(
  presentation: DiscoveredViewPresentation | unknown,
  fallbacks: ViewPresentationFallbacks = {},
): NormalizedViewPresentation {
  const raw = objectValue(presentation);
  const title = stringValue(raw?.title) ?? fallbacks.title ?? "View";
  const columns = presentationColumns(raw?.columns, fallbacks);
  const emptyState = stringValue(raw?.empty_state) ?? fallbacks.emptyState ?? "No rows returned.";

  return { title, columns, emptyState };
}

export function valueText(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function viewTableRows(
  presentation: NormalizedViewPresentation,
  rows: readonly Record<string, unknown>[],
): string[][] {
  return rows.map((row) =>
    presentation.columns.map((column) => valueText(row[column.field]))
  );
}

function presentationColumns(
  rawColumns: unknown,
  fallbacks: ViewPresentationFallbacks,
): readonly NormalizedViewColumn[] {
  if (Array.isArray(rawColumns)) {
    const normalized = rawColumns
      .map(normalizeColumn)
      .filter((column): column is NormalizedViewColumn => column !== undefined);
    if (normalized.length > 0) return normalized;
  }

  if (fallbacks.columns && fallbacks.columns.length > 0) {
    return fallbacks.columns.map((field) => ({
      field,
      label: labelFromField(field),
    }));
  }

  const row = fallbacks.rows?.[0];
  if (row) {
    const fields = Object.keys(row).filter((field) => field !== "id").slice(0, 4);
    if (fields.length > 0) {
      return fields.map((field) => ({
        field,
        label: labelFromField(field),
      }));
    }
  }

  return [{ field: "id", label: "ID" }];
}

function normalizeColumn(column: unknown): NormalizedViewColumn | undefined {
  if (typeof column === "string" && column.length > 0) {
    return { field: column, label: labelFromField(column) };
  }

  const raw = objectValue(column);
  if (!raw) return undefined;
  const field = stringValue(raw.field);
  if (!field) return undefined;

  const role = stringValue(raw.role);
  return {
    field,
    label: stringValue(raw.label) ?? labelFromField(field),
    role: isColumnRole(role) ? role : undefined,
  };
}

function labelFromField(field: string): string {
  const label = field
    .split("_")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
  return label.length > 0 ? label : field;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isColumnRole(value: unknown): value is DiscoveredViewPresentationColumnRole {
  return value === "title"
    || value === "subtitle"
    || value === "body"
    || value === "metadata"
    || value === "url";
}
