// pneuma_policy_rules — system-owned Table holding Builder-authored PolicyRule additions.
// Each row represents one app-definition policy rule declaration.

import {
  PolicySet,
  type Action,
  type PolicyEffect,
  type PolicyRule,
  type Resource,
  type Subject,
} from "../aggregates/policy-set.js";
import { Row } from "../aggregates/row.js";
import { Table } from "../aggregates/table.js";
import { isWhereClause, type WhereClause } from "../value-objects/where-clause.js";
import type { CellType } from "../value-objects/cell-type.js";
import type { ActorKind } from "./app-history.js";

export const PNEUMA_POLICY_RULES_TABLE_ID = "pneuma_policy_rules";

const TEXT: CellType = { kind: "primitive", of: "Text" };
const NUMBER: CellType = { kind: "primitive", of: "Number" };
const JSON_T: CellType = { kind: "json" };

export function createPneumaPolicyRulesTable(app_id: string): Table {
  return new Table({
    id: PNEUMA_POLICY_RULES_TABLE_ID,
    app_id,
    system_owned: true,
    source: { kind: "stored" },
    columns: [
      { name: "rule_id", type: TEXT },
      { name: "effect", type: TEXT },
      { name: "allow", type: JSON_T },
      { name: "actions", type: JSON_T },
      { name: "resource", type: JSON_T },
      { name: "when", type: JSON_T, nullable: true },
      { name: "created_by", type: TEXT },
      { name: "created_by_kind", type: TEXT },
      { name: "definition_version", type: NUMBER },
    ],
  });
}

export interface PneumaPolicyRuleEntry {
  readonly id: string;
  readonly app_id: string;
  readonly rule_id: string;
  readonly effect?: PolicyEffect;
  readonly allow: readonly Subject[];
  readonly do: readonly Action[];
  readonly on: Resource;
  readonly when?: WhereClause;
  readonly created_by: string;
  readonly created_by_kind: ActorKind;
  readonly definition_version: number;
}

export function pneumaPolicyRuleEntryToRow(entry: PneumaPolicyRuleEntry): Row {
  return new Row({
    id: entry.id,
    table_id: PNEUMA_POLICY_RULES_TABLE_ID,
    app_id: entry.app_id,
    cells: {
      rule_id: entry.rule_id,
      effect: entry.effect ?? "allow",
      allow: entry.allow,
      actions: entry.do,
      resource: entry.on,
      when: entry.when ?? null,
      created_by: entry.created_by,
      created_by_kind: entry.created_by_kind,
      definition_version: entry.definition_version,
    },
  });
}

export function rowToPneumaPolicyRuleEntry(row: Row): PneumaPolicyRuleEntry {
  if (row.table_id !== PNEUMA_POLICY_RULES_TABLE_ID) {
    throw new Error(
      `rowToPneumaPolicyRuleEntry: row.table_id is '${row.table_id}', expected '${PNEUMA_POLICY_RULES_TABLE_ID}'`,
    );
  }

  const rule_id = row.getCell("rule_id");
  const effect = row.getCell("effect");
  const allow = row.getCell("allow");
  const actions = row.getCell("actions");
  const resource = row.getCell("resource");
  const when = row.getCell("when");
  const created_by = row.getCell("created_by");
  const created_by_kind = row.getCell("created_by_kind");
  const definition_version = row.getCell("definition_version");

  if (typeof rule_id !== "string" || rule_id.length === 0) {
    throw new Error(`rowToPneumaPolicyRuleEntry: missing rule_id on row ${row.id}`);
  }
  if (effect !== undefined && effect !== null && effect !== "allow" && effect !== "deny") {
    throw new Error(`rowToPneumaPolicyRuleEntry: invalid policy rule on row ${row.id}: effect must be 'allow' or 'deny'`);
  }
  if (!Array.isArray(allow)) {
    throw new Error(`rowToPneumaPolicyRuleEntry: allow must be an array on row ${row.id}`);
  }
  if (!Array.isArray(actions)) {
    throw new Error(`rowToPneumaPolicyRuleEntry: actions must be an array on row ${row.id}`);
  }
  if (!isRecord(resource)) {
    throw new Error(`rowToPneumaPolicyRuleEntry: resource must be object on row ${row.id}`);
  }
  if (when !== null && when !== undefined && !isWhereClause(when)) {
    throw new Error(`rowToPneumaPolicyRuleEntry: when must be a valid WhereClause or null on row ${row.id}`);
  }
  if (typeof definition_version !== "number") {
    throw new Error(`rowToPneumaPolicyRuleEntry: definition_version must be number on row ${row.id}`);
  }
  if (typeof created_by !== "string" || typeof created_by_kind !== "string") {
    throw new Error(`rowToPneumaPolicyRuleEntry: created_by fields missing on row ${row.id}`);
  }

  const entry: PneumaPolicyRuleEntry = {
    id: row.id,
    app_id: row.app_id,
    rule_id,
    effect: effect === "deny" ? "deny" : "allow",
    allow: allow as readonly Subject[],
    do: actions as readonly Action[],
    on: resource as Resource,
    when: when === null || when === undefined ? undefined : when,
    created_by,
    created_by_kind: created_by_kind as ActorKind,
    definition_version,
  };
  validatePolicyRuleEntry(entry, row.id);
  return entry;
}

export function policyRuleFromPneumaPolicyRuleEntry(entry: PneumaPolicyRuleEntry): PolicyRule {
  return {
    id: entry.rule_id,
    effect: entry.effect ?? "allow",
    allow: entry.allow,
    do: entry.do,
    on: entry.on,
    ...(entry.when !== undefined ? { when: entry.when } : {}),
  };
}

function validatePolicyRuleEntry(entry: PneumaPolicyRuleEntry, rowId: string): void {
  try {
    new PolicySet({
      app_id: entry.app_id,
      rules: [policyRuleFromPneumaPolicyRuleEntry(entry)],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`rowToPneumaPolicyRuleEntry: invalid policy rule on row ${rowId}: ${message}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
