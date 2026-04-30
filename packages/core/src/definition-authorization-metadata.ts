import type {
  AuthorizationTarget,
  Capability,
} from "@pneuma-framework/core-domain";

export interface DefinitionApplyAuthorizationMetadata {
  readonly capability: Capability;
  readonly target: AuthorizationTarget;
}

export function definitionApplyAuthorizationMetadata(change: unknown): DefinitionApplyAuthorizationMetadata {
  if (
    isRecord(change)
    && (
      change.kind === "add_policy_rule"
      || change.kind === "update_policy_rule"
      || change.kind === "delete_policy_rule"
    )
  ) {
    const id = stringField(change, "rule_id") ?? "unknown";
    return {
      capability: "policy:mutate",
      target: { kind: "policy_rule", id, fingerprint: `policy_rule:${id}` },
    };
  }
  if (isRecord(change) && change.kind === "set_default_posture") {
    return {
      capability: "policy:mutate",
      target: {
        kind: "policy_setting",
        id: "default_posture",
        fingerprint: "policy_setting:default_posture",
      },
    };
  }
  const targetId = definitionApplyTargetId(change);
  return {
    capability: "definition:apply",
    target: { kind: "definition", id: targetId, fingerprint: targetId },
  };
}

function definitionApplyTargetId(change: unknown): string {
  if (!isRecord(change)) return "definition.apply";
  const kind = change.kind;
  if (typeof kind !== "string") return "definition.apply";
  switch (kind) {
    case "add_table":
      return `definition.apply:add_table:${stringField(change, "table_id") ?? "unknown"}`;
    case "add_table_column":
      return [
        "definition.apply:add_table_column",
        stringField(change, "table_id") ?? "unknown",
        stringField(change, "column_name") ?? "unknown",
      ].join(":");
    case "add_operation":
      return `definition.apply:add_operation:${stringField(change, "operation_id") ?? "unknown"}`;
    case "add_view":
      return `definition.apply:add_view:${stringField(change, "view_id") ?? "unknown"}`;
    case "add_policy_rule":
      return `definition.apply:add_policy_rule:${stringField(change, "rule_id") ?? "unknown"}`;
    default:
      return `definition.apply:${kind}`;
  }
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
