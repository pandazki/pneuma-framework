#!/usr/bin/env node
// The artifact's own CLI. No dependencies; any Node >= 18 runs it. A copy lives in
// every app at .pneuma/pneuma.mjs, so whichever coding agent opens the directory
// can drive the governed loop without installing anything.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_HOST = "http://127.0.0.1:8090";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const USAGE = `usage: node .pneuma/pneuma.mjs <command> [--app <name>] [--agent <name>] [--host <url>] [--json]

  status [<name>]        active version, address, uncommitted files, changes waiting for the owner,
                         and what submit does in the mode this Host runs in
  history [<name>]       every attempt so far, oldest first, with what was guaranteed for each
  submit "<intent>"      take the working tree through this Host's loop and release it
    [--one-way "<what is lost>"]  record mode only: this change drops or rewrites stored data
  discard                put the working tree back to the active version
  undo "<why>"           go back one version; again to go further back
    [--to <version>]     go straight back to an earlier version
    [--accept-one-way]   owner only, in a terminal: confirm going back past a one-way change
  approve <change-id>    owner only, asks for confirmation in a terminal
  preview <change-id>    publish a waiting change's preview again once it has ended itself
  deny <change-id> [why] owner only
  create <name>          create and publish a new app (run from anywhere)
  list                   every app: version, address, last change, anything waiting for the owner
  guide [--write <file>] a short block for an agent's user-level instructions: where the Host and
                         the apps are, and the commands. --write puts it in <file> between markers.

In an app's directory, commands act on that app. Elsewhere, name it: status <name>, or --app <name>.

The Host's address: --host <url>, else PNEUMA_HOST, else the address the Host recorded in
.pneuma/host.json (here or in a directory above), else ${DEFAULT_HOST}.
PNEUMA_AGENT names the agent for the history; PNEUMA_OWNER is the owner subject (default user:me).`;

// The flags that take a value, and what to say when one is the last word with nothing after it. Without a value
// such a flag would be dropped silently: `undo --to` would go back one step, `submit --one-way` would submit
// without the declaration, `guide --write` would print instead of writing.
const VALUE_FLAGS = {
  "--app": ["app", "--app takes the app's name"],
  "--agent": ["agent", "--agent takes the agent's name"],
  "--to": ["to", "--to takes a version, e.g. v3"],
  "--host": ["host", "--host takes the Host's address, e.g. http://127.0.0.1:8090"],
  "--one-way": ["oneWay", '--one-way takes "<what putting files back would not undo>"'],
  "--write": ["write", "guide --write takes the file to put the block in"],
};

function parse(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--accept-one-way") flags.acceptOneWay = true;
    else if (Object.hasOwn(VALUE_FLAGS, arg)) {
      const [key, missing] = VALUE_FLAGS[arg];
      if (i + 1 >= argv.length) fail(missing);
      flags[key] = argv[++i];
    } else rest.push(arg);
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

/** 2026-11-23T22:48:12.345Z -> 2026-11-23 22:48 UTC */
const readableTime = (iso) => (typeof iso === "string" && iso.length >= 16 ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "an unknown date");

/**
 * The address a Host recorded for itself: .pneuma/host.json in the current directory or above, else
 * next to this copy of the CLI, else in the example's apps directory next to bin/.
 */
function findRecordedHost(start) {
  const files = [];
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    files.push(join(dir, ".pneuma", "host.json"));
    if (dirname(dir) === dir) break;
  }
  files.push(join(SCRIPT_DIR, "host.json"), join(SCRIPT_DIR, "..", "apps", ".pneuma", "host.json"));
  for (const file of files) {
    if (!existsSync(file)) continue;
    try {
      const record = JSON.parse(readFileSync(file, "utf8"));
      if (typeof record.url === "string" && record.url) return { ...record, file };
    } catch {
      // Not readable as a record: look further.
    }
  }
  return null;
}

/** The directory that holds the apps, by where a Host recorded its address: that directory itself, or the app directory in it. */
function appsDirOf(recorded) {
  if (!recorded?.file) return null;
  const dir = dirname(dirname(recorded.file));
  return recorded.scope === "apps" ? dir : recorded.scope === "app" ? dirname(dir) : null;
}

/** Where to find the Host, and a sentence saying where that address came from, for the error when it cannot be reached. */
function resolveHost(flag) {
  const clean = (url) => String(url).trim().replace(/\/+$/, "");
  const recorded = findRecordedHost(process.cwd());
  if (flag) return { url: clean(flag), source: "That address came from the --host flag.", recorded };
  if (process.env.PNEUMA_HOST) return { url: clean(process.env.PNEUMA_HOST), source: "That address came from PNEUMA_HOST.", recorded };
  if (recorded) {
    return { url: clean(recorded.url), source: `That address was recorded by the Host on ${readableTime(recorded.recorded_at)} in ${recorded.file}.`, recorded };
  }
  return {
    url: DEFAULT_HOST,
    source: "That address is the built-in default: there is no --host flag, no PNEUMA_HOST, and no .pneuma/host.json recorded by a Host here or above.",
  };
}

// The environment variables each coding agent sets in the shells it starts, and only those. A shell started from
// another agent's terminal inherits that agent's markers too, so two sets can be present at once. Other variables
// with the same prefix are set by a person or another tool (CODEX_HOME in a shell profile, CODEX_COMPANION_SESSION_ID
// from the Codex plugin for Claude Code) and say nothing about which agent runs this command.
const AGENT_MARKERS = [
  { agent: "claude-code", markers: (env) => ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"].filter((key) => env[key]) },
  { agent: "codex", markers: (env) => ["CODEX_THREAD_ID", "CODEX_TOOL_CALL_ID"].filter((key) => env[key]) },
];

/**
 * Who to name in the history, and where the name came from: the --agent flag, PNEUMA_AGENT, or the one
 * agent whose markers are set. With markers of more than one agent, nobody is guessed: the agent is
 * recorded as "unknown" with the candidates beside it, and the caller warns.
 */
function identifyAgent() {
  if (flags.agent?.trim()) return { name: flags.agent.trim(), source: "--agent" };
  if (process.env.PNEUMA_AGENT?.trim()) return { name: process.env.PNEUMA_AGENT.trim(), source: "PNEUMA_AGENT" };
  const found = AGENT_MARKERS.map(({ agent, markers }) => ({ agent, markers: markers(process.env) })).filter((candidate) => candidate.markers.length);
  if (found.length === 1) return { name: found[0].agent, source: "detected", markers: found[0].markers };
  if (found.length > 1) return { name: "unknown", source: "ambiguous", candidates: found };
  return { name: "unknown", source: "none" };
}

/** "codex (from PNEUMA_AGENT)": the recorded agent and where its name came from, in words. */
function describeAgent(agent) {
  switch (agent?.source) {
    case "--agent":
      return `${agent.name} (from the --agent flag)`;
    case "PNEUMA_AGENT":
      return `${agent.name} (from PNEUMA_AGENT)`;
    case "detected":
      return `${agent.name} (detected from ${agent.markers.join(", ")})`;
    case "ambiguous":
      return `unknown (markers of more than one agent are set: ${agent.candidates.map((c) => `${c.agent} from ${c.markers.join(", ")}`).join("; ")})`;
    case "none":
      return "unknown (no --agent, no PNEUMA_AGENT, and no agent's markers in the environment)";
    default:
      return agent?.name ?? "unknown";
  }
}

// `recorded` says what the entry keeps: submit sends the candidates, undo sends only a name.
const AMBIGUOUS_AGENT = (agent, recorded) =>
  `warning: markers of more than one agent are set (${agent.candidates.map((c) => `${c.agent}: ${c.markers.join(", ")}`).join("; ")}), ` +
  `so ${recorded}. Say which agent you are with --agent <name> or PNEUMA_AGENT=<name>.`;

/** The agent fields of a request body: the name, where it came from, and what detection saw. */
function agentFields(agent) {
  return {
    agent: agent.name,
    agent_source: agent.source,
    ...(agent.markers ? { agent_markers: agent.markers } : {}),
    ...(agent.candidates ? { agent_candidates: agent.candidates } : {}),
  };
}

// node:http, not fetch: undici stops waiting for response headers after 300 s, and the Host holds
// create, submit, approve and undo open for the whole `npm ci && npm test` (up to 600 s). So no
// timeout of any kind here, and agent: false keeps Node's global agent and its 5 s socket timeout out of it.
function request(method, url, payload) {
  return new Promise((settle) => {
    // Every request that changes something carries a JSON body and says so: the Host refuses a write
    // without `content-type: application/json`, which is one of the things a web page cannot send it.
    const body = payload ? JSON.stringify(payload) : method === "GET" ? undefined : "{}";
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
        res.on("end", () =>
          res.complete ? settle({ status: res.statusCode, level: res.headers["pneuma-host-api"], text: Buffer.concat(chunks).toString("utf8") }) : lost(aborted()),
        );
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
  plan_changed: 'Nothing changed. Run the same undo again to see what going back does now, then confirm that.',
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

// The level of the Host's API this CLI is written for. The Host sends its own in the `pneuma-host-api` header of
// every answer (src/server.ts). Raise both together when this CLI starts to rely on something a Host at the level
// before does not send; a Host from before levels sends none.
const HOST_API_LEVEL = 2;
let hostLevelChecked = false;

async function send(method, path, payload) {
  // A request that changes something is never the first one: nothing is changed on a Host this CLI cannot read.
  if (method !== "GET" && !hostLevelChecked) await call("GET", "/healthz");
  let url;
  try {
    url = new URL(`${HOST}${path}`);
  } catch {}
  if (url?.protocol !== "http:" && url?.protocol !== "https:") fail(`the Host address must be an http:// or https:// address, not "${HOST}". ${HOST_SOURCE}`, 3);
  const { err, connected, status, level, text } = await request(method, url, payload);
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
    // Not "the stack is down": the Host may well be running, on another address than the one tried.
    fail(
      `cannot reach the Host at ${HOST} (${code}). ${HOST_SOURCE} The Host may be running on another address, or not running. ` +
        "Ask the user for its address, then pass --host <url> or set PNEUMA_HOST.",
      3,
    );
  }
  if (status >= 200 && status < 300 && !hostLevelChecked) {
    if (!(Number(level) >= HOST_API_LEVEL)) fail(`the Host at ${HOST} is older than this CLI; rebuild it: docker compose up -d --build`, 3);
    hostLevelChecked = true;
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
  preview_refused: "Do not change the code for this: nothing was found wrong with it. Show this to the user.",
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

// A waiting change's preview, as the Host asked PneumaSpace for it: an ephemeral app that ends itself. When PneumaSpace
// did not answer, the preview may still stand: that is said as unknown, and nothing is suggested that would replace it.
function previewLine(preview, changeId) {
  if (preview.state === "standing") return `preview: ${preview.address}${preview.expires_at ? ` (it ends itself at ${readableTime(preview.expires_at)})` : ""}`;
  if (preview.state === "unknown") return `preview: unknown; ${preview.note}. Nothing was changed; ask again in a minute.`;
  return `preview: none standing; ${preview.note}. Publish it again with: node .pneuma/pneuma.mjs preview ${changeId}`;
}

function printChange(result, appName) {
  if (result.status === "published") {
    console.log(`published ${result.version} at ${result.address}`);
    if (result.released_as_is) console.log(`${result.version} was recorded earlier and did not go live then; it went live now, as it was. No new version was recorded.`);
    if (result.changed_paths.length) console.log(`changed: ${result.changed_paths.join(", ")}`);
    if (result.guarantees.length === 0) console.log(NOTHING_CHECKED);
    else console.log(`risks: ${result.risks.join(", ")}; approved by: ${result.approved_by.join(", ")}`);
    if (result.one_way) console.log(`ONE-WAY: ${String(result.one_way).replace(/\.+$/, "")}. Going back past this version needs the owner's confirmation.`);
    if (result.note) console.log(result.note);
    if (result.test_warning) console.log(result.test_warning);
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
    if (result.test_warning) console.log(result.test_warning);
    if (result.preview) console.log(previewLine(result.preview, result.change_id));
    const look = result.preview ? "They can open the preview, then decide with" : "They decide with";
    console.log(`Show this to the owner. ${look}: node .pneuma/pneuma.mjs approve ${result.change_id}   (or deny)`);
    // The other way, for the owner only: the Host's page, in a browser that opened the owner link the Host printed at start.
    if (appName) console.log(`Or on the Host's page, opened from the owner link the Host printed when it started: ${HOST}/app/${appName}/change/${result.change_id}`);
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
const { url: HOST, source: HOST_SOURCE, recorded: RECORDED } = resolveHost(flags.host);

/** Two addresses of one Host: the same scheme, port and host name, with localhost, 127.0.0.1 and [::1] taken as one name. */
function sameHost(a, b) {
  try {
    const [x, y] = [new URL(a), new URL(b)];
    const name = (url) => (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ? "loopback" : url.hostname);
    return x.protocol === y.protocol && x.port === y.port && name(x) === name(y);
  } catch {
    return false;
  }
}

// Where the apps live, by the record nearest to here; only when that record is of the Host in use, which
// --host or PNEUMA_HOST may have pointed elsewhere. A record can also be stale (the apps directory moved), so
// create and guide check the directory against what the Host says before they name it.
const APPS_DIR = RECORDED && sameHost(RECORDED.url, HOST) ? appsDirOf(RECORDED) : null;
const out = (data, human) => (flags.json ? console.log(JSON.stringify(data, null, 2)) : human(data));

if (!command || command === "help" || command === "--help") {
  console.log(USAGE);
  process.exit(command ? 0 : 1);
}

// The summaries come from files an agent can write, so a field may be missing or of another type.
const clip = (value, max = 80) => {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const items = (value) => (Array.isArray(value) ? value : []);

/** Every app in a few lines each: version and address, then only what deserves a look. */
function printApps({ governance, apps }) {
  if (!apps.length) {
    console.log("no apps yet. Create one with: node .pneuma/pneuma.mjs create <name>");
    return;
  }
  const waiting = apps.flatMap((app) => items(app.pending).map(() => app.app_id));
  console.log(
    `${apps.length} app${apps.length === 1 ? "" : "s"} on the Host at ${HOST}, in ${governance} mode. ` +
      (waiting.length ? `Waiting for the owner: ${waiting.length} change${waiting.length === 1 ? "" : "s"} (${[...new Set(waiting)].join(", ")}).` : "Nothing waits for the owner."),
  );
  const width = Math.max(...apps.map((app) => app.app_id.length));
  for (const app of apps) {
    console.log("");
    if (app.error) {
      console.log(`${app.app_id.padEnd(width)}  could not be read: ${app.error}`);
      continue;
    }
    console.log(`${app.app_id.padEnd(width)}  ${app.active_version ?? "unpublished"}  ${app.address}`);
    const last = app.last_change;
    if (last) console.log(`  last change ${readableTime(last.at)} by ${clip(last.agent, 40)}: "${clip(last.intent)}" (${last.kind} ${last.outcome}${last.version ? ` ${last.version}` : ""})`);
    for (const p of items(app.pending)) console.log(`  waiting for the owner: ${p.change_id} "${clip(p.intent)}" (${items(p.risks).join(", ")})`);
    for (const line of items(app.malformed_pending)) console.log(`  ${line}`);
    if (items(app.uncommitted).length) console.log(`  uncommitted: ${clip(app.uncommitted.join(", "), 100)}`);
    // As status says it, whatever the versions are: the line says why the Host cannot vouch, and assumes nothing more.
    if (app.serving_uncertain) console.log(`  the Host cannot vouch for what the address serves: ${app.serving_uncertain}`);
    else if (app.serves_other_version) console.log(`  the address serves ${app.serving_version}, not ${app.active_version}: the last release did not go live`);
  }
}

if (command === "list") {
  out(await call("GET", "/apps"), printApps);
  process.exit(0);
}

const GUIDE_BEGIN = "<!-- pneuma-apps:begin (written by pneuma.mjs guide; guide --write replaces this block) -->";
const GUIDE_END = "<!-- pneuma-apps:end -->";

/**
 * Where the marked block is in `text`: the first end marker after a begin marker, and the begin marker nearest
 * before it. A stray marker of either kind elsewhere in the file stays where it is, with the text around it.
 * Null when there is no such block. (src/artifact.ts finds the Host's own block the same way.)
 */
function markedBlock(text, beginMarker, endMarker) {
  const first = text.indexOf(beginMarker);
  const end = first === -1 ? -1 : text.indexOf(endMarker, first + beginMarker.length);
  return end === -1 ? null : { begin: text.lastIndexOf(beginMarker, end - beginMarker.length), end };
}

/** A self-contained block for an agent's user-level instructions, so any session can answer "what apps do I have?". */
function guideBlock(appsDir) {
  const own = join(appsDir, ".pneuma", "pneuma.mjs");
  const cli = existsSync(own) ? own : fileURLToPath(import.meta.url);
  // Every path in single quotes, as a POSIX shell takes it literally, so a command copied from the block works
  // in a directory whose name has a space or any other character the shell would read.
  const quoted = (path) => `'${path.replaceAll("'", `'\\''`)}'`;
  const run = (args) => `\`node ${quoted(cli)} ${args}\``;
  return [
    GUIDE_BEGIN,
    "## My apps (pneuma Host)",
    "",
    `Small apps on this machine are kept and published by a pneuma Host at ${HOST}. The app directories are in ${quoted(appsDir)}, one directory per app.`,
    "",
    `- What apps do I have: ${run("list")}. It shows each app's version, address, last change, and any change waiting for me.`,
    `- One app in full: ${run("status <name>")} and ${run("history <name>")}.`,
    `- A new app: ${run("create <name>")}.`,
    `- To change an app, work in its directory (${quoted(join(appsDir, "<name>"))}) and follow its AGENTS.md. A change goes live only through that app's own submit. A change that waits for me is mine to approve, in a terminal.`,
    `- If the Host cannot be reached at that address, ask me where it runs and add --host <url>.`,
    GUIDE_END,
  ].join("\n");
}

if (command === "guide") {
  if (!APPS_DIR) {
    fail("guide needs to know where the apps live: run it in the apps directory, in an app's directory, or as bin/pneuma.mjs next to the example's apps/ once the Host has started");
  }
  // The block names this directory as the Host's, so every app the Host lists must be in it.
  const { apps } = await call("GET", "/apps");
  const missing = items(apps).map((a) => String(a.app_id)).filter((name) => !existsSync(join(APPS_DIR, name, ".pneuma", "app.json")));
  if (missing.length) {
    fail(
      `the apps directory found here (${APPS_DIR}) does not hold the apps of the Host at ${HOST} (not there: ${missing.join(", ")}). ` +
        "Its address record may be from before the apps directory moved. Run guide in the Host's apps directory, or in one of its apps.",
    );
  }
  const block = guideBlock(APPS_DIR);
  if (flags.write === undefined) {
    console.log(block);
    process.exit(0);
  }
  if (!flags.write) fail("guide --write takes the file to put the block in");
  // Only the file named, and only the marked block in it; nothing else is read or written.
  const file = resolve(flags.write);
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  const at = markedBlock(existing, GUIDE_BEGIN, GUIDE_END);
  const replaced = at !== null;
  const next = at
    ? `${existing.slice(0, at.begin)}${block}${existing.slice(at.end + GUIDE_END.length)}`
    : `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${existing ? "\n" : ""}${block}\n`;
  try {
    writeFileSync(file, next);
  } catch (err) {
    fail(`could not write ${file}: ${err.message}`);
  }
  console.log(`${replaced ? "replaced the pneuma block in" : existing ? "added the pneuma block to" : "wrote the pneuma block to"} ${file}`);
  process.exit(0);
}

if (command === "create") {
  if (!args[0]) fail("create takes <name>");
  const result = await call("POST", "/apps", { name: args[0] });
  let code = 0;
  out(result, (data) => {
    code = printChange(data);
    if (data.status === "published") {
      // Named only when the Host's app is there: the record found here may be stale.
      console.log(
        APPS_DIR && existsSync(join(APPS_DIR, args[0], ".pneuma", "app.json"))
          ? `The app directory is ${join(APPS_DIR, args[0])}. Open it with your coding agent.`
          : `The app directory is ${args[0]}/ in the Host's apps directory (apps/ next to the compose file, unless PNEUMA_APPS_DIR moved it). Open it with your coding agent.`,
      );
    }
  });
  process.exit(flags.json ? (result.status === "published" ? 0 : 1) : code);
}

// status and history take the app's name as a word too, so they work from the directory that holds the apps.
const named = (command === "status" || command === "history") && args[0] ? args[0] : undefined;
const app = flags.app ?? named ?? findApp(process.cwd());
if (!app) fail("not inside an app directory (no .pneuma/app.json found here or above). Name the app with --app <name> (status and history also take it as a word); list shows every app.");
const base = `/apps/${app}`;

switch (command) {
  case "status":
    out(await call("GET", base), (s) => {
      console.log(`${s.app_id}: ${s.active_version ?? "unpublished"} at ${s.address}`);
      // The Host cannot vouch for what the address serves: say so whatever the versions are, and say nothing that assumes one.
      if (s.serving_uncertain) console.log(`the Host cannot vouch for what the address serves: ${s.serving_uncertain}`);
      else if (s.serving_version && s.serving_version !== s.active_version) {
        console.log(`the address serves ${s.serving_version}, not ${s.active_version}: the last release did not go live. Submitting with no new edits releases ${s.active_version} as it is.`);
      }
      console.log(`previous: ${s.previous_version ? `${s.previous_version} (undo goes back here)` : "none (this is the first version)"}; owner: ${s.owner}; governance: ${s.governance}`);
      console.log(s.governance_note);
      console.log(
        s.data_snapshot
          ? `data snapshot: ${s.data_snapshot} (undo past a one-way change puts stored data back, with the owner's confirmation)`
          : "data snapshot: none (undo past a one-way change puts back code only, with the owner's confirmation)",
      );
      console.log(`on PneumaSpace: ${s.space_manager.note}`);
      console.log(`uncommitted: ${s.uncommitted.length ? s.uncommitted.join(", ") : "none"}`);
      for (const p of s.pending) {
        console.log(`waiting for the owner: ${p.change_id} "${p.intent}" (${p.risks.join(", ")})`);
        for (const line of p.disclosure) console.log(`  - ${line}`);
        if (p.preview) console.log(`  ${previewLine(p.preview, p.change_id)}`);
      }
      for (const line of s.malformed_pending ?? []) console.log(line);
    });
    break;
  case "history":
    out(await call("GET", `${base}/history`), ({ history }) => {
      for (const h of history) {
        const where = h.version ? ` -> ${h.version}` : "";
        const why = h.reason ? ` (${h.reason})` : "";
        console.log(`${h.at} ${h.kind} ${h.outcome}${where} by ${h.agent} [${h.control}]: ${h.intent}${why}`);
        if (h.agent_candidates?.length) {
          console.log(`    agent unknown: markers of more than one agent were set (${h.agent_candidates.map((c) => `${c.agent}: ${c.markers.join(", ")}`).join("; ")})`);
        }
        if (h.changed_paths?.length) console.log(`    files: ${h.changed_paths.join(", ")}`);
        if (h.approval) console.log(`    approval: ${h.approval.reason_code} by ${h.approval.by.join(", ") || "nobody yet"} (${h.risks?.join(", ") ?? ""})`);
        const tests = h.checks?.find((check) => check.id === "npm-test");
        if (tests?.coverage) console.log(`    tests (${tests.status}): ${tests.coverage.note}`);
        // Absence of a guarantee means it was not guaranteed; an empty list means recorded only.
        if (h.kind !== "snapshot") console.log(`    guarantees: ${h.guarantees.length ? h.guarantees.join(", ") : "none (recorded only)"}`);
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
    const agent = identifyAgent();
    // On stderr, so that --json output stays one JSON document.
    if (agent.source === "ambiguous") console.error(`pneuma: ${AMBIGUOUS_AGENT(agent, 'this is recorded as agent "unknown", with those candidates kept in the entry')}`);
    const result = await call("POST", `${base}/changes`, {
      intent: args.join(" "),
      ...agentFields(agent),
      ...(flags.oneWay !== undefined ? { one_way: flags.oneWay } : {}),
    });
    let code = result.status === "published" ? 0 : result.status === "needs_approval" ? 2 : 1;
    out(result, (data) => {
      code = printChange(data, app);
      console.log(`recorded agent: ${describeAgent(data.agent)}`);
    });
    process.exit(code);
  }
  case "discard":
    out(await call("POST", `${base}/discard`, {}), (d) => console.log(`working tree is back at ${d.active_version}${d.restored.length ? `; restored: ${d.restored.join(", ")}` : ""}`));
    break;
  case "undo": {
    // Going back past a one-way change is the owner's decision, with or without its data, so it takes a
    // terminal, like approve: a speed bump, not a security boundary.
    if (flags.acceptOneWay && !process.stdin.isTTY) fail("--accept-one-way is the owner's decision and must be run by a person in a terminal");
    const actor = identifyAgent();
    if (actor.source === "ambiguous") console.error(`pneuma: ${AMBIGUOUS_AGENT(actor, 'this undo is recorded as done by "unknown"')}`);
    const payload = { reason: args.join(" ") || "undo", actor: actor.name, ...(flags.to ? { to: flags.to } : {}) };
    let { status, data } = await send("POST", `${base}/undo`, payload);
    if (flags.acceptOneWay && status === 409 && data.reason === "crosses_one_way_change") {
      console.log(data.error);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(confirmPrompt(data.data_restore)).catch(() => "");
      rl.close();
      if (answer.trim() !== "accept") fail("not confirmed; nothing changed");
      // The confirmation covers the plan just shown: the Host refuses it once the app has moved on from where that plan started.
      ({ status, data } = await send("POST", `${base}/undo`, { ...payload, accept_one_way: true, subject: process.env.PNEUMA_OWNER ?? "user:me", ...(data.from ? { from: data.from } : {}) }));
    }
    if (status < 200 || status >= 300) fail(refusalText(data, `POST ${base}/undo answered ${status}`), refusalCode(data.reason));
    out(data, (d) => {
      console.log(`now on ${d.active_version} (was ${d.undone_version}) at ${d.address}.${d.undone.length > 1 ? ` Went back past ${d.undone.join(", ")}.` : ""}`);
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
    if (pending.preview) console.log(previewLine(pending.preview, args[0]));
    // Approving releases what the owner could look at; the Host refuses it too, this only saves typing. Not while the
    // Host cannot vouch for what the address serves: it may refuse the approval for that, and a new preview would not help.
    if (command === "approve" && !status.serving_uncertain && pending.preview?.state === "gone") fail("nobody can look at what approving would release; publish the preview again first, look at it, then approve", 3);
    if (command === "approve" && !status.serving_uncertain && pending.preview?.state === "unknown") fail("whether the preview still stands is unknown, so approving waits; nothing changed. Ask again in a minute: run approve again", 3);
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
  case "preview": {
    if (!args[0]) fail("preview takes <change-id>");
    out(await call("POST", `${base}/changes/${args[0]}/preview`, {}), (d) => {
      console.log(d.republished ? `published the preview of ${d.change_id} again.` : `the preview of ${d.change_id} still stands; nothing was published.`);
      console.log(previewLine(d.preview, d.change_id));
    });
    break;
  }
  default:
    fail(`unknown command "${command}"\n${USAGE}`);
}
