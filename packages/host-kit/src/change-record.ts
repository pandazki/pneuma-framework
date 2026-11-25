import {
  appendFileSync,
  closeSync,
  cpSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { copyTree, defaultTreeWalkOptions, diffTrees, listFiles, sha1File, type TreeWalkOptions } from "./workspace.js";

// ---------------------------------------------------------------------------
// The change record: the floor under every other layer.
//
// It keeps a local record of an app directory's versions and does nothing else:
//
//   .pneuma-framework/versions/v<N>/  a clean copy of the files that make up version N
//   .pneuma-framework/history.jsonl   append-only, one JSON entry per line
//   .pneuma-framework/record.json     { schema_version: 1, version_counter, current_version }
//
// What it promises: each version is a faithful copy of the files it was given, the
// history is only ever appended to, and a restore puts exactly a version's files back.
//
// What it does not do: run any check, ask anyone to approve anything, touch or put
// back stored data, or lock. Whoever uses it (a coding agent, a Host, the person)
// owns governance. Heavier layers (verify, approval, preview) write to the same
// record and say what they guaranteed in each entry's `guarantees`. An entry that
// names no guarantee was recorded and nothing more.
//
// This file may import only ./workspace.js and Node built-ins.
// ---------------------------------------------------------------------------

/**
 * Names of guarantees a layer above the floor can write into an entry's `guarantees`.
 * The floor never sets any of them. Hosts may add their own strings.
 */
export const GUARANTEES = {
  /** A check command passed on this content. */
  verified: "verified",
  /** This content answered as a running app before release. */
  previewed: "previewed",
  /** An approval record exists for this content. */
  approved: "approved",
  /** The recorded content is byte-identical to the content that was checked. */
  sealed: "sealed",
} as const;

export interface ChangeRecordOptions {
  /**
   * Which files make up a version. Default: host-kit's workspace defaults, plus `.pneuma-framework`, a
   * top-level `data/` (runtime data), the directories agents and editors keep for themselves
   * (`.claude`, `.codex`, `.vscode`, `.idea`, and pneuma-skills' `.pneuma`) and `.DS_Store` ignored. Whatever is passed, a
   * top-level `.pneuma-framework` is never part of a version. A file the walk includes is versioned and
   * restored like source, so keep stored data out of it.
   */
  readonly walkOptions?: TreeWalkOptions;
}

/** Restoring code to before this version does not undo it (e.g. it dropped stored data). */
export interface OneWayChange {
  readonly reason: string;
}

/** A data snapshot taken by a capability the Host declared. */
export interface DataRef {
  readonly capability: string;
  readonly ref: string;
}

/** Written into a restore entry that went back past one or more one-way changes. */
export interface OneWayCrossing {
  readonly versions: readonly string[];
  /** `data_restored`: the Host put stored data back first. `accepted`: someone said to go ahead without it. */
  readonly by: "data_restored" | "accepted";
  /** The snapshot that was put back, when `by` is `data_restored` and the target had one. */
  readonly data_ref?: DataRef;
}

/** One line of history.jsonl. Hosts add their own fields through `Extra`. */
export interface ChangeRecordEntry {
  readonly change_id: string;
  /** ISO time. */
  readonly at: string;
  /** The floor writes "create" | "change" | "restore". Hosts may write others. */
  readonly kind: string;
  /** What the person asked for. */
  readonly intent: string;
  /** Who made the change. */
  readonly agent: string;
  /** The version this entry created or made current. */
  readonly version?: string;
  /** The version that was current before. */
  readonly base_version?: string;
  readonly changed_paths?: readonly string[];
  /** Names of the guarantees that held for this entry. Empty means recorded only. */
  readonly guarantees: readonly string[];
  /** Restoring code to before this version does not undo it (e.g. it dropped stored data). */
  readonly one_way?: OneWayChange;
  /** A data snapshot taken with this version by a capability the Host declared. */
  readonly data_ref?: DataRef;
  /** Restore entries only: the one-way changes this restore went back past, and on what authority. */
  readonly one_way_crossed?: OneWayCrossing;
  /** Restore entries only: paths whose unsaved edits the restore threw away. */
  readonly discarded_edits?: readonly string[];
  /** Restore entries only: the working tree held these unsaved edits, so the restore left every file as it was. */
  readonly kept_edits?: readonly string[];
}

const ENTRY_FIELDS = new Set([
  "change_id",
  "at",
  "kind",
  "intent",
  "agent",
  "version",
  "base_version",
  "changed_paths",
  "guarantees",
  "one_way",
  "data_ref",
  "one_way_crossed",
  "discarded_edits",
  "kept_edits",
]);

export interface RecordInput {
  /** What the person asked for. */
  readonly intent: string;
  /** Who made the change. */
  readonly agent: string;
  /** A directory to copy in instead of the working tree. The working tree is then left alone. */
  readonly from?: string;
  readonly changeId?: string;
  /** Default: "create" for the first version, "change" after. */
  readonly kind?: string;
  /** Default: none, which means recorded only. */
  readonly guarantees?: readonly string[];
  readonly oneWay?: OneWayChange;
  readonly dataRef?: DataRef;
}

export interface NoteInput {
  readonly intent: string;
  readonly agent: string;
  /** Default: "note". */
  readonly kind?: string;
  readonly changeId?: string;
  /**
   * An existing version this entry is about. A note can declare a version one-way, or
   * attach a data snapshot to it, after the version was recorded; `planRestore` reads both.
   */
  readonly version?: string;
  readonly baseVersion?: string;
  readonly changedPaths?: readonly string[];
  readonly guarantees?: readonly string[];
  readonly oneWay?: OneWayChange;
  readonly dataRef?: DataRef;
}

export interface RestoreInput {
  readonly agent: string;
  /** Default: "go back to <version>". */
  readonly intent?: string;
  readonly changeId?: string;
  readonly guarantees?: readonly string[];
  /** Throw away edits that were not recorded as a version. Without it a restore over them is refused. */
  readonly discardEdits?: boolean;
  /**
   * When the working tree holds edits that were not recorded, leave every file as it is
   * instead of refusing: the current version still moves, and the entry lists the edits in
   * `kept_edits`. With a clean working tree the files are put back as usual. For a caller
   * whose working tree can be edited while it does its own step (a Host publishing).
   * Cannot be combined with `discardEdits`.
   */
  readonly keepEdits?: boolean;
  /** Explicit authorisation to go back past a one-way change without putting stored data back. */
  readonly acceptOneWay?: boolean;
  /** The Host put stored data back through its declared capability before calling. */
  readonly dataRestored?: boolean;
}

export interface RestorePlan {
  readonly target: string;
  readonly from: string | null;
  /** Versions on the current version's ancestor chain that are not on the target's, newest first. */
  readonly undone: readonly string[];
  /** Entries among the undone versions that declare `one_way`. */
  readonly oneWay: readonly ChangeRecordEntry[];
  /**
   * The data snapshot to put back, present only when the restore crosses a one-way change:
   * the newest `data_ref` attached to the base version of the oldest undone one-way version.
   * That base is where stored data was last in a state that code alone can go back from, so
   * its data fits the target's code. It equals the target when the one-way change sits
   * directly on it.
   */
  readonly dataRef?: DataRef;
}

/** What a step of `restoreWithData` is told. */
export interface RestoreStep {
  readonly plan: RestorePlan;
  /** Stored data is put back in this restore. In `verify` that means it is back already. */
  readonly withData: boolean;
}

/**
 * The Host's own steps in `restoreWithData`, in the order they run: `release`, then stored data is
 * put back (when it has to be), then `verify`, then the record moves. `putReleaseBack` runs only when
 * something fails after `release`. Every step is optional. Passing any of them needs `keepEdits` or
 * `discardEdits` in the input: the working tree can change while they run, and a refusal must come
 * before anything is touched.
 */
export interface RestoreWithDataOptions {
  /**
   * Make the target version's code what the runtime will start. A Host publishes here. It runs
   * after every refusal and before any stored data is touched, so newer code is never started on
   * data that was put back. If it throws, nothing else runs, no data is touched, the record does not
   * move, and the error propagates. A release that went half-way is this step's own to clean up.
   */
  readonly release?: (step: RestoreStep) => Promise<void>;
  /**
   * Check the target right before the record moves: after `release`, and after the data is back
   * when it was put back. If it throws with no data put back, `putReleaseBack` runs, the record does
   * not move, and the error propagates. If it throws after the data was put back, the release is not
   * put back: putting the newer code back on the restored data is exactly what must not happen. The
   * target's code and its data are then what is in place, so the record moves to the target, and the
   * error still propagates. A Host says in the entry's `extra` that the check failed before it throws.
   */
  readonly verify?: (step: RestoreStep) => Promise<void>;
  /**
   * Put the release back to what it was before `release`. Runs when putting the data back fails
   * after `release` succeeded, and when `verify` fails with no data put back. The original error
   * propagates afterwards. If this step throws too, an `AggregateError` with both errors propagates.
   */
  readonly putReleaseBack?: (step: RestoreStep & { readonly error: unknown }) => Promise<void>;
}

export interface ChangeRecordStatus {
  readonly current: string | null;
  readonly dirty: boolean;
  readonly changedPaths: string[];
}

export type ChangeRecordRefusalReason =
  | "no_change"
  | "unknown_version"
  | "already_current"
  | "dirty_working_tree"
  | "crosses_one_way_change"
  /** `restoreWithData` only: the capability's `check` said the snapshot cannot be put back. Nothing was released. */
  | "data_snapshot_refused";

/**
 * The record declined to act, and nothing was changed. `message` is written for a person to read;
 * `detail` lists the paths, versions or refs involved; `cause` is the error a capability threw, if any.
 */
export class ChangeRecordRefused extends Error {
  constructor(
    readonly reason: ChangeRecordRefusalReason,
    message: string,
    readonly detail?: readonly string[],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ChangeRecordRefused";
  }
}

export interface ChangeRecord {
  readonly root: string;
  readonly paths: { readonly state: string; readonly versions: string; readonly history: string; readonly info: string };
  /** True once a version has been recorded here, or a `versions/` directory can be adopted. */
  exists(): boolean;
  current(): string | null;
  /** In numeric order. */
  versions(): string[];
  versionDir(version: string): string;
  history<Extra = {}>(): (ChangeRecordEntry & Extra)[];
  /** Working tree against the current version. */
  status(): ChangeRecordStatus;
  /** Copy a tree (default: the working tree) in as the next version and make it current. */
  record<Extra = {}>(input: RecordInput & { extra?: Extra }): ChangeRecordEntry & Extra;
  /** Append an entry that creates no version (a rejection, a decision). */
  note<Extra = {}>(input: NoteInput & { extra?: Extra }): ChangeRecordEntry & Extra;
  /** What a restore to `version` would undo. */
  planRestore(version: string): RestorePlan;
  /** Make `version` current and put its files back in the working tree. */
  restore<Extra = {}>(version: string, input: RestoreInput & { extra?: Extra }): ChangeRecordEntry & Extra;
}

/**
 * A Host that can put stored data back declares it by supplying one of these. The framework never supplies one.
 * `restore` receives a `ref` read back from the record, which the agent can write: accept only a ref this
 * capability made for this app, checked against something the agent cannot write, before touching anything.
 */
export interface DataSnapshotCapability {
  /** e.g. "neon-branch". */
  readonly id: string;
  snapshot(input: { appRoot: string; version: string }): Promise<{ ref: string }>;
  /**
   * Optional. Says whether `ref` can be put back for this app, and changes nothing. It resolves when it
   * can, and throws an error written for a person to read when it cannot. `restoreWithData` calls it
   * before anything is released, so a ref that would be refused stops the restore while nothing has
   * changed. `restore` must still check again itself: time passes between the two, and the ref came
   * from the record.
   */
  check?(input: { appRoot: string; ref: string }): Promise<void>;
  restore(input: { appRoot: string; ref: string }): Promise<void>;
}

const STATE_DIR = ".pneuma-framework";
const DATA_DIR = "data";
const VERSION_ID = /^v(0|[1-9]\d*)$/;

/**
 * What coding agents, editors and the OS keep for themselves in a directory, at any depth. None of it
 * is the app. Claude Code writes `.claude/settings.local.json` when the person picks "don't ask again";
 * versioning it would let a restore delete those choices, and a Finder `.DS_Store` would count as an
 * unsaved edit and block a restore. pneuma-skills keeps its sessions and preferences in `.pneuma/`;
 * versioned, each of its writes would be an edit and a restore would rewind them. Only the change
 * record's own default leaves these out: host-kit's `defaultTreeWalkOptions()`, which the
 * governed-change backbone uses, is unchanged.
 */
const RECORD_IGNORED_DIRS: readonly string[] = [".claude", ".codex", ".vscode", ".idea", ".pneuma"];
const RECORD_IGNORED_FILES: readonly string[] = [".DS_Store"];

function versionNumber(version: string): number {
  return Number(version.slice(1));
}

function effectiveWalk(walk: TreeWalkOptions | undefined): TreeWalkOptions {
  let base: TreeWalkOptions;
  if (walk) {
    base = walk;
  } else {
    const defaults = defaultTreeWalkOptions();
    defaults.ignoredDirs.add(STATE_DIR);
    for (const dir of RECORD_IGNORED_DIRS) defaults.ignoredDirs.add(dir);
    for (const file of RECORD_IGNORED_FILES) defaults.ignoredFiles.add(file);
    // A top-level data/ is where scaffolds keep runtime data (see the Scaffold Project's
    // materialization and share excludes). Versioning it would roll stored data back on restore.
    defaults.ignoredPaths.add(DATA_DIR);
    base = defaults;
  }
  // A version must never copy the record into itself, whatever the caller passed.
  return { ...base, ignoredPaths: new Set([...(base.ignoredPaths ?? []), STATE_DIR]) };
}

function listed(paths: readonly string[], max = 10): string {
  const shown = paths.slice(0, max).join(", ");
  return paths.length > max ? `${shown}, and ${paths.length - max} more` : shown;
}

function oneWayVersions(plan: RestorePlan): string[] {
  return [...new Set(plan.oneWay.map((entry) => entry.version!))];
}

function oneWayMessage(plan: RestorePlan): string {
  const count = plan.oneWay.length;
  return [
    `Going back to ${plan.target} would undo ${count === 1 ? "a change" : `${count} changes`} that putting files back cannot undo:`,
    ...plan.oneWay.map((entry) => `  - ${entry.version}: ${entry.one_way?.reason ?? ""}`),
    `The files of ${plan.target} would come back, but stored data would stay as it is now, so ${plan.target} may not work with it.`,
    "To go back anyway, put the stored data back first, or say explicitly that you accept this.",
  ].join("\n");
}

function assertText(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
}

function checkOneWay(oneWay: OneWayChange | undefined): void {
  if (oneWay !== undefined && (typeof oneWay.reason !== "string" || !oneWay.reason.trim())) {
    throw new TypeError("oneWay.reason must say, in words, why restoring code does not undo this change");
  }
}

/** Called before anything is written, so a bad input never leaves a version behind. */
function checkInput(input: { intent?: unknown; agent: unknown; oneWay?: OneWayChange; extra?: unknown }, needsIntent: boolean): void {
  if (needsIntent || input.intent !== undefined) assertText(input.intent, "intent");
  assertText(input.agent, "agent");
  checkOneWay(input.oneWay);
  if (input.extra === undefined || input.extra === null) return;
  if (typeof input.extra !== "object" || Array.isArray(input.extra)) throw new TypeError("extra must be an object");
  for (const key of Object.keys(input.extra)) {
    if (ENTRY_FIELDS.has(key)) throw new TypeError(`extra field "${key}" is a record field; pass it through its own input`);
  }
}

function withExtra<Extra>(core: ChangeRecordEntry, extra: Extra | undefined): ChangeRecordEntry & Extra {
  if (extra === undefined || extra === null) return core as ChangeRecordEntry & Extra;
  return { ...core, ...extra };
}

function pruneEmptyDirs(dir: string, root: string): void {
  let current = dir;
  while (current !== root && current.startsWith(root)) {
    try {
      if (readdirSync(current).length > 0) return;
      rmdirSync(current);
    } catch {
      return;
    }
    current = dirname(current);
  }
}

class FileChangeRecord implements ChangeRecord {
  readonly root: string;
  readonly paths: { readonly state: string; readonly versions: string; readonly history: string; readonly info: string };
  private readonly walk: TreeWalkOptions;

  constructor(appRoot: string, options: ChangeRecordOptions) {
    this.root = resolve(appRoot);
    const state = join(this.root, STATE_DIR);
    this.paths = {
      state,
      versions: join(state, "versions"),
      history: join(state, "history.jsonl"),
      info: join(state, "record.json"),
    };
    this.walk = effectiveWalk(options.walkOptions);
  }

  exists(): boolean {
    return existsSync(this.paths.info) || this.versions().length > 0;
  }

  current(): string | null {
    return this.readState().current;
  }

  versions(): string[] {
    if (!existsSync(this.paths.versions)) return [];
    return readdirSync(this.paths.versions, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && VERSION_ID.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => versionNumber(a) - versionNumber(b));
  }

  versionDir(version: string): string {
    if (typeof version !== "string" || !VERSION_ID.test(version)) {
      throw new ChangeRecordRefused("unknown_version", `"${String(version)}" is not a version name. Versions are named v1, v2, and so on.`, [String(version)]);
    }
    return join(this.paths.versions, version);
  }

  history<Extra = {}>(): (ChangeRecordEntry & Extra)[] {
    if (!existsSync(this.paths.history)) return [];
    const out: (ChangeRecordEntry & Extra)[] = [];
    for (const line of readFileSync(this.paths.history, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // A line cut short (a crash mid-append) carries nothing a reader can trust.
        continue;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      const raw = parsed as Record<string, unknown>;
      // Older lines have no `guarantees`; absence means nothing was guaranteed.
      const guarantees = Array.isArray(raw.guarantees) ? raw.guarantees.filter((g): g is string => typeof g === "string") : [];
      out.push({ ...raw, guarantees } as unknown as ChangeRecordEntry & Extra);
    }
    return out;
  }

  status(): ChangeRecordStatus {
    const current = this.current();
    if (current === null) {
      const files = listFiles(this.root, this.walk);
      return { current, dirty: files.length > 0, changedPaths: files };
    }
    const diff = diffTrees(this.existingVersionDir(current), this.root, this.walk);
    return { current, dirty: diff.changedPaths.length > 0, changedPaths: diff.changedPaths };
  }

  record<Extra = {}>(input: RecordInput & { extra?: Extra }): ChangeRecordEntry & Extra {
    checkInput(input, true);
    const state = this.readState();
    const first = this.versions().length === 0;
    const source = input.from === undefined ? this.root : resolve(input.from);
    const next = `v${state.counter + 1}`;
    const finalDir = join(this.paths.versions, next);
    if (existsSync(finalDir)) throw new Error(`${finalDir} already exists; the record is out of step with its versions directory`);

    // Copy first, into a staging directory the version listing ignores. Everything after
    // works on the copy, so `changed_paths` describes exactly what was stored.
    mkdirSync(this.paths.versions, { recursive: true });
    const staging = join(this.paths.versions, `.staging-${next}-${randomUUID()}`);
    let changedPaths: string[];
    try {
      copyTree(source, staging, this.walk);
      if (state.current !== null) {
        changedPaths = diffTrees(this.existingVersionDir(state.current), staging, this.walk).changedPaths;
        if (changedPaths.length === 0) {
          throw new ChangeRecordRefused("no_change", `Nothing changed since ${state.current}, so there is nothing to record.`);
        }
      } else {
        changedPaths = listFiles(staging, this.walk);
      }
      renameSync(staging, finalDir);
    } catch (err) {
      rmSync(staging, { recursive: true, force: true });
      throw err;
    }

    this.writeState(state.counter + 1, next);
    const entry = withExtra<Extra>(
      {
        change_id: input.changeId ?? newChangeId(),
        at: new Date().toISOString(),
        kind: input.kind ?? (first ? "create" : "change"),
        intent: input.intent,
        agent: input.agent,
        version: next,
        ...(state.current !== null ? { base_version: state.current } : {}),
        changed_paths: changedPaths,
        guarantees: [...(input.guarantees ?? [])],
        ...(input.oneWay ? { one_way: { reason: input.oneWay.reason } } : {}),
        ...(input.dataRef ? { data_ref: { capability: input.dataRef.capability, ref: input.dataRef.ref } } : {}),
      },
      input.extra,
    );
    this.append(entry);
    return entry;
  }

  note<Extra = {}>(input: NoteInput & { extra?: Extra }): ChangeRecordEntry & Extra {
    checkInput(input, true);
    if (input.version !== undefined) this.existingVersionDir(input.version);
    const entry = withExtra<Extra>(
      {
        change_id: input.changeId ?? newChangeId(),
        at: new Date().toISOString(),
        kind: input.kind ?? "note",
        intent: input.intent,
        agent: input.agent,
        ...(input.version !== undefined ? { version: input.version } : {}),
        ...(input.baseVersion !== undefined ? { base_version: input.baseVersion } : {}),
        ...(input.changedPaths !== undefined ? { changed_paths: [...input.changedPaths] } : {}),
        guarantees: [...(input.guarantees ?? [])],
        ...(input.oneWay ? { one_way: { reason: input.oneWay.reason } } : {}),
        ...(input.dataRef ? { data_ref: { capability: input.dataRef.capability, ref: input.dataRef.ref } } : {}),
      },
      input.extra,
    );
    this.append(entry);
    return entry;
  }

  planRestore(version: string): RestorePlan {
    this.existingVersionDir(version);
    const from = this.current();
    const entries = this.history();
    // The entry that created a version is the first one naming it. A restore names a
    // version it did not create, so it never counts.
    const creators = new Map<string, ChangeRecordEntry>();
    for (const entry of entries) {
      if (entry.version && entry.kind !== "restore" && !creators.has(entry.version)) creators.set(entry.version, entry);
    }
    const chain = (start: string | null): string[] => {
      const out: string[] = [];
      const seen = new Set<string>();
      let at = start;
      while (at && !seen.has(at)) {
        seen.add(at);
        out.push(at);
        at = creators.get(at)?.base_version ?? null;
      }
      return out;
    };
    const targetChain = new Set(chain(version));
    const undone = chain(from).filter((v) => !targetChain.has(v));
    const oneWay = undone.flatMap((v) => entries.filter((e) => e.kind !== "restore" && e.version === v && e.one_way));
    // The data to put back is the snapshot taken just before the oldest one-way change being
    // undone, which is attached to that change's base version. Everything between the target
    // and that base is undone by code alone, so data as of the base fits the target's code.
    // `undone` is newest first, so the oldest one-way version is the last one listed.
    const oldestOneWay = [...undone].reverse().find((v) => oneWay.some((e) => e.version === v));
    const base = oldestOneWay === undefined ? undefined : creators.get(oldestOneWay)?.base_version;
    const dataRef =
      base === undefined ? undefined : [...entries].reverse().find((e) => e.kind !== "restore" && e.version === base && e.data_ref)?.data_ref;
    return { target: version, from, undone, oneWay, ...(dataRef ? { dataRef } : {}) };
  }

  restore<Extra = {}>(version: string, input: RestoreInput & { extra?: Extra }): ChangeRecordEntry & Extra {
    checkInput(input, false);
    const { plan, status } = preflightRestore(this, version, input);
    return this.moveTo(version, input, plan, status, input.keepEdits === true);
  }

  /**
   * Step 5 of `restoreWithData`, inside this module only: move the record as step 1 decided, with step 1's
   * plan. The Host's steps have run by now, so nothing step 1 settled is decided again: a one-way line written
   * into the history meanwhile does not turn the restore into a refusal. The working tree is read again,
   * because it can be edited while the steps run. Edits made meanwhile are kept, and listed in `kept_edits`,
   * unless the input says `discardEdits`: step 1 refused a tree that was already dirty without one of the two.
   */
  moveDecided<Extra = {}>(version: string, input: RestoreInput & { extra?: Extra }, plan: RestorePlan): ChangeRecordEntry & Extra {
    return this.moveTo(version, input, plan, this.status(), input.discardEdits !== true);
  }

  private moveTo<Extra>(version: string, input: RestoreInput & { extra?: Extra }, plan: RestorePlan, status: ChangeRecordStatus, keepIfDirty: boolean): ChangeRecordEntry & Extra {
    let crossed: OneWayCrossing | undefined;
    if (plan.oneWay.length > 0) {
      const versions = oneWayVersions(plan);
      if (input.dataRestored) {
        crossed = { versions, by: "data_restored", ...(plan.dataRef ? { data_ref: plan.dataRef } : {}) };
      } else if (input.acceptOneWay) {
        crossed = { versions, by: "accepted" };
      } else {
        throw new ChangeRecordRefused("crosses_one_way_change", oneWayMessage(plan), versions);
      }
    }

    const targetDir = this.existingVersionDir(version);
    const changedPaths =
      plan.from !== null ? diffTrees(this.existingVersionDir(plan.from), targetDir, this.walk).changedPaths : listFiles(targetDir, this.walk);
    const keep = keepIfDirty && status.dirty;
    if (!keep) this.putBack(targetDir);
    this.writeState(this.readState().counter, version);
    const entry = withExtra<Extra>(
      {
        change_id: input.changeId ?? newChangeId(),
        at: new Date().toISOString(),
        kind: "restore",
        intent: input.intent ?? `go back to ${version}`,
        agent: input.agent,
        version,
        ...(plan.from !== null ? { base_version: plan.from } : {}),
        changed_paths: changedPaths,
        guarantees: [...(input.guarantees ?? [])],
        ...(crossed ? { one_way_crossed: crossed } : {}),
        ...(status.dirty && !keep ? { discarded_edits: status.changedPaths } : {}),
        ...(keep ? { kept_edits: status.changedPaths } : {}),
      },
      input.extra,
    );
    this.append(entry);
    return entry;
  }

  private existingVersionDir(version: string): string {
    const dir = this.versionDir(version);
    if (!existsSync(dir)) {
      const known = this.versions();
      throw new ChangeRecordRefused(
        "unknown_version",
        `There is no version ${version} in this record.${known.length ? ` Versions: ${known.join(", ")}.` : " Nothing has been recorded yet."}`,
        [version],
      );
    }
    return dir;
  }

  private readState(): { counter: number; current: string | null } {
    const found = this.versions();
    const newest = found[found.length - 1];
    const highest = newest === undefined ? 0 : versionNumber(newest);
    if (!existsSync(this.paths.info)) {
      // Best-effort adoption of a directory that has versions but no record.json.
      return { counter: highest, current: newest ?? null };
    }
    const raw = JSON.parse(readFileSync(this.paths.info, "utf8")) as Record<string, unknown>;
    if (raw.schema_version !== 1) {
      throw new Error(`${this.paths.info} has schema_version ${String(raw.schema_version)}; this host-kit reads schema_version 1`);
    }
    const counter = typeof raw.version_counter === "number" && Number.isInteger(raw.version_counter) ? raw.version_counter : 0;
    return {
      // A version directory beyond the counter (a write cut short) still takes its number.
      counter: Math.max(counter, highest),
      current: typeof raw.current_version === "string" ? raw.current_version : null,
    };
  }

  private writeState(counter: number, current: string): void {
    mkdirSync(this.paths.state, { recursive: true });
    const temp = `${this.paths.info}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temp, `${JSON.stringify({ schema_version: 1, version_counter: counter, current_version: current }, null, 2)}\n`);
    renameSync(temp, this.paths.info);
  }

  private append(entry: ChangeRecordEntry): void {
    mkdirSync(this.paths.state, { recursive: true });
    let prefix = "";
    if (existsSync(this.paths.history)) {
      // Start on a fresh line even if the last write was cut short.
      const fd = openSync(this.paths.history, "r");
      try {
        const size = fstatSync(fd).size;
        if (size > 0) {
          const last = Buffer.alloc(1);
          readSync(fd, last, 0, 1, size - 1);
          if (last[0] !== 0x0a) prefix = "\n";
        }
      } finally {
        closeSync(fd);
      }
    }
    appendFileSync(this.paths.history, `${prefix}${JSON.stringify(entry)}\n`);
  }

  /** Make the working tree hold exactly the files of `versionRoot`, leaving ignored paths alone. */
  private putBack(versionRoot: string): void {
    const wanted = listFiles(versionRoot, this.walk);
    const keep = new Set(wanted);
    for (const rel of listFiles(this.root, this.walk)) {
      if (keep.has(rel)) continue;
      const path = join(this.root, rel);
      rmSync(path, { force: true });
      pruneEmptyDirs(dirname(path), this.root);
    }
    for (const rel of wanted) {
      const from = join(versionRoot, rel);
      const to = join(this.root, rel);
      if (existsSync(to) && statSync(to).isFile() && sha1File(to) === sha1File(from)) continue;
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to);
    }
  }
}

function newChangeId(): string {
  return `chg_${randomUUID()}`;
}

/** The refusals a restore makes before it looks at one-way changes; shared with `restoreWithData` so data is never put back for a restore that would then be refused. */
function preflightRestore(record: ChangeRecord, version: string, input: RestoreInput): { plan: RestorePlan; status: ChangeRecordStatus } {
  if (input.discardEdits && input.keepEdits) {
    throw new TypeError("discardEdits and keepEdits contradict each other; pass one of them");
  }
  const plan = record.planRestore(version);
  const status = record.status();
  if (version === plan.from && !status.dirty) {
    throw new ChangeRecordRefused("already_current", `${version} is already the current version and nothing has been edited since, so there is nothing to go back to.`, [version]);
  }
  if (version === plan.from && input.keepEdits) {
    // Keeping the edits on the current version would change nothing at all.
    throw new ChangeRecordRefused("already_current", `${version} is already the current version, and the edits since are to be kept, so there is nothing to do.`, [version]);
  }
  if (status.dirty && !input.discardEdits && !input.keepEdits) {
    throw new ChangeRecordRefused(
      "dirty_working_tree",
      `Some edits have not been saved as a version yet: ${listed(status.changedPaths)}.\nGoing back to ${version} would throw them away. Save them first, or say that they may be thrown away.`,
      status.changedPaths,
    );
  }
  return { plan, status };
}

/**
 * Open the change record of an app directory. Nothing is written until `record`, `note`
 * or `restore` is called.
 *
 * No locking: one writer at a time is the caller's job. Two processes writing the same
 * record at once can lose a version or interleave history.
 *
 * Adoption is best-effort. A directory that has `.pneuma-framework/versions/v<N>/` but no
 * `record.json` reads as counter = highest N found and current = highest N found. History
 * lines without `guarantees` read as `[]`, and a line that is not valid JSON is skipped.
 */
export function openChangeRecord(appRoot: string, options: ChangeRecordOptions = {}): ChangeRecord {
  return new FileChangeRecord(appRoot, options);
}

/**
 * Restore `version`, putting stored data back when the restore goes back past a one-way change
 * and `capability` can do it: the plan has a `dataRef` (the snapshot taken before the oldest
 * one-way change being undone) written by a capability with the same id. Then the restore entry
 * records `by: "data_restored"`. Otherwise the restore goes ahead as `record.restore(version, input)`
 * would, so the one-way refusal or an explicit `acceptOneWay` applies.
 *
 * The order:
 *   1. Every refusal (unknown version, unsaved edits, a one-way change that is neither restored nor
 *      accepted). Then, when data is to be put back, `capability.check`, if the capability has one: if
 *      it throws, the restore is refused with `data_snapshot_refused` and the capability's error as
 *      `cause`. Nothing has been touched yet.
 *   2. `options.release`: the target's code becomes what the runtime will start.
 *   3. `capability.restore`, when data is to be put back.
 *   4. `options.verify`.
 *   5. The record moves: the files and the current version. It moves by the plan step 1 made, so
 *      nothing step 1 settled is decided again; a one-way line written into the history meanwhile
 *      does not turn the restore into a refusal. Edits made to the working tree while the steps ran
 *      are kept and listed in `kept_edits`, unless the input says `discardEdits`.
 * Code goes out before the data comes back because the newer code may be what removes the data,
 * for example in a startup step. Started on the restored data, it would remove it again. With this
 * order the runtime starts only the target's code once the data is back.
 *
 * What remains between steps 2 and 3: the older code serves on the newer data, and it may answer
 * errors. Step 3 then replaces that data together with everything stored since the snapshot, so
 * whatever the older code writes in that moment goes where the rest of the newer data goes.
 *
 * A refusal in step 1 is a `ChangeRecordRefused`: nothing was released and `putReleaseBack` does not
 * run. An error from a later step is the error the step threw. Once `release` or `capability.restore`
 * has started, nothing this function throws is a `ChangeRecordRefused`: if the record still refuses to
 * move in step 5, the refusal comes wrapped in an ordinary `Error` whose message says what ran and whose
 * `cause` is the refusal, the same kind of error as any other failure to move the record. So a caller
 * can tell a restore that was refused before anything happened apart from one that failed after the
 * release.
 *
 * If step 2 throws, nothing else runs. If step 3 throws, `options.putReleaseBack` runs and the
 * record does not move. If step 4 throws with no data put back, `putReleaseBack` runs and the record
 * does not move. If step 4 throws after the data was put back, nothing is put back, and the record
 * moves to the target anyway: the target's code and data are what is in place, and a record that
 * still named the newer version would lead the next step to release the newer code on the restored
 * data. If step 5 throws, nothing is put back: the release, and the data when it was put back, stay
 * in place, the record still names the newer version, and the caller says what it left in place.
 * Every error propagates, so no failed step is reported as a finished restore.
 */
export async function restoreWithData<Extra = {}>(
  record: ChangeRecord,
  version: string,
  capability: DataSnapshotCapability | undefined,
  input: RestoreInput & { extra?: Extra },
  options: RestoreWithDataOptions = {},
): Promise<ChangeRecordEntry & Extra> {
  checkInput(input, false);
  const hooks = (["release", "verify", "putReleaseBack"] as const).filter((name) => options[name] !== undefined);
  if (hooks.length > 0 && !input.keepEdits && !input.discardEdits) {
    throw new TypeError(`${hooks.join(", ")} needs keepEdits or discardEdits: the working tree can change while it runs, and a refusal must come before anything is touched`);
  }
  const { plan } = preflightRestore(record, version, input);
  const putDataBack =
    plan.oneWay.length > 0 &&
    !input.dataRestored &&
    capability !== undefined &&
    plan.dataRef !== undefined &&
    plan.dataRef.capability === capability.id;
  if (plan.oneWay.length > 0 && !putDataBack && !input.dataRestored && !input.acceptOneWay) {
    throw new ChangeRecordRefused("crosses_one_way_change", oneWayMessage(plan), oneWayVersions(plan));
  }
  if (putDataBack && capability.check) {
    const ref = plan.dataRef!.ref;
    try {
      await capability.check({ appRoot: record.root, ref });
    } catch (err) {
      throw new ChangeRecordRefused("data_snapshot_refused", errorText(err), [ref], { cause: err });
    }
  }
  const step: RestoreStep = { plan, withData: putDataBack };
  // Set once a step that can change something outside the record has started: from then on nothing
  // thrown here may be a ChangeRecordRefused, because that would say nothing happened.
  let stepRan = false;
  const putReleaseBack = async (error: unknown): Promise<never> => {
    if (options.release && options.putReleaseBack) {
      try {
        await options.putReleaseBack({ ...step, error });
      } catch (back) {
        throw new AggregateError(
          [error, back],
          `${putDataBack ? "stored data could not be put back" : "the release did not pass its check"} (${errorText(error)}), and the release could not be put back either (${errorText(back)})`,
        );
      }
    }
    throw error;
  };

  if (options.release) {
    stepRan = true;
    await options.release(step);
  }
  if (putDataBack) {
    stepRan = true;
    try {
      await capability.restore({ appRoot: record.root, ref: plan.dataRef!.ref });
    } catch (err) {
      await putReleaseBack(err);
    }
  }
  const decided = putDataBack ? { ...input, dataRestored: true } : input;
  // Step 1's plan, so what it settled is not decided again (see `moveDecided`). A record from another
  // implementation plans again; whatever it refuses after a step ran is reported as below.
  const moveRecord = (): ChangeRecordEntry & Extra => {
    try {
      return record instanceof FileChangeRecord ? record.moveDecided<Extra>(version, decided, plan) : record.restore<Extra>(version, decided);
    } catch (err) {
      if (!stepRan || !(err instanceof ChangeRecordRefused)) throw err;
      // Not a refusal: the release step ran, and the data may be back, so something did happen. Like any
      // other failure to move the record here, it is an ordinary error, with the record's own as its cause.
      const done = [options.release ? `${version}'s release step ran` : "", putDataBack ? `stored data was put back to ${plan.dataRef!.ref}` : ""].filter(Boolean).join(" and ");
      throw new Error(`${done}, but the record could not be moved to ${version} (${err.message})`, { cause: err });
    }
  };
  if (options.verify) {
    try {
      await options.verify(step);
    } catch (err) {
      if (!putDataBack) await putReleaseBack(err);
      // The data is back and the target is released. The newer code must not come back on that data,
      // so the record names what is in place, and the failed check still propagates.
      try {
        moveRecord();
      } catch (recordErr) {
        throw new AggregateError([err, recordErr], `the check after the data was put back failed (${errorText(err)}), and the record could not be moved to ${version} either (${errorText(recordErr)})`);
      }
      throw err;
    }
  }
  return moveRecord();
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
