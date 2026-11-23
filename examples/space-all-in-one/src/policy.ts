import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateBuildChangeGovernance,
  type BuildChangeGovernanceDecision,
  type BuildChangeGovernanceDecisionInput,
  type BuildChangeGovernancePolicy,
} from "@pneuma-framework/core/enterprise-governance";
import { BUILD_CHANGE_RISK_KINDS, type BuildChangeRisk } from "@pneuma-framework/core/build-assurance";
import type { TreeDiff } from "@pneuma-framework/host-kit/workspace";
import type { SpaceManifest } from "./artifact";

// ---------------------------------------------------------------------------
// "Bypass permission" without a bypass.
//
// The framework invariant stays: no change is applied without an approval
// record. What changes is who approves. A standing policy subject,
// `policy:auto`, holds the reviewer role, so the risks a preset lists under
// `auto_approve` are satisfied without a person. Every other risk requires the
// owner role, which only a person holds. The evaluator is the framework's own.
//
// Which change carries which risk is not decided here. It is a preset: a JSON
// file the Host is started with (policy/personal.json is the example one).
// This file only knows how to read a preset and apply its rules to what is on
// disk. A different scenario means a different preset, not different code.
// ---------------------------------------------------------------------------

export const AUTO_SUBJECT = "policy:auto";

/**
 * record: the zero position. A change is recorded and published, and nothing checks or approves it.
 * personal: the standing policy approves what the preset lets it. review-all: the owner approves everything.
 */
export type GovernanceMode = "record" | "personal" | "review-all";
export const GOVERNANCE_MODES: readonly GovernanceMode[] = ["record", "personal", "review-all"];

/** What a manifest rule can react to. These are facts about pneuma-space.json; the risk each one carries is the preset's choice. */
const MANIFEST_CONDITIONS = ["capability_added", "capability_removed", "runtime_changed", "sign_in_dropped"] as const;
type ManifestCondition = (typeof MANIFEST_CONDITIONS)[number];

interface PathRule {
  /** Path prefixes, e.g. `src/billing/`, or exact files. */
  readonly under: readonly string[];
  readonly risk: BuildChangeRisk;
  /** Shown to the owner. `{paths}` is replaced by the changed paths that matched. */
  readonly disclosure?: string;
  /** A change this rule finds cannot be undone by putting files back. */
  readonly one_way?: boolean;
}

interface ManifestRule {
  readonly when: ManifestCondition;
  readonly risk: BuildChangeRisk;
  readonly disclosure?: string;
  /** A change this rule finds cannot be undone by putting files back. */
  readonly one_way?: boolean;
}

interface ContentRule {
  readonly id: string;
  /** Which changed files to read. */
  readonly files: RegExp;
  readonly risk: BuildChangeRisk;
  /** Shown to the owner. `{path}` and `{labels}` are replaced. */
  readonly disclosure?: string;
  /** A change this rule finds cannot be undone by putting files back, for example one that drops stored data. */
  readonly one_way?: boolean;
  readonly patterns: readonly { readonly label: string; readonly regex: RegExp }[];
}

export interface RiskPolicy {
  readonly preset_id: string;
  /** Risks the standing policy may approve on its own. Everything else waits for the owner. */
  readonly auto_approve: readonly BuildChangeRisk[];
  /** The risk every change carries, and lighter ones for changes confined to certain paths. */
  readonly change: {
    readonly risk: BuildChangeRisk;
    readonly when_only_under: readonly { readonly paths: readonly string[]; readonly risk: BuildChangeRisk; readonly note?: string }[];
  };
  readonly paths: readonly PathRule[];
  readonly manifest: readonly ManifestRule[];
  readonly content: readonly ContentRule[];
}

// --- reading a preset --------------------------------------------------------

function plainObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** Parse and check a preset. Throws with the place and the reason, so a bad preset stops the Host at start instead of misjudging changes later. */
export function parseRiskPolicy(raw: unknown, source = "risk preset"): RiskPolicy {
  const fail = (where: string, why: string): never => {
    throw new Error(`${source}: ${where} ${why}`);
  };
  // A field the parser does not know is refused, not ignored: a misspelled `one_way` would otherwise
  // let a destructive change through as an ordinary one without a word.
  const object = (value: unknown, where: string, fields: readonly string[]): Record<string, unknown> => {
    const found = plainObject(value) ?? fail(where, "must be an object");
    const unknown = Object.keys(found).find((key) => !fields.includes(key));
    if (unknown !== undefined) fail(`${where}.${unknown}`, `is not a field of a preset (known here: ${fields.join(", ")})`);
    return found;
  };
  const optionalFlag = (value: unknown, where: string): boolean | undefined =>
    value === undefined || typeof value === "boolean" ? value : fail(where, "must be true or false");
  const list = (value: unknown, where: string): unknown[] => (Array.isArray(value) ? value : fail(where, "must be a list"));
  const text = (value: unknown, where: string): string => (typeof value === "string" && value ? value : fail(where, "must be a non-empty string"));
  const optionalText = (value: unknown, where: string): string | undefined => (value === undefined ? undefined : text(value, where));
  const strings = (value: unknown, where: string): string[] => list(value, where).map((item, i) => text(item, `${where}[${i}]`));
  const risk = (value: unknown, where: string): BuildChangeRisk =>
    (BUILD_CHANGE_RISK_KINDS as readonly unknown[]).includes(value) ? (value as BuildChangeRisk) : fail(where, `must be one of ${BUILD_CHANGE_RISK_KINDS.join(", ")}`);
  const regex = (value: unknown, flags: string, where: string): RegExp => {
    try {
      return new RegExp(text(value, where), flags);
    } catch (err) {
      return fail(where, `is not a valid regular expression (${err instanceof Error ? err.message : String(err)})`);
    }
  };

  const root = object(raw, "the preset", ["schema_version", "preset_id", "description", "auto_approve", "change", "paths", "manifest", "content"]);
  if (root.schema_version !== 1) fail("schema_version", "must be 1");
  optionalText(root.description, "description");
  const change = object(root.change, "change", ["risk", "when_only_under"]);
  return {
    preset_id: text(root.preset_id, "preset_id"),
    auto_approve: list(root.auto_approve, "auto_approve").map((item, i) => risk(item, `auto_approve[${i}]`)),
    change: {
      risk: risk(change.risk, "change.risk"),
      when_only_under: list(change.when_only_under ?? [], "change.when_only_under").map((item, i) => {
        const rule = object(item, `change.when_only_under[${i}]`, ["paths", "risk", "note"]);
        return {
          paths: strings(rule.paths, `change.when_only_under[${i}].paths`),
          risk: risk(rule.risk, `change.when_only_under[${i}].risk`),
          note: optionalText(rule.note, `change.when_only_under[${i}].note`),
        };
      }),
    },
    paths: list(root.paths ?? [], "paths").map((item, i) => {
      const rule = object(item, `paths[${i}]`, ["under", "risk", "disclosure", "one_way"]);
      return {
        under: strings(rule.under, `paths[${i}].under`),
        risk: risk(rule.risk, `paths[${i}].risk`),
        disclosure: optionalText(rule.disclosure, `paths[${i}].disclosure`),
        one_way: optionalFlag(rule.one_way, `paths[${i}].one_way`),
      };
    }),
    manifest: list(root.manifest ?? [], "manifest").map((item, i) => {
      const rule = object(item, `manifest[${i}]`, ["when", "risk", "disclosure", "one_way"]);
      const when = (MANIFEST_CONDITIONS as readonly unknown[]).includes(rule.when)
        ? (rule.when as ManifestCondition)
        : fail(`manifest[${i}].when`, `must be one of ${MANIFEST_CONDITIONS.join(", ")}`);
      return {
        when,
        risk: risk(rule.risk, `manifest[${i}].risk`),
        disclosure: optionalText(rule.disclosure, `manifest[${i}].disclosure`),
        one_way: optionalFlag(rule.one_way, `manifest[${i}].one_way`),
      };
    }),
    content: list(root.content ?? [], "content").map((item, i) => {
      const rule = object(item, `content[${i}]`, ["id", "files", "risk", "disclosure", "one_way", "patterns"]);
      return {
        id: text(rule.id, `content[${i}].id`),
        files: regex(rule.files, "", `content[${i}].files`),
        risk: risk(rule.risk, `content[${i}].risk`),
        disclosure: optionalText(rule.disclosure, `content[${i}].disclosure`),
        one_way: optionalFlag(rule.one_way, `content[${i}].one_way`),
        patterns: list(rule.patterns, `content[${i}].patterns`).map((entry, j) => {
          const pattern = object(entry, `content[${i}].patterns[${j}]`, ["label", "regex"]);
          return { label: text(pattern.label, `content[${i}].patterns[${j}].label`), regex: regex(pattern.regex, "gi", `content[${i}].patterns[${j}].regex`) };
        }),
      };
    }),
  };
}

export function loadRiskPolicy(file: string): RiskPolicy {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`risk preset ${file}: cannot be read as JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  return parseRiskPolicy(raw, `risk preset ${file}`);
}

// --- who approves ------------------------------------------------------------

/** Whether `subject` holds the owner role. Turning a change down and accepting an undo past a one-way change both take it. */
export function holdsOwnerRole(policy: BuildChangeGovernancePolicy, subject: string): boolean {
  return policy.role_assignments.some((held) => held.subject === subject && held.role === "owner");
}

/** In record mode nothing is approved, so only the role assignments matter: they say who the owner is. */
export function governancePolicy(appId: string, owner: string, mode: GovernanceMode, policy: RiskPolicy): BuildChangeGovernancePolicy {
  const auto = new Set<BuildChangeRisk>(policy.auto_approve);
  return {
    policy_id: `${policy.preset_id}:${mode}`,
    app_id: appId,
    role_assignments: [
      { subject: AUTO_SUBJECT, role: "reviewer" },
      { subject: owner, role: "owner" },
    ],
    routes: [
      { route_id: "low-risk", risks: [...auto], required_roles: [mode === "personal" ? "reviewer" : "owner"] },
      // Every risk the preset does not hand to the standing policy, including ones no rule of it emits.
      { route_id: "high-risk", risks: BUILD_CHANGE_RISK_KINDS.filter((risk) => !auto.has(risk)), required_roles: ["owner"] },
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

// --- which risks a change carries -----------------------------------------------

export interface RiskAssessment {
  readonly risks: readonly BuildChangeRisk[];
  /** One line per finding, for the history. */
  readonly reasons: readonly string[];
  /** Plain-language lines shown to the owner when a person has to decide. */
  readonly disclosure: readonly string[];
  /**
   * Why the change cannot be undone by putting files back, one line per finding of a rule the
   * preset marks `one_way`: the rule's disclosure, or the finding itself when the rule has none.
   * Empty for an ordinary change.
   */
  readonly oneWay: readonly string[];
}

const under = (path: string, prefixes: readonly string[]): boolean => prefixes.some((prefix) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));

function matchCounts(pattern: RegExp, source: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [match] of source.matchAll(pattern)) {
    // Quoting, spacing and a closing delimiter are formatting: a requoted or respaced statement is the same statement.
    const key = match
      .toLowerCase()
      .replace(/[`'"\\;)]/g, "")
      .replace(/\s+/g, " ")
      .replace(/ ?([,.]) ?/g, "$1")
      .trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** A pattern is new for a file when something it matches occurs more often after the change than before, not merely when it is present. */
function addsMatch(pattern: RegExp, before: string, after: string): boolean {
  const existing = matchCounts(pattern, before);
  for (const [match, count] of matchCounts(pattern, after)) {
    if (count > (existing.get(match) ?? 0)) return true;
  }
  return false;
}

function read(root: string, rel: string): string {
  const file = join(root, rel);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

// pneuma-space.json is agent-edited JSON, so the manifest and every value in it can be any JSON value.
function capabilitiesOf(manifest: SpaceManifest): Record<string, unknown> {
  return plainObject(plainObject(manifest)?.capabilities) ?? {};
}

function runtimeOf(manifest: SpaceManifest): unknown {
  return plainObject(manifest)?.runtime ?? "isolate";
}

function identityRequired(capabilities: Record<string, unknown>): boolean {
  const identity = plainObject(capabilities.identity);
  return identity !== undefined && identity.required !== false;
}

/** What changed in the runtime manifest, as the conditions a preset can attach a risk to. */
function manifestFacts(before: SpaceManifest, after: SpaceManifest): { readonly when: ManifestCondition; readonly reason: string }[] {
  const facts: { when: ManifestCondition; reason: string }[] = [];
  const beforeCapabilities = capabilitiesOf(before);
  const afterCapabilities = capabilitiesOf(after);
  for (const kind of Object.keys(afterCapabilities)) {
    if (!(kind in beforeCapabilities)) facts.push({ when: "capability_added", reason: `declares capability ${kind}` });
  }
  for (const kind of Object.keys(beforeCapabilities)) {
    if (!(kind in afterCapabilities)) facts.push({ when: "capability_removed", reason: `stops using capability ${kind}; its data is kept by the platform` });
  }
  if (runtimeOf(before) !== runtimeOf(after)) {
    facts.push({ when: "runtime_changed", reason: `runtime changes from ${String(runtimeOf(before))} to ${String(runtimeOf(after))}` });
  }
  if (identityRequired(beforeCapabilities) && !identityRequired(afterCapabilities)) facts.push({ when: "sign_in_dropped", reason: "sign-in is no longer required" });
  return facts;
}

/**
 * Apply a preset's rules to a change. Reads what is on disk, never what the agent says.
 * A rule can only add a risk; nothing a rule says removes one another rule found.
 */
export function classifyRisks(
  policy: RiskPolicy,
  input: {
    readonly diff: TreeDiff;
    readonly activeRoot: string;
    readonly draftRoot: string;
    readonly before: SpaceManifest;
    readonly after: SpaceManifest;
  },
): RiskAssessment {
  const risks = new Set<BuildChangeRisk>();
  const reasons: string[] = [];
  const disclosure: string[] = [];
  const oneWay: string[] = [];
  const { diff } = input;

  const confined = policy.change.when_only_under.find((rule) => diff.changedPaths.every((path) => under(path, rule.paths)));
  risks.add(confined?.risk ?? policy.change.risk);
  reasons.push(`${diff.changedPaths.length} file(s) changed${confined?.note ? `, ${confined.note}` : ""}`);

  for (const rule of policy.paths) {
    const hit = diff.changedPaths.filter((path) => under(path, rule.under));
    if (!hit.length) continue;
    risks.add(rule.risk);
    const reason = `${hit.join(", ")} changed (${rule.risk})`;
    const told = rule.disclosure?.replaceAll("{paths}", hit.join(", "));
    reasons.push(reason);
    if (told) disclosure.push(told);
    if (rule.one_way) oneWay.push(told ?? reason);
  }

  for (const fact of manifestFacts(input.before, input.after)) {
    for (const rule of policy.manifest) {
      if (rule.when !== fact.when) continue;
      risks.add(rule.risk);
      reasons.push(fact.reason);
      if (rule.disclosure && !disclosure.includes(rule.disclosure)) disclosure.push(rule.disclosure);
      if (rule.one_way && !oneWay.includes(rule.disclosure ?? fact.reason)) oneWay.push(rule.disclosure ?? fact.reason);
    }
  }

  for (const path of [...diff.added, ...diff.changed]) {
    for (const rule of policy.content) {
      if (!rule.files.test(path)) continue;
      const after = read(input.draftRoot, path);
      const before = read(input.activeRoot, path);
      // One statement can match several patterns; the owner gets one line per file and rule.
      const labels = rule.patterns.filter(({ regex }) => addsMatch(regex, before, after)).map(({ label }) => label);
      if (!labels.length) continue;
      risks.add(rule.risk);
      const reason = `${path} newly contains ${labels.join(", ")}`;
      const told = rule.disclosure?.replaceAll("{path}", path).replaceAll("{labels}", labels.map((label) => `"${label}"`).join(" and "));
      reasons.push(reason);
      if (told) disclosure.push(told);
      if (rule.one_way) oneWay.push(told ?? reason);
    }
  }

  return { risks: [...risks], reasons, disclosure, oneWay };
}
