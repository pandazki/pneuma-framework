import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ChangeRecordRefused,
  openChangeRecord,
  type ChangeRecord,
  type ChangeRecordEntry,
} from "@pneuma-framework/host-kit/change-record";
import type { RecordArgs } from "./parse-args.js";

// ---------------------------------------------------------------------------
// `pneuma-framework record ...`: the change record for a coding agent that works in
// an app directory with no Host around it. It records versions and restores them.
// It checks nothing and approves nothing, and every message says so where it matters.
// ---------------------------------------------------------------------------

export const AGENTS_SECTION_BEGIN = "<!-- pneuma-framework:change-record:begin -->";
export const AGENTS_SECTION_END = "<!-- pneuma-framework:change-record:end -->";
const DEFAULT_AGENT = "unknown";
const CLI = "pneuma-framework";

/** The section `record init` puts at the top of AGENTS.md. */
export function agentsSection(): string {
  return [
    AGENTS_SECTION_BEGIN,
    "## This directory keeps a record of its changes",
    "",
    `Run these commands from this directory. \`${CLI}\` is the pneuma-framework command-line tool.`,
    "",
    `- Before you change anything, read what happened so far: \`${CLI} record history\`.`,
    `- When a request is finished, save it: \`${CLI} record save "<what the person asked for>" --agent <your name>\`.`,
    `- To go back to an earlier version: \`${CLI} record restore <version>\`.`,
    "- Nothing here checks or approves your work. Checking it is your job.",
    "- If a change removes or rewrites stored data so that older versions can no longer run on it, say so when you save: add `--one-way \"<reason>\"`.",
    AGENTS_SECTION_END,
  ].join("\n");
}

/** Put the section at the top of `<dir>/AGENTS.md` unless it is already there. */
export function ensureAgentsSection(dir: string): "created" | "added" | "present" {
  const file = join(dir, "AGENTS.md");
  if (!existsSync(file)) {
    writeFileSync(file, `${agentsSection()}\n`);
    return "created";
  }
  const existing = readFileSync(file, "utf8");
  if (existing.includes(AGENTS_SECTION_BEGIN)) return "present";
  writeFileSync(file, `${agentsSection()}\n\n${existing.trimStart()}`);
  return "added";
}

interface Output {
  out(line: string): void;
  err(line: string): void;
}
const consoleOutput: Output = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

/** Run one `record` command. Returns the exit code: 0 done, 1 refused or failed. */
export function runRecord(args: RecordArgs, output: Output = consoleOutput): number {
  const dir = resolve(args.dir ?? process.cwd());
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    output.err(`${CLI}: ${dir} is not a directory`);
    return 1;
  }
  const record = openChangeRecord(dir);
  try {
    switch (args.command) {
      case "init":
        return init(record, args, output);
      case "save":
        return save(record, args, output);
      case "history":
        return history(record, args, output);
      case "status":
        return status(record, args, output);
      case "restore":
        return restore(record, args, output);
    }
  } catch (err) {
    if (err instanceof ChangeRecordRefused) {
      if (args.json) {
        output.out(JSON.stringify({ refused: err.reason, message: err.message, detail: err.detail ?? [] }, null, 2));
      } else {
        output.err(err.message);
        const hint = refusalHint(err);
        if (hint) output.err(hint);
      }
      return 1;
    }
    output.err(`${CLI}: ${(err as Error).message}`);
    return 1;
  }
}

function refusalHint(err: ChangeRecordRefused): string | undefined {
  switch (err.reason) {
    case "dirty_working_tree":
      return `To throw the edits away, run the same command with --discard-edits. To keep them, save them first with ${CLI} record save "<what the person asked for>".`;
    case "crosses_one_way_change":
      return "To accept it, run the same command again with --accept-one-way. This tool cannot put stored data back.";
    case "unknown_version":
      return `Run ${CLI} record history to see the versions.`;
    default:
      return undefined;
  }
}

function init(record: ChangeRecord, args: RecordArgs, output: Output): number {
  if (record.exists()) {
    output.out(`${record.root} already keeps a change record. The current version is ${record.current() ?? "not set"}.`);
    if (!args.noAgentsMd) {
      const agents = ensureAgentsSection(record.root);
      if (agents !== "present") {
        output.out(`${agents === "created" ? "Created AGENTS.md with" : "Added"} the change record section${agents === "created" ? "" : " to AGENTS.md"}. It is not saved as a version yet; run ${CLI} record save to save it.`);
      }
    }
    return 0;
  }
  const agents = args.noAgentsMd ? "skipped" : ensureAgentsSection(record.root);
  const entry = record.record({ intent: "start keeping a record of changes", agent: args.agent ?? DEFAULT_AGENT });
  output.out(`Started a change record in ${record.root}. ${entry.version} holds ${count(entry.changed_paths?.length ?? 0, "file")}.`);
  if (agents === "created") output.out("Created AGENTS.md with a short section that tells coding agents how to use the record.");
  else if (agents === "added") output.out("Added a short section to the top of AGENTS.md that tells coding agents how to use the record.");
  output.out("Nothing checked or approved this version. It is recorded only.");
  return 0;
}

function save(record: ChangeRecord, args: RecordArgs, output: Output): number {
  const entry = record.record({
    intent: args.intent!,
    agent: args.agent ?? DEFAULT_AGENT,
    ...(args.oneWay ? { oneWay: { reason: args.oneWay } } : {}),
  });
  if (args.json) {
    output.out(JSON.stringify(entry, null, 2));
    return 0;
  }
  const base = entry.base_version ? ` on top of ${entry.base_version}` : "";
  output.out(`Saved ${entry.version}${base}: ${count(entry.changed_paths?.length ?? 0, "file")} changed.`);
  if (entry.one_way) {
    output.out(`Marked one-way: ${entry.one_way.reason}. Going back to before ${entry.version} will ask for explicit confirmation.`);
  }
  output.out("Nothing checked or approved this version. It is recorded only.");
  return 0;
}

function history(record: ChangeRecord, args: RecordArgs, output: Output): number {
  const entries = record.history();
  if (args.json) {
    output.out(JSON.stringify(entries, null, 2));
    return 0;
  }
  if (entries.length === 0) {
    output.out("Nothing has been recorded here yet.");
    return 0;
  }
  const rows = entries.map((entry) => ({
    at: shortTime(entry.at),
    kind: String(entry.kind ?? "-"),
    version: entry.version ?? "-",
    guarantees: entry.guarantees.length > 0 ? entry.guarantees.join(",") : "recorded only",
    rest: `${entry.intent ?? ""}${markers(entry)}`,
  }));
  const width = (key: "at" | "kind" | "version" | "guarantees"): number => Math.max(...rows.map((row) => row[key].length));
  const w = { at: width("at"), kind: width("kind"), version: width("version"), guarantees: width("guarantees") };
  for (const row of rows) {
    output.out(`${row.at.padEnd(w.at)}  ${row.kind.padEnd(w.kind)}  ${row.version.padEnd(w.version)}  ${row.guarantees.padEnd(w.guarantees)}  ${row.rest}`);
  }
  return 0;
}

function markers(entry: ChangeRecordEntry): string {
  const parts: string[] = [];
  if (entry.agent) parts.push(`(by ${entry.agent})`);
  if (entry.kind === "restore" && entry.base_version) parts.push(`(from ${entry.base_version})`);
  if (entry.one_way) parts.push(`[ONE-WAY: ${entry.one_way.reason}]`);
  if (entry.one_way_crossed) {
    const how = entry.one_way_crossed.by === "data_restored" ? "stored data was put back first" : "accepted without putting stored data back";
    parts.push(`[went back past one-way ${entry.one_way_crossed.versions.join(", ")}: ${how}]`);
  }
  if (entry.discarded_edits && entry.discarded_edits.length > 0) {
    parts.push(`[threw away unsaved edits to ${count(entry.discarded_edits.length, "file")}]`);
  }
  return parts.length > 0 ? `  ${parts.join(" ")}` : "";
}

function status(record: ChangeRecord, args: RecordArgs, output: Output): number {
  const exists = record.exists();
  const result = record.status();
  if (args.json) {
    output.out(JSON.stringify(result, null, 2));
    return 0;
  }
  if (!exists) {
    output.out(`Nothing has been recorded here yet. Run ${CLI} record init to start.`);
    return 0;
  }
  output.out(`Current version: ${result.current ?? "not set"}`);
  if (!result.dirty) {
    output.out("No unsaved edits.");
    return 0;
  }
  output.out(`Unsaved edits (${count(result.changedPaths.length, "file")}):`);
  for (const path of result.changedPaths) output.out(`  ${path}`);
  output.out(`Run ${CLI} record save "<what the person asked for>" to save them as a version.`);
  return 0;
}

function restore(record: ChangeRecord, args: RecordArgs, output: Output): number {
  const entry = record.restore(args.version!, {
    agent: args.agent ?? DEFAULT_AGENT,
    discardEdits: Boolean(args.discardEdits),
    acceptOneWay: Boolean(args.acceptOneWay),
  });
  if (args.json) {
    output.out(JSON.stringify(entry, null, 2));
    return 0;
  }
  const from = entry.base_version ? ` (was ${entry.base_version})` : "";
  output.out(`Now at ${entry.version}${from}. ${count(entry.changed_paths?.length ?? 0, "file")} put back.`);
  if (entry.discarded_edits && entry.discarded_edits.length > 0) {
    output.out(`Threw away unsaved edits to ${count(entry.discarded_edits.length, "file")}.`);
  }
  if (entry.one_way_crossed) {
    output.out(`Went back past one-way ${entry.one_way_crossed.versions.join(", ")} because you accepted it. The record says so.`);
  }
  output.out("Stored data was not touched.");
  return 0;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function shortTime(at: unknown): string {
  if (typeof at !== "string") return "-";
  return at.replace("T", " ").replace(/\.\d+Z$/, "Z");
}
