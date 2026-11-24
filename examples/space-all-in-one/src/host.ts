import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createFileBuildThreadStore, type BuildThreadStore } from "@pneuma-framework/core/build-thread";
import type { BuildChangeRisk } from "@pneuma-framework/core/build-assurance";
import type { BuildChangeGovernancePolicy } from "@pneuma-framework/core/enterprise-governance";
import { createReleaseInstance, promoteReleaseCandidate, stageReleaseCandidate } from "@pneuma-framework/core/release-rollout";
import { FileReleaseRolloutStore } from "@pneuma-framework/core/release-rollout-store";
import {
  ChangeRecordRefused,
  GUARANTEES,
  restoreWithData,
  type ChangeRecord,
  type ChangeRecordEntry,
  type DataSnapshotCapability,
  type OneWayChange,
  type RestorePlan,
} from "@pneuma-framework/host-kit/change-record";
import {
  buildGovernedProposal,
  GovernedProposalRejected,
  type ObservationEvidence,
  type VerifyResult,
} from "@pneuma-framework/host-kit/governed-change";
import {
  adoptLegacyRecord,
  APP_NAME,
  appPaths,
  describeAppsDir,
  installCli,
  refreshCli,
  installOverlay,
  nextVersionId,
  recordHostAddress,
  openRecord,
  readAppInfo,
  readScaffold,
  readServingVersion,
  readSpaceManifest,
  restoreWorkingTree,
  snapshot,
  sourceDiff,
  sourceFiles,
  sourceSignature,
  TREE,
  writeAppInfo,
  type AppInfo,
  type AppPaths,
  type ControlPlane,
  type HistoryEntry,
  type HostEntryFields,
} from "./artifact";
import { classifyRisks, decide, governancePolicy, holdsOwnerRole, type GovernanceMode, type RiskPolicy } from "./policy";
import { DEFAULT_MANAGER, readManager, type ManagerState, type ProbeResult, type SpaceRuntime } from "./space";
import { DEFAULT_PREVIEW_TTL_SECONDS, previewName, Previews, type PreviewState, type StandingPreview } from "./preview";
import { runCheckCommand, testCoverage, testWarning, type CheckRun, type TestCoverage } from "./test-coverage";
import type { Overview } from "./page";

// ---------------------------------------------------------------------------
// A headless Creation Host on PneumaSpace.
//
// One loop, two control planes:
//   agent-driven  the coding agent edits the working tree and calls submit()
//   host-driven   the Host starts a code agent on a draft, then runs the same loop
//
// One record under every mode. Versions, history and the current version live in
// the framework's change record (`@pneuma-framework/host-kit/change-record`).
// What varies with the mode is what happens before a version is recorded:
//   record      nothing: the change is recorded and published, `guarantees: []`
//   personal    verify, preview, approval by the standing policy or the owner
//   review-all  verify, preview, approval by the owner
// Every entry the Host writes says which guarantees held for it.
//
// Sequencing and gating come from the framework (governed-change backbone,
// governance evaluator, change record, rollout state, BuildThread). Every effect
// is supplied here: the verify gate, the preview on PneumaSpace, publish and undo.
// ---------------------------------------------------------------------------

type Check = NonNullable<HistoryEntry["checks"]>[number];

/**
 * The framework's `DataSnapshotCapability`, plus two optional things this Host can tell a person when a
 * capability offers them. The framework knows neither; a plain `DataSnapshotCapability` works as it is.
 */
export interface HostDataSnapshot extends DataSnapshotCapability {
  /** One sentence, read before a restore: where the stored data in use now will be kept. */
  readonly setAsideNote?: string;
  /** One sentence, after this process restored the app in `appRoot`: where the data that was in use is kept now. */
  setAsideAfter?(input: { appRoot: string }): string | undefined;
}

export interface AppHostOptions {
  readonly appsDir: string;
  readonly space: SpaceRuntime;
  /** Directory holding AGENTS.pneuma.md, CLAUDE.md and pneuma.scaffold.json. */
  readonly overlayDir: string;
  /** Path of the artifact CLI (bin/pneuma.mjs), copied into every app. */
  readonly cliSource: string;
  /** Owner subject, e.g. user:me. Only this subject satisfies the owner role. */
  readonly owner: string;
  readonly governance?: GovernanceMode;
  /** The risk preset: which change carries which risk, and which risks the standing policy may approve. See policy/personal.json. */
  readonly policy: RiskPolicy;
  /** Boot every draft on PneumaSpace as an ephemeral app before release. Default true. Record mode never previews. */
  readonly preview?: boolean;
  /** Seconds a preview stands before it ends itself; a waiting change keeps it until then. Default 3600, PneumaSpace's default maximum. */
  readonly previewTtlSeconds?: number;
  /** This Host as the manager of what it publishes on PneumaSpace, and where a person acts through it. Default `pneuma-host`, no url. */
  readonly manager?: { readonly name: string; readonly url?: string };
  /**
   * Runs the scaffold's verify command in a draft. Default: `sh -c <command>`, with Node's test runner asked
   * for a JUnit report beside its usual output, so the entry can say how many of the tests are the app's own.
   */
  readonly runVerify?: (draftRoot: string, command: string) => Promise<CheckRun>;
  /**
   * A way to save stored data and put it back, if this Host has one. When present, the Host saves the
   * data right before it releases a one-way change, and an undo past that change puts the data back.
   * Either way, an undo past a one-way change needs the owner's confirmation: with the data put back,
   * everything stored since the snapshot leaves the app; without it, only code goes back.
   */
  readonly dataSnapshot?: HostDataSnapshot;
  /**
   * This Host's own address as the person's machine reaches it, e.g. http://127.0.0.1:8090. When set,
   * the Host records it in `.pneuma/host.json` of the apps directory and of every app (at start, and
   * when it creates or opens an app), so the CLI copies there find it without PNEUMA_HOST.
   */
  readonly hostUrl?: string;
  /** PneumaSpace's console as the person's machine reaches it, e.g. http://127.0.0.1:8081/. The owner page links to it. */
  readonly consoleUrl?: string;
  readonly log?: (line: string) => void;
}

/**
 * Where the name in an entry's `agent` came from, as the client that submitted says. The artifact CLI
 * sends it; a host-driven change knows its own lane and sends none.
 */
export interface AgentProvenance {
  /**
   * `--agent` or `PNEUMA_AGENT`: named by the caller. `detected`: the one agent whose markers were in the
   * environment (`markers`). `ambiguous`: markers of more than one agent (`candidates`); `agent` is then
   * `unknown`, never one of them. `none`: nothing named or detected.
   */
  readonly source: "--agent" | "PNEUMA_AGENT" | "detected" | "ambiguous" | "none";
  readonly markers?: readonly string[];
  readonly candidates?: readonly { readonly agent: string; readonly markers: readonly string[] }[];
}

export const AGENT_SOURCES: readonly AgentProvenance["source"][] = ["--agent", "PNEUMA_AGENT", "detected", "ambiguous", "none"];

/** The entry fields that say where the agent's name came from. Empty when the caller said nothing. */
function provenanceFields(provenance: AgentProvenance | undefined): Pick<HostEntryFields, "agent_source" | "agent_markers" | "agent_candidates"> {
  if (!provenance) return {};
  return {
    agent_source: provenance.source,
    ...(provenance.markers?.length ? { agent_markers: provenance.markers } : {}),
    ...(provenance.candidates?.length ? { agent_candidates: provenance.candidates } : {}),
  };
}

const isText = (value: unknown): value is string => typeof value === "string";
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * What keeps `value`, read from `.pneuma/pending/<id>.json`, from being a waiting change in the shape this Host
 * writes; undefined when nothing does. The agent can write that directory, so every field the owner reads or
 * the decision uses is checked before anything relies on it.
 */
function pendingProblem(value: unknown, id: string): string | undefined {
  if (!isObject(value)) return "it is not a JSON object";
  if (value.change_id !== id) return `its change_id is not ${id}, the file's name`;
  for (const field of ["intent", "agent", "control", "base_version", "created_at", "draft_signature"]) {
    if (!isText(value[field])) return `${field} is missing or not text`;
  }
  for (const field of ["changed_paths", "risks", "risk_reasons", "disclosure"]) {
    if (!isTextList(value[field])) return `${field} is missing or not a list of text`;
  }
  if (!Array.isArray(value.checks) || !value.checks.every(isObject)) return "checks is missing or not a list of checks";
  if (value.agent_note !== undefined && !isText(value.agent_note)) return "agent_note is not text";
  if (value.one_way !== undefined && value.one_way !== null && !isText(value.one_way)) return "one_way is not text";
  if (value.agent_provenance !== undefined && !isProvenance(value.agent_provenance)) return "agent_provenance is not in the shape this Host writes";
  if (value.preview_app_id !== undefined && !isText(value.preview_app_id)) return "preview_app_id is not text";
  return undefined;
}

function isProvenance(value: unknown): value is AgentProvenance {
  return (
    isObject(value) &&
    (AGENT_SOURCES as readonly unknown[]).includes(value.source) &&
    (value.markers === undefined || isTextList(value.markers)) &&
    (value.candidates === undefined || (Array.isArray(value.candidates) && value.candidates.every((c) => isObject(c) && isText(c.agent) && isTextList(c.markers))))
  );
}

/**
 * Who stands behind an approval. The route may already be satisfied by the standing policy (a change that waited
 * under one mode and is approved under another); when the owner said yes, the record names them too. Any other
 * subject's yes is not an approval, so it is not named, whoever sent it.
 */
function approvers(satisfiedBy: readonly string[], subject: string, policy: BuildChangeGovernancePolicy): string[] {
  return satisfiedBy.includes(subject) || !holdsOwnerRole(policy, subject) ? [...satisfiedBy] : [...satisfiedBy, subject];
}

/** The line `status` shows for a file in `.pneuma/pending/` it leaves out. */
function malformedPendingLine(file: string, problem: string): string {
  return `.pneuma/pending/${file} is not a waiting change in the shape this Host writes (${problem}), so it is not listed and cannot be approved or denied. Look at it, then delete it.`;
}

export interface SubmitInput {
  readonly name: string;
  /** What the person asked for. */
  readonly intent: string;
  /** Who made the change, e.g. claude-code, codex. `unknown` when the caller could not tell. */
  readonly agent: string;
  /** Where that name came from. Recorded in the entry and returned with the result. */
  readonly agentProvenance?: AgentProvenance;
  /**
   * Record mode only: the agent's own statement of why putting files back would not undo this change
   * (a dropped column, rewritten rows). Nothing classifies risk in record mode, so this is the only
   * way such a change is marked one-way. In the governed modes the risk preset decides.
   */
  readonly oneWay?: string;
  /**
   * Host-driven only: run one code-agent turn against the draft. When absent the
   * working tree is taken as the draft (agent-driven).
   */
  readonly runAgent?: (draftRoot: string, context: { readonly system_prompt: string }) => Promise<{ note: string }>;
  readonly isAgentTimeout?: (err: unknown) => boolean;
}

/** The agent a submit recorded, as returned with its result: the name and where it came from. */
export interface RecordedAgent extends Partial<AgentProvenance> {
  readonly name: string;
}

export type ChangeResult = ChangeOutcome & {
  /** Set on a submit's result: the agent the entry names, and where the name came from. */
  readonly agent?: RecordedAgent;
};

type ChangeOutcome =
  | {
      readonly status: "published";
      readonly change_id: string;
      readonly version: string;
      readonly address: string;
      readonly changed_paths: readonly string[];
      readonly risks: readonly string[];
      readonly approved_by: readonly string[];
      /** What held for this version. Empty in record mode: nothing checked or approved it. */
      readonly guarantees: readonly string[];
      /** Set when going back past this version needs its stored data put back. */
      readonly one_way?: string;
      /** Set when the working tree was edited while the change was made and was therefore not brought up to date, or when this release marked the app as this Host's on PneumaSpace. */
      readonly note?: string;
      /**
       * Set when `version` was recorded earlier and did not go live then, and the working tree still equals
       * it: this submit released it as it was, and no new version was recorded.
       */
      readonly released_as_is?: true;
      /** What the test check ran. Absent when no test check ran (record mode). */
      readonly tests?: TestCoverage;
      /** One line when the change touched app code and none of the app's own tests ran, or that is unknown. */
      readonly test_warning?: string;
    }
  | { readonly status: "rejected"; readonly change_id: string; readonly reason: string; readonly detail: string }
  | {
      readonly status: "needs_approval";
      readonly change_id: string;
      readonly risks: readonly string[];
      readonly disclosure: readonly string[];
      readonly changed_paths: readonly string[];
      readonly tests?: TestCoverage;
      readonly test_warning?: string;
      /** The preview the owner can open before deciding, standing until they do or until it ends itself. */
      readonly preview?: StandingPreview;
    }
  | {
      /** Record mode: the version was recorded, because the record is all this mode promises, but it did not go live. */
      readonly status: "release_failed";
      readonly change_id: string;
      readonly version: string;
      readonly reason: string;
      readonly detail: string;
      /** What the address serves now. */
      readonly address_note: string;
      readonly serving_version: string | null;
    };

interface PendingChange {
  readonly change_id: string;
  readonly intent: string;
  readonly agent: string;
  readonly control: ControlPlane;
  readonly base_version: string;
  readonly changed_paths: readonly string[];
  readonly risks: readonly BuildChangeRisk[];
  readonly risk_reasons: readonly string[];
  readonly disclosure: readonly string[];
  readonly checks: readonly Check[];
  readonly agent_note: string;
  readonly created_at: string;
  /** The backbone's `draftSignature`: the draft as it was diffed. Approval releases the draft only if it still matches. */
  readonly draft_signature: string;
  /** Why the change is one-way, by the preset, or null. Absent only in a file an earlier Host wrote. */
  readonly one_way?: string | null;
  /** Where the agent's name came from, when the client said. */
  readonly agent_provenance?: AgentProvenance;
  /**
   * The app id PneumaSpace returned for the change's preview, which discarding it carries, so the discard never ends
   * a later app of the same name. Absent when there was no preview or PneumaSpace printed no id: then the Host does
   * not discard it, and it ends itself. A wrong id makes PneumaSpace refuse the discard, nothing more.
   */
  readonly preview_app_id?: string;
}

export interface AppStatus {
  readonly app_id: string;
  readonly owner: string;
  readonly scaffold_id: string;
  readonly address: string;
  /** The change record's current version: what the working tree is compared against and what undo goes back from. */
  readonly active_version: string | null;
  /** The version the current one was built on: where `undo` goes. */
  readonly previous_version: string | null;
  /** What the address serves, by the rollout state. Differs from `active_version` after a release that failed in record mode. */
  readonly serving_version: string | null;
  /**
   * Set when the Host cannot vouch for what the address serves: its last attempt to put the address back did not
   * succeed (the next release or undo that answers settles it), or the active version has served and the address
   * serves another, after an undo that could not be recorded (submit and approve are refused until an undo answers).
   * `serving_version` is then only what the rollout state names. The text says why and what to do.
   */
  readonly serving_uncertain?: string;
  readonly governance: GovernanceMode;
  /** One plain sentence on what `submit` does in this mode, for whoever reads `status`. */
  readonly governance_note: string;
  /** The id of the Host's data snapshot capability, or null when it has none. */
  readonly data_snapshot: string | null;
  /** Files in the working tree that differ from the active version. */
  readonly uncommitted: readonly string[];
  /** With previews on, each with its preview as PneumaSpace answers for it now. */
  readonly pending: readonly (PendingChange & { readonly preview?: PreviewState })[];
  /**
   * One plain line for each file in `.pneuma/pending/` that is not a waiting change in the shape this Host
   * writes, naming the file. Such a file is left out of `pending` and cannot be approved or denied, and the
   * others can. Absent when there is none.
   */
  readonly malformed_pending?: readonly string[];
  /** Who PneumaSpace says manages the app. */
  readonly space_manager: ManagerState;
}

/** A change waiting for the owner, as a list of apps shows it. */
export type PendingSummary = Pick<PendingChange, "change_id" | "intent" | "agent" | "control" | "risks" | "disclosure" | "changed_paths" | "created_at"> & {
  readonly one_way: string | null;
};

/** One app at a glance: what `list` and `GET /apps` return for each app. */
export type AppSummary =
  | {
      readonly app_id: string;
      readonly active_version: string | null;
      readonly address: string;
      /** What the address serves, by the rollout state. */
      readonly serving_version: string | null;
      /** True when the address serves a version other than the current one (a release that did not go live). */
      readonly serves_other_version: boolean;
      /** As in `status`: set when the address could not be put back, so `serving_version` was not seen answering. */
      readonly serving_uncertain?: string;
      /** The last create, change, decision or undo, whatever its outcome. */
      readonly last_change: {
        readonly at: string;
        readonly kind: string;
        readonly outcome: string;
        readonly version: string | null;
        readonly agent: string;
        readonly intent: string;
      } | null;
      readonly pending: readonly PendingSummary[];
      /** As in `status`: a line for each file in `.pneuma/pending/` left out of `pending`. Absent when there is none. */
      readonly malformed_pending?: readonly string[];
      readonly uncommitted: readonly string[];
    }
  /** An app directory this Host could not read; the others are listed regardless. */
  | { readonly app_id: string; readonly error: string };

export interface UndoOptions {
  /** Who asked, e.g. claude-code or owner. Labels the entry. */
  readonly actor?: string;
  /** Go straight to this earlier version instead of one step back. It must be one the current version was built on. */
  readonly to?: string;
  /**
   * The owner's confirmation to go back past a one-way change. Every such undo needs it: when this Host
   * puts stored data back, because what was stored since the snapshot leaves the app; when it cannot,
   * because only code goes back. Takes the owner role, like approving.
   */
  readonly acceptOneWay?: boolean;
  /** The subject confirming, when `acceptOneWay` is set. */
  readonly subject?: string;
  /** Where the undo came from when not the CLI, e.g. `owner-page`; written into the entry as `channel`. */
  readonly channel?: string;
  /**
   * The version the plan shown before this undo started from: the current version then (`undoPlan().from`, or `from`
   * on a `crosses_one_way_change` refusal). When the current version is another one now, the undo would go back past
   * something nobody was shown, so it is refused with `plan_changed` (409) and nothing changes.
   */
  readonly from?: string;
}

export interface UndoResult {
  readonly active_version: string;
  readonly undone_version: string;
  /** Every version this undo went back past, newest first. */
  readonly undone: readonly string[];
  readonly address: string;
  /** Stored data was put back through the Host's data snapshot capability. */
  readonly data_restored: boolean;
  /** The owner who confirmed going back past a one-way change, with its data put back or without. */
  readonly confirmed_by?: string;
  /** Where the data that was in use before the restore is kept, when the capability says. */
  readonly set_aside?: string;
  /** Set when the working tree was edited while the undo ran and was therefore left as it is, or when this undo marked the app as this Host's on PneumaSpace. */
  readonly note?: string;
}

export class HostError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** A reason code a client can act on, e.g. crosses_one_way_change. */
    readonly reason?: string,
    readonly detail?: readonly string[],
    /** More fields a client can act on, sent next to `reason`; e.g. `data_restore` with crosses_one_way_change. */
    readonly fields?: Readonly<Record<string, string>>,
  ) {
    super(message);
  }
}

/** A change the Host turns down by its own rules, on top of the backbone's. Recorded as `rejected`. */
class ChangeRefused extends Error {
  constructor(readonly reason: string, readonly detail: string) {
    super(`${reason}: ${detail}`);
  }
}

/** An undo whose older version could not be published or did not answer. Thrown before any data is touched. */
class UndoNotPublished extends Error {
  constructor(readonly reason: string, readonly why: string, readonly addressNote: string) {
    super(`${reason}: ${why}`);
  }
}

/** An undo whose older version answered when it went out, and did not answer once its data was back. */
class UndoNotVerified extends Error {
  constructor(readonly why: string) {
    super(`unhealthy_after_data_restore: ${why}`);
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type PublishOutcome =
  | { readonly ok: true; readonly address: string; readonly probe: ProbeResult }
  | { readonly ok: false; readonly reason: string; readonly detail: string; readonly address_note?: string };

const NOT_PROBED = { ok: false, status: 0, detail: "" } as const;

function unsubmitted(paths: readonly string[], before: string): string {
  return `the working tree has edits that were never submitted (${paths.join(", ")}); submit or discard them before ${before}`;
}

function leftAlone(version: string): string {
  return `the working tree was edited while this ran, so it was left as it is and does not hold ${version}; run status, then submit or discard those edits`;
}

/** A published result with the note that the release also marked the app as this Host's on PneumaSpace. */
function markedNote<T extends ChangeOutcome>(result: T, marked: string | undefined): T {
  return marked && result.status === "published" ? { ...result, note: andNote(result.note, marked) } : result;
}

/** `note` with `more` after it. */
const andNote = (note: string | undefined, more: string | undefined): string | undefined => (note && more ? `${note}. ${more}` : (note ?? more));

const NOT_TOUCHED = "the address was not touched";

/** Names what still serves only when the Host can say it: not while nobody has seen the address answer (see `cannotVouch`). */
function untouched(record: ChangeRecord, serving: string | null): string {
  return serving && cannotVouch(record, serving)?.undoUnfinished !== false ? `${NOT_TOUCHED} and still serves ${serving}` : NOT_TOUCHED;
}

/**
 * The guarantees the gate earned for a draft: `verified` when the scaffold's verify command passed on
 * it, `previewed` when it answered as a running app under a throwaway name before release. A preview
 * that never ran (preview off, or the tests failed first) earns nothing. Callers add `approved` and
 * `sealed` only where those held.
 */
function earnedByChecks(checks: readonly Check[]): string[] {
  const passed = (id: string) => checks.some((check) => check.id === id && check.status === "passed");
  return [...(passed("npm-test") ? [GUARANTEES.verified] : []), ...(passed("space-preview") ? [GUARANTEES.previewed] : [])];
}

/** What the test check ran, and the warning for a change to app code that no app test covered, for a change's result. */
function testFacts(checks: readonly Check[], changedPaths: readonly string[]): { tests?: TestCoverage; test_warning?: string } {
  const coverage = checks.find((check) => check.id === "npm-test")?.coverage;
  const warning = testWarning(changedPaths, coverage);
  return { ...(coverage ? { tests: coverage } : {}), ...(warning ? { test_warning: warning } : {}) };
}

/** 2026-11-23T22:48:12.345Z -> 2026-11-23 22:48 UTC */
function readableTime(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

/** The version `version` was built on, by the first entry naming it that is not a restore: the rule `planRestore` follows. */
function builtOn(history: readonly ChangeRecordEntry[], version: string): string | null {
  return history.find((entry) => entry.version === version && entry.kind !== "restore")?.base_version ?? null;
}

/** `version` and every version it was built on, newest first. */
function lineage(history: readonly ChangeRecordEntry[], version: string): string[] {
  const out: string[] = [];
  for (let at: string | null = version; at && !out.includes(at); at = builtOn(history, at)) out.push(at);
  return out;
}

/** The record says `version` has served at the address: a release of it went out and answered, or an undo landed on it. */
function servedBefore(history: readonly HistoryEntry[], version: string): boolean {
  return history.some((entry) => entry.version === version && (entry.outcome === "published" || entry.outcome === "rolled_back"));
}

/** Some entry about `version`, other than a restore, says it is one-way: the rule `planRestore` reads. */
function declaredOneWay(history: readonly ChangeRecordEntry[], version: string): boolean {
  return history.some((entry) => entry.kind !== "restore" && entry.version === version && entry.one_way !== undefined);
}

/**
 * The recorded versions a release of `top` takes live for the first time, newest first: `top` and the
 * versions it was built on, back to what the address serves, or to a version that served before. In
 * record mode a version can be recorded and never go live; the next release takes it live with it.
 */
function firstTimeLive(history: readonly HistoryEntry[], top: string, serving: string | null): string[] {
  const out: string[] = [];
  for (let at: string | null = top; at && at !== serving && !out.includes(at) && !servedBefore(history, at); at = builtOn(history, at)) out.push(at);
  return out;
}

export class AppHost {
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly governance: GovernanceMode;
  private readonly log: (line: string) => void;
  /** This Host as PneumaSpace's manager of what it publishes: the name every write names, and where a person acts through it. */
  private readonly manager: { readonly name: string; readonly url?: string };
  private readonly previews: Previews;

  constructor(private readonly opts: AppHostOptions) {
    this.governance = opts.governance ?? "personal";
    this.log = opts.log ?? (() => {});
    this.manager = opts.manager ?? { name: DEFAULT_MANAGER };
    this.previews = new Previews({ space: opts.space, manager: this.manager, ttlSeconds: opts.previewTtlSeconds ?? DEFAULT_PREVIEW_TTL_SECONDS, log: this.log });
    mkdirSync(opts.appsDir, { recursive: true });
  }

  // --- plumbing --------------------------------------------------------------

  /** One operation per app at a time: the record and the rollout state are files. */
  private serial<T>(name: string, work: () => Promise<T>): Promise<T> {
    const run = (this.locks.get(name) ?? Promise.resolve()).then(work, work);
    this.locks.set(name, run.catch(() => {}));
    return run;
  }

  private open(name: string): { paths: AppPaths; info: AppInfo; record: ChangeRecord } {
    if (!APP_NAME.test(name)) throw new HostError(400, `app name must match ${APP_NAME}`);
    const paths = appPaths(this.opts.appsDir, name);
    if (!existsSync(paths.info)) throw new HostError(404, `no app named ${name}`);
    if (adoptLegacyRecord(paths, (record) => this.declareLegacyOneWay(record))) {
      this.log(`${name}: put an app directory made by an earlier Host on the change record`);
    }
    if (refreshCli(paths.root, this.opts.cliSource)) this.log(`${name}: updated its copy of the CLI to this Host's`);
    this.recordAddress(paths.root, "app", name);
    return { paths, info: readAppInfo(paths), record: openRecord(paths) };
  }

  /** Write this Host's address into `<dir>/.pneuma/host.json` when it is not there yet. A failure is logged, never thrown: the CLI then falls back to PNEUMA_HOST or the default. */
  private recordAddress(dir: string, scope: "app" | "apps", label: string): void {
    if (!this.opts.hostUrl) return;
    try {
      if (recordHostAddress(dir, this.opts.hostUrl, scope)) this.log(`${label}: recorded this Host's address (${this.opts.hostUrl}) in .pneuma/host.json`);
    } catch (err) {
      this.log(`${label}: could not record this Host's address in .pneuma/host.json (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  /**
   * At start: describe the apps directory (its AGENTS.md block, CLI copy and address record), and in every app
   * record this Host's address and bring the CLI copy up to this Host's, so the copies there reach this Host on
   * whatever port it runs. A copy from an earlier Host does not read the address record, so the address alone
   * would not reach an agent that runs it before the app is next opened.
   */
  announce(): void {
    this.describeAppsDir();
    for (const name of this.list()) {
      const root = appPaths(this.opts.appsDir, name).root;
      try {
        if (refreshCli(root, this.opts.cliSource)) this.log(`${name}: updated its copy of the CLI to this Host's`);
      } catch (err) {
        this.log(`${name}: could not update its copy of the CLI (${err instanceof Error ? err.message : String(err)})`);
      }
      this.recordAddress(root, "app", name);
    }
  }

  /** The directory that holds the apps: its address record, its AGENTS.md block and its copy of the CLI, each when stale. */
  private describeAppsDir(): void {
    this.recordAddress(this.opts.appsDir, "apps", "the apps directory");
    if (!this.opts.hostUrl) return;
    try {
      const written = describeAppsDir(this.opts.appsDir, this.opts.overlayDir, this.opts.cliSource, this.opts.hostUrl);
      if (written.length) this.log(`the apps directory: wrote ${written.join(", ")}`);
    } catch (err) {
      this.log(`the apps directory: could not write its AGENTS.md or CLI copy (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  /**
   * Versions an earlier Host released never said whether they were one-way: that field did not exist.
   * Left unmarked, an undo past the column drop that started this work would report success again.
   * So, once, when such an app is put on the record, the preset's one-way rules are applied to each
   * version against the version it was built on, and what they find is declared with a note. A
   * version that already carries a declaration is skipped, so running this twice adds nothing.
   */
  private declareLegacyOneWay(record: ChangeRecord): void {
    const history = record.history();
    const known = new Set(record.versions());
    for (const version of known) {
      if (history.some((entry) => entry.version === version && entry.one_way)) continue;
      const base = builtOn(history, version);
      if (!base || !known.has(base)) continue;
      const before = record.versionDir(base);
      const after = record.versionDir(version);
      let oneWay: readonly string[];
      try {
        oneWay = classifyRisks(this.opts.policy, { diff: sourceDiff(before, after), activeRoot: before, draftRoot: after, before: readSpaceManifest(before), after: readSpaceManifest(after) }).oneWay;
      } catch {
        // A manifest that cannot be read cannot be classified; the version stays as the earlier Host left it.
        continue;
      }
      if (!oneWay.length) continue;
      record.note<HostEntryFields>({
        kind: "declaration",
        intent: `marked one-way when this app was put on the change record, by the rules of preset ${this.opts.policy.preset_id}`,
        agent: "host",
        version,
        oneWay: { reason: oneWay.join("; ") },
        // A declaration claims nothing about the content: nothing was checked or approved by writing it.
        guarantees: [],
        extra: { outcome: "one_way_declared", control: "owner" },
      });
    }
  }

  private threads(paths: AppPaths): BuildThreadStore {
    return createFileBuildThreadStore({ workspace: paths.root });
  }

  private rollout(paths: AppPaths): FileReleaseRolloutStore {
    return new FileReleaseRolloutStore({ workspace: paths.root });
  }

  private changeId(): string {
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  }

  private ownerPolicy(name: string, info: AppInfo) {
    return governancePolicy(name, info.owner, this.governance, this.opts.policy);
  }

  /** What the address serves. Falls back to the record's current version when the rollout state says nothing, so a failed step never takes a live app down. */
  private serving(paths: AppPaths, record: ChangeRecord): string | null {
    return readServingVersion(paths) ?? record.current();
  }

  /** Submit and approve stop here after an undo that went out and could not be recorded (see `cannotVouch`). */
  private refuseUnfinishedUndo(paths: AppPaths, record: ChangeRecord): void {
    const unsure = cannotVouch(record, readServingVersion(paths));
    if (unsure?.undoUnfinished) throw new HostError(409, `The Host cannot vouch for what the address serves: ${unsure.why}. Nothing was released and nothing was recorded. ${RUN_UNDO}`, "serving_uncertain");
  }

  /** The version a governed change is checked against: what the address serves, when the record has it; else the base version. */
  private liveBase(paths: AppPaths, record: ChangeRecord, baseVersion: string): string {
    const serving = readServingVersion(paths);
    return serving !== null && record.versions().includes(serving) ? serving : baseVersion;
  }

  /**
   * A change waiting for the owner, or what keeps the file from being one. A file an earlier Host wrote has no
   * `one_way`: that Host did not mark one-way changes. For such a file the preset's one-way rules are applied to
   * the draft now, so the owner reads what approving costs and an approved column drop is marked one-way like any other.
   */
  private readPending(paths: AppPaths, record: ChangeRecord, file: string): PendingChange | { readonly problem: string } {
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return { problem: "it is not readable as JSON" };
    }
    const problem = pendingProblem(value, basename(file, ".json"));
    if (problem) return { problem };
    const pending = value as PendingChange;
    if (pending.one_way !== undefined) return pending;
    const draftRoot = join(paths.drafts, pending.change_id);
    const base = record.versions().includes(pending.base_version) ? this.liveBase(paths, record, pending.base_version) : undefined;
    if (!base || !existsSync(draftRoot)) return { ...pending, one_way: null };
    let oneWay: readonly string[];
    try {
      const liveRoot = record.versionDir(base);
      oneWay = classifyRisks(this.opts.policy, {
        diff: sourceDiff(liveRoot, draftRoot),
        activeRoot: liveRoot,
        draftRoot,
        before: readSpaceManifest(liveRoot),
        after: readSpaceManifest(draftRoot),
      }).oneWay;
    } catch {
      return { ...pending, one_way: null };
    }
    if (!oneWay.length) return { ...pending, one_way: null };
    return { ...pending, one_way: oneWay.join("; "), disclosure: [...(Array.isArray(pending.disclosure) ? pending.disclosure : []), this.oneWayCost()] };
  }

  private verifyCommand(draftRoot: string, command: string): Promise<CheckRun> {
    return this.opts.runVerify ? this.opts.runVerify(draftRoot, command) : runCheckCommand(draftRoot, command);
  }

  /** The line the owner reads before approving a one-way change: what approving costs, and whether this Host can put data back. */
  private oneWayCost(): string {
    const cap = this.opts.dataSnapshot;
    const cost = "What approving costs: after this change, going back to an earlier version is refused unless the owner confirms it.";
    return cap
      ? `${cost} This Host declares a data snapshot capability (${cap.id}): it saves the stored data just before the release, unless it kept a snapshot from before an earlier attempt at a one-way release on the same version, and a confirmed undo puts that data back. Everything stored after the snapshot is then set aside and is not in the app.`
      : `${cost} This Host declares no data snapshot capability, so a confirmed undo puts back only the code. The older version may fail on the data stored by then.`;
  }

  /**
   * What going back past one-way changes would do to stored data, in words a person can read, and which
   * case applies. (a) This Host can put the data back: it returns to the snapshot taken before the
   * oldest of those changes, and what was stored since leaves the app. (b) It cannot: only code returns.
   */
  private describeCrossing(record: ChangeRecord, plan: RestorePlan): { withData: boolean; text: string } {
    const cap = this.opts.dataSnapshot;
    const reasons = new Map<string, string>();
    for (const entry of plan.oneWay) if (!reasons.has(entry.version!)) reasons.set(entry.version!, entry.one_way?.reason ?? "");
    // `undone` is newest first; the snapshot that fits the target was taken before the oldest one-way change.
    const oldest = [...plan.undone].reverse().find((version) => reasons.has(version));
    const lines = [
      `Going back to ${plan.target} would undo ${reasons.size === 1 ? "a change" : `${reasons.size} changes`} that putting files back cannot undo:`,
      ...[...reasons].map(([version, reason]) => `  - ${version}: ${reason}`),
    ];
    const withData = cap !== undefined && plan.dataRef?.capability === cap.id;
    if (withData) {
      const ref = plan.dataRef!;
      const taken = record
        .history()
        .filter((entry) => entry.data_ref?.capability === ref.capability && entry.data_ref.ref === ref.ref)
        .at(-1)?.at;
      // The snapshot by its name, so the owner sees what would be copied in. The name and the time come from
      // the history, which the agent can write; the capability checks the name before it touches anything.
      lines.push(
        `This Host can put stored data back (${cap.id}). The stored data would return to the snapshot ${ref.ref}, taken before ${oldest}${taken ? ` at ${readableTime(taken)}` : ""}.`,
        `Everything stored since then would be set aside and would not be in the app.${cap.setAsideNote ? ` ${cap.setAsideNote}` : ""}`,
      );
    } else {
      lines.push(
        cap
          ? `This Host can put stored data back (${cap.id}), but it took no snapshot before ${oldest}, so it cannot put this data back.`
          : "This Host cannot put stored data back.",
        `Only the code of ${plan.target} would come back. The stored data would stay as it is now, so ${plan.target} may not work with it: the older version may fail on today's data.`,
      );
    }
    lines.push("Going back past a one-way change is the owner's decision, and they have to confirm it.");
    return { withData, text: lines.join("\n") };
  }

  private governanceNote(): string {
    const checks = this.opts.preview === false ? "the checks" : "the checks and a preview";
    switch (this.governance) {
      case "record":
        return 'record mode: submit records the working tree as the next version and publishes it. Nothing checks or approves it. If a change drops or rewrites stored data, add --one-way "<what is lost>".';
      case "personal":
        return `personal mode: submit runs ${checks}; the standing policy approves ordinary changes and the owner decides risky ones.`;
      case "review-all":
        return `review-all mode: submit runs ${checks}, and the owner approves every change.`;
    }
  }

  /**
   * The verify gate: the scaffold's command, then a real boot on PneumaSpace, as an ephemeral app.
   *
   * A preview that booted is left standing, and its app id goes into `preview.id`; the caller discards it
   * by that id once the change is settled (a waiting change: when the owner decides, or it ends itself).
   * PneumaSpace stores bundles by content, so a release that follows while the preview is still up reuses
   * the bytes the preview uploaded, and discarding the preview afterwards deletes nothing. Discarding first
   * costs one more upload and one bundle deletion per change (measured: about 8 s each).
   */
  private async gate(name: string, changeId: string, draftRoot: string, command: string, checks: Check[], preview: { id?: string }): Promise<VerifyResult & { readonly refused?: string }> {
    // The command runs in a copy. `npm test` executes code the agent wrote, and whatever that code
    // writes must not end up in the tree that was diffed, classified and is about to be released.
    // The copy lives outside the app, so no relative path from it leads to the draft; a write that
    // reaches the draft anyway is caught by the signature checks (the sealed draft, and before release).
    const checkRoot = mkdtempSync(join(tmpdir(), "pneuma-check-"));
    let tests: CheckRun;
    let coverage: TestCoverage;
    try {
      snapshot(draftRoot, checkRoot);
      tests = await this.verifyCommand(checkRoot, command);
      // Read while the copy exists: the report names files by their path in it.
      coverage = testCoverage(tests, checkRoot);
    } finally {
      rmSync(checkRoot, { recursive: true, force: true });
    }
    checks.push({ id: "npm-test", status: tests.ok ? "passed" : "failed", detail: tests.ok ? undefined : tests.output.slice(-600), coverage });
    if (!tests.ok) return tests;
    if (this.opts.preview === false) return tests;

    const booted = await this.previews.boot(previewName(name, changeId), draftRoot);
    const output = `${tests.output}\n${booted.output}`;
    // PneumaSpace refused the preview for a reason that is not the change's: no check failed, and the caller gives it its own reason.
    if (!booted.ok && booted.refused) return { ok: false, output, refused: `${booted.refused}.\n${booted.output.slice(-600)}` };
    checks.push({ id: "space-preview", status: booted.ok ? "passed" : "failed", detail: booted.ok ? undefined : output.slice(-600) });
    if (booted.ok) preview.id = booted.id;
    return { ok: booted.ok, output };
  }

  /** Before a write to the app on PneumaSpace: refused when another manager runs it; when nobody does, the publish marks it as this Host's, and the note says so. */
  private async claim(name: string, act: "submit" | "approval" | "undo"): Promise<string | undefined> {
    const manager = await readManager(this.opts.space, name, this.manager.name);
    if (manager.state === "other") throw new HostError(409, `${manager.note}. Nothing was checked, recorded or released.`, "managed_elsewhere", undefined, { manager: manager.name! });
    // In the result only: who manages the app is PneumaSpace's fact, which status asks for and its audit keeps.
    return manager.state === "unmanaged" ? `PneumaSpace had no manager for ${name}; this ${act} marked it as managed by ${this.manager.name}` : undefined;
  }

  /** Approving releases what the owner could look at: with previews on, the change's preview has to stand, by PneumaSpace's answer now. */
  private async previewStanding(name: string, changeId: string): Promise<void> {
    const preview = await this.previews.state(previewName(name, changeId));
    if (preview.state === "standing") return;
    const waits = "Nothing was approved or released, and the change still waits.";
    // Not answered is not gone: the preview may stand, and publishing it again would not help.
    if (preview.state === "unknown") throw new HostError(502, `${preview.note}, so whether anyone can look at what approving would release is unknown. ${waits} Ask again in a minute.`, "preview_unknown");
    throw new HostError(409, `${preview.note}, so nobody can look at what approving would release. ${waits} Publish the preview again with \`node .pneuma/pneuma.mjs preview ${changeId}\`, look at it, then approve.`, "preview_gone");
  }

  /**
   * After a failed attempt that reached the address: put back the version that was serving, or,
   * for an app that never had one, take the app down again. Returns what the address holds now.
   * `attempted` names what went out, for the case where it cannot be taken off the address.
   */
  private async settleAddress(name: string, record: ChangeRecord, servingVersion: string | null, attempted = "the rejected build"): Promise<string> {
    if (!servingVersion) {
      if (await this.opts.space.takeDown(name, this.manager.name)) return `${name} was removed from PneumaSpace again`;
      return (
        `${name} could not be removed from PneumaSpace and is still there, so the name stays taken. ` +
        `Remove it with \`appctl remove ${name} --manager ${this.manager.name}\`, then \`appctl purge ${name} --manager ${this.manager.name}\` (or in the PneumaSpace console), before creating ${name} again`
      );
    }
    const restored = await this.opts.space.publish(name, record.versionDir(servingVersion), { manager: this.manager });
    const probe = restored.code === 0 ? await this.opts.space.probe(name) : NOT_PROBED;
    if (restored.code === 0 && probe.ok) return `the address is back on ${servingVersion}`;
    const why = restored.code === 0 ? `GET / -> ${probe.status} ${probe.detail}` : restored.output.slice(-300);
    return `the address could not be put back on ${servingVersion} and may still serve ${attempted} (${why.trim()})`;
  }

  /**
   * A release went out and answered, and then writing it to the record failed. Put the address back on
   * what served before (or take a new app down again), so the address and the record agree, write what
   * can be written, and return the HostError to throw, with a reason, as undo does. Never a bare
   * exception after a publish.
   */
  private async releasedButNotRecorded(name: string, record: ChangeRecord, serving: string | null, err: unknown, sayFailed: (addressNote: string) => void): Promise<HostError> {
    const addressNote = await this.settleAddress(name, record, serving);
    try {
      sayFailed(addressNote);
    } catch {
      // The record cannot be written to at all; the error is all there is.
    }
    return new HostError(500, `the release went out and answered, but it could not be recorded (${errText(err)}); ${addressNote}`, "record_failed");
  }

  /** Write a failed release to the record. The address was settled already; if the write fails too, say both, with a reason. */
  private recordNotReleased<T>(why: string, addressNote: string | undefined, write: () => T): T {
    try {
      return write();
    } catch (err) {
      throw new HostError(500, `the release failed (${why}), and that could not be recorded either (${errText(err)})${addressNote ? `; ${addressNote}` : ""}`, "record_failed");
    }
  }

  /** Write into the framework's rollout state that the address now serves `version` and that it answered. */
  private async markServing(name: string, paths: AppPaths, version: string, address: string, probe: ProbeResult, reason: string): Promise<void> {
    const store = this.rollout(paths);
    const staged = stageReleaseCandidate(
      await store.load(),
      createReleaseInstance({
        candidate_id: version,
        image_tag: `${name}:${version}`,
        url: address,
        status: "healthy",
        checks: [{ name: "space-probe", status: "passed", message: `GET / -> ${probe.status}`, at_ms: Date.now() }],
      }),
      { reason },
    );
    const promoted = promoteReleaseCandidate(staged, { reason });
    // A healthy candidate is always promoted; if that ever changes, the rollout state stays as it was and says so here.
    if (!promoted.ok) return this.log(`${name}: the rollout state did not take ${version} (${promoted.error}); it still names what served before`);
    await store.save(promoted.state);
  }

  /** `markServing` on a path that is already failing: a second failure is logged, and the error being reported stays the one thrown. */
  private async markServingQuietly(name: string, paths: AppPaths, version: string, address: string, probe: ProbeResult, reason: string): Promise<void> {
    try {
      await this.markServing(name, paths, version, address, probe, reason);
    } catch (err) {
      this.log(`${name}: could not write that the address serves ${version} (${errText(err)})`);
    }
  }

  private observe(root: string): Promise<ObservationEvidence> {
    const manifest = readSpaceManifest(root);
    const files = sourceFiles(root);
    return Promise.resolve({
      appSchemaSignature: `${manifest.runtime ?? "isolate"}(${Object.keys(manifest.capabilities ?? {}).sort().join(",")})`,
      bundleSignature: sourceSignature(root),
      bundleBytes: files.reduce((bytes, rel) => bytes + statSync(join(root, rel)).size, 0),
      extra: { files: files.length },
    });
  }

  /**
   * Where the data snapshot for a release belongs, or null when the release needs none. The rule looks at
   * what goes live, not at the submit: every recorded version this release takes live for the first time,
   * plus the release itself. When any of them is one-way, the snapshot belongs to the base of the oldest
   * one-way one, which is where `planRestore` looks for it. None of those versions has served yet. Null
   * too when that base already carries a snapshot and has not gone live again since (a release of it that
   * answered, an undo that landed on it): an attempt in between may have run its one-way change at startup,
   * and putting the address back afterwards does not undo that, so a new snapshot could hold data it changed.
   * `asIs` says the release is the current version itself; otherwise it is new content on top of it.
   * `oneWay` says the release is one-way.
   */
  private snapshotBase(record: ChangeRecord, serving: string | null, release: { readonly asIs?: boolean; readonly oneWay?: OneWayChange }): { base: string; oneWay: string } | null {
    const current = record.current();
    if (!current) return null;
    const history = record.history<HostEntryFields>();
    const span = firstTimeLive(history, current, serving);
    const oneWay = span.filter((version) => declaredOneWay(history, version) || (release.asIs && release.oneWay && version === current));
    const oldest = oneWay.at(-1);
    const base = oldest ? builtOn(history, oldest) : release.oneWay && !release.asIs ? current : null;
    if (!base) return null;
    const snapped = history.map((entry) => entry.kind !== "restore" && entry.version === base && entry.data_ref !== undefined).lastIndexOf(true);
    if (snapped >= 0 && !servedBefore(history.slice(snapped + 1), base)) return null;
    return { base, oneWay: oldest ? `the one-way version ${oldest}` : "this one-way change" };
  }

  /**
   * Publish a private copy of a change to the app's stable address and see that it answers. Records
   * nothing but a data snapshot: the caller records the copy afterwards, so what is recorded is exactly
   * what went out.
   *
   * `expectedBase` and `sealedSignature` are the governed path's: the version the draft was checked
   * against, and the draft's signature when it was diffed. Record mode passes neither, because nothing
   * was checked. `asIs` says the copy is the current version, recorded earlier and not live. When the
   * release takes a one-way change live for the first time and this Host has a data snapshot capability,
   * the stored data is saved first (see `snapshotBase`); if that fails, nothing goes out.
   */
  private async publishRelease(input: {
    readonly name: string;
    readonly paths: AppPaths;
    readonly record: ChangeRecord;
    readonly releaseRoot: string;
    readonly changeId: string;
    readonly intent: string;
    readonly control: ControlPlane;
    readonly expectedBase?: string | null;
    readonly sealedSignature?: string;
    readonly oneWay?: OneWayChange;
    readonly asIs?: boolean;
  }): Promise<PublishOutcome> {
    const { name, paths, record, releaseRoot } = input;
    const current = record.current();
    if (input.expectedBase !== undefined && current !== input.expectedBase) {
      return { ok: false, reason: "base_changed", detail: `the current version is ${current}, the draft was checked against ${input.expectedBase}` };
    }
    // Compared on the copy that is about to be published, so nothing can change in between.
    if (input.sealedSignature !== undefined && sourceSignature(releaseRoot) !== input.sealedSignature) {
      return {
        ok: false,
        reason: "draft_changed_after_check",
        detail: "the draft was changed after it was diffed and checked, so what would be released is not what was checked; nothing was released",
      };
    }
    const serving = this.serving(paths, record);

    const cap = this.opts.dataSnapshot;
    const snap = cap ? this.snapshotBase(record, serving, input) : null;
    if (cap && snap) {
      // Not atomic with the release: the app keeps running while the data is saved, so a write it makes
      // between the snapshot and the new build's first start is not in the snapshot.
      let ref: string;
      try {
        ref = (await cap.snapshot({ appRoot: paths.root, version: snap.base })).ref;
      } catch (err) {
        return {
          ok: false,
          reason: "data_snapshot_failed",
          detail: `the stored data could not be saved before ${snap.oneWay} went live (${errText(err)}), so nothing went live, and an undo past it could not have put the data back`,
          address_note: untouched(record, serving),
        };
      }
      try {
        record.note<HostEntryFields>({
          kind: "snapshot",
          intent: `stored data before: ${input.intent}`,
          agent: "host",
          version: snap.base,
          dataRef: { capability: cap.id, ref },
          // A snapshot note is about stored data, not content: none of the guarantees names anything that held for it.
          guarantees: [],
          extra: { outcome: "snapshot_taken", control: input.control, for_change: input.changeId },
        });
      } catch (err) {
        // Nothing went out yet. Without the note, an undo could never find this snapshot, so nothing goes out at all.
        throw new HostError(500, `saved the stored data as ${ref}, but could not write that into the record (${errText(err)}); nothing was released, and ${untouched(record, serving)}`, "record_failed");
      }
    }

    const published = await this.opts.space.publish(name, releaseRoot, { manager: this.manager });
    const probe = published.code === 0 ? await this.opts.space.probe(name) : NOT_PROBED;
    if (published.code !== 0 || !probe.ok) {
      // A refused publish never reached an existing address. Everything else did: a build that went up
      // and did not come up, and any attempt on a name this create had just claimed.
      const address_note = published.code === 0 || !serving ? await this.settleAddress(name, record, serving) : undefined;
      const detail = published.code !== 0 ? published.output.slice(-1200) : `GET / -> ${probe.status} ${probe.detail}`;
      return {
        ok: false,
        reason: published.code !== 0 ? "publish_failed" : "published_unhealthy",
        detail: address_note ? `${detail}\n${address_note}` : detail,
        address_note,
      };
    }
    return { ok: true, address: this.opts.space.address(name), probe };
  }

  /** A private copy of a tree outside the app, where no process the agent started can reach it by a relative path. */
  private privateCopy(source: string): string {
    const root = mkdtempSync(join(tmpdir(), "pneuma-release-"));
    snapshot(source, root);
    return root;
  }

  // --- lifecycle -------------------------------------------------------------

  async create(name: string, intent = "Create the app from the PneumaSpace template"): Promise<ChangeResult> {
    if (!APP_NAME.test(name)) throw new HostError(400, `app name must match ${APP_NAME}`);
    return this.serial(name, async () => {
      const paths = appPaths(this.opts.appsDir, name);
      const existed = existsSync(paths.root);
      if (existed && readdirSync(paths.root).length) throw new HostError(409, `${paths.root} is not empty`);
      // The name is the app's identity on PneumaSpace, stored data included. Publishing under a name
      // that is already in use would take that app over, and cleaning up after a failed create would delete it.
      const taken = await this.opts.space.app(name).catch((err: unknown) => {
        throw new HostError(502, `cannot ask PneumaSpace whether ${name} exists: ${err instanceof Error ? err.message : String(err)}`);
      });
      const ours = taken?.manager?.name === this.manager.name ? `, managed by this Host (${this.manager.name}) though this apps directory has no such app; its directory may have moved` : "";
      if (taken) throw new HostError(409, `PneumaSpace already has an app named ${name}${ours}; pick another name`);

      let result: ChangeResult | undefined;
      try {
        result = await this.createApp(name, paths, intent);
        return result;
      } finally {
        // A create that did not publish leaves nothing behind, in every mode. A half-made directory
        // could be neither created again ("not empty") nor changed ("no active version").
        if (result?.status !== "published") {
          rmSync(paths.root, { recursive: true, force: true });
          if (existed) mkdirSync(paths.root, { recursive: true });
        }
      }
    });
  }

  private async createApp(name: string, paths: AppPaths, intent: string): Promise<ChangeResult> {
    const init = await this.opts.space.init(paths.root);
    if (init.code !== 0) throw new HostError(502, `template init failed: ${init.output.slice(-400)}`);
    installOverlay(paths.root, this.opts.overlayDir, this.opts.cliSource);
    this.recordAddress(paths.root, "app", name);
    this.describeAppsDir();

    const scaffold = readScaffold(paths.root);
    const thread = await this.threads(paths).startThread({ profile_id: scaffold.scaffold_id, app_id: name, builder_user_id: this.opts.owner });
    const info: AppInfo = {
      schema_version: 1,
      app_id: name,
      scaffold_id: scaffold.scaffold_id,
      owner: this.opts.owner,
      thread_id: thread.thread_id,
      created_at: new Date().toISOString(),
    };
    writeAppInfo(paths, info);
    const record = openRecord(paths);
    const governed = this.governance !== "record";

    const changeId = this.changeId();
    const draftRoot = join(paths.drafts, changeId);
    snapshot(paths.root, draftRoot);
    const draftSignature = sourceSignature(draftRoot);
    const checks: Check[] = [];
    const preview: { id?: string } = {};
    const meta = { changeId, kind: "create", intent, agent: "host" };
    let releaseRoot: string | undefined;
    try {
      let approval: HostEntryFields["approval"];
      let approvedBy: readonly string[] = [];
      if (governed) {
        const gate = await this.gate(name, changeId, draftRoot, scaffold.verify_command, checks, preview);
        if (!gate.ok) {
          const reason = gate.refused ? "preview_refused" : "verify_failed";
          record.note<HostEntryFields>({ ...meta, guarantees: earnedByChecks(checks), extra: { outcome: "rejected", control: "owner", reason, checks } });
          return { status: "rejected", change_id: changeId, reason, detail: gate.refused ?? gate.output.slice(-2000) };
        }
        // Creating the app is the owner's own act; it is recorded as their approval.
        const decision = decide({
          policy: this.ownerPolicy(name, info),
          change_id: changeId,
          builder_subject: "agent:host",
          risks: ["release_change"],
          owner_decision: { subject: info.owner, decision: "approved", reason: "requested creation", decided_at_ms: Date.now() },
        });
        approval = { preset: this.opts.policy.preset_id, route: decision.route_id, by: decision.satisfied_by_subjects, reason_code: decision.reason_code };
        approvedBy = decision.satisfied_by_subjects;
      }
      releaseRoot = this.privateCopy(draftRoot);
      const released = await this.publishRelease({
        name,
        paths,
        record,
        releaseRoot,
        changeId,
        intent,
        control: "owner",
        expectedBase: null,
        sealedSignature: governed ? draftSignature : undefined,
      });
      let outcome = released;
      // Checked again on the copy that went out, as a change's release is: `sealed` rests on it.
      if (governed && released.ok && sourceSignature(releaseRoot) !== draftSignature) {
        const address_note = await this.settleAddress(name, record, null);
        outcome = {
          ok: false,
          reason: "draft_changed_after_check",
          detail: `the copy being released changed while it was published, so what went out is not what was checked; nothing was recorded\n${address_note}`,
          address_note,
        };
      }
      if (!outcome.ok) {
        // What held: the checks it passed and the owner's approval, unless the copy changed after it was checked.
        const guarantees = !governed || outcome.reason === "draft_changed_after_check" ? [] : [...earnedByChecks(checks), GUARANTEES.approved];
        const failure = outcome;
        this.recordNotReleased(failure.reason, failure.address_note, () =>
          record.note<HostEntryFields>({ ...meta, guarantees, extra: { outcome: "rejected", control: "owner", reason: failure.reason, address_note: failure.address_note, checks } }),
        );
        return { status: "rejected", change_id: changeId, reason: outcome.reason, detail: outcome.detail };
      }
      const guarantees = governed ? [...earnedByChecks(checks), GUARANTEES.approved, GUARANTEES.sealed] : [];
      // The app is on PneumaSpace now. If it cannot be recorded, it is taken down again, so the name is free;
      // the directory goes too, as with every create that did not publish, so there is nothing to note it in.
      let entry: HistoryEntry;
      try {
        entry = record.record<HostEntryFields>({
          ...meta,
          from: releaseRoot,
          guarantees,
          extra: governed
            ? { outcome: "published", control: "owner", risks: ["release_change"], approval, checks, address: outcome.address }
            : { outcome: "published", control: "owner", address: outcome.address },
        });
      } catch (err) {
        throw await this.releasedButNotRecorded(name, record, null, err, () => {});
      }
      await this.markServing(name, paths, entry.version!, outcome.address, outcome.probe, "space-all-in-one release");
      this.log(`created ${name} ${entry.version} at ${outcome.address}`);
      return {
        status: "published",
        change_id: changeId,
        version: entry.version!,
        address: outcome.address,
        changed_paths: [],
        risks: governed ? ["release_change"] : [],
        approved_by: approvedBy,
        guarantees,
      };
    } finally {
      if (earnedByChecks(checks).includes(GUARANTEES.previewed)) await this.previews.drop(previewName(name, changeId), preview.id);
      rmSync(draftRoot, { recursive: true, force: true });
      if (releaseRoot) rmSync(releaseRoot, { recursive: true, force: true });
    }
  }

  submit(input: SubmitInput): Promise<ChangeResult> {
    return this.serial(input.name, async () => {
      const { paths, info, record } = this.open(input.name);
      const baseVersion = record.current();
      if (!baseVersion) throw new HostError(409, `${input.name} has no active version`);
      if (input.oneWay !== undefined && this.governance !== "record") {
        throw new HostError(400, `this Host runs in ${this.governance} mode, where the risk preset decides which changes are one-way; one_way is for record mode only`);
      }
      if (input.oneWay !== undefined && !input.oneWay.trim()) throw new HostError(400, "one_way must say, in words, what putting files back would not undo");
      this.refuseUnfinishedUndo(paths, record);
      // Refused before anything is checked or recorded when another manager runs the app on PneumaSpace.
      const adopted = await this.claim(input.name, "submit");
      let workingTree: string | undefined;
      if (input.runAgent) {
        // A host-driven change is made in a draft and then written over the working tree.
        const dirty = this.uncommitted(record);
        if (dirty.length) throw new HostError(409, unsubmitted(dirty, "starting a host-driven change"));
        workingTree = sourceSignature(paths.root);
      }
      const result =
        this.governance === "record"
          ? await this.submitRecorded(input, paths, info, record, baseVersion, workingTree)
          : await this.submitGoverned(input, paths, info, record, baseVersion, workingTree);
      return { ...markedNote(result, adopted), agent: { name: input.agent, ...(input.agentProvenance ?? {}) } };
    });
  }

  /**
   * Record mode, the zero position of the dial: copy the change, publish it, record it. No verify
   * command, no preview, no writable-root or protected-path check, no risk classification, no approval.
   *
   * The version is recorded whether or not the release goes out, because the record is the only
   * promise this mode makes. When the runtime refuses the build or the build does not answer, the
   * address is put back on what served before, the entry says the release failed and what the address
   * serves now, and the caller is told so (the CLI exits non-zero). That version is then recorded but not
   * live. Submitting again with no new edits releases it as it is, with a `release` note and no new
   * version; submitting with new edits records a new version on top, and the release takes both live.
   */
  private async submitRecorded(
    input: SubmitInput,
    paths: AppPaths,
    info: AppInfo,
    record: ChangeRecord,
    baseVersion: string,
    workingTree: string | undefined,
  ): Promise<ChangeResult> {
    const control: ControlPlane = input.runAgent ? "host-driven" : "agent-driven";
    const changeId = this.changeId();
    const threads = this.threads(paths);
    const oneWay = input.oneWay ? { reason: input.oneWay.trim() } : undefined;
    const meta = { changeId, kind: "change", intent: input.intent, agent: input.agent, baseVersion };
    const who = provenanceFields(input.agentProvenance);
    await threads.appendTurn(info.thread_id, { kind: "user", text: input.intent });

    const draftRoot = join(paths.drafts, changeId);
    let releaseRoot: string | undefined;
    try {
      let agentNote: string | undefined;
      if (input.runAgent) {
        snapshot(record.versionDir(baseVersion), draftRoot);
        try {
          const scaffold = readScaffold(record.versionDir(baseVersion));
          agentNote = (await input.runAgent(draftRoot, { system_prompt: scaffold.system_prompt_fragments.join("\n") })).note;
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          // Record mode: nothing checked or approved this attempt, so the entry claims nothing.
          record.note<HostEntryFields>({ ...meta, guarantees: [], extra: { outcome: "rejected", control, reason: "agent_failed", ...who } });
          return { status: "rejected", change_id: changeId, reason: "agent_failed", detail };
        }
      }
      const copy = this.privateCopy(input.runAgent ? draftRoot : paths.root);
      releaseRoot = copy;
      const changed = sourceDiff(record.versionDir(baseVersion), copy).changedPaths;
      // What the address serves before this release, and what goes back on it if the release fails.
      const servingBefore = this.serving(paths, record);
      // The tree equals the current version while the address serves something else: an earlier release of
      // this version did not go live. Submitting again releases it as it is, and records no new version.
      const asIs = changed.length === 0 && servingBefore !== baseVersion;
      if (!changed.length && !asIs) {
        record.note<HostEntryFields>({ ...meta, guarantees: [], extra: { outcome: "rejected", control, reason: "no_change", ...who } });
        return { status: "rejected", change_id: changeId, reason: "no_change", detail: `the working tree is identical to ${baseVersion}` };
      }
      const history = record.history<HostEntryFields>();
      const declared = history.find((entry) => entry.kind !== "restore" && entry.version === baseVersion && entry.one_way)?.one_way?.reason;
      const liveDiff = asIs && servingBefore && record.versions().includes(servingBefore) ? sourceDiff(record.versionDir(servingBefore), copy).changedPaths : [];

      const released = await this.publishRelease({ name: input.name, paths, record, releaseRoot: copy, changeId, intent: input.intent, control, oneWay, asIs });
      const version = asIs ? baseVersion : nextVersionId(record);
      // No await from the comparison to the restore below: nothing in this process can edit the tree in between.
      const edited = workingTree !== undefined && sourceSignature(paths.root) !== workingTree;
      const note = edited ? leftAlone(version) : undefined;
      const serving = readServingVersion(paths);
      const addressNote = released.ok ? undefined : (released.address_note ?? untouched(record, serving));
      const extra: HostEntryFields = released.ok
        ? { outcome: "published", control, address: released.address, agent_note: agentNote, note, ...who }
        : { outcome: "release_failed", control, reason: released.reason, address_note: addressNote, agent_note: agentNote, note, ...who };
      // Record mode: nothing checked or approved this content, so no entry claims anything.
      const write = asIs
        ? () =>
            record.note<HostEntryFields>({
              changeId,
              kind: "release",
              intent: input.intent,
              agent: input.agent,
              version: baseVersion,
              ...(servingBefore ? { baseVersion: servingBefore } : {}),
              changedPaths: liveDiff,
              guarantees: [],
              // Said once per version: a version that is one-way already says so in its own entry.
              ...(oneWay && !declared ? { oneWay } : {}),
              extra,
            })
        : () => record.record<HostEntryFields>({ changeId, kind: "change", intent: input.intent, agent: input.agent, from: copy, oneWay, guarantees: [], extra });
      let entry: HistoryEntry;
      if (!released.ok) entry = this.recordNotReleased(released.reason, addressNote, write);
      else {
        try {
          entry = write();
        } catch (err) {
          throw await this.releasedButNotRecorded(input.name, record, servingBefore, err, (address_note) =>
            record.note<HostEntryFields>({ ...meta, guarantees: [], extra: { outcome: "rejected", control, reason: "record_failed", address_note, agent_note: agentNote, ...who } }),
          );
        }
      }
      // The version is current whether or not it went live, so a host-driven change brings the tree up to it.
      if (workingTree !== undefined && !edited) restoreWorkingTree(record.versionDir(version), paths.root);
      await threads.appendTurn(info.thread_id, {
        kind: "host_execution_receipt",
        proposal_id: changeId,
        status: released.ok ? "completed" : "failed_host_rolled_back",
        evidence: released.ok ? { version, address: released.address } : { version, reason: released.reason, address_note: addressNote },
      });
      if (!released.ok) {
        this.log(`${input.name} ${changeId} ${asIs ? `released ${version} as it is` : `recorded as ${version}`}, not live: ${released.reason}`);
        return {
          status: "release_failed",
          change_id: changeId,
          version,
          reason: released.reason,
          detail: released.detail,
          address_note: addressNote!,
          serving_version: serving,
        };
      }
      await this.markServing(input.name, paths, version, released.address, released.probe, "space-all-in-one release (record mode)");
      this.log(`${input.name} ${changeId} ${asIs ? "released as it is" : "recorded and published"} as ${version}${note ? `; ${note}` : ""}`);
      const wayReason = oneWay?.reason ?? (asIs ? declared : undefined);
      return {
        status: "published",
        change_id: changeId,
        version,
        address: released.address,
        changed_paths: asIs ? liveDiff : (entry.changed_paths ?? []),
        risks: [],
        approved_by: [],
        guarantees: [],
        ...(wayReason ? { one_way: wayReason } : {}),
        ...(asIs ? { released_as_is: true as const } : {}),
        note,
      };
    } finally {
      rmSync(draftRoot, { recursive: true, force: true });
      if (releaseRoot) rmSync(releaseRoot, { recursive: true, force: true });
    }
  }

  private async submitGoverned(
    input: SubmitInput,
    paths: AppPaths,
    info: AppInfo,
    record: ChangeRecord,
    baseVersion: string,
    workingTree: string | undefined,
  ): Promise<ChangeResult> {
    // What the working tree and a host-driven draft start from.
    const baseRoot = record.versionDir(baseVersion);
    // What the change is checked against: what the address serves. Only the governed modes having run,
    // that is the base version itself. After a record-mode release that did not go live, it is the older
    // version that still serves, so the recorded but unreleased content is diffed, guarded and classified
    // before it goes live with an approval.
    const liveRoot = record.versionDir(this.liveBase(paths, record, baseVersion));
    // The Host's own guardrails, not the app's copy of them: record mode does not protect pneuma.scaffold.json,
    // so a version recorded there may carry a loosened one.
    const scaffold = readScaffold(this.opts.overlayDir);
    const control: ControlPlane = input.runAgent ? "host-driven" : "agent-driven";
    const changeId = this.changeId();
    const draftRoot = join(paths.drafts, changeId);
    const threads = this.threads(paths);
    const checks: Check[] = [];
    const preview: { id?: string } = {};
    const meta = { changeId, kind: "change", intent: input.intent, agent: input.agent, baseVersion };
    const who = provenanceFields(input.agentProvenance);
    const createdAt = new Date().toISOString();
    await threads.appendTurn(info.thread_id, { kind: "user", text: input.intent });

    // Agent-driven: the working tree the agent just edited is the draft.
    // Host-driven: the draft starts as the active version and the agent edits it.
    snapshot(input.runAgent ? baseRoot : paths.root, draftRoot);

    let keepDraft = false;
    const previewed = () => earnedByChecks(checks).includes(GUARANTEES.previewed);
    try {
      let proposal;
      try {
        proposal = await buildGovernedProposal({
          draftId: changeId,
          activeRoot: liveRoot,
          draftRoot,
          protectedRoots: scaffold.protected_paths,
          writableRoots: scaffold.writable_roots,
          walkOptions: TREE,
          sealDraft: true,
          runAgent: input.runAgent
            ? (root) => input.runAgent!(root, { system_prompt: scaffold.system_prompt_fragments.join("\n") })
            : async () => ({ note: "edited in the working tree by the agent" }),
          isAgentTimeout: input.isAgentTimeout ?? (() => false),
          verify: (root) => {
            // The manifest decides what the runtime provides and who gets in; one that cannot be read cannot be classified.
            let manifest: unknown;
            try {
              manifest = readSpaceManifest(root);
            } catch (err) {
              throw new ChangeRefused("invalid_manifest", `pneuma-space.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
            }
            if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
              throw new ChangeRefused("invalid_manifest", `pneuma-space.json must hold a JSON object, not ${manifest === null ? "null" : Array.isArray(manifest) ? "an array" : typeof manifest}`);
            }
            return this.gate(input.name, changeId, root, scaffold.verify_command, checks, preview).then((gate) => {
              if (gate.refused) throw new ChangeRefused("preview_refused", gate.refused);
              return gate;
            });
          },
          observe: (root) => this.observe(root),
        });
      } catch (err) {
        const rejected = err instanceof GovernedProposalRejected;
        const refused = err instanceof ChangeRefused;
        let reason: string = rejected || refused ? err.reason : "agent_failed";
        // Users get one reason for a draft altered after it was diffed, whether verify or the release caught it.
        if (reason === "draft_changed_during_verify") reason = "draft_changed_after_check";
        const detail = rejected ? (err.detail ?? err.message) : refused ? err.detail : err instanceof Error ? err.message : String(err);
        // What held: the checks the draft passed before it was turned down (none, for a refusal that comes
        // before the checks). A draft that changed after it was checked holds nothing.
        const guarantees = reason === "draft_changed_after_check" ? [] : earnedByChecks(checks);
        record.note<HostEntryFields>({ ...meta, guarantees, extra: { outcome: "rejected", control, reason, checks, ...who } });
        await threads.appendTurn(info.thread_id, { kind: "host_event", label: "change_rejected", payload: { change_id: changeId, reason, detail: detail.slice(-600) } });
        this.log(`${input.name} ${changeId} rejected: ${reason}`);
        return { status: "rejected", change_id: changeId, reason, detail };
      }

      const { diff, draftSignature } = proposal;
      const assessment = classifyRisks(this.opts.policy, {
        diff,
        activeRoot: liveRoot,
        draftRoot,
        before: readSpaceManifest(liveRoot),
        after: readSpaceManifest(draftRoot),
      });
      const oneWay = assessment.oneWay.length ? assessment.oneWay.join("; ") : undefined;
      await threads.appendTurn(info.thread_id, {
        kind: "agent_proposal",
        proposal_id: changeId,
        summary: input.intent,
        rationale: assessment.reasons.join("; "),
        tool_calls: [],
      });
      const decision = decide({
        policy: this.ownerPolicy(input.name, info),
        change_id: changeId,
        builder_subject: `agent:${input.agent}`,
        risks: assessment.risks,
      });
      const approval = { preset: this.opts.policy.preset_id, route: decision.route_id, by: decision.satisfied_by_subjects, reason_code: decision.reason_code };

      if (!decision.allowed) {
        const disclosure = assessment.disclosure.length ? [...assessment.disclosure] : ["This Host is set to have the owner review every change."];
        if (oneWay) disclosure.push(this.oneWayCost());
        const pending: PendingChange = {
          change_id: changeId,
          intent: input.intent,
          agent: input.agent,
          control,
          base_version: baseVersion,
          changed_paths: diff.changedPaths,
          risks: assessment.risks,
          risk_reasons: assessment.reasons,
          disclosure,
          checks,
          agent_note: proposal.agentNote,
          created_at: createdAt,
          draft_signature: draftSignature,
          one_way: oneWay ?? null,
          ...(input.agentProvenance ? { agent_provenance: input.agentProvenance } : {}),
          ...(preview.id ? { preview_app_id: preview.id } : {}),
        };
        mkdirSync(paths.pending, { recursive: true });
        writeFileSync(join(paths.pending, `${changeId}.json`), `${JSON.stringify(pending, null, 2)}\n`);
        keepDraft = true;
        record.note<HostEntryFields>({
          ...meta,
          changedPaths: diff.changedPaths,
          // What held so far: the checks it passed. No approval record exists yet, and nothing is recorded to be sealed.
          guarantees: earnedByChecks(checks),
          extra: { outcome: "needs_approval", control, risks: assessment.risks, risk_reasons: assessment.reasons, approval, checks, ...who },
        });
        this.log(`${input.name} ${changeId} waits for ${info.owner}: ${assessment.risks.join(", ")}`);
        // The preview stays up for the owner; where it is and when it ends is PneumaSpace's answer.
        const standing = previewed() ? await this.previews.state(previewName(input.name, changeId)) : undefined;
        const facts = { ...testFacts(checks, diff.changedPaths), ...(standing?.state === "standing" ? { preview: standing } : {}) };
        return { status: "needs_approval", change_id: changeId, risks: assessment.risks, disclosure, changed_paths: diff.changedPaths, ...facts };
      }

      await threads.appendTurn(info.thread_id, { kind: "host_event", label: "policy_approval", payload: decision });
      return await this.finish(
        input.name,
        paths,
        info,
        record,
        draftRoot,
        draftSignature,
        {
          change_id: changeId,
          kind: "change",
          intent: input.intent,
          agent: input.agent,
          control,
          base_version: baseVersion,
          changed_paths: diff.changedPaths,
          risks: assessment.risks,
          risk_reasons: assessment.reasons,
          approval,
          checks,
          agent_note: proposal.agentNote,
          one_way: oneWay,
          agent_provenance: input.agentProvenance,
        },
        workingTree,
      );
    } finally {
      // A change that waits for the owner keeps its draft and its preview (discarded when they decide, or it ends itself).
      if (!keepDraft && previewed()) await this.previews.drop(previewName(input.name, changeId), preview.id);
      if (!keepDraft) rmSync(draftRoot, { recursive: true, force: true });
    }
  }

  /**
   * Release an approved draft and record it. `workingTree` is set when the change was made outside the
   * working tree (host-driven, or an owner's approval): the tree's `sourceSignature` when the change
   * started. The tree is brought up to date only if it still matches.
   *
   * When the draft is the current version itself (recorded in record mode, never live), the release
   * takes that version live as it is: the Host marks it serving and writes a note with the guarantees
   * that held, and records no new version.
   */
  private async finish(
    name: string,
    paths: AppPaths,
    info: AppInfo,
    record: ChangeRecord,
    draftRoot: string,
    draftSignature: string,
    change: {
      readonly change_id: string;
      readonly kind: "change" | "decision";
      readonly intent: string;
      readonly agent: string;
      readonly control: ControlPlane;
      readonly base_version: string;
      readonly changed_paths: readonly string[];
      readonly risks: readonly string[];
      readonly risk_reasons: readonly string[];
      readonly approval: NonNullable<HostEntryFields["approval"]>;
      readonly checks: readonly Check[];
      readonly agent_note: string;
      readonly one_way?: string;
      readonly agent_provenance?: AgentProvenance;
      /** An owner's decision that came through somewhere other than the CLI, e.g. `owner-page`. */
      readonly channel?: string;
    },
    workingTree?: string,
  ): Promise<ChangeOutcome> {
    const threads = this.threads(paths);
    const oneWay = change.one_way ? { reason: change.one_way } : undefined;
    const fields = {
      control: change.control,
      risks: change.risks,
      risk_reasons: change.risk_reasons,
      approval: change.approval,
      checks: change.checks,
      agent_note: change.agent_note,
      ...provenanceFields(change.agent_provenance),
      ...(change.channel ? { channel: change.channel } : {}),
    };
    // The checks it passed, and the approval record that let it through (the policy's or the owner's).
    const earned = [...earnedByChecks(change.checks), GUARANTEES.approved];
    // The draft is byte for byte the version it was built on: that version is recorded and goes live as it is.
    const asIs = record.versions().includes(change.base_version) && sourceSignature(record.versionDir(change.base_version)) === draftSignature;
    // What the address serves before this release, and what goes back on it if the release fails.
    const servingBefore = this.serving(paths, record);
    const releaseRoot = this.privateCopy(draftRoot);
    try {
      let released = await this.publishRelease({
        name,
        paths,
        record,
        releaseRoot,
        changeId: change.change_id,
        intent: change.intent,
        control: change.control,
        expectedBase: change.base_version,
        sealedSignature: draftSignature,
        oneWay,
        asIs,
      });
      // Checked again on the copy that went out, with no await from here to the record below: what was
      // published, what is recorded and what was checked are the same bytes, so `sealed` holds.
      if (released.ok && sourceSignature(releaseRoot) !== draftSignature) {
        const address_note = await this.settleAddress(name, record, servingBefore);
        released = {
          ok: false,
          reason: "draft_changed_after_check",
          detail: `the copy being released changed while it was published, so what went out is not what was checked; nothing was recorded\n${address_note}`,
          address_note,
        };
      }
      if (!released.ok) {
        // A copy that changed after it was checked holds nothing; otherwise the checks and the approval held, for a change that did not ship.
        const guarantees = released.reason === "draft_changed_after_check" ? [] : earned;
        const failure = released;
        this.recordNotReleased(failure.reason, failure.address_note, () =>
          record.note<HostEntryFields>({
            changeId: change.change_id,
            kind: change.kind,
            intent: change.intent,
            agent: change.agent,
            baseVersion: change.base_version,
            changedPaths: change.changed_paths,
            guarantees,
            extra: { ...fields, outcome: "rejected", reason: failure.reason, address_note: failure.address_note },
          }),
        );
        await threads.appendTurn(info.thread_id, {
          kind: "host_execution_receipt",
          proposal_id: change.change_id,
          status: "failed_host_rolled_back",
          evidence: { reason: released.reason, detail: released.detail.slice(-600) },
        });
        return { status: "rejected", change_id: change.change_id, reason: released.reason, detail: released.detail };
      }
      // No await from the comparison to the restore: nothing in this process can edit the tree in between.
      const version = asIs ? change.base_version : nextVersionId(record);
      const edited = workingTree !== undefined && sourceSignature(paths.root) !== workingTree;
      const note = edited ? leftAlone(version) : undefined;
      // The recorded version is byte-identical to what was checked: as-is by the signature above, otherwise because it is this copy.
      const guarantees = [...earned, GUARANTEES.sealed];
      const extra: HostEntryFields = { ...fields, outcome: "published", address: released.address, note };
      const declared = asIs ? declaredOneWay(record.history(), version) : false;
      try {
        if (asIs) {
          record.note<HostEntryFields>({
            changeId: change.change_id,
            kind: "release",
            intent: change.intent,
            agent: change.agent,
            version,
            ...(servingBefore ? { baseVersion: servingBefore } : {}),
            changedPaths: change.changed_paths,
            guarantees,
            // The preset found it one-way: said once per version, so only when the version does not say so already.
            ...(oneWay && !declared ? { oneWay } : {}),
            extra,
          });
        } else {
          record.record<HostEntryFields>({ changeId: change.change_id, kind: change.kind, intent: change.intent, agent: change.agent, from: releaseRoot, guarantees, oneWay, extra });
        }
      } catch (err) {
        throw await this.releasedButNotRecorded(name, record, servingBefore, err, (address_note) =>
          record.note<HostEntryFields>({
            changeId: change.change_id,
            kind: change.kind,
            intent: change.intent,
            agent: change.agent,
            baseVersion: change.base_version,
            changedPaths: change.changed_paths,
            // The checks and the approval held, for a release that went out and was taken back.
            guarantees: earned,
            extra: { ...fields, outcome: "rejected", reason: "record_failed", address_note },
          }),
        );
      }
      if (workingTree !== undefined && !edited) restoreWorkingTree(record.versionDir(version), paths.root);
      await this.markServing(name, paths, version, released.address, released.probe, "space-all-in-one release");
      await threads.appendTurn(info.thread_id, {
        kind: "host_execution_receipt",
        proposal_id: change.change_id,
        status: "completed",
        evidence: { version, address: released.address, checks: change.checks },
      });
      this.log(`${name} ${change.change_id} ${asIs ? "released as it is" : "published"} as ${version}${note ? `; ${note}` : ""}`);
      return {
        status: "published",
        change_id: change.change_id,
        version,
        address: released.address,
        changed_paths: change.changed_paths,
        risks: change.risks,
        approved_by: change.approval.by,
        guarantees,
        ...(oneWay ? { one_way: oneWay.reason } : {}),
        ...(asIs ? { released_as_is: true as const } : {}),
        note,
        ...testFacts(change.checks, change.changed_paths),
      };
    } finally {
      rmSync(releaseRoot, { recursive: true, force: true });
    }
  }

  /**
   * The owner's answer to a change that is waiting. `subject` must hold the owner role. `channel` names where the
   * answer came from when it was not the CLI (e.g. `owner-page`); the entry carries it, and is otherwise the same.
   */
  resolve(name: string, changeId: string, answer: "approved" | "denied", subject: string, reason?: string, channel?: string): Promise<ChangeResult> {
    return this.serial(name, async () => {
      const { paths, info, record } = this.open(name);
      const file = join(paths.pending, `${changeId}.json`);
      if (!existsSync(file)) throw new HostError(404, `no change ${changeId} is waiting`);
      const pending = this.readPending(paths, record, file);
      // Neither approving nor denying what the owner was never shown.
      if ("problem" in pending) throw new HostError(409, malformedPendingLine(`${changeId}.json`, pending.problem), "malformed_pending");
      const draftRoot = join(paths.drafts, changeId);
      const threads = this.threads(paths);
      const policy = this.ownerPolicy(name, info);
      const decision = decide({
        policy,
        change_id: changeId,
        builder_subject: `agent:${pending.agent}`,
        risks: pending.risks,
        owner_decision: { subject, decision: answer, reason, decided_at_ms: Date.now() },
      });
      if (answer === "approved" && !decision.allowed) {
        throw new HostError(403, `${subject} cannot approve this change (${decision.reason_code}; missing ${decision.missing_roles.join(", ")})`);
      }
      // Turning a change down throws the draft away, so it is the owner's call as much as approving is.
      if (answer === "denied" && !holdsOwnerRole(policy, subject)) {
        throw new HostError(403, `${subject} cannot deny this change (only the owner decides)`);
      }
      let workingTree: string | undefined;
      let adopted: string | undefined;
      if (answer === "approved") {
        this.refuseUnfinishedUndo(paths, record);
        // Approval writes the new version over the working tree. Nothing is lost when the tree is
        // untouched since the last release, or still holds exactly the change being approved.
        const beyond = this.uncommitted(record).length ? sourceDiff(draftRoot, paths.root).changedPaths : [];
        if (beyond.length) {
          throw new HostError(409, `the working tree has edits that are not part of this change (${beyond.join(", ")}); submit or discard them, then approve again`);
        }
        // PneumaSpace is asked only once nothing here refuses the approval: who manages the app, then whether the preview stands.
        adopted = await this.claim(name, "approval");
        if (this.opts.preview !== false) await this.previewStanding(name, changeId);
        workingTree = sourceSignature(paths.root);
      }
      const change = {
        change_id: changeId,
        kind: "decision" as const,
        intent: pending.intent,
        agent: pending.agent,
        control: pending.control,
        base_version: pending.base_version,
        changed_paths: pending.changed_paths,
        risks: pending.risks,
        risk_reasons: pending.risk_reasons,
        approval: { preset: this.opts.policy.preset_id, route: decision.route_id, by: answer === "approved" ? approvers(decision.satisfied_by_subjects, subject, policy) : [subject], reason_code: decision.reason_code },
        checks: pending.checks,
        agent_note: pending.agent_note,
        one_way: pending.one_way ?? undefined,
        agent_provenance: pending.agent_provenance,
        channel,
      };
      await threads.appendTurn(info.thread_id, { kind: "user_decision", proposal_id: changeId, decision: answer === "approved" ? "approved" : "rejected", reason });
      try {
        if (answer === "denied") {
          record.note<HostEntryFields>({
            changeId,
            kind: "decision",
            intent: change.intent,
            agent: change.agent,
            baseVersion: change.base_version,
            changedPaths: change.changed_paths,
            // What held: the checks it passed. A denial is a decision record, not an approval.
            guarantees: earnedByChecks(change.checks),
            extra: {
              outcome: "denied",
              control: change.control,
              risks: change.risks,
              risk_reasons: change.risk_reasons,
              approval: change.approval,
              checks: change.checks,
              agent_note: change.agent_note,
              reason: reason ?? "denied by the owner",
              ...provenanceFields(change.agent_provenance),
              ...(channel ? { channel } : {}),
            },
          });
          return { status: "rejected", change_id: changeId, reason: "denied", detail: reason ?? "denied by the owner" };
        }
        return markedNote(await this.finish(name, paths, info, record, draftRoot, pending.draft_signature, change, workingTree), adopted);
      } finally {
        rmSync(file, { force: true });
        rmSync(draftRoot, { recursive: true, force: true });
        // After the release, which reused the bytes the preview uploaded. Gone already when it ended itself.
        if (this.opts.preview !== false) await this.previews.drop(previewName(name, changeId), pending.preview_app_id);
      }
    });
  }

  /**
   * Go back: one step, to the version the current one was built on, or straight to an earlier one
   * with `to`. Each undo republishes that version, sees that it answers, and only then moves the
   * record and puts its files back in the working tree. Calling it again goes back further.
   *
   * Going back past a one-way change is refused unless the owner confirms it, in every governance
   * mode. The refusal says which case applies: this Host puts the stored data back to its snapshot and
   * what was stored since leaves the app, or it cannot and only code goes back. With the owner's
   * confirmation the undo goes ahead, and the entry names who confirmed. Every refusal comes before
   * anything is touched.
   */
  undo(name: string, reason: string, options: UndoOptions = {}): Promise<UndoResult> {
    return this.serial(name, async () => {
      const { paths, info, record } = this.open(name);
      const actor = options.actor ?? "owner";
      const current = record.current();
      if (!current) throw new HostError(409, `${name} has no version to go back from`);
      if (options.from !== undefined && options.from !== current) {
        throw new HostError(
          409,
          `${name} is on ${current} now, not on ${options.from}, where the plan that was shown started, so going back would not do what that plan said. Nothing changed. Look at what going back does now, then decide again.`,
          "plan_changed",
          undefined,
          { current },
        );
      }
      const line = lineage(record.history(), current);
      let target: string;
      if (options.to !== undefined) {
        if (!record.versions().includes(options.to)) {
          throw new HostError(404, `${name} has no version ${options.to}; its versions are ${record.versions().join(", ")}`);
        }
        if (options.to === current) throw new HostError(409, `${options.to} is already the current version of ${name}; there is nothing to go back to`);
        if (!line.includes(options.to)) {
          throw new HostError(
            409,
            `undo goes back along the versions ${current} was built on (${line.join(", ")}), and ${options.to} is not one of them. ` +
              `To bring ${options.to} back, submit its files again (they are in .pneuma/versions/${options.to}/)`,
          );
        }
        target = options.to;
      } else {
        const before = line[1];
        if (!before) throw new HostError(409, `${current} is the first version of ${name}; there is nothing before it to go back to`);
        target = before;
      }
      // Undo writes the older version over the working tree.
      const dirty = this.uncommitted(record);
      if (dirty.length) throw new HostError(409, unsubmitted(dirty, "undoing"));
      if (options.acceptOneWay && !holdsOwnerRole(this.ownerPolicy(name, info), options.subject ?? "")) {
        throw new HostError(403, `${options.subject || "nobody"} cannot confirm going back past a one-way change (only the owner decides)`);
      }
      // Refused before anything is touched when another manager runs the app on PneumaSpace.
      const adopted = await this.claim(name, "undo");

      const plan = record.planRestore(target);
      const cap = this.opts.dataSnapshot;
      let withData = false;
      let confirmedBy: string | undefined;
      if (plan.oneWay.length > 0) {
        // Both cases interrupt the person: putting data back drops what was stored since the snapshot,
        // and not putting it back can leave the older version unable to read today's data.
        const crossing = this.describeCrossing(record, plan);
        if (!options.acceptOneWay) {
          throw new HostError(409, crossing.text, "crosses_one_way_change", [...new Set(plan.oneWay.map((entry) => entry.version!))], {
            data_restore: crossing.withData ? "snapshot" : "none",
            // A confirmation of this plan sends it back, so it covers only this plan.
            from: current,
          });
        }
        withData = crossing.withData;
        confirmedBy = options.subject;
      }
      const serving = this.serving(paths, record);
      const address = this.opts.space.address(name);
      const changeId = this.changeId();
      const stored = withData
        ? `code, manifest and stored data: the data was put back to the snapshot ${plan.dataRef!.ref}, saved before ${plan.oneWay.map((entry) => entry.version).join(", ")}, as ${confirmedBy} confirmed`
        : confirmedBy
          ? `code and manifest only; stored data is left as it is, as ${confirmedBy} confirmed`
          : "code and manifest only; stored data is left as it is";
      // Filled in by the steps below, before the record writes the entry: where the replaced data went, and a failed second look.
      const extra: { -readonly [K in keyof HostEntryFields]: HostEntryFields[K] } = {
        outcome: "rolled_back",
        control: "owner",
        reason: stored,
        address,
        ...(confirmedBy ? { confirmed_by: confirmedBy } : {}),
        ...(options.channel ? { channel: options.channel } : {}),
      };
      const olderCode = `${target}'s code`;
      let setAside: string | undefined;
      let dataAttempted = false;
      let dataRestored = false;
      // Set when the older code starts going out. Before that, a refusal means nothing happened; after it, never.
      let releaseStarted = false;
      let released = false;
      let putBackNote: string | undefined;
      let probe: ProbeResult = NOT_PROBED;
      // The same capability, telling this code how far the data step got, so an error is blamed on the right step.
      const tracked: DataSnapshotCapability | undefined = cap && {
        id: cap.id,
        snapshot: (input) => cap.snapshot(input),
        // restoreWithData asks this before the older code goes out, so a ref the capability will not take changes nothing.
        ...(cap.check ? { check: (input: { appRoot: string; ref: string }) => cap.check!(input) } : {}),
        restore: async (input) => {
          dataAttempted = true;
          await cap.restore(input);
          dataRestored = true;
        },
      };
      let entry: HistoryEntry;
      try {
        entry = await restoreWithData<HostEntryFields>(
          record,
          target,
          tracked,
          {
            agent: actor,
            intent: reason,
            changeId,
            acceptOneWay: options.acceptOneWay,
            // The tree is compared again only after the publish, so edits made meanwhile are kept, not lost.
            keepEdits: true,
            // A restore entry claims nothing about the content it makes current: that version's own entry says what held when it was released.
            guarantees: [],
            extra,
          },
          {
            // restoreWithData's order: the older code goes out, then the data comes back, then a second look,
            // then the record moves. The build that dropped the data is never the release once the data is
            // back, so a request cannot wake it on the restored data and let it drop the data again.
            // One window remains, between this publish and the data swap: the older code serves on the newer
            // data and may answer errors. It loses nothing by that: the swap sets that data aside with
            // everything stored since the snapshot, unless the older version's own startup deletes something.
            release: async () => {
              releaseStarted = true;
              const result = await this.opts.space.publish(name, record.versionDir(target), { manager: this.manager });
              const answered = result.code === 0 ? await this.opts.space.probe(name) : NOT_PROBED;
              if (result.code !== 0 || !answered.ok) {
                const addressNote = result.code === 0 ? await this.settleAddress(name, record, serving, olderCode) : untouched(record, serving);
                const why = result.code !== 0 ? result.output.slice(-400) : `GET / -> ${answered.status} ${answered.detail}`;
                throw new UndoNotPublished(result.code !== 0 ? "publish_failed" : "published_unhealthy", why.trim(), addressNote);
              }
              probe = answered;
              released = true;
            },
            // Only when the data step failed: the data is as it was, so what served before can serve again.
            putReleaseBack: async () => {
              putBackNote = await this.settleAddress(name, record, serving, olderCode);
              released = false;
            },
            verify: async ({ withData: dataBack }) => {
              // Without data, the release step's own probe was the check.
              if (!dataBack) return;
              setAside = cap?.setAsideAfter?.({ appRoot: paths.root });
              if (setAside) extra.set_aside = setAside;
              // The capability stopped the app to swap its database; this wakes the older code on the restored data.
              const again = await this.opts.space.probe(name);
              if (!again.ok) {
                const why = `GET / -> ${again.status} ${again.detail}`.trim();
                extra.address_note = `${target} did not answer after the data came back (${why})`;
                throw new UndoNotVerified(why);
              }
              probe = again;
            },
          },
        );
      } catch (err) {
        // restoreWithData throws a refusal only before anything happened. Should one ever come after the older code
        // started going out, it is not answered as a refusal: it falls through to the cases below, which say what is live.
        if (err instanceof ChangeRecordRefused && !releaseStarted && err.reason === "data_snapshot_refused") {
          // The capability's check said no before the older code went out. Unlike data_restore_failed, nothing happened.
          throw new HostError(
            409,
            `the stored data cannot be put back to the snapshot ${plan.dataRef!.ref} (${err.message}). ` +
              "The undo was refused before anything happened: no code was released, no data was touched, and the record was not changed.",
            err.reason,
            err.detail,
          );
        }
        if (err instanceof ChangeRecordRefused && !releaseStarted) {
          // The record's plain-language message, unchanged.
          throw new HostError(err.reason === "unknown_version" ? 404 : 409, err.message, err.reason, err.detail);
        }
        const asideNote = setAside ? ` ${setAside}` : "";
        // Write what can be written; the error thrown below says the rest either way.
        const failed = (why: string, addressNote: string): void => {
          try {
            record.note<HostEntryFields>({
              changeId,
              kind: "restore",
              intent: reason,
              agent: actor,
              baseVersion: current,
              guarantees: [],
              extra: { outcome: "rejected", control: "owner", reason: why, target_version: target, address_note: addressNote, ...(options.channel ? { channel: options.channel } : {}) },
            });
          } catch {
            // The record cannot be written to; the error is all there is.
          }
        };
        if (err instanceof UndoNotPublished) {
          // The older code did not go out, so no data was touched.
          failed(err.reason, err.addressNote);
          throw new HostError(502, `could not republish ${target} (${err.why}); ${err.addressNote}${withData ? "; stored data was not touched" : ""}`, err.reason);
        }
        if (dataAttempted && !dataRestored) {
          // The data capability threw after the older code went out, and that release was put back. What
          // happened to the data is the capability's to say, in its message: usually nothing, but not always.
          const dataErr = err instanceof AggregateError ? err.errors[0] : err;
          const addressNote =
            putBackNote ??
            `the address could not be put back on ${serving} (${err instanceof AggregateError ? errText(err.errors[1]) : "unknown"}) and may still serve ${olderCode}`;
          failed("data_restore_failed", `${olderCode} had gone out first; ${addressNote}`);
          throw new HostError(
            502,
            `the stored data could not be put back (${errText(dataErr)}). The undo stopped there: ${olderCode} had gone out first, and ${addressNote}. The record was not changed.`,
            "data_restore_failed",
          );
        }
        if (err instanceof UndoNotVerified) {
          // restoreWithData moved the record to what is in place: the older code on its own data. The
          // newer code is not put back, because it must not start on the restored data.
          await this.markServingQuietly(name, paths, target, address, probe, `undo: ${current} -> ${target}, unanswered after the data came back`);
          throw new HostError(
            502,
            `Stored data was put back to the snapshot ${plan.dataRef!.ref} and ${olderCode} is released, but after the data came back ${target} did not answer (${err.why}). ` +
              `${target} is now the current version. ${current}'s code was not put back: it must not run on the restored data.${asideNote} Look at the app's logs before anything else.`,
            "unhealthy_after_data_restore",
          );
        }
        if (released && dataRestored) {
          // Everything went out, but recording it failed. The address stays on the older code: the newer
          // code must not run on the restored data, even if that leaves the record behind the address.
          await this.markServingQuietly(name, paths, target, address, probe, `undo: ${current} -> ${target}, not recorded`);
          failed("record_failed", `the address was left on ${olderCode}, which serves the restored data`);
          throw new HostError(
            500,
            `${olderCode} and the stored data of the snapshot ${plan.dataRef!.ref} are live, but the record could not be written (${errText(err)}), so it still names ${current}. ` +
              `${current}'s code was not put back: it must not run on the restored data.${asideNote} Once the record can be written, run undo again, confirming it like this one, to put ${target} on the record. Do not submit before that: a submit would release ${current}'s code on the restored data.`,
            "record_failed",
          );
        }
        if (released) {
          // The older version went out, but recording it failed. No data was touched, so put the address back
          // on what the record still names, so the two agree, and say so.
          const addressNote = await this.settleAddress(name, record, serving, olderCode);
          failed("record_failed", addressNote);
          throw new HostError(500, `${target} was published but could not be recorded (${errText(err)}); ${addressNote}`, "record_failed");
        }
        throw err;
      }
      await this.markServing(name, paths, target, address, probe, `undo: ${current} -> ${target}`);
      const note = andNote(entry.kept_edits ? leftAlone(target) : undefined, adopted);
      await this.threads(paths).appendTurn(info.thread_id, {
        kind: "host_event",
        label: "undo",
        payload: { change_id: changeId, from: current, to: target, undone: plan.undone, reason, data_restored: dataRestored, confirmed_by: confirmedBy, set_aside: setAside },
      });
      this.log(`${name} went back ${current} -> ${target}${note ? `; ${note}` : ""}`);
      return {
        active_version: target,
        undone_version: current,
        undone: plan.undone,
        address,
        data_restored: dataRestored,
        ...(confirmedBy ? { confirmed_by: confirmedBy } : {}),
        ...(setAside ? { set_aside: setAside } : {}),
        note,
      };
    });
  }

  /**
   * What `undo` to `to` would go back past and do to stored data, without doing anything: for a confirmation
   * shown before the undo (the owner page). `crossing` is null when no one-way change is in the way; otherwise
   * it carries the text `undo` refuses with and which case applies. `from` is the current version the plan starts
   * from; an undo that sends it back is refused once that is no longer current. `undo` itself still decides.
   */
  undoPlan(name: string, to: string): RestorePlan & { readonly from: string | null; readonly crossing: { readonly data_restore: "snapshot" | "none"; readonly text: string } | null } {
    const { record } = this.open(name);
    if (!record.versions().includes(to)) throw new HostError(404, `${name} has no version ${to}`);
    const plan = record.planRestore(to);
    const crossing = plan.oneWay.length ? this.describeCrossing(record, plan) : null;
    return { ...plan, from: record.current(), crossing: crossing && { data_restore: crossing.withData ? "snapshot" : "none", text: crossing.text } };
  }

  /** Publish a waiting change's preview again once it has ended itself, so the owner can look before deciding. One that stands is left as it is. */
  preview(name: string, changeId: string): Promise<{ readonly change_id: string; readonly preview: StandingPreview; readonly republished: boolean }> {
    return this.serial(name, async () => {
      const { paths, info, record } = this.open(name);
      const file = join(paths.pending, `${changeId}.json`);
      if (!existsSync(file)) throw new HostError(404, `no change ${changeId} is waiting`);
      if (this.opts.preview === false) throw new HostError(409, "this Host runs without previews (PNEUMA_PREVIEW=off), so there is no preview to publish", "previews_off");
      const pending = this.readPending(paths, record, file);
      if ("problem" in pending) throw new HostError(409, malformedPendingLine(`${changeId}.json`, pending.problem), "malformed_pending");
      this.refuseUnfinishedUndo(paths, record);
      const done = await this.previews.ensure(previewName(name, changeId), join(paths.drafts, changeId), pending.draft_signature, pending.preview_app_id);
      if (!done.ok) throw new HostError(done.reason === "preview_failed" || done.reason === "preview_unknown" ? 502 : 409, done.detail, done.reason);
      if (done.republished) {
        // A new app under the same name: the discard has to carry its id from now on.
        const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
        writeFileSync(file, `${JSON.stringify({ ...raw, preview_app_id: done.id }, null, 2)}\n`);
        await this.threads(paths).appendTurn(info.thread_id, { kind: "host_event", label: "preview_published_again", payload: { change_id: changeId, preview: done.preview } });
      }
      return { change_id: changeId, preview: done.preview, republished: done.republished };
    });
  }

  /** Throw away uncommitted edits: put the working tree back to the active version. */
  discard(name: string): Promise<{ active_version: string; restored: readonly string[] }> {
    return this.serial(name, async () => {
      const { paths, record } = this.open(name);
      const active = record.current();
      if (!active) throw new HostError(409, `${name} has no active version`);
      const restored = this.uncommitted(record);
      restoreWorkingTree(record.versionDir(active), paths.root);
      return { active_version: active, restored };
    });
  }

  /** Files in the working tree that differ from the record's current version. */
  private uncommitted(record: ChangeRecord): string[] {
    const current = record.current();
    return current ? sourceDiff(record.versionDir(current), record.root).changedPaths : [];
  }

  /**
   * The changes waiting for the owner, oldest first, and a line for each file in the directory that is not one.
   * One malformed file is left out on its own: the owner can still decide every other change.
   */
  private pendingChanges(paths: AppPaths, record: ChangeRecord): { pending: PendingChange[]; malformed: string[] } {
    const pending: PendingChange[] = [];
    const malformed: string[] = [];
    if (!existsSync(paths.pending)) return { pending, malformed };
    for (const file of readdirSync(paths.pending).filter((name) => name.endsWith(".json")).sort()) {
      const read = this.readPending(paths, record, join(paths.pending, file));
      if ("problem" in read) malformed.push(malformedPendingLine(file, read.problem));
      else pending.push(read);
    }
    pending.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { pending, malformed };
  }

  async status(name: string): Promise<AppStatus> {
    const { paths, info, record } = this.open(name);
    const active = record.current();
    const { pending: waiting, malformed } = this.pendingChanges(paths, record);
    const pending = this.opts.preview === false ? waiting : await Promise.all(waiting.map(async (p) => ({ ...p, preview: await this.previews.state(previewName(name, p.change_id)) })));
    const uncertain = servingUncertainLine(record, readServingVersion(paths));
    return {
      app_id: info.app_id,
      owner: info.owner,
      scaffold_id: info.scaffold_id,
      address: this.opts.space.address(name),
      active_version: active,
      previous_version: active ? builtOn(record.history(), active) : null,
      serving_version: readServingVersion(paths),
      ...(uncertain ? { serving_uncertain: uncertain } : {}),
      governance: this.governance,
      governance_note: this.governanceNote(),
      data_snapshot: this.opts.dataSnapshot?.id ?? null,
      uncommitted: this.uncommitted(record),
      pending,
      ...(malformed.length ? { malformed_pending: malformed } : {}),
      space_manager: await readManager(this.opts.space, name, this.manager.name),
    };
  }

  history(name: string): HistoryEntry[] {
    return this.open(name).record.history<HostEntryFields>();
  }

  list(): string[] {
    if (!existsSync(this.opts.appsDir)) return [];
    return readdirSync(this.opts.appsDir).filter((name) => existsSync(appPaths(this.opts.appsDir, name).info)).sort();
  }

  /** Every app at a glance, in one call: "how many apps, which versions, anything waiting for me". */
  summaries(): AppSummary[] {
    return this.list().map((name) => {
      try {
        return this.summary(name);
      } catch (err) {
        return { app_id: name, error: err instanceof Error ? err.message : String(err) };
      }
    });
  }

  /** Keyed by the directory name, which is what every command takes; `app.json` sits in the app directory, where an agent can edit it. */
  private summary(name: string): AppSummary {
    const { paths, record } = this.open(name);
    const active = record.current();
    const serving = readServingVersion(paths);
    const last = record
      .history<HostEntryFields>()
      // "release" is a recorded version going live later, as it was: without it the summary would stop at the failed attempt.
      .filter((entry) => entry.kind === "create" || entry.kind === "change" || entry.kind === "decision" || entry.kind === "restore" || entry.kind === "release")
      .at(-1);
    const { pending, malformed } = this.pendingChanges(paths, record);
    return {
      app_id: name,
      active_version: active,
      address: this.opts.space.address(name),
      serving_version: serving,
      serves_other_version: serving !== null && active !== null && serving !== active,
      ...(servingUncertainLine(record, serving) ? { serving_uncertain: servingUncertainLine(record, serving)! } : {}),
      last_change: last
        ? { at: last.at, kind: last.kind, outcome: last.outcome, version: last.version ?? null, agent: last.agent, intent: last.intent }
        : null,
      pending: pending.map((p) => ({
        change_id: p.change_id,
        intent: p.intent,
        agent: p.agent,
        control: p.control,
        risks: p.risks,
        disclosure: p.disclosure,
        changed_paths: p.changed_paths,
        created_at: p.created_at,
        one_way: p.one_way ?? null,
      })),
      ...(malformed.length ? { malformed_pending: malformed } : {}),
      uncommitted: this.uncommitted(record),
    };
  }

  get governanceMode(): GovernanceMode {
    return this.governance;
  }

  /** The address this Host was told it is reached at, if any. */
  get hostUrl(): string | undefined {
    return this.opts.hostUrl;
  }

  get consoleUrl(): string | undefined {
    return this.opts.consoleUrl;
  }

  /** The risks the standing policy approves in this mode; every other risk waits for the owner. Empty unless `personal`. */
  get autoApproved(): readonly string[] {
    return this.governance === "personal" ? this.opts.policy.auto_approve : [];
  }

  /**
   * What the owner page shows: the summaries, and for every app what `status` and `history` return. It
   * changes nothing in any record. Opening an app may refresh its CLI copy and address record under `.pneuma/`,
   * as every command does.
   */
  async overview(): Promise<Overview> {
    const apps: Overview["apps"][number][] = [];
    for (const name of this.list()) {
      try {
        apps.push({ app_id: name, status: await this.status(name), history: this.history(name) });
      } catch (err) {
        apps.push({ app_id: name, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return {
      governance: this.governance,
      governance_note: this.governanceNote(),
      data_snapshot: this.opts.dataSnapshot?.id ?? null,
      ...(this.opts.hostUrl ? { host_url: this.opts.hostUrl } : {}),
      ...(this.opts.consoleUrl ? { console_url: this.opts.consoleUrl } : {}),
      manager: this.manager.name,
      summaries: this.summaries(),
      apps,
      generated_at: new Date().toISOString(),
    };
  }

  /** Refresh the CLI copy inside an artifact, e.g. after the Host was upgraded or the directory was moved here. */
  adopt(name: string): void {
    installCli(this.open(name).paths.root, this.opts.cliSource);
  }
}

/**
 * Why the Host cannot vouch for what the address serves, or undefined when it can. Read only from what is already
 * written, because in one of the two cases the record may not be writable. `undoUnfinished` says which:
 *   - true: the current version has served, and the rollout state names another. The address went back without the
 *     record: an undo that went out and could not be recorded, or something outside this Host. A submit or an
 *     approval would take the current version's code live again on whatever data the older one serves, so both are
 *     refused until an undo answers.
 *   - false: the newest entry that reached the address says it could not be put back, so nobody has seen it answer
 *     since. A release or an undo that answered ends that; entries that did not reach the address (a denial, a
 *     publish the platform refused) are skipped. Nothing is refused: the next release that answers settles it.
 */
function cannotVouch(record: ChangeRecord, serving: string | null): { readonly why: string; readonly undoUnfinished: boolean } | undefined {
  const history = record.history<HostEntryFields>();
  const current = record.current();
  if (current && serving !== null && serving !== current && servedBefore(history, current)) {
    const why = `the record names ${current}, which has served before, but the address serves ${serving}: an undo to ${serving} went out and could not be recorded, or something outside this Host moved the address`;
    return { why, undoUnfinished: true };
  }
  for (const entry of [...history].reverse()) {
    if (entry.outcome === "published" || entry.outcome === "rolled_back") return undefined;
    const note = entry.address_note;
    if (typeof note === "string" && !note.startsWith(NOT_TOUCHED)) return note.includes("could not be put back") ? { why: note, undoUnfinished: false } : undefined;
  }
  return undefined;
}

/** The one line status, list and the overview page show while `cannotVouch` holds; undefined otherwise. */
function servingUncertainLine(record: ChangeRecord, serving: string | null): string | undefined {
  const uncertain = cannotVouch(record, serving);
  return uncertain ? `${uncertain.why}. ${uncertain.undoUnfinished ? RUN_UNDO : NEXT_ANSWER_SETTLES}` : undefined;
}

/** What to do in each case, said the same way by status and by the refusal. The owner page tells the two cases apart by it. */
export const RUN_UNDO = "Submit and approve are refused until an undo puts a version on the address and sees it answer: run undo.";
const NEXT_ANSWER_SETTLES = "The next release or undo that answers settles it.";
