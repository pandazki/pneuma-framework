export type ViewKind = "table" | "list" | "detail" | "custom";

export type ViewPresentationColumnRole = "title" | "subtitle" | "body" | "metadata" | "url";

export interface ViewPresentationColumn {
  readonly field: string;
  readonly label?: string;
  readonly role?: ViewPresentationColumnRole;
}

export interface ViewPresentation {
  readonly title?: string;
  readonly columns?: readonly ViewPresentationColumn[];
  readonly empty_state?: string;
}

export type ViewPresentationInput = ViewPresentation | Readonly<Record<string, unknown>>;

export interface ViewOperationSource {
  readonly kind: "operation";
  readonly operation_id: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export type ViewSource = ViewOperationSource;

export interface ViewInit {
  readonly id: string;
  readonly app_id: string;
  readonly name: string;
  readonly description?: string;
  readonly kind: ViewKind;
  readonly source: ViewSource;
  readonly presentation?: ViewPresentationInput;
}

export class ViewInvariantViolation extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "ViewInvariantViolation";
  }
}

export class View {
  readonly id: string;
  readonly app_id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: ViewKind;
  readonly source: ViewSource;
  readonly presentation?: ViewPresentation;

  constructor(init: ViewInit) {
    if (!init.id) throw new ViewInvariantViolation("id required", "empty_id");
    if (!init.app_id) throw new ViewInvariantViolation("app_id required", "empty_app_id");
    if (!init.name) throw new ViewInvariantViolation("name required", "empty_name");
    if (!isViewKind(init.kind)) {
      throw new ViewInvariantViolation(`invalid view kind '${String(init.kind)}'`, "invalid_kind");
    }
    if (!isViewSource(init.source)) {
      throw new ViewInvariantViolation("invalid source", "invalid_source");
    }
    const presentation = normalizeViewPresentation(init.presentation);

    this.id = init.id;
    this.app_id = init.app_id;
    this.name = init.name;
    this.description = init.description ?? "";
    this.kind = init.kind;
    this.source = normalizeViewSource(init.source);
    this.presentation = presentation;
  }
}

export function isViewKind(value: unknown): value is ViewKind {
  return value === "table" || value === "list" || value === "detail" || value === "custom";
}

export function isViewSource(value: unknown): value is ViewSource {
  if (!isPlainObject(value)) return false;
  const source = value as { kind?: unknown; operation_id?: unknown; params?: unknown };
  if (source.kind !== "operation") return false;
  if (typeof source.operation_id !== "string" || source.operation_id.length === 0) return false;
  if (source.params !== undefined && !isPlainObject(source.params)) return false;
  return true;
}

function normalizeViewSource(source: ViewSource): ViewSource {
  const out: {
    kind: "operation";
    operation_id: string;
    params?: Readonly<Record<string, unknown>>;
  } = {
    kind: "operation",
    operation_id: source.operation_id,
  };
  if (source.params !== undefined) out.params = { ...source.params };
  return out;
}

export function normalizeViewPresentation(
  presentation: ViewPresentationInput | undefined,
): ViewPresentation | undefined {
  if (presentation === undefined) return undefined;
  if (!isPlainObject(presentation)) {
    throw new ViewInvariantViolation("presentation must be an object when provided", "invalid_presentation");
  }
  for (const key of Object.keys(presentation)) {
    if (key !== "title" && key !== "columns" && key !== "empty_state") {
      throw new ViewInvariantViolation(
        `presentation.${key} is not part of the View presentation contract`,
        "invalid_presentation",
      );
    }
  }

  const normalized: {
    title?: string;
    columns?: ViewPresentationColumn[];
    empty_state?: string;
  } = {};

  if (presentation.title !== undefined) {
    if (typeof presentation.title !== "string") {
      throw new ViewInvariantViolation("presentation.title must be a string", "invalid_presentation");
    }
    normalized.title = presentation.title;
  }

  if (presentation.empty_state !== undefined) {
    if (typeof presentation.empty_state !== "string") {
      throw new ViewInvariantViolation("presentation.empty_state must be a string", "invalid_presentation");
    }
    normalized.empty_state = presentation.empty_state;
  }

  if (presentation.columns !== undefined) {
    if (!Array.isArray(presentation.columns)) {
      throw new ViewInvariantViolation("presentation.columns must be an array", "invalid_presentation");
    }
    normalized.columns = presentation.columns.map((column, index) => normalizeViewPresentationColumn(column, index));
  }

  return normalized;
}

function normalizeViewPresentationColumn(column: unknown, index: number): ViewPresentationColumn {
  if (typeof column === "string") {
    if (column.length === 0) {
      throw new ViewInvariantViolation(
        `presentation.columns[${index}] must not be empty`,
        "invalid_presentation",
      );
    }
    return { field: column };
  }

  if (!isPlainObject(column)) {
    throw new ViewInvariantViolation(
      `presentation.columns[${index}] must be a field name or column object`,
      "invalid_presentation",
    );
  }
  for (const key of Object.keys(column)) {
    if (key !== "field" && key !== "label" && key !== "role") {
      throw new ViewInvariantViolation(
        `presentation.columns[${index}].${key} is not part of the View presentation contract`,
        "invalid_presentation",
      );
    }
  }

  const field = column.field;
  if (typeof field !== "string" || field.length === 0) {
    throw new ViewInvariantViolation(
      `presentation.columns[${index}].field must be a non-empty string`,
      "invalid_presentation",
    );
  }

  const normalized: {
    field: string;
    label?: string;
    role?: ViewPresentationColumnRole;
  } = { field };

  if (column.label !== undefined) {
    if (typeof column.label !== "string") {
      throw new ViewInvariantViolation(
        `presentation.columns[${index}].label must be a string`,
        "invalid_presentation",
      );
    }
    normalized.label = column.label;
  }

  if (column.role !== undefined) {
    if (!isViewPresentationColumnRole(column.role)) {
      throw new ViewInvariantViolation(
        `presentation.columns[${index}].role is invalid`,
        "invalid_presentation",
      );
    }
    normalized.role = column.role;
  }

  return normalized;
}

function isViewPresentationColumnRole(value: unknown): value is ViewPresentationColumnRole {
  return value === "title"
    || value === "subtitle"
    || value === "body"
    || value === "metadata"
    || value === "url";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
