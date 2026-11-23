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
//   .pneuma/versions/v<N>/  a clean copy of the files that make up version N
//   .pneuma/history.jsonl   append-only, one JSON entry per line
//   .pneuma/record.json     { schema_version: 1, version_counter, current_version }
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
   * Which files make up a version. Default: host-kit's workspace defaults, plus `.pneuma`
   * and a top-level `data/` (runtime data) ignored. Whatever is passed, a top-level
   * `.pneuma` is never part of a version. A file the walk includes is versioned and
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

/** Options of `restoreWithData`. */
export interface RestoreWithDataOptions {
  /**
   * Runs after stored data was put back (when it was) and before the files and the current
   * version move. A Host publishes there. If it throws, the files and the current version stay
   * as they were and the error propagates; data that was put back stays put back. The working
   * tree can change while it runs, so it needs `keepEdits` or `discardEdits` in the input: that
   * way the restore after it never refuses once data was touched or the step ran.
   */
  readonly beforeRestore?: (step: { readonly plan: RestorePlan; readonly dataRestored: boolean }) => Promise<void>;
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
  | "crosses_one_way_change";

/** The record declined to act. `message` is written for a person to read; `detail` lists the paths or versions involved. */
export class ChangeRecordRefused extends Error {
  constructor(
    readonly reason: ChangeRecordRefusalReason,
    message: string,
    readonly detail?: readonly string[],
  ) {
    super(message);
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

/** A Host that can put stored data back declares it by supplying one of these. The framework never supplies one. */
export interface DataSnapshotCapability {
  /** e.g. "neon-branch". */
  readonly id: string;
  snapshot(input: { appRoot: string; version: string }): Promise<{ ref: string }>;
  restore(input: { appRoot: string; ref: string }): Promise<void>;
}

const STATE_DIR = ".pneuma";
const DATA_DIR = "data";
const VERSION_ID = /^v(0|[1-9]\d*)$/;

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
    const keep = input.keepEdits === true && status.dirty;
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
 * Adoption is best-effort. A directory that has `.pneuma/versions/v<N>/` but no
 * `record.json` reads as counter = highest N found and current = highest N found. History
 * lines without `guarantees` read as `[]`, and a line that is not valid JSON is skipped.
 */
export function openChangeRecord(appRoot: string, options: ChangeRecordOptions = {}): ChangeRecord {
  return new FileChangeRecord(appRoot, options);
}

/**
 * Restore `version`, putting stored data back first when the restore goes back past a
 * one-way change and `capability` can do it: the plan has a `dataRef` (the snapshot taken
 * before the oldest one-way change being undone) written by a capability with the same id.
 * Then the restore entry records `by: "data_restored"`. Otherwise the restore goes ahead as
 * `record.restore(version, input)` would, so the one-way refusal or an explicit
 * `acceptOneWay` applies.
 *
 * Every refusal (unknown version, unsaved edits, a one-way change that is neither restored
 * nor accepted) comes before any data is touched and before `options.beforeRestore` runs.
 * If `capability.restore` throws, no file is restored, `beforeRestore` does not run, and the
 * error propagates.
 */
export async function restoreWithData<Extra = {}>(
  record: ChangeRecord,
  version: string,
  capability: DataSnapshotCapability | undefined,
  input: RestoreInput & { extra?: Extra },
  options: RestoreWithDataOptions = {},
): Promise<ChangeRecordEntry & Extra> {
  checkInput(input, false);
  if (options.beforeRestore && !input.keepEdits && !input.discardEdits) {
    throw new TypeError("beforeRestore needs keepEdits or discardEdits: the working tree can change while it runs, and a refusal must come before anything is touched");
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
  if (putDataBack) await capability.restore({ appRoot: record.root, ref: plan.dataRef!.ref });
  await options.beforeRestore?.({ plan, dataRestored: putDataBack });
  return record.restore<Extra>(version, putDataBack ? { ...input, dataRestored: true } : input);
}
