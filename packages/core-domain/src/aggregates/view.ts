export type ViewKind = "table" | "list" | "detail" | "custom";

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
  readonly presentation?: Readonly<Record<string, unknown>>;
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
  readonly presentation?: Readonly<Record<string, unknown>>;

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
    if (init.presentation !== undefined && !isPlainObject(init.presentation)) {
      throw new ViewInvariantViolation("presentation must be an object when provided", "invalid_presentation");
    }

    this.id = init.id;
    this.app_id = init.app_id;
    this.name = init.name;
    this.description = init.description ?? "";
    this.kind = init.kind;
    this.source = normalizeViewSource(init.source);
    this.presentation = init.presentation === undefined ? undefined : { ...init.presentation };
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
