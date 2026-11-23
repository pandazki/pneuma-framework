#!/usr/bin/env node
// The artifact's own CLI. No dependencies; any Node >= 18 runs it. A copy lives in
// every app at .pneuma/pneuma.mjs, so whichever coding agent opens the directory
// can drive the governed loop without installing anything.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const HOST = (process.env.PNEUMA_HOST ?? "http://127.0.0.1:8090").replace(/\/$/, "");

const USAGE = `usage: node .pneuma/pneuma.mjs <command> [--app <name>] [--agent <name>] [--json]

  status                 active version, address, uncommitted files, changes waiting for the owner
  history                every attempt so far, oldest first
  submit "<intent>"      take the working tree through verify, preview and release
  discard                put the working tree back to the active version
  undo "<why>"           go back one version (code only; stored data stays)
  approve <change-id>    owner only, asks for confirmation in a terminal
  deny <change-id> [why] owner only
  create <name>          create and publish a new app (run from anywhere)
  list                   apps this Host knows

PNEUMA_HOST (default http://127.0.0.1:8090), PNEUMA_AGENT, PNEUMA_OWNER (default user:me)`;

function parse(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--app" || arg === "--agent") flags[arg.slice(2)] = argv[++i];
    else rest.push(arg);
  }
  return { flags, rest };
}

function findApp(start) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const info = join(dir, ".pneuma", "app.json");
    if (existsSync(info)) return JSON.parse(readFileSync(info, "utf8")).app_id;
    if (dirname(dir) === dir) return null;
  }
}

// Best effort: the name only labels history entries.
function detectAgent() {
  if (process.env.PNEUMA_AGENT) return process.env.PNEUMA_AGENT;
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) return "claude-code";
  if (Object.keys(process.env).some((key) => key.startsWith("CODEX_"))) return "codex";
  return "unknown-agent";
}

async function call(method, path, payload) {
  let res;
  try {
    res = await fetch(`${HOST}${path}`, {
      method,
      headers: payload ? { "content-type": "application/json" } : {},
      body: payload ? JSON.stringify(payload) : undefined,
    });
  } catch (err) {
    const code = err.cause?.code ?? err.message;
    // EPERM is not a Host that is down: it is a sandbox (Codex's default one, for instance) refusing the connection.
    if (code === "EPERM" || code === "EACCES") {
      fail(`the sandbox this command runs in blocks the connection to the Host at ${HOST} (${code}). Nothing was sent. Run this command with network access (ask the user for permission), then repeat it.`, 3);
    }
    fail(`cannot reach the Host at ${HOST} (${code}). Start it with: docker compose up -d`, 3);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(data.error ?? `${method} ${path} answered ${res.status}`, 3);
  return data;
}

function fail(message, code = 1) {
  console.error(`pneuma: ${message}`);
  process.exit(code);
}

// What the agent should do next, for the reasons where the raw detail does not say it.
const REJECTION_HINTS = {
  protected_file_changed:
    "These paths are protected (see AGENTS.md). Restore them from .pneuma/versions/<active version>/ and submit again; put your own styles and scripts under public/app/.",
  no_change: "The working tree is identical to the active version, so there is nothing to release.",
  base_changed: "Another change was released while this one was being checked. Run status, then submit again.",
};

function printChange(result) {
  if (result.status === "published") {
    console.log(`published ${result.version} at ${result.address}`);
    if (result.changed_paths.length) console.log(`changed: ${result.changed_paths.join(", ")}`);
    console.log(`risks: ${result.risks.join(", ")}; approved by: ${result.approved_by.join(", ")}`);
    return 0;
  }
  if (result.status === "needs_approval") {
    console.log(`needs_approval ${result.change_id}: nothing was released.`);
    console.log(`risks: ${result.risks.join(", ")}`);
    for (const line of result.disclosure) console.log(`  - ${line}`);
    console.log(`Show this to the owner. They decide with: node .pneuma/pneuma.mjs approve ${result.change_id}   (or deny)`);
    return 2;
  }
  console.log(`rejected (${result.reason}): nothing was released.`);
  if (result.detail) console.log(result.detail);
  const hint = REJECTION_HINTS[result.reason];
  if (hint) console.log(hint);
  return 1;
}

const { flags, rest } = parse(process.argv.slice(2));
const [command, ...args] = rest;
const out = (data, human) => (flags.json ? console.log(JSON.stringify(data, null, 2)) : human(data));

if (!command || command === "help" || command === "--help") {
  console.log(USAGE);
  process.exit(command ? 0 : 1);
}

if (command === "list") {
  out(await call("GET", "/apps"), (data) => console.log(data.apps.join("\n") || "no apps yet"));
  process.exit(0);
}

if (command === "create") {
  if (!args[0]) fail("create takes <name>");
  const result = await call("POST", "/apps", { name: args[0] });
  let code = 0;
  out(result, (data) => {
    code = printChange(data);
    if (data.status === "published") console.log(`The app directory is apps/${args[0]} next to the compose file. Open it with your coding agent.`);
  });
  process.exit(flags.json ? (result.status === "published" ? 0 : 1) : code);
}

const app = flags.app ?? findApp(process.cwd());
if (!app) fail("not inside an app directory (no .pneuma/app.json found here or above); pass --app <name>");
const base = `/apps/${app}`;

switch (command) {
  case "status":
    out(await call("GET", base), (s) => {
      console.log(`${s.app_id}: ${s.active_version ?? "unpublished"} at ${s.address}`);
      console.log(`previous: ${s.previous_version ?? "none"}; owner: ${s.owner}; governance: ${s.governance}`);
      console.log(`uncommitted: ${s.uncommitted.length ? s.uncommitted.join(", ") : "none"}`);
      for (const p of s.pending) {
        console.log(`waiting for the owner: ${p.change_id} "${p.intent}" (${p.risks.join(", ")})`);
        for (const line of p.disclosure) console.log(`  - ${line}`);
      }
    });
    break;
  case "history":
    out(await call("GET", `${base}/history`), ({ history }) => {
      for (const h of history) {
        const where = h.version ? ` -> ${h.version}` : "";
        const why = h.reason ? ` (${h.reason})` : "";
        console.log(`${h.at} ${h.kind} ${h.outcome}${where} by ${h.agent} [${h.control}]: ${h.intent}${why}`);
        if (h.changed_paths?.length) console.log(`    files: ${h.changed_paths.join(", ")}`);
        if (h.approval) console.log(`    approval: ${h.approval.reason_code} by ${h.approval.by.join(", ") || "nobody yet"} (${h.risks?.join(", ") ?? ""})`);
      }
    });
    break;
  case "submit": {
    if (!args[0]) fail('submit takes "<one sentence: what the user asked for>"');
    const result = await call("POST", `${base}/changes`, { intent: args.join(" "), agent: flags.agent ?? detectAgent() });
    let code = result.status === "published" ? 0 : result.status === "needs_approval" ? 2 : 1;
    out(result, (data) => (code = printChange(data)));
    process.exit(code);
  }
  case "discard":
    out(await call("POST", `${base}/discard`, {}), (d) => console.log(`working tree is back at ${d.active_version}${d.restored.length ? `; restored: ${d.restored.join(", ")}` : ""}`));
    break;
  case "undo":
    out(await call("POST", `${base}/undo`, { reason: args.join(" ") || "undo", actor: flags.agent ?? detectAgent() }), (d) =>
      console.log(`now on ${d.active_version} (was ${d.undone_version}) at ${d.address}. Code only; stored data was not rolled back.`),
    );
    break;
  case "approve":
  case "deny": {
    if (!args[0]) fail(`${command} takes <change-id>`);
    // A speed bump, not a security boundary: coding agents run without a terminal, the owner has one.
    if (!process.stdin.isTTY) fail(`${command} is the owner's decision and must be run by a person in a terminal`);
    const status = await call("GET", base);
    const pending = status.pending.find((p) => p.change_id === args[0]);
    if (!pending) fail(`no change ${args[0]} is waiting`);
    console.log(`"${pending.intent}" by ${pending.agent}\nfiles: ${pending.changed_paths.join(", ")}\nrisks: ${pending.risks.join(", ")}`);
    for (const line of pending.disclosure) console.log(`  - ${line}`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    // Ctrl+D or Ctrl+C at the prompt rejects the question; that is a "no", not a crash.
    const answer = await rl.question(`Type "${command}" to confirm: `).catch(() => "");
    rl.close();
    if (answer.trim() !== command) fail("not confirmed; nothing changed");
    const result = await call("POST", `${base}/changes/${args[0]}/${command}`, {
      subject: process.env.PNEUMA_OWNER ?? "user:me",
      reason: args.slice(1).join(" ") || undefined,
    });
    let code = 0;
    out(result, (data) => (code = command === "deny" ? (console.log("denied; nothing was released"), 0) : printChange(data)));
    process.exit(code);
  }
  default:
    fail(`unknown command "${command}"\n${USAGE}`);
}
