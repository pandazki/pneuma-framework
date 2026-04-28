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
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_execution_denied";
      readonly authorization_reason_code: string;
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
  readonly detail: Record<string, unknown>;
  readonly authorization_reason_code?: string;
  readonly message?: string;
}

export interface PermissionLedgerListOptions {
  readonly limit?: number;
}

export interface PermissionLedgerRequestListOptions {
  readonly limit?: number;
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
        const parsed = JSON.parse(line) as PermissionLedgerEvent;
        if (parsed.schema_version === 1 && typeof parsed.prompt_id === "string") {
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
  return applyLimit(records, options.limit);
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
  let authorization_reason_code: string | undefined;
  let message: string | undefined;
  for (const event of ordered) {
    switch (event.event_type) {
      case "permission_responded":
        responded_at_ms = event.at_ms;
        decision = event.decision;
        decided_by = event.decided_by;
        status = event.decision === "deny" ? "denied" : "allowed";
        break;
      case "permission_execution_authorized":
        authorization_reason_code = event.authorization_reason_code;
        status = "authorized";
        break;
      case "permission_execution_denied":
        authorization_reason_code = event.authorization_reason_code;
        message = event.message;
        status = "failed";
        break;
      case "permission_execution_completed":
        completed_at_ms = event.at_ms;
        status = "completed";
        break;
      case "permission_execution_failed":
        completed_at_ms = event.at_ms;
        message = event.message;
        status = "failed";
        break;
      case "permission_expired":
        completed_at_ms = event.at_ms;
        message = event.message;
        status = "expired";
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
    detail: request.detail,
    authorization_reason_code,
    message,
  };
}

function applyLimit<T>(items: readonly T[], limit?: number): readonly T[] {
  if (limit === undefined || limit < 0) return items;
  return items.slice(-limit);
}
