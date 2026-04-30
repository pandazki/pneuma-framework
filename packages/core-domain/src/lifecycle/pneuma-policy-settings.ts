// pneuma_policy_settings — system-owned Table holding app-level policy settings.
// M2.5 first setting: default_posture.

import { PolicySet, type DefaultPosture } from "../aggregates/policy-set.js";
import { Row } from "../aggregates/row.js";
import { Table } from "../aggregates/table.js";
import type { CellType } from "../value-objects/cell-type.js";
import type { ActorKind } from "./app-history.js";

export const PNEUMA_POLICY_SETTINGS_TABLE_ID = "pneuma_policy_settings";

export type PolicySettingId = "default_posture";

const TEXT: CellType = { kind: "primitive", of: "Text" };
const NUMBER: CellType = { kind: "primitive", of: "Number" };
const JSON_T: CellType = { kind: "json" };

export interface PneumaPolicySettingEntry {
  readonly id: string;
  readonly app_id: string;
  readonly setting_id: PolicySettingId;
  readonly value: DefaultPosture;
  readonly created_by: string;
  readonly created_by_kind: ActorKind;
  readonly definition_version: number;
}

export function createPneumaPolicySettingsTable(app_id: string): Table {
  return new Table({
    id: PNEUMA_POLICY_SETTINGS_TABLE_ID,
    app_id,
    system_owned: true,
    source: { kind: "stored" },
    columns: [
      { name: "setting_id", type: TEXT },
      { name: "value", type: JSON_T },
      { name: "created_by", type: TEXT },
      { name: "created_by_kind", type: TEXT },
      { name: "definition_version", type: NUMBER },
    ],
  });
}

export function pneumaPolicySettingEntryToRow(entry: PneumaPolicySettingEntry): Row {
  return new Row({
    id: entry.id,
    table_id: PNEUMA_POLICY_SETTINGS_TABLE_ID,
    app_id: entry.app_id,
    cells: {
      setting_id: entry.setting_id,
      value: entry.value,
      created_by: entry.created_by,
      created_by_kind: entry.created_by_kind,
      definition_version: entry.definition_version,
    },
  });
}

export function rowToPneumaPolicySettingEntry(row: Row): PneumaPolicySettingEntry {
  if (row.table_id !== PNEUMA_POLICY_SETTINGS_TABLE_ID) {
    throw new Error(
      `rowToPneumaPolicySettingEntry: row.table_id is '${row.table_id}', expected '${PNEUMA_POLICY_SETTINGS_TABLE_ID}'`,
    );
  }

  const setting_id = row.getCell("setting_id");
  const value = row.getCell("value");
  const created_by = row.getCell("created_by");
  const created_by_kind = row.getCell("created_by_kind");
  const definition_version = row.getCell("definition_version");

  if (setting_id !== "default_posture") {
    throw new Error(`rowToPneumaPolicySettingEntry: setting_id must be 'default_posture' on row ${row.id}`);
  }
  if (!isDefaultPosture(value)) {
    throw new Error(`rowToPneumaPolicySettingEntry: invalid policy setting value on row ${row.id}`);
  }
  if (typeof definition_version !== "number") {
    throw new Error(`rowToPneumaPolicySettingEntry: definition_version must be number on row ${row.id}`);
  }
  if (typeof created_by !== "string" || typeof created_by_kind !== "string") {
    throw new Error(`rowToPneumaPolicySettingEntry: created_by fields missing on row ${row.id}`);
  }

  const entry: PneumaPolicySettingEntry = {
    id: row.id,
    app_id: row.app_id,
    setting_id,
    value,
    created_by,
    created_by_kind: created_by_kind as ActorKind,
    definition_version,
  };
  validatePolicySettingEntry(entry);
  return entry;
}

export function policyDefaultPostureFromSettingEntry(
  entry: PneumaPolicySettingEntry,
): DefaultPosture {
  validatePolicySettingEntry(entry);
  return entry.value;
}

function validatePolicySettingEntry(entry: PneumaPolicySettingEntry): void {
  try {
    const policy = new PolicySet({ app_id: entry.app_id });
    policy.setDefaultPosture(entry.value);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`rowToPneumaPolicySettingEntry: invalid policy setting on row ${entry.id}: ${message}`);
  }
}

function isDefaultPosture(value: unknown): value is DefaultPosture {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const posture = value as { app?: unknown };
  return posture.app === "public" || posture.app === "restricted";
}
