import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AuthorizationTarget,
  Capability,
  Principal,
} from "@pneuma-framework/core-domain";
import { stateDir } from "./workspace.js";

export type PermissionLedgerDecision = "allow" | "deny" | "allow-always";
export type PermissionLedgerRequestStatus =
  | "pending"
  | "allowed"
  | "denied"
  | "authorized"
  | "completed"
  | "failed"
  | "expired";

export interface PermissionLedgerBaseEvent {
  readonly schema_version: 1;
  readonly event_id: string;
  readonly event_type: string;
  readonly at_ms: number;
  readonly prompt_id: string;
  readonly session_id?: string;
  readonly app_id: string;
  readonly workspace_id: string;
  readonly tool: string;
  readonly capability?: Capability;
  readonly target?: AuthorizationTarget;
  readonly target_fingerprint?: string;
}

export type PermissionLedgerEvent =
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_requested";
      readonly requested_principal?: Principal;
      readonly detail: Record<string, unknown>;
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_responded";
      readonly decision: PermissionLedgerDecision;
      readonly decided_by: { readonly kind: "builder"; readonly id: string };
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "approval_token_issued";
      readonly approval_token_hash: string;
      readonly approved_capability: Capability;
      readonly approved_by: { readonly kind: "builder"; readonly id: string };
      readonly issued_at_ms: number;
      readonly expires_at_ms: number;
      readonly single_use: true;
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_execution_authorized";
      readonly authorization_reason_code: string;
      readonly execution_principal?: Principal;
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_execution_denied";
      readonly authorization_reason_code: string;
      readonly execution_principal?: Principal;
      readonly message?: string;
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_execution_completed";
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_execution_failed";
      readonly message: string;
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_expired";
      readonly message?: string;
    });

export interface PermissionLedgerRequestRecord {
  readonly prompt_id: string;
  readonly status: PermissionLedgerRequestStatus;
  readonly live: boolean;
  readonly requested_at_ms: number;
  readonly responded_at_ms?: number;
  readonly completed_at_ms?: number;
  readonly tool: string;
  readonly capability?: Capability;
  readonly target?: AuthorizationTarget;
  readonly target_fingerprint?: string;
  readonly requested_principal?: Principal;
  readonly decided_by?: { readonly kind: "builder"; readonly id: string };
  readonly decision?: PermissionLedgerDecision;
  readonly approved_by?: { readonly kind: "builder"; readonly id: string };
  readonly approval_token_hash?: string;
  readonly approved_capability?: Capability;
  readonly approval_token_expires_at_ms?: number;
  readonly approval_token_single_use?: true;
  readonly execution_principal?: Principal;
  readonly detail: Record<string, unknown>;
  readonly authorization_reason_code?: string;
  readonly message?: string;
}

export interface PermissionLedgerListOptions {
  readonly limit?: number;
}

export interface PermissionLedgerRequestQuery {
  readonly status?: PermissionLedgerRequestStatus | readonly PermissionLedgerRequestStatus[];
  readonly tool?: string | readonly string[];
  readonly capability?: Capability | readonly Capability[];
  readonly target_kind?: AuthorizationTarget["kind"] | readonly AuthorizationTarget["kind"][];
  readonly requested_principal_kind?: Principal["kind"] | readonly Principal["kind"][];
  readonly execution_principal_kind?: Principal["kind"] | readonly Principal["kind"][];
  readonly text?: string;
  readonly limit?: number;
}

export interface PermissionCenterSummary {
  readonly pending: number;
  readonly completed: number;
  readonly denied: number;
  readonly failed: number;
  readonly expired: number;
  readonly dirty_definition_state?: boolean;
}

export interface PermissionCenterState {
  readonly summary: PermissionCenterSummary;
  readonly records: readonly PermissionLedgerRequestRecord[];
  readonly query: PermissionLedgerRequestQuery;
}

export interface PermissionCenterStateOptions {
  readonly query?: PermissionLedgerRequestQuery;
  readonly dirtyDefinitionState?: boolean;
}

export interface PermissionLedgerRequestListOptions extends PermissionLedgerRequestQuery {
  readonly livePromptIds?: ReadonlySet<string>;
}

export interface PermissionLedgerStore {
  append(event: PermissionLedgerEvent): void | Promise<void>;
  list(options?: PermissionLedgerListOptions): readonly PermissionLedgerEvent[] | Promise<readonly PermissionLedgerEvent[]>;
  listRequests(options?: PermissionLedgerRequestListOptions): readonly PermissionLedgerRequestRecord[] | Promise<readonly PermissionLedgerRequestRecord[]>;
  getRequest(promptId: string, options?: PermissionLedgerRequestListOptions): PermissionLedgerRequestRecord | undefined | Promise<PermissionLedgerRequestRecord | undefined>;
}

export function permissionLedgerFilePath(workspace: string): string {
  return join(stateDir(workspace), "permission-ledger.jsonl");
}

export function permissionLedgerEventId(): string {
  return `permission-${randomUUID()}`;
}

export function approvalTokenLedgerHash(input: {
  readonly token_id: string;
  readonly app_id: string;
  readonly workspace_id: string;
}): string {
  return createHash("sha256")
    .update(`${input.app_id}\0${input.workspace_id}\0${input.token_id}`)
    .digest("hex");
}

export class FilePermissionLedgerStore implements PermissionLedgerStore {
  private readonly path: string;

  constructor(private readonly workspace: string) {
    this.path = permissionLedgerFilePath(workspace);
  }

  append(event: PermissionLedgerEvent): void {
    mkdirSync(stateDir(this.workspace), { recursive: true });
    appendFileSync(this.path, JSON.stringify(event) + "\n", "utf8");
  }

  list(options: PermissionLedgerListOptions = {}): readonly PermissionLedgerEvent[] {
    if (!existsSync(this.path)) return [];
    const events: PermissionLedgerEvent[] = [];
    const raw = readFileSync(this.path, "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line.trim()) continue;
      try {
        const parsed: unknown = JSON.parse(line);
        if (isPermissionLedgerEvent(parsed)) {
          events.push(parsed);
        }
      } catch {
        continue;
      }
    }
    return applyLimit(events, options.limit);
  }

  listRequests(options: PermissionLedgerRequestListOptions = {}): readonly PermissionLedgerRequestRecord[] {
    return derivePermissionLedgerRequests(this.list(), options);
  }

  getRequest(promptId: string, options: PermissionLedgerRequestListOptions = {}): PermissionLedgerRequestRecord | undefined {
    return this.listRequests(options).find((record) => record.prompt_id === promptId);
  }
}

export class InMemoryPermissionLedgerStore implements PermissionLedgerStore {
  private readonly events: PermissionLedgerEvent[] = [];

  append(event: PermissionLedgerEvent): void {
    this.events.push(event);
  }

  list(options: PermissionLedgerListOptions = {}): readonly PermissionLedgerEvent[] {
    return applyLimit([...this.events], options.limit);
  }

  listRequests(options: PermissionLedgerRequestListOptions = {}): readonly PermissionLedgerRequestRecord[] {
    return derivePermissionLedgerRequests(this.events, options);
  }

  getRequest(promptId: string, options: PermissionLedgerRequestListOptions = {}): PermissionLedgerRequestRecord | undefined {
    return this.listRequests(options).find((record) => record.prompt_id === promptId);
  }
}

export function derivePermissionLedgerRequests(
  events: readonly PermissionLedgerEvent[],
  options: PermissionLedgerRequestListOptions = {},
): readonly PermissionLedgerRequestRecord[] {
  const byPrompt = new Map<string, PermissionLedgerEvent[]>();
  for (const event of events) {
    const bucket = byPrompt.get(event.prompt_id) ?? [];
    bucket.push(event);
    byPrompt.set(event.prompt_id, bucket);
  }
  const records = [...byPrompt.values()]
    .map((bucket) => deriveOne(bucket, options.livePromptIds ?? new Set()))
    .filter((record): record is PermissionLedgerRequestRecord => record !== undefined)
    .sort((a, b) => b.requested_at_ms - a.requested_at_ms);
  return applyNewestFirstLimit(filterPermissionLedgerRequests(records, { ...options, limit: undefined }), options.limit);
}

export function filterPermissionLedgerRequests(
  records: readonly PermissionLedgerRequestRecord[],
  query: PermissionLedgerRequestQuery = {},
): readonly PermissionLedgerRequestRecord[] {
  return records.filter((record) => matchesRequestQuery(record, query));
}

export function summarizePermissionLedgerRequests(
  records: readonly PermissionLedgerRequestRecord[],
  dirtyDefinitionState = false,
): PermissionCenterSummary {
  return {
    pending: records.filter((record) => record.status === "pending").length,
    completed: records.filter((record) => record.status === "completed").length,
    denied: records.filter((record) => record.status === "denied").length,
    failed: records.filter((record) => record.status === "failed").length,
    expired: records.filter((record) => record.status === "expired").length,
    ...(dirtyDefinitionState ? { dirty_definition_state: true } : {}),
  };
}

export function derivePermissionCenterState(
  records: readonly PermissionLedgerRequestRecord[],
  options: PermissionCenterStateOptions = {},
): PermissionCenterState {
  const query = options.query ?? {};
  const filtered = filterPermissionLedgerRequests(records, { ...query, limit: undefined });
  return {
    summary: summarizePermissionLedgerRequests(filtered, options.dirtyDefinitionState ?? false),
    records: applyNewestFirstLimit(filtered, query.limit),
    query,
  };
}

function deriveOne(
  bucket: readonly PermissionLedgerEvent[],
  livePromptIds: ReadonlySet<string>,
): PermissionLedgerRequestRecord | undefined {
  const ordered = [...bucket].sort((a, b) => a.at_ms - b.at_ms);
  const request = ordered.find((event) => event.event_type === "permission_requested");
  if (!request || request.event_type !== "permission_requested") return undefined;
  let status: PermissionLedgerRequestStatus = "pending";
  let responded_at_ms: number | undefined;
  let completed_at_ms: number | undefined;
  let decision: PermissionLedgerDecision | undefined;
  let decided_by: { readonly kind: "builder"; readonly id: string } | undefined;
  let approved_by: { readonly kind: "builder"; readonly id: string } | undefined;
  let approval_token_hash: string | undefined;
  let approved_capability: Capability | undefined;
  let approval_token_expires_at_ms: number | undefined;
  let approval_token_single_use: true | undefined;
  let execution_principal: Principal | undefined;
  let authorization_reason_code: string | undefined;
  let message: string | undefined;
  let terminal = false;
  for (const event of ordered) {
    switch (event.event_type) {
      case "permission_responded":
        responded_at_ms = event.at_ms;
        decision = event.decision;
        decided_by = event.decided_by;
        if (!terminal) {
          status = event.decision === "deny" ? "denied" : "allowed";
        }
        break;
      case "approval_token_issued":
        approval_token_hash = event.approval_token_hash;
        approved_capability = event.approved_capability;
        approved_by = event.approved_by;
        approval_token_expires_at_ms = event.expires_at_ms;
        approval_token_single_use = event.single_use;
        break;
      case "permission_execution_authorized":
        authorization_reason_code = event.authorization_reason_code;
        execution_principal = event.execution_principal;
        if (!terminal) {
          status = "authorized";
        }
        break;
      case "permission_execution_denied":
        authorization_reason_code = event.authorization_reason_code;
        execution_principal = event.execution_principal;
        message = event.message;
        if (!terminal) {
          status = "failed";
          terminal = true;
        }
        break;
      case "permission_execution_completed":
        if (!terminal) {
          completed_at_ms = event.at_ms;
          status = "completed";
          terminal = true;
        }
        break;
      case "permission_execution_failed":
        message = event.message;
        if (!terminal) {
          completed_at_ms = event.at_ms;
          status = "failed";
          terminal = true;
        }
        break;
      case "permission_expired":
        message = event.message;
        if (!terminal) {
          completed_at_ms = event.at_ms;
          status = "expired";
          terminal = true;
        }
        break;
    }
  }
  return {
    prompt_id: request.prompt_id,
    status,
    live: status === "pending" && livePromptIds.has(request.prompt_id),
    requested_at_ms: request.at_ms,
    responded_at_ms,
    completed_at_ms,
    tool: request.tool,
    capability: request.capability,
    target: request.target,
    target_fingerprint: request.target_fingerprint,
    requested_principal: request.requested_principal,
    decided_by,
    decision,
    approved_by,
    approval_token_hash,
    approved_capability,
    approval_token_expires_at_ms,
    approval_token_single_use,
    execution_principal,
    detail: request.detail,
    authorization_reason_code,
    message,
  };
}

function matchesRequestQuery(record: PermissionLedgerRequestRecord, query: PermissionLedgerRequestQuery): boolean {
  if (!matchesOneOrMany(record.status, query.status)) return false;
  if (!matchesOneOrMany(record.tool, query.tool)) return false;
  if (!matchesOneOrMany(record.capability, query.capability)) return false;
  if (!matchesOneOrMany(record.target?.kind, query.target_kind)) return false;
  if (!matchesOneOrMany(record.requested_principal?.kind, query.requested_principal_kind)) return false;
  if (!matchesOneOrMany(record.execution_principal?.kind, query.execution_principal_kind)) return false;
  if (query.text && !recordSearchText(record).includes(query.text.toLowerCase())) return false;
  return true;
}

function matchesOneOrMany<T extends string>(value: T | undefined, allowed: T | readonly T[] | undefined): boolean {
  if (allowed === undefined) return true;
  if (value === undefined) return false;
  return Array.isArray(allowed) ? allowed.includes(value) : value === allowed;
}

function recordSearchText(record: PermissionLedgerRequestRecord): string {
  return [
    record.prompt_id,
    record.tool,
    record.capability,
    record.target?.id,
    record.target?.fingerprint,
    record.target_fingerprint,
    record.requested_principal?.id,
    record.execution_principal?.id,
    record.authorization_reason_code,
    record.message,
  ].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
}

function applyLimit<T>(items: readonly T[], limit?: number): readonly T[] {
  if (limit === 0) return [];
  if (limit === undefined || limit < 0) return items;
  return items.slice(-limit);
}

function applyNewestFirstLimit<T>(items: readonly T[], limit?: number): readonly T[] {
  if (limit === 0) return [];
  if (limit === undefined || limit < 0) return items;
  return items.slice(0, limit);
}

function isPermissionLedgerEvent(value: unknown): value is PermissionLedgerEvent {
  if (!isRecord(value)) return false;
  if (value.schema_version !== 1) return false;
  if (!isString(value.event_id)) return false;
  if (!isString(value.event_type)) return false;
  if (typeof value.at_ms !== "number" || !Number.isFinite(value.at_ms)) return false;
  if (!isString(value.prompt_id)) return false;
  if (value.session_id !== undefined && !isString(value.session_id)) return false;
  if (!isString(value.app_id)) return false;
  if (!isString(value.workspace_id)) return false;
  if (!isString(value.tool)) return false;
  if (value.capability !== undefined && !isCapability(value.capability)) return false;
  if (value.target !== undefined && !isAuthorizationTarget(value.target)) return false;
  if (value.target_fingerprint !== undefined && !isString(value.target_fingerprint)) return false;

  switch (value.event_type) {
    case "permission_requested":
      return isRecord(value.detail);
    case "permission_responded":
      return isPermissionLedgerDecision(value.decision) && isBuilderPrincipal(value.decided_by);
    case "approval_token_issued":
      return (
        isString(value.approval_token_hash) &&
        isCapability(value.approved_capability) &&
        isBuilderPrincipal(value.approved_by) &&
        typeof value.issued_at_ms === "number" &&
        Number.isFinite(value.issued_at_ms) &&
        typeof value.expires_at_ms === "number" &&
        Number.isFinite(value.expires_at_ms) &&
        value.single_use === true
      );
    case "permission_execution_authorized":
      return (
        isString(value.authorization_reason_code) &&
        (value.execution_principal === undefined || isPrincipal(value.execution_principal))
      );
    case "permission_execution_denied":
      return (
        isString(value.authorization_reason_code) &&
        (value.execution_principal === undefined || isPrincipal(value.execution_principal)) &&
        (value.message === undefined || isString(value.message))
      );
    case "permission_execution_completed":
      return true;
    case "permission_execution_failed":
      return isString(value.message);
    case "permission_expired":
      return value.message === undefined || isString(value.message);
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBuilderPrincipal(value: unknown): value is { readonly kind: "builder"; readonly id: string } {
  return isRecord(value) && value.kind === "builder" && isString(value.id);
}

function isPrincipal(value: unknown): value is Principal {
  if (!isRecord(value)) return false;
  if (!isString(value.id)) return false;
  switch (value.kind) {
    case "builder":
      return true;
    case "build_agent":
      return isBuilderPrincipal(value.acting_for);
    case "runtime_agent":
      return value.acting_for === undefined || isEndUserPrincipal(value.acting_for);
    case "end_user":
      return Array.isArray(value.roles) && value.roles.every(isString);
    case "framework_system":
      return value.id === "framework";
    case "extension":
      return value.roles === undefined || (Array.isArray(value.roles) && value.roles.every(isString));
    default:
      return false;
  }
}

function isEndUserPrincipal(value: unknown): value is { readonly kind: "end_user"; readonly id: string } {
  return isRecord(value) && value.kind === "end_user" && isString(value.id);
}

function isAuthorizationTarget(value: unknown): value is AuthorizationTarget {
  if (!isRecord(value)) return false;
  if (!["definition", "policy_rule", "operation", "view", "rollback_target"].includes(String(value.kind))) return false;
  if (value.id !== undefined && !isString(value.id)) return false;
  if (value.fingerprint !== undefined && !isString(value.fingerprint)) return false;
  return true;
}

function isCapability(value: unknown): value is Capability {
  return (
    value === "definition:propose" ||
    value === "definition:apply" ||
    value === "definition:approve" ||
    value === "definition:rollback:validate" ||
    value === "definition:rollback:execute" ||
    value === "policy:propose" ||
    value === "policy:approve" ||
    value === "policy:mutate" ||
    value === "operation:invoke" ||
    value === "view:read"
  );
}

function isPermissionLedgerDecision(value: unknown): value is PermissionLedgerDecision {
  return value === "allow" || value === "deny" || value === "allow-always";
}
