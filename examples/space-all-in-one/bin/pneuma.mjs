#!/usr/bin/env node
// The artifact's own CLI. No dependencies; any Node >= 18 runs it. A copy lives in
// every app at .pneuma/pneuma.mjs, so whichever coding agent opens the directory
// can drive the governed loop without installing anything.
import { existsSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const HOST = (process.env.PNEUMA_HOST ?? "http://127.0.0.1:8090").replace(/\/$/, "");

const USAGE = `usage: node .pneuma/pneuma.mjs <command> [--app <name>] [--agent <name>] [--json]

  status                 active version, address, uncommitted files, changes waiting for the owner,
                         and what submit does in the mode this Host runs in
  history                every attempt so far, oldest first, with what was guaranteed for each
  submit "<intent>"      take the working tree through this Host's loop and release it
    [--one-way "<what is lost>"]  record mode only: this change drops or rewrites stored data
  discard                put the working tree back to the active version
  undo "<why>"           go back one version; again to go further back
    [--to <version>]     go straight back to an earlier version
    [--accept-one-way]   owner only, in a terminal: confirm going back past a one-way change
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
    else if (arg === "--accept-one-way") flags.acceptOneWay = true;
    else if (arg === "--app" || arg === "--agent" || arg === "--to") flags[arg.slice(2)] = argv[++i];
    else if (arg === "--one-way") flags.oneWay = argv[++i];
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

// node:http, not fetch: undici stops waiting for response headers after 300 s, and the Host holds
// create, submit, approve and undo open for the whole `npm ci && npm test` (up to 600 s). So no
// timeout of any kind here, and agent: false keeps Node's global agent and its 5 s socket timeout out of it.
function request(method, url, payload) {
  return new Promise((settle) => {
    const body = payload ? JSON.stringify(payload) : undefined;
    const tls = url.protocol === "https:";
    // Set once the Host has the connection: from then on a failure no longer means "nothing was sent".
    let connected = false;
    const lost = (err) => settle({ err, connected: true });
    const aborted = () => Object.assign(new Error("aborted"), { code: "ECONNRESET" });
    const req = (tls ? httpsRequest : httpRequest)(
      url,
      { method, agent: false, headers: body ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) } : {} },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => (res.complete ? settle({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }) : lost(aborted())));
        res.on("error", lost);
        res.on("close", () => res.complete || lost(aborted()));
      },
    );
    req.on("socket", (socket) => socket.once(tls ? "secureConnect" : "connect", () => (connected = true)));
    req.on("error", (err) => settle({ err, connected }));
    req.end(body);
  });
}

// Answers the Host gives as a refusal that the caller acts on, with what to do next.
const REFUSAL_HINTS = {
  crosses_one_way_change:
    'Stop and show this to the user. Going back past a one-way change is the owner\'s decision. In a terminal, they run: node .pneuma/pneuma.mjs undo --accept-one-way "<why>" (with the same --to, if one was given).',
  // The capability's check refused the snapshot before the older code went out. Unlike data_restore_failed, nothing happened.
  data_snapshot_refused:
    "Nothing changed: no code was released and the stored data was not touched. Stop and show this to the user. Do not edit .pneuma/ to name another snapshot: the Host checks every snapshot it is given.",
};

// What the owner types "accept" to, after the refusal has said which case applies.
function confirmPrompt(dataRestore) {
  return dataRestore === "snapshot"
    ? 'Type "accept" to go back and put the stored data back to that snapshot; what was stored since then will not be in the app: '
    : 'Type "accept" to go back with the code only, leaving the stored data as it is: ';
}

// Exit code for a refusal: 2 when the owner has to decide, as for needs_approval; 3 for anything else.
const refusalCode = (reason) => (reason === "crosses_one_way_change" ? 2 : 3);

function refusalText(data, fallback) {
  const hint = REFUSAL_HINTS[data.reason];
  return `${data.error ?? fallback}${hint ? `\n${hint}` : ""}`;
}

async function call(method, path, payload) {
  const { status, data } = await send(method, path, payload);
  if (status < 200 || status >= 300) fail(refusalText(data, `${method} ${path} answered ${status}`), refusalCode(data.reason));
  return data;
}

async function send(method, path, payload) {
  let url;
  try {
    url = new URL(`${HOST}${path}`);
  } catch {}
  if (url?.protocol !== "http:" && url?.protocol !== "https:") fail(`PNEUMA_HOST must be an http:// or https:// address, not "${HOST}"`, 3);
  const { err, connected, status, text } = await request(method, url, payload);
  if (err) {
    const code = err.code ?? err.errors?.[0]?.code ?? err.message;
    if (connected) {
      fail(
        method === "GET"
          ? `the connection to the Host at ${HOST} was lost before it answered (${code}). Nothing was changed; run the command again.`
          : `the connection to the Host at ${HOST} was lost while it was working on the request (${code}). The Host may still finish it, so the change may still be released: run status and history before submitting again.`,
        3,
      );
    }
    // EPERM is not a Host that is down: it is a sandbox (Codex's default one, for instance) refusing the connection.
    if (code === "EPERM" || code === "EACCES") {
      fail(`the sandbox this command runs in blocks the connection to the Host at ${HOST} (${code}). Nothing was sent. Run this command with network access (ask the user for permission), then repeat it.`, 3);
    }
    fail(`cannot reach the Host at ${HOST} (${code}). Start it with: docker compose up -d`, 3);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = {};
  }
  return { status, data };
}

function fail(message, code = 1) {
  console.error(`pneuma: ${message}`);
  process.exit(code);
}

// What the agent should do next, for the reasons where the raw detail does not say it.
const REJECTION_HINTS = {
  protected_file_changed:
    "These paths are protected (see AGENTS.md). Restore them from .pneuma/versions/<active version>/ and submit again; put your own styles and scripts under public/app/.",
  outside_writable_roots:
    "A change may only touch the writable roots listed in AGENTS.md and pneuma.scaffold.json. Move these files under src/ or public/app/, or remove them, and submit again.",
  invalid_manifest: "Fix pneuma-space.json so that it parses, and submit again.",
  no_change: "The working tree is identical to the active version, so there is nothing to release.",
  base_changed: "Another change was released while this one was being checked. Run status, then submit again.",
  draft_changed_after_check:
    "The change's files were altered after they were checked (for example by a test that writes outside its own directory). Make sure nothing writes into .pneuma/, then run status and submit again.",
  data_snapshot_failed:
    "The Host could not save the stored data before this one-way change, so nothing went live. Tell the user; submit again once saving the data works.",
};

// What submitting again does after a release that did not go live: with no new edits, the same version goes out as it is.
const releaseAgain = (version) =>
  `Fix the cause and submit again, or undo. Submitting with no new edits releases ${version} as it is; with new edits, it records a new version on top of ${version} and releases both.`;

const NOTHING_CHECKED = "Nothing checked or approved this change: the Host recorded it and published it as it was.";

function printChange(result) {
  if (result.status === "published") {
    console.log(`published ${result.version} at ${result.address}`);
    if (result.released_as_is) console.log(`${result.version} was recorded earlier and did not go live then; it went live now, as it was. No new version was recorded.`);
    if (result.changed_paths.length) console.log(`changed: ${result.changed_paths.join(", ")}`);
    if (result.guarantees?.length === 0) console.log(NOTHING_CHECKED);
    else console.log(`risks: ${result.risks.join(", ")}; approved by: ${result.approved_by.join(", ")}`);
    if (result.one_way) console.log(`ONE-WAY: ${String(result.one_way).replace(/\.+$/, "")}. Going back past this version needs the owner's confirmation.`);
    if (result.note) console.log(result.note);
    return 0;
  }
  if (result.status === "release_failed") {
    console.log(`recorded ${result.version}, but it did not go live (${result.reason}).`);
    console.log(NOTHING_CHECKED.replace("published it as it was", "tried to publish it as it was"));
    if (result.detail) console.log(result.detail);
    if (!String(result.detail ?? "").includes(result.address_note)) console.log(`${result.address_note}.`);
    if (REJECTION_HINTS[result.reason]) console.log(REJECTION_HINTS[result.reason]);
    console.log(releaseAgain(result.version));
    return 1;
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
      if (s.serving_version && s.serving_version !== s.active_version) {
        console.log(
          `the address serves ${s.serving_version}, not ${s.active_version}: the last release did not go live. Submitting with no new edits releases ${s.active_version} as it is.`,
        );
      }
      console.log(`previous: ${s.previous_version ? `${s.previous_version} (undo goes back here)` : "none (this is the first version)"}; owner: ${s.owner}; governance: ${s.governance}`);
      if (s.governance_note) console.log(s.governance_note);
      // A Host from before data snapshots sends no such field and has no one-way confirmation to describe.
      if (s.data_snapshot !== undefined) {
        console.log(
          s.data_snapshot
            ? `data snapshot: ${s.data_snapshot} (undo past a one-way change puts stored data back, with the owner's confirmation)`
            : "data snapshot: none (undo past a one-way change puts back code only, with the owner's confirmation)",
        );
      }
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
        // Absence of a guarantee means it was not guaranteed; an empty list means recorded only. A Host from
        // before the change record sends no list at all, and says nothing about guarantees.
        if (h.kind !== "snapshot" && Array.isArray(h.guarantees)) console.log(`    guarantees: ${h.guarantees.length ? h.guarantees.join(", ") : "none (recorded only)"}`);
        if (h.one_way) console.log(`    ONE-WAY: ${h.one_way.reason}`);
        if (h.data_ref) console.log(`    stored data saved: ${h.data_ref.capability} ${h.data_ref.ref}`);
        if (h.one_way_crossed) {
          const how = h.one_way_crossed.by === "data_restored" ? "stored data put back" : "code only, stored data left as it was";
          console.log(`    went back past one-way ${h.one_way_crossed.versions.join(", ")}: ${how}${h.confirmed_by ? `, confirmed by ${h.confirmed_by}` : ""}`);
          if (h.set_aside) console.log(`    ${h.set_aside}`);
        }
        if (h.address_note) console.log(`    address: ${h.address_note}`);
        if (h.kept_edits?.length) console.log(`    working tree left as it was (edited meanwhile): ${h.kept_edits.join(", ")}`);
      }
    });
    break;
  case "submit": {
    if (!args[0]) fail('submit takes "<one sentence: what the user asked for>"');
    if (flags.oneWay !== undefined && !String(flags.oneWay).trim()) fail('--one-way takes "<what putting files back would not undo>"');
    const result = await call("POST", `${base}/changes`, {
      intent: args.join(" "),
      agent: flags.agent ?? detectAgent(),
      ...(flags.oneWay !== undefined ? { one_way: flags.oneWay } : {}),
    });
    let code = result.status === "published" ? 0 : result.status === "needs_approval" ? 2 : 1;
    out(result, (data) => (code = printChange(data)));
    process.exit(code);
  }
  case "discard":
    out(await call("POST", `${base}/discard`, {}), (d) => console.log(`working tree is back at ${d.active_version}${d.restored.length ? `; restored: ${d.restored.join(", ")}` : ""}`));
    break;
  case "undo": {
    // Going back past a one-way change is the owner's decision, with or without its data, so it takes a
    // terminal, like approve: a speed bump, not a security boundary.
    if (flags.acceptOneWay && !process.stdin.isTTY) fail("--accept-one-way is the owner's decision and must be run by a person in a terminal");
    const payload = { reason: args.join(" ") || "undo", actor: flags.agent ?? detectAgent(), ...(flags.to ? { to: flags.to } : {}) };
    let { status, data } = await send("POST", `${base}/undo`, payload);
    if (flags.acceptOneWay && status === 409 && data.reason === "crosses_one_way_change") {
      console.log(data.error);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(confirmPrompt(data.data_restore)).catch(() => "");
      rl.close();
      if (answer.trim() !== "accept") fail("not confirmed; nothing changed");
      ({ status, data } = await send("POST", `${base}/undo`, { ...payload, accept_one_way: true, subject: process.env.PNEUMA_OWNER ?? "user:me" }));
    }
    if (status < 200 || status >= 300) fail(refusalText(data, `POST ${base}/undo answered ${status}`), refusalCode(data.reason));
    out(data, (d) => {
      // A Host from before multi-level undo sends no `undone`.
      console.log(`now on ${d.active_version} (was ${d.undone_version}) at ${d.address}.${d.undone?.length > 1 ? ` Went back past ${d.undone.join(", ")}.` : ""}`);
      if (d.data_restored) {
        console.log(`Stored data was put back from the snapshot saved before the one-way change${d.confirmed_by ? `, as ${d.confirmed_by} confirmed` : ""}. What was stored after that is not in the app.`);
        if (d.set_aside) console.log(d.set_aside);
      } else if (d.confirmed_by) console.log(`Code only; stored data was not put back, as ${d.confirmed_by} confirmed. This version may fail on it.`);
      else console.log("Code only; stored data was not rolled back.");
      if (d.note) console.log(d.note);
    });
    break;
  }
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
