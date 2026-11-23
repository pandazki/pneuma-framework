import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { copyTree, listFiles, type TreeWalkOptions } from "@pneuma-framework/host-kit/workspace";

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
//   .pneuma/history.jsonl      every attempt: intent, risks, who approved, result
//   .pneuma/build-threads.json framework BuildThread transcript
//   .pneuma/release-rollout.json  framework rollout state (active / previous)
//   .pneuma/versions/vN        source snapshot of every released version
//
// The Host keeps no state of its own about the app.
// ---------------------------------------------------------------------------

/**
 * Never part of a version: host state, installed dependencies, VCS, local secrets, and the
 * directories coding agents and editors keep for themselves. Claude Code writes
 * `.claude/settings.local.json` when the user picks "don't ask again"; versioning that would
 * release it and let a later undo delete it.
 */
export const TREE: TreeWalkOptions = {
  ignoredDirs: new Set(["node_modules", ".pneuma", ".git", "dist", ".work", ".claude", ".codex", ".vscode", ".idea"]),
  ignoredFiles: new Set([".env", ".env.local", ".DS_Store"]),
};

// 30 characters, not PneumaSpace's 40: a preview is published as `<name>-pv<4 chars>`, seven
// characters longer, and that name has to pass PneumaSpace's own limit too.
export const APP_NAME = /^[a-z][a-z0-9-]{0,29}$/;

export interface AppPaths {
  readonly root: string;
  readonly state: string;
  readonly versions: string;
  readonly drafts: string;
  readonly pending: string;
  readonly history: string;
  readonly info: string;
  readonly cli: string;
}

export function appPaths(appsDir: string, name: string): AppPaths {
  const root = join(appsDir, name);
  const state = join(root, ".pneuma");
  return {
    root,
    state,
    versions: join(state, "versions"),
    drafts: join(state, "drafts"),
    pending: join(state, "pending"),
    history: join(state, "history.jsonl"),
    info: join(state, "app.json"),
    cli: join(state, "pneuma.mjs"),
  };
}

export interface AppInfo {
  readonly schema_version: 1;
  readonly app_id: string;
  readonly scaffold_id: string;
  readonly owner: string;
  readonly thread_id: string;
  readonly created_at: string;
  version_counter: number;
}

export function readAppInfo(paths: AppPaths): AppInfo {
  return JSON.parse(readFileSync(paths.info, "utf8")) as AppInfo;
}

export function writeAppInfo(paths: AppPaths, info: AppInfo): void {
  mkdirSync(paths.state, { recursive: true });
  writeFileSync(paths.info, `${JSON.stringify(info, null, 2)}\n`);
}

export type Outcome = "published" | "rejected" | "needs_approval" | "denied" | "rolled_back";
export type ControlPlane = "agent-driven" | "host-driven" | "owner";

export interface HistoryEntry {
  /** Set when a failed release or undo had to touch the address: what the address serves afterwards. */
  readonly address_note?: string;
  readonly change_id: string;
  readonly at: string;
  readonly kind: "create" | "change" | "undo" | "decision";
  readonly outcome: Outcome;
  /** What the person asked for, in their words. */
  readonly intent: string;
  /** Which agent produced the change, e.g. claude-code, codex. */
  readonly agent: string;
  readonly control: ControlPlane;
  readonly version?: string;
  readonly base_version?: string;
  readonly changed_paths?: readonly string[];
  readonly risks?: readonly string[];
  readonly risk_reasons?: readonly string[];
  /** `preset` names the risk preset that was in force, so a later reader knows which rules let the change through. */
  readonly approval?: { readonly preset?: string; readonly route?: string; readonly by: readonly string[]; readonly reason_code: string };
  readonly checks?: readonly { readonly id: string; readonly status: "passed" | "failed"; readonly detail?: string }[];
  readonly reason?: string;
  readonly address?: string;
  readonly agent_note?: string;
}

export function appendHistory(paths: AppPaths, entry: HistoryEntry): void {
  mkdirSync(paths.state, { recursive: true });
  appendFileSync(paths.history, `${JSON.stringify(entry)}\n`);
}

export function readHistory(paths: AppPaths): HistoryEntry[] {
  if (!existsSync(paths.history)) return [];
  return readFileSync(paths.history, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as HistoryEntry);
}

/** Copy a working tree or a version into `dest` as a clean source tree. */
export function snapshot(source: string, dest: string): void {
  copyTree(source, dest, TREE);
  // A local run leaves its files directory at the top level; it is data, not source.
  rmSync(join(dest, "data"), { recursive: true, force: true });
}

/** Make `dest` hold exactly the source files of `source`, leaving host state and dependencies alone. */
export function restoreWorkingTree(source: string, dest: string): void {
  const wanted = new Set(listFiles(source, TREE));
  for (const rel of listFiles(dest, TREE)) {
    if (rel === "data" || rel.startsWith("data/")) continue;
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
