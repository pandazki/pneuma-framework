import type { Database } from "bun:sqlite";
import {
  derivePermissionLedgerRequests,
  type PermissionLedgerEvent,
  type PermissionLedgerListOptions,
  type PermissionLedgerRequestListOptions,
  type PermissionLedgerRequestRecord,
  type PermissionLedgerStore,
} from "./permission-ledger.js";

interface PermissionLedgerEventRow {
  event_json: string;
}

export class BunSqlitePermissionLedgerStore implements PermissionLedgerStore {
  constructor(private readonly db: Database) {}

  append(event: PermissionLedgerEvent): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO permission_ledger_events
         (event_id, prompt_id, app_id, workspace_id, event_type, at_ms, event_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.event_id,
        event.prompt_id,
        event.app_id,
        event.workspace_id,
        event.event_type,
        event.at_ms,
        JSON.stringify(event)
      );
  }

  list(options: PermissionLedgerListOptions = {}): readonly PermissionLedgerEvent[] {
    const limit = options.limit ?? 1000;
    return this.db
      .query<PermissionLedgerEventRow, [number]>(
        `SELECT event_json FROM permission_ledger_events
         ORDER BY at_ms ASC, event_id ASC
         LIMIT ?`
      )
      .all(limit)
      .map((row) => JSON.parse(row.event_json) as PermissionLedgerEvent);
  }

  listRequests(options: PermissionLedgerRequestListOptions = {}): readonly PermissionLedgerRequestRecord[] {
    return derivePermissionLedgerRequests(this.list(), options);
  }

  getRequest(
    promptId: string,
    options: PermissionLedgerRequestListOptions = {}
  ): PermissionLedgerRequestRecord | undefined {
    return this.listRequests(options).find((record) => record.prompt_id === promptId);
  }
}
