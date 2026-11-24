import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openChangeRecord, type ChangeRecord, type ChangeRecordEntry } from "@pneuma-framework/host-kit/change-record";
import { copyTree, diffTrees, listFiles, treeSignature, type TreeDiff, type TreeWalkOptions } from "@pneuma-framework/host-kit/workspace";
import type { TestCoverage } from "./test-coverage";

// ---------------------------------------------------------------------------
// The self-describing artifact.
//
// An app is one directory. Everything a different agent, a different Host or a
// different machine needs to keep evolving it travels inside that directory:
//
//   AGENTS.md / CLAUDE.md      how to work on it (read by Codex / Claude Code)
//   pneuma-space.json          what the runtime must provide
//   pneuma.scaffold.json       what may change and which checks gate a change
//   .pneuma/app.json           identity of the app
//   .pneuma/pneuma.mjs         zero-dependency CLI that talks to a Host
//   .pneuma/host.json          the Host's address, as the Host recorded it; the CLI reads it
//   .pneuma/versions/vN        the framework's change record: a clean copy of every version
//   .pneuma/history.jsonl      the change record's history: every attempt, with the guarantees that held
//   .pneuma/record.json        the change record's version counter and current version
//   .pneuma/build-threads.json framework BuildThread transcript
//   .pneuma/release-rollout.json  framework rollout state: what the address serves (active / previous)
//
// The Host keeps no state of its own about the app. Versions, history and the current
// version belong to `@pneuma-framework/host-kit/change-record`, the framework's floor;
// this Host writes its entries there with its own fields added.
// ---------------------------------------------------------------------------

/**
 * Never part of a version: host state, installed dependencies, VCS, local secrets, the
 * directories coding agents and editors keep for themselves, and the files directory a local
 * run leaves at the top level. Claude Code writes `.claude/settings.local.json` when the user
 * picks "don't ask again"; versioning that would release it and let a later undo delete it.
 * `data` is an ignored path, not an ignored directory name, because `src/data/` is source.
 *
 * The governed-change backbone diffs and signs drafts with these options too, so its
 * `changedPaths` and `draftSignature` cover exactly what a version holds.
 */
export const TREE: TreeWalkOptions = {
  ignoredDirs: new Set(["node_modules", ".pneuma", ".git", "dist", ".work", ".claude", ".codex", ".vscode", ".idea"]),
  ignoredFiles: new Set([".env", ".env.local", ".DS_Store"]),
  ignoredPaths: new Set(["data"]),
};

// 30 characters, not PneumaSpace's 40: a preview is published as `<name>-pv<4 chars>`, seven
// characters longer, and that name has to pass PneumaSpace's own limit too.
export const APP_NAME = /^[a-z][a-z0-9-]{0,29}$/;

export interface AppPaths {
  readonly root: string;
  readonly state: string;
  readonly drafts: string;
  readonly pending: string;
  readonly info: string;
  readonly cli: string;
  readonly rollout: string;
}

export function appPaths(appsDir: string, name: string): AppPaths {
  const root = join(appsDir, name);
  const state = join(root, ".pneuma");
  return {
    root,
    state,
    drafts: join(state, "drafts"),
    pending: join(state, "pending"),
    info: join(state, "app.json"),
    cli: join(state, "pneuma.mjs"),
    rollout: join(state, "release-rollout.json"),
  };
}

/** Identity of the app. The version counter and the current version live in the change record's record.json. */
export interface AppInfo {
  readonly schema_version: 1;
  readonly app_id: string;
  readonly scaffold_id: string;
  readonly owner: string;
  readonly thread_id: string;
  readonly created_at: string;
}

export function readAppInfo(paths: AppPaths): AppInfo {
  return JSON.parse(readFileSync(paths.info, "utf8")) as AppInfo;
}

export function writeAppInfo(paths: AppPaths, info: AppInfo): void {
  mkdirSync(paths.state, { recursive: true });
  writeFileSync(paths.info, `${JSON.stringify(info, null, 2)}\n`);
}

/** The app's change record, with the Host's own idea of which files make up a version. */
export function openRecord(paths: AppPaths): ChangeRecord {
  return openChangeRecord(paths.root, { walkOptions: TREE });
}

/**
 * Put an app directory made before this Host used the change record on the record. Such a
 * directory has `versions/` and `history.jsonl` already, under the names the record uses, but no
 * `record.json`: its app.json carried the version counter, and its rollout state said which
 * version the address served. Left alone, the record would take the highest version as current,
 * which is wrong after an old undo. So record.json is written once, from those two, and the
 * counter leaves app.json. Old history lines read as `guarantees: []`, which is the truth: they
 * never said what held. Returns whether anything was written.
 */
export function adoptLegacyRecord(paths: AppPaths, beforeCommit?: (record: ChangeRecord) => void): boolean {
  if (!isLegacyRecord(paths)) return false;
  const record = openRecord(paths);
  const raw = JSON.parse(readFileSync(paths.info, "utf8")) as Record<string, unknown> & { version_counter: number };
  const versions = record.versions();
  const highest = versions.length ? Number(versions[versions.length - 1]!.slice(1)) : 0;
  const serving = readServingVersion(paths);
  const current = serving !== null && versions.includes(serving) ? serving : (versions[versions.length - 1] ?? null);
  if (current === null) return false;
  // Before record.json exists, so a crash here means the whole adoption runs again next time.
  beforeCommit?.(record);
  // record.json's layout is the change record's documented on-disk format (schema_version 1).
  const temp = `${record.paths.info}.${process.pid}.adopt.tmp`;
  writeFileSync(temp, `${JSON.stringify({ schema_version: 1, version_counter: Math.max(raw.version_counter, highest), current_version: current }, null, 2)}\n`);
  renameSync(temp, record.paths.info);
  const { version_counter: _counter, ...identity } = raw;
  writeFileSync(paths.info, `${JSON.stringify(identity, null, 2)}\n`);
  return true;
}

/**
 * The id the record gives the next version it records. The Host needs it a moment early, to word
 * the entry it writes with that version. The rule is the record's: one more than the highest of the
 * counter in record.json and the version directories, so a number is never reused.
 */
export function nextVersionId(record: ChangeRecord): string {
  let counter = Math.max(0, ...record.versions().map((version) => Number(version.slice(1))));
  if (existsSync(record.paths.info)) {
    const raw = JSON.parse(readFileSync(record.paths.info, "utf8")) as { version_counter?: unknown };
    if (typeof raw.version_counter === "number" && Number.isInteger(raw.version_counter)) counter = Math.max(counter, raw.version_counter);
  }
  return `v${counter + 1}`;
}

/** An app directory an earlier Host made: app.json still holds the version counter, and there is no record.json yet. */
export function isLegacyRecord(paths: AppPaths): boolean {
  if (existsSync(join(paths.state, "record.json")) || !existsSync(paths.info)) return false;
  const raw = JSON.parse(readFileSync(paths.info, "utf8")) as Record<string, unknown>;
  return typeof raw.version_counter === "number";
}

/** What the address serves, by the framework's rollout state: the last version published there that answered. */
export function readServingVersion(paths: AppPaths): string | null {
  if (!existsSync(paths.rollout)) return null;
  try {
    const state = JSON.parse(readFileSync(paths.rollout, "utf8")) as { active?: { candidate_id?: unknown } };
    return typeof state.active?.candidate_id === "string" ? state.active.candidate_id : null;
  } catch {
    return null;
  }
}

export type Outcome =
  | "published"
  | "rejected"
  | "needs_approval"
  | "denied"
  | "rolled_back"
  /** Record mode: the version was recorded, but the runtime refused it or it did not answer. */
  | "release_failed"
  /** Stored data was saved through the Host's data snapshot capability before a one-way change. */
  | "snapshot_taken"
  /** A version an earlier Host released, marked one-way by the preset when the app was put on the change record. */
  | "one_way_declared";
export type ControlPlane = "agent-driven" | "host-driven" | "owner";

/** The fields this Host adds to a change record entry. */
export interface HostEntryFields {
  readonly outcome: Outcome;
  readonly control: ControlPlane;
  /** Set when a failed release or undo had to touch the address, or did not reach it: what the address serves afterwards. */
  readonly address_note?: string;
  readonly risks?: readonly string[];
  readonly risk_reasons?: readonly string[];
  /** `preset` names the risk preset that was in force, so a later reader knows which rules let the change through. */
  readonly approval?: { readonly preset?: string; readonly route?: string; readonly by: readonly string[]; readonly reason_code: string };
  /** `coverage` on the npm-test check: what the test run covered, as the runner reported it. */
  readonly checks?: readonly { readonly id: string; readonly status: "passed" | "failed"; readonly detail?: string; readonly coverage?: TestCoverage }[];
  readonly reason?: string;
  readonly address?: string;
  readonly agent_note?: string;
  /** Set when a release left the working tree alone because it was edited while the step ran. */
  readonly note?: string;
  /** An undo past a one-way change: the owner who confirmed it, whether stored data was put back or not. */
  readonly confirmed_by?: string;
  /** An undo that put stored data back: where the data that was in use before is kept, when the capability says. */
  readonly set_aside?: string;
  /** A failed undo: the version it tried to go back to. */
  readonly target_version?: string;
  /** A snapshot note: the change the data was saved for. */
  readonly for_change?: string;
  /** Where the name in `agent` came from: --agent, PNEUMA_AGENT, detected, ambiguous or none. Absent when the caller did not say. */
  readonly agent_source?: string;
  /** `detected`: the environment variables the name was read from. */
  readonly agent_markers?: readonly string[];
  /** `ambiguous`: each agent whose markers were set, with those markers. `agent` is then `unknown`. */
  readonly agent_candidates?: readonly { readonly agent: string; readonly markers: readonly string[] }[];
  /** An owner's decision or undo that came through somewhere other than the CLI, e.g. `owner-page`. Absent for the CLI. */
  readonly channel?: string;
}

/** One line of `.pneuma/history.jsonl`: the change record's entry plus this Host's fields. */
export type HistoryEntry = ChangeRecordEntry & HostEntryFields;

/** The files of a tree that make up a version. */
export function sourceFiles(root: string): string[] {
  return listFiles(root, TREE);
}

/** How two trees differ in the files that make up a version. */
export function sourceDiff(base: string, next: string): TreeDiff {
  return diffTrees(base, next, TREE);
}

/** A content signature over the files that make up a version: two trees with equal signatures release the same version. */
export function sourceSignature(root: string): string {
  return treeSignature(root, TREE);
}

/** Copy a working tree or a version into `dest` as a clean source tree. */
export function snapshot(source: string, dest: string): void {
  copyTree(source, dest, TREE);
}

/** Make `dest` hold exactly the source files of `source`, leaving host state, dependencies and data alone. */
export function restoreWorkingTree(source: string, dest: string): void {
  const wanted = new Set(sourceFiles(source));
  for (const rel of sourceFiles(dest)) {
    if (!wanted.has(rel)) rmSync(join(dest, rel), { force: true });
  }
  for (const rel of wanted) {
    const to = join(dest, rel);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(source, rel), to);
  }
}

export interface SpaceManifest {
  readonly contract?: number;
  readonly runtime?: string;
  readonly capabilities?: Record<string, unknown>;
}

export function readSpaceManifest(root: string): SpaceManifest {
  const file = join(root, "pneuma-space.json");
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8")) as SpaceManifest;
}

export interface ScaffoldBoundary {
  readonly scaffold_id: string;
  /** The only places a change may touch. A path outside them is refused before any check runs. */
  readonly writable_roots: readonly string[];
  readonly protected_paths: readonly string[];
  readonly system_prompt_fragments: readonly string[];
  readonly verify_command: string;
}

export function readScaffold(root: string): ScaffoldBoundary {
  const raw = JSON.parse(readFileSync(join(root, "pneuma.scaffold.json"), "utf8")) as {
    scaffold_id: string;
    artifact_boundary: { writable_roots: string[]; protected_paths: string[] };
    agent_contract: { system_prompt_fragments: string[] };
    guardrails: { pre_proposal: { kind: string; command?: string }[] };
  };
  const command = raw.guardrails.pre_proposal.find((check) => check.kind === "command")?.command;
  if (!command) throw new Error("pneuma.scaffold.json declares no pre_proposal command guardrail");
  return {
    scaffold_id: raw.scaffold_id,
    writable_roots: raw.artifact_boundary.writable_roots,
    protected_paths: raw.artifact_boundary.protected_paths,
    system_prompt_fragments: raw.agent_contract.system_prompt_fragments,
    verify_command: command,
  };
}

const AGENTS_MARKER = "## Changing this app (read this before the first edit)";

/** Turn a plain PneumaSpace app directory into a self-describing governed artifact. */
export function installOverlay(root: string, overlayDir: string, cliSource: string): void {
  const agents = join(root, "AGENTS.md");
  const existing = existsSync(agents) ? readFileSync(agents, "utf8") : "";
  if (!existing.includes(AGENTS_MARKER)) {
    // The protocol goes first. The platform's own guide ends with "publish with appctl"; an agent that
    // reads top-down has to meet the governed protocol before it meets that.
    writeFileSync(agents, `${readFileSync(join(overlayDir, "AGENTS.pneuma.md"), "utf8").trimEnd()}\n\n${existing.trimStart()}`);
  }
  copyFileSync(join(overlayDir, "CLAUDE.md"), join(root, "CLAUDE.md"));
  copyFileSync(join(overlayDir, "pneuma.scaffold.json"), join(root, "pneuma.scaffold.json"));
  installCli(root, cliSource);
}

export function installCli(root: string, cliSource: string): void {
  mkdirSync(join(root, ".pneuma"), { recursive: true });
  copyFileSync(cliSource, join(root, ".pneuma", "pneuma.mjs"));
}

/** Where the Host can be reached from the person's machine, as the Host itself recorded it in `.pneuma/host.json`. */
export interface HostAddressRecord {
  readonly schema_version: 1;
  readonly url: string;
  /** When a Host first recorded this address here. */
  readonly recorded_at: string;
  /** `app`: an app directory. `apps`: the directory that holds the apps. */
  readonly scope: "app" | "apps";
  readonly note: string;
}

const HOST_ADDRESS_NOTE =
  "The address of the pneuma Host that manages this directory, recorded by that Host. The CLI in .pneuma/pneuma.mjs uses it unless --host or PNEUMA_HOST names another.";

/**
 * Record the Host's own address under `<dir>/.pneuma/host.json`, so the CLI copy there finds the Host
 * without anyone exporting PNEUMA_HOST. `.pneuma/` is not part of any version. Rewritten only when the
 * address or scope changed, so `recorded_at` says when this address was first recorded. Returns whether it wrote.
 */
export function recordHostAddress(dir: string, url: string, scope: HostAddressRecord["scope"], now: Date = new Date()): boolean {
  const file = join(dir, ".pneuma", "host.json");
  if (existsSync(file)) {
    try {
      const current = JSON.parse(readFileSync(file, "utf8")) as Partial<HostAddressRecord>;
      if (current.url === url && current.scope === scope) return false;
    } catch {
      // Unreadable: written again below.
    }
  }
  const record: HostAddressRecord = { schema_version: 1, url, recorded_at: now.toISOString(), scope, note: HOST_ADDRESS_NOTE };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return true;
}

const APPS_BLOCK_BEGIN = "<!-- pneuma-host:begin (the pneuma Host rewrites this block when it starts; edits inside it are lost) -->";
const APPS_BLOCK_END = "<!-- pneuma-host:end -->";

/**
 * Where the marked block is in `text`: the first end marker after a begin marker, and the begin marker nearest
 * before it. A stray marker of either kind elsewhere in the file stays where it is, with the text around it.
 * Null when there is no such block. (The CLI finds its guide block the same way.)
 */
function markedBlock(text: string, beginMarker: string, endMarker: string): { begin: number; end: number } | null {
  const first = text.indexOf(beginMarker);
  const end = first === -1 ? -1 : text.indexOf(endMarker, first + beginMarker.length);
  return end === -1 ? null : { begin: text.lastIndexOf(beginMarker, end - beginMarker.length), end };
}

/** Put `block` between the markers in `existing`, replacing an earlier block, or in front of the rest. */
function withBlock(existing: string, block: string): string {
  const wrapped = `${APPS_BLOCK_BEGIN}\n${block.trim()}\n${APPS_BLOCK_END}\n`;
  const at = markedBlock(existing, APPS_BLOCK_BEGIN, APPS_BLOCK_END);
  if (at) return `${existing.slice(0, at.begin)}${wrapped}${existing.slice(at.end + APPS_BLOCK_END.length).replace(/^\n/, "")}`;
  return existing.trim() ? `${wrapped}\n${existing.trimStart()}` : wrapped;
}

/**
 * Make the directory that holds the apps describe itself, for an agent started there: an `AGENTS.md`
 * block saying what the directory is, the Host's address and the commands (Claude Code reads it through a
 * `CLAUDE.md` holding `@AGENTS.md`), and a copy of the CLI at `.pneuma/pneuma.mjs`. Text outside the
 * marked block and an existing `CLAUDE.md` are left alone. Each file is written only when it is stale.
 * Returns the files it wrote, relative to `appsDir`.
 */
export function describeAppsDir(appsDir: string, overlayDir: string, cliSource: string, hostUrl: string): string[] {
  const written: string[] = [];
  const agents = join(appsDir, "AGENTS.md");
  const existing = existsSync(agents) ? readFileSync(agents, "utf8") : "";
  const wanted = withBlock(existing, readFileSync(join(overlayDir, "AGENTS.apps.md"), "utf8").replaceAll("{{HOST_URL}}", hostUrl));
  if (wanted !== existing) {
    writeFileSync(agents, wanted);
    written.push("AGENTS.md");
  }
  const claude = join(appsDir, "CLAUDE.md");
  if (!existsSync(claude)) {
    copyFileSync(join(overlayDir, "CLAUDE.md"), claude);
    written.push("CLAUDE.md");
  }
  if (refreshCli(appsDir, cliSource)) written.push(".pneuma/pneuma.mjs");
  return written;
}

/**
 * Bring an app's copy of the CLI up to the Host's. The copy is how an agent talks to this Host, so a
 * copy from an earlier Host silently drops what it does not know (a live run sent `undo --to v4` as a
 * plain undo). It lives under `.pneuma/`, which is not part of any version. Returns whether it changed.
 */
export function refreshCli(root: string, cliSource: string): boolean {
  const installed = join(root, ".pneuma", "pneuma.mjs");
  const wanted = readFileSync(cliSource);
  if (existsSync(installed) && readFileSync(installed).equals(wanted)) return false;
  installCli(root, cliSource);
  return true;
}
