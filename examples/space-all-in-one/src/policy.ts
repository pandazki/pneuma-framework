import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateBuildChangeGovernance,
  type BuildChangeGovernanceDecision,
  type BuildChangeGovernanceDecisionInput,
  type BuildChangeGovernancePolicy,
} from "@pneuma-framework/core/enterprise-governance";
import type { BuildChangeRisk } from "@pneuma-framework/core/build-assurance";
import type { TreeDiff } from "@pneuma-framework/host-kit/workspace";
import type { SpaceManifest } from "./artifact";

// ---------------------------------------------------------------------------
// "Bypass permission" without a bypass.
//
// The framework invariant stays: no change is applied without an approval
// record. What changes is who approves. A standing policy subject,
// `policy:auto`, holds the reviewer role, so low-risk routes are satisfied
// without a person. High-risk routes require the owner role, which only a
// person holds. The evaluator is the framework's own; this file only supplies
// the policy and a deterministic risk classifier.
// ---------------------------------------------------------------------------

export const AUTO_SUBJECT = "policy:auto";

/** personal: policy approves low risk. review-all: the owner approves everything. */
export type GovernanceMode = "personal" | "review-all";

const LOW_RISK: readonly BuildChangeRisk[] = ["additive_ui", "source_code_change", "definition_additive", "release_change"];
const HIGH_RISK: readonly BuildChangeRisk[] = ["policy_change", "destructive_definition", "data_migration", "credential_boundary"];

export function governancePolicy(appId: string, owner: string, mode: GovernanceMode): BuildChangeGovernancePolicy {
  return {
    policy_id: `space-all-in-one-${mode}`,
    app_id: appId,
    role_assignments: [
      { subject: AUTO_SUBJECT, role: "reviewer" },
      { subject: owner, role: "owner" },
    ],
    routes: [
      { route_id: "low-risk", risks: LOW_RISK, required_roles: [mode === "personal" ? "reviewer" : "owner"] },
      { route_id: "high-risk", risks: HIGH_RISK, required_roles: ["owner"] },
    ],
  };
}

export function decide(input: {
  readonly policy: BuildChangeGovernancePolicy;
  readonly change_id: string;
  readonly builder_subject: string;
  readonly risks: readonly BuildChangeRisk[];
  readonly owner_decision?: BuildChangeGovernanceDecisionInput;
}): BuildChangeGovernanceDecision {
  // The standing policy always casts its vote; it only counts on routes that ask for its role.
  const decisions: BuildChangeGovernanceDecisionInput[] = [
    { subject: AUTO_SUBJECT, decision: "approved", reason: "standing policy", decided_at_ms: Date.now() },
  ];
  if (input.owner_decision) decisions.push(input.owner_decision);
  return evaluateBuildChangeGovernance(input.policy, {
    app_id: input.policy.app_id,
    build_change_id: input.change_id,
    builder_subject: input.builder_subject,
    risks: input.risks,
    evidence_refs: [{ kind: "code_change_receipt", proposal_id: input.change_id }],
    decisions,
  });
}

export interface RiskAssessment {
  readonly risks: readonly BuildChangeRisk[];
  /** One line per finding, for the history. */
  readonly reasons: readonly string[];
  /** Plain-language lines shown to the owner when a person has to decide. */
  readonly disclosure: readonly string[];
}

const DESTRUCTIVE_SQL: readonly { readonly pattern: RegExp; readonly label: string }[] = [
  { pattern: /\bDROP\s+(TABLE|COLUMN|INDEX)\b/i, label: "DROP" },
  { pattern: /\bALTER\s+TABLE\b[^;`'"]*\b(DROP|RENAME)\b/i, label: "ALTER TABLE ... DROP/RENAME" },
  { pattern: /\bTRUNCATE\b/i, label: "TRUNCATE" },
  { pattern: /\bDELETE\s+FROM\s+[\w"]+\s*(;|`|'|"|\))/i, label: "DELETE without WHERE" },
];

function read(root: string, rel: string): string {
  const file = join(root, rel);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function identityRequired(manifest: SpaceManifest): boolean {
  const identity = manifest.capabilities?.identity as { required?: boolean } | undefined;
  return identity !== undefined && identity.required !== false;
}

/**
 * Classify a change from what is on disk, never from what the agent says.
 * Two inputs carry most of the signal: the runtime manifest diff (capabilities,
 * who may reach the app) and SQL that newly appears in changed source.
 */
export function classifyRisks(input: {
  readonly diff: TreeDiff;
  readonly activeRoot: string;
  readonly draftRoot: string;
  readonly before: SpaceManifest;
  readonly after: SpaceManifest;
}): RiskAssessment {
  const risks = new Set<BuildChangeRisk>();
  const reasons: string[] = [];
  const disclosure: string[] = [];
  const { diff } = input;

  const uiOnly = diff.changedPaths.every((path) => path.startsWith("public/"));
  risks.add(uiOnly ? "additive_ui" : "source_code_change");
  reasons.push(`${diff.changedPaths.length} file(s) changed${uiOnly ? ", browser assets only" : ""}`);

  const beforeKinds = new Set(Object.keys(input.before.capabilities ?? {}));
  const afterKinds = new Set(Object.keys(input.after.capabilities ?? {}));
  for (const kind of afterKinds) {
    if (!beforeKinds.has(kind)) {
      risks.add("definition_additive");
      reasons.push(`declares capability ${kind}`);
    }
  }
  for (const kind of beforeKinds) {
    if (!afterKinds.has(kind)) {
      risks.add("release_change");
      reasons.push(`stops using capability ${kind}; its data is kept by the platform`);
    }
  }
  if ((input.before.runtime ?? "isolate") !== (input.after.runtime ?? "isolate")) {
    risks.add("release_change");
    reasons.push(`runtime changes from ${input.before.runtime ?? "isolate"} to ${input.after.runtime ?? "isolate"}`);
  }

  if (identityRequired(input.before) && !identityRequired(input.after)) {
    risks.add("policy_change");
    reasons.push("sign-in is no longer required");
    disclosure.push("Visitors will be able to open this app without signing in.");
  }

  for (const path of [...diff.added, ...diff.changed]) {
    if (!/\.(ts|js|mjs|cjs|sql)$/.test(path)) continue;
    const after = read(input.draftRoot, path);
    const before = read(input.activeRoot, path);
    // One statement can match several patterns (`ALTER TABLE t DROP COLUMN c` is both); the owner gets one line per file.
    const labels = DESTRUCTIVE_SQL.filter(({ pattern }) => pattern.test(after) && !pattern.test(before)).map(({ label }) => label);
    if (labels.length) {
      risks.add("destructive_definition");
      reasons.push(`${path} newly contains ${labels.join(", ")}`);
      disclosure.push(`${path} now runs ${labels.map((label) => `"${label}"`).join(" and ")}, which deletes or rewrites data that is already stored. Undo restores code only, not that data.`);
    }
  }

  return { risks: [...risks], reasons, disclosure };
}
