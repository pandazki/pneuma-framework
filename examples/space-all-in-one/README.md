# space-all-in-one

A headless Creation Host on [PneumaSpace](https://github.com/pandazki/pneuma-space). One `docker compose up` gives a coding agent you already use (Claude Code, Codex) a place to publish small stateful apps on your own machine and to keep changing them under the framework's governed loop.

[中文版](./README.zh-CN.md)

The example answers two questions the other examples leave to the Host author:

- **Where does the Published Application run?** On PneumaSpace: an app is a directory and a manifest, publishing is an upload, an idle app sleeps and its data outlives every release.
- **Who drives the loop?** Either side. The same loop runs agent-driven (the agent edits and submits) and host-driven (the Host starts the agent), over the same app directory.

## Status

Run end to end on 2026-11-23 on macOS with colima (Docker 29.5, Compose 5.7, buildx 0.38) and again with Docker Desktop (Docker 29.9), Bun 1.4.5, Node 26 on the machine and Node 24 in the image, Claude Code 2.1.330 and codex-cli 0.167.0.

The rows at the end of the table cover the Host's move onto the framework's change record and the data snapshot practice. They were run later the same day on the colima stack, against the app directories the earlier run left behind and two new apps.

| What was run | Result |
| --- | --- |
| `bun run typecheck` and `bun test` for the whole repository | Pass. The offline tests here use an in-memory PneumaSpace and scripted agent CLIs. |
| `docker compose up -d --build`, from the pinned commit and from a local checkout | Five services up, gateway healthy. |
| `create` | `appctl init` in the container, `npm ci && npm test`, preview boot, release. About 14 s. |
| Agent-driven, Claude Code (`claude -p` in the app directory) | Read `status` and `history`, edited, ran the tests, submitted. Published without being told the protocol and without calling `appctl`. |
| Agent-driven, Codex (`codex exec` in the app directory) | The same, after two fixes the run forced: the protocol now comes first in `AGENTS.md`, and the sandbox needs network access (below). |
| Protected paths | Codex's first attempt edited `public/ui.css` and `public/ui.js`; `submit` answered `rejected (protected_file_changed)` and nothing was released. |
| A risky change ("drop the `created_at` column") | `needs_approval`. Claude Code stopped and relayed the disclosure. `approve` refused to run without a terminal, and the Host answered 403 to `agent:claude-code` and to `policy:auto`. Approved at the terminal prompt as `user:me`, it was released as the next version. A later one was denied the same way; the Host answered 403 to a deny from `agent:codex` and from `policy:auto`. |
| The boundary of a change | A file outside the writable roots: `rejected (outside_writable_roots)`. A test that wrote a new source file and rewrote a protected one while it ran: the change was released without either, and the working tree was not touched. |
| Host-driven lanes: `scripted`, `claude-code`, `codex` | Each published a version and brought the working tree up to date. |
| `undo`, `discard`, a submit after an undo | Address, working tree and history all moved together. |
| Linux file ownership | Reproduced on a Linux-native bind mount (a directory inside the colima VM): a Host running as root left files the machine's user could not edit. The Host now starts as the owner of the apps directory; with that, create, submit and undo left every file owned by the user. |
| App directories from the run above, opened by this Host | Both were put on the change record with their version and history intact, and the earlier column drop was declared one-way. The run found one bug: each directory carried the earlier Host's CLI, which sent `undo --to v4` as a plain undo. The Host now replaces a stale copy when it opens the app. |
| `record` mode: submit, a build that does not answer, undo | A new app and a change were published as recorded only. A change with a syntax error was recorded as `release_failed (published_unhealthy)`, the address went back to the version before, and the command exited 1. `undo` returned to that version. Rerun on the final code with the runner paused, so the build could not answer: the version was recorded and not live, and `status` said the address could not be put back rather than naming a version. With the runner back, the same `submit` with no new edits released that version as it was and recorded no new one. The same was done across modes: a version left unreleased in `record` mode went through the checks, the preview and the standing policy when submitted with no edits in `personal` mode. A publish the platform refuses outright was not run live. |
| `undo` several times in a row, and `undo --to` | v21, v20, v19 one step at a time, then `--to v16` in one step. The address answered after each. `--to v21` from v16 was refused: it is not a version v16 was built on. |
| `undo` after an approved column drop, no snapshot (the app from the earlier run, on SQLite) | Refused, saying only the code would come back and the older version may fail on today's data. `--accept-one-way` without a terminal was refused. The owner's confirmation in this case was not run live. |
| Practice `postgres-template` on the stack: `--profile postgres`, `db_backend` set to `postgres`, an app's first database lands on PostgreSQL | A new app got its database on PostgreSQL when a Claude Code change first declared `db`. Two rows were written through the app. |
| Practice `postgres-template`: an approved column drop takes a snapshot first; `undo` is refused, saying the data returns to that snapshot | Claude Code relayed the disclosure, including what approving costs, and stopped. On approval the Host created the snapshot database, then released. An unconfirmed `undo` was refused and named the snapshot, its time and where the replaced data would go. Rerun on the final code: the snapshot database carried the capability's mark. A history line forged to point at an older, unmarked snapshot of the same app was refused after the owner confirmed and before anything was published. |
| Practice `postgres-template`: the owner confirms; the column and the earlier rows come back, later rows sit in the replaced database | As described. The dropped column and both earlier rows were back, the row written after the drop was in the renamed database, and the app answered a signed-in request and accepted a new row. Rerun on the final code, twice, with a signed-in request every half second throughout: one request answered 500 while the older code ran on the newer data, every other one answered 200, the column was not dropped a second time, and the second probe did not time out on the cold start. |

Not run live: a Linux machine as a whole (only the Host side was checked, on the VM's own filesystem), and the gateway without the Docker socket. The changes made after the first-run trial in pandazki/pneuma-framework#3 were run on the stack. With the Host moved to another port, `status` worked from an app directory with nothing exported, and the unreachable message named the address it tried and where that address came from. `list`, run from the apps directory by the CLI copy the Host keeps there, summarised four apps. The overview page answered with all four and no script. A write carrying a browser's `Origin`, a `text/plain` write, and a read under another host name were each refused. A submit with markers of two agents was recorded as `unknown` with both candidates, and its history entry says that eleven SDK tests ran and none of the app's own. Not run live: a second stack beside the first (checked with `docker compose config` only), an agent answering from the `guide` block, and the page in a browser (it was fetched, not rendered).

A change takes 10 to 15 s on that machine when the standing policy approves it. Most of it is `npm ci` and one bundle upload.

## Run it (agent-driven)

Needs Docker with a recent Compose (the Host image uses additional build contexts) and any Node 18+ on the machine for the artifact CLI.

```sh
cd examples/space-all-in-one
docker compose up -d --build            # PneumaSpace + the Host; first build pulls node:24, redis, rustfs
node bin/pneuma.mjs create todo         # copies the PneumaSpace template, verifies, previews, publishes v1
open http://127.0.0.1:8080/apps/todo/
open http://127.0.0.1:8090/             # the Host's overview page: every app, its history, what waits for you
```

Then open `apps/todo/` with your agent and ask for a change:

```sh
cd apps/todo
claude        # or: codex
> add a todo list stored in the database, with a form to add items
```

`AGENTS.md` in the directory (Claude Code reads it through `CLAUDE.md`) opens with the whole protocol: edit in place, then `node .pneuma/pneuma.mjs submit "<what was asked>"`. The PneumaSpace guide follows it. The order matters: the guide ends with "publish with `appctl`", and with the protocol appended after it Codex edited the files, never submitted, and touched two protected ones. In the default `personal` mode the Host copies the working tree, checks the diff against the protected paths, runs `npm ci --ignore-scripts && npm test`, boots the draft on PneumaSpace under a throwaway name, has the change approved, and only then releases it under the app's stable address.

`npm test` in a new app runs the SDK's tests and the app's own. The template's script runs only `node --test 'sdk/*.test.ts'`, so at `create` the Host appends `'src/**/*.test.ts'`, which matches nothing until the first test exists (the template is to do this itself: pandazki/pneuma-space#35). `AGENTS.md` asks for a test with every change in behaviour and shows the smallest one that sends the app a real request. Each entry's `npm-test` check records how many tests ran and how many of them are the app's own. Skipped and todo tests did not run and are not counted. To tell the two apart the Host asks Node's test runner for a JUnit report beside its usual output, through `NODE_OPTIONS`. With Node older than 24, with a test script that picks its own reporter, or with another test runner, the app's share is recorded as unknown, and the check passes or fails exactly as it would without the report. When a change touches `src/` or `public/app/` and none of the app's own tests ran, `submit` says so in one line, and names any test file under `src/` that did not run. `history` shows what ran. Neither blocks the change.

Switch agents whenever you like. Nothing about the app lives in the agent's session.

`submit` prints the agent it recorded and where the name came from: `--agent`, `PNEUMA_AGENT`, or the environment variables the agent sets in its shells (`CLAUDECODE` or `CLAUDE_CODE_ENTRYPOINT` for Claude Code, `CODEX_*` for Codex). An agent started from another agent's terminal inherits that agent's variables too. With both sets present and nothing naming the agent, `submit` warns, records the agent as `unknown` with both candidates in the entry, and still submits. Set `PNEUMA_AGENT` or pass `--agent` to name it.

Codex needs one setting. Its default sandbox blocks loopback connections, so `npm test` cannot open its port and `submit` cannot reach the Host. Start it with `codex -c sandbox_workspace_write.network_access=true`, or approve the command when it asks. Without either, Codex edits the files, reports that the sandbox stopped the submit, and nothing is released. Claude Code asks before it runs `npm` and `node`; allow both.

```sh
node .pneuma/pneuma.mjs list            # every app: version, address, last change, anything waiting for you
node .pneuma/pneuma.mjs status          # active version, address, uncommitted files, anything waiting for you
node .pneuma/pneuma.mjs history         # every attempt: who, what was asked, risks, who approved, result
node .pneuma/pneuma.mjs undo "why"      # back one version; run it again to go further back
node .pneuma/pneuma.mjs undo --to v2 "why"   # straight back to an earlier version
node .pneuma/pneuma.mjs approve <id>    # you, in a terminal, for a risky change
```

### What apps do I have?

`list` answers in one call: how many apps, each one's version and address, the last change (when, by which agent, what was asked), changes waiting for the owner, files changed but not submitted, and an address that serves something other than the current version. `GET /apps` on the Host returns the same, and `list --json` prints it.

The directory that holds the apps describes itself, for an agent started there. When the Host starts, it writes into it a marked block in `AGENTS.md` (and a `CLAUDE.md` holding `@AGENTS.md`, unless one exists), a copy of the CLI at `.pneuma/pneuma.mjs`, and its own address in `.pneuma/host.json`. The block says what the directory is, gives the Host's address and the commands, and says that a change to an app goes through that app's own protocol. Each file is rewritten only when it is stale, and text outside the block is kept. From there, `node .pneuma/pneuma.mjs list`, `create <name>`, `status <name>` and `history <name>` work with no app selected.

For an agent started anywhere else, run `node .pneuma/pneuma.mjs guide` in the apps directory. It prints a short block to paste into the agent's user-level instructions: the Host's address, where the apps are, and the commands with full paths. It asks the Host for its apps first and refuses when one of them is not in that directory, which is what an address record left behind by a move of `PNEUMA_APPS_DIR` looks like. `guide --write <file>` adds that block to the file you name, between begin and end markers, and replaces it on later runs. It writes no other file. Nothing in this example touches an agent's user-level instructions unless you name that file to `guide --write`.

### The overview page, and the PneumaSpace console

The Host serves a read-only page at its own address, http://127.0.0.1:8090/ by default. It shows every app with the summary `list` gives, each app's status and its whole history (intent, agent, risks, approver, guarantees, one-way marks, what the tests covered), and each change waiting for the owner with its disclosure and the exact terminal command to decide it. The page has no script and no form, and its Content-Security-Policy allows neither: approving, denying and undoing stay in a terminal. Every value an agent or a person wrote is escaped. It links to each app's address and to the PneumaSpace console.

Opening the Host's port in a browser means any other page in that browser can send requests to it, and the Host has no login. So the Host refuses what only a browser would send: a request that changes anything must not carry `Origin` or `Sec-Fetch-Site` and must say `content-type: application/json`, and every request must name the Host by this machine's name or by `PNEUMA_HOST_URL`. The CLI passes all three. This keeps a web page from creating, submitting, approving or undoing; it is not authentication, and a program on the machine can still do all of those.

The PneumaSpace console is PneumaSpace's own admin page, at http://127.0.0.1:8081/ (`PNEUMA_SPACE_ADMIN_PORT`). It opens without a login and shows the platform's side of each app: runtime, asleep or awake, release number, requests. These of its actions go around the Host: removing an app, purging it and its data, changing its access or its policy, and publishing a new bundle over an existing app. After any of them, the Host's history and rollout state no longer match what is live, so do not use them on apps this Host manages. PneumaSpace cannot yet mark an app as managed elsewhere (pandazki/pneuma-space#36).

To build PneumaSpace from a local checkout instead of the pinned commit, copy `.env.example` to `.env` and set `PNEUMA_SPACE_CONTEXT` to the checkout's path.

On Linux the Host has to write app files as you, or your agent cannot edit them. It does this by itself: started as root, it becomes whoever owns the mounted apps directory (`host-entrypoint.sh`). The repository ships an empty `apps/` so that the directory is yours before Docker mounts it. If you point `PNEUMA_APPS_DIR` somewhere else, create that directory yourself first; a directory Docker has to create belongs to root. Docker Desktop is not needed on Linux: Docker Engine with the Compose and buildx plugins is enough.

## Running beside other services

The stack listens on four ports, all on 127.0.0.1. When one is taken, set another in `.env`:

| Variable | Default | What listens there |
| --- | --- | --- |
| `PNEUMA_SPACE_HTTP_PORT` | 8080 | the apps, at `/apps/<name>/` |
| `PNEUMA_SPACE_ADMIN_PORT` | 8081 | the PneumaSpace console and admin API |
| `PNEUMA_SPACE_OBJECT_PORT` | 9000 | the object store |
| `PNEUMA_HOST_PORT` | 8090 | the Host: its overview page and the API the CLI calls |

The CLI finds the Host by itself. Compose tells the Host its address (`PNEUMA_HOST_URL`, built from `PNEUMA_HOST_PORT`), and the Host records it in `.pneuma/host.json` in the apps directory and in every app, when it starts and when it creates or opens an app. An agent in an app's directory or in the apps directory needs nothing exported. `node bin/pneuma.mjs` in this directory reads the address recorded in `apps/` once the Host has started; with the apps directory elsewhere, run the copy in that directory, or name the Host. The CLI takes, in order: `--host <url>`, `PNEUMA_HOST`, the recorded address, `http://127.0.0.1:8090`. When it cannot reach the Host, it says which address it tried and where that address came from. At start the Host also brings every app's copy of the CLI up to its own, because a copy from an earlier Host does not read the record. It does not rewrite an existing app's `AGENTS.md`, which is versioned with the app. So an app created before this keeps the old sentence there, which says the stack is down when the Host cannot be reached; the CLI's message says what it tried.

The PneumaSpace console is at `http://127.0.0.1:<PNEUMA_SPACE_ADMIN_PORT>/`. It is PneumaSpace's own admin page, not the Host's; see above for which of its actions go around the Host.

A second stack beside the first needs its own compose project name, Docker network name, ports and apps directory. The network name appears twice in `compose.yaml`, as the network's name and as the gateway's `PNEUMA_SPACE_NETWORK`; the variable `PNEUMA_SPACE_NETWORK` sets both. From a second checkout of the repository (`git worktree add`, for instance), these lines go in that checkout's `.env`. From the same checkout, put them in another file and pass it to every `docker compose` command for that stack with `--env-file`; that file replaces `.env` for the command, so repeat any line of `.env` you rely on, such as `PNEUMA_SPACE_CONTEXT`.

```sh
COMPOSE_PROJECT_NAME=pneuma-second
PNEUMA_SPACE_NETWORK=pneuma-second
PNEUMA_SPACE_HTTP_PORT=48360
PNEUMA_SPACE_ADMIN_PORT=48361
PNEUMA_SPACE_OBJECT_PORT=48362
PNEUMA_HOST_PORT=48363
PNEUMA_APPS_DIR=/path/to/second-apps    # create it first, so that it is yours
```

Then `docker compose --env-file second.env up -d --build`, and `node bin/pneuma.mjs create notes --host http://127.0.0.1:48363` once. From then on, `node .pneuma/pneuma.mjs` in `/path/to/second-apps` or in `/path/to/second-apps/notes` reaches the second Host with nothing set. The first stack keeps its defaults.

## Run it (host-driven)

This is the shape a desktop agent product embeds: the product owns the conversation and starts the code agent itself. It runs on your machine, not in the container, because that is where `claude` and `codex` are logged in. It needs Bun 1.4.5 (the version the repository pins in `package.json`), Node 24+, a PneumaSpace checkout for `appctl`, and the compose stack above for PneumaSpace itself.

```sh
bun install --frozen-lockfile                                 # once, at the repo root
cd examples/space-all-in-one
export PNEUMA_SPACE_CLI=/path/to/pneuma-space/cli/appctl.ts

bun run drive change todo "add a due date to each item" --agent claude-code
bun run drive change todo "sort by due date" --agent codex
bun run drive change todo "leave a note" --agent scripted     # no login needed; exercises the loop
```

Both control planes read and write the same `apps/todo/`, so a host-driven turn and an agent-driven edit stack on one history. Do not run both against one app at the same moment; each process serialises its own operations only.

A host-driven change, an owner's approval and `undo` all write a version over the working tree. Each refuses to start while the tree holds edits that were never submitted, and names them. Submit or `discard` them first. If the tree is edited while one of them is running, the version is still released and the tree is left as it is, with a note saying so.

Nobody answers a permission prompt in the `claude-code` lane, so a tool call outside the adapter's allow-list is denied. The lane prints each denial as `[claude:denied ...]`.

## The artifact

The Host keeps no state about an app. Everything travels in the app directory, so copying it to another machine and pointing any Host at it continues the same history (`test/host.test.ts` does exactly that).

Versions, history and the current version are the framework's change record (`@pneuma-framework/host-kit/change-record`, see [Change Record](../../docs/developer/change-record.md)). The Host writes its own fields (outcome, risks, approval, checks, address) into the same entries. An app directory made by an earlier version of this Host has `versions/` and `history.jsonl` already, under the same names. On first open the Host writes `record.json` from the counter in `app.json` and the version the rollout state says the address serves, so it goes on where it was. Its old history lines read as `guarantees: []`. Those versions never said whether they were one-way, so the Host applies the preset's one-way rules to each of them once and declares what it finds with a note. On the live run's `todo` app, that marks the column drop. A change an earlier Host left waiting for the owner is classified the same way when it is read, and its disclosure gains the cost line.

| Path | What it is |
| --- | --- |
| `AGENTS.md`, `CLAUDE.md` | How to work on the app. The PneumaSpace guide plus the change protocol. |
| `pneuma-space.json` | What the runtime must provide (capabilities). |
| `pneuma.scaffold.json` | The framework's `ScaffoldProjectManifest`: writable roots, protected paths, the checks that gate a change. |
| `.pneuma/pneuma.mjs` | Zero-dependency CLI that talks to a Host. |
| `.pneuma/host.json` | The Host's address, written by the Host when it starts and when it creates or opens the app. The CLI uses it unless `--host` or `PNEUMA_HOST` names another. |
| `.pneuma/versions/vN/` | Clean source of every recorded version. The framework's change record. |
| `.pneuma/history.jsonl` | One line per attempt, in plain fields, with the guarantees that held. The change record's history. |
| `.pneuma/record.json` | The change record's version counter and current version. |
| `.pneuma/build-threads.json` | The framework's BuildThread transcript. |
| `.pneuma/release-rollout.json` | The framework's rollout state: what the address serves (active and previous). |

## Governance: one record, one dial

Every mode writes to the same record. What the dial changes is what happens before a version is recorded. `PNEUMA_GOVERNANCE` sets it.

- `record`, the zero position: `submit` records the working tree as the next version and publishes it. That is all. No verify command, no preview, no writable-root or protected-path check, no risk classification, no approval. The CLI says in one sentence that nothing checked or approved the change.
- `personal` (default) and `review-all`: no change is applied without an approval record. What varies is who approves.

Every entry says which guarantees held for it, using the framework's names. Absence means not guaranteed.

| Entry | `guarantees` |
| --- | --- |
| Released in `personal` or `review-all` | `verified`, `approved`, `sealed`, and `previewed` when a preview ran |
| Waiting for the owner, or denied | What its checks earned: `verified`, and `previewed` when the preview passed. No approval exists. |
| Turned down by the checks | What passed before the failure, often nothing. A draft that changed after it was checked: nothing. |
| Approved, but the release failed | `verified`, `approved`, and `previewed` when it ran. Nothing was recorded, so not `sealed`. |
| A version recorded earlier that a governed submit released as it is | The `release` note carries what held for that release: `verified`, `approved`, `sealed`, and `previewed` when it ran. |
| Anything in `record` mode, an undo, a data snapshot | Nothing |

An undo entry claims nothing about the version it makes current; that version's own entry says what held when it was released.

Which change carries which risk is a preset, not code. The Host is started with a JSON file (`policy/personal.json` unless `PNEUMA_POLICY_FILE` names another) and applies its rules to what is on disk. The table below is that example preset, written for one person's apps on a trusted machine. Its SQL rules are text patterns: they stop a quoted `DROP` that never runs and miss a deletion built from variables. Treat it as a starting point and write your own for your scenario.

A preset has four kinds of rule and one list:

| In the preset | What it says |
| --- | --- |
| `change` | The risk every change carries, and a lighter one when the change stays under given paths. |
| `paths` | Changes under these paths carry this risk, for example payment code that always needs the owner. |
| `manifest` | The risk for each fact about `pneuma-space.json`: a capability added or removed, the runtime changed, sign-in dropped. |
| `content` | Text patterns over changed files. A pattern counts when what it matches occurs more often than before the change. |
| `auto_approve` | The risks the standing policy may approve. Every other risk waits for the owner. |

The history records the preset each decision was made under.

| Signal, read from disk | Risk | `record` | `personal` (default) | `review-all` |
| --- | --- | --- | --- | --- |
| Source or browser assets changed | `source_code_change`, `additive_ui` | not read; released | `policy:auto` | owner |
| Capability added to `pneuma-space.json` | `definition_additive` | not read; released | `policy:auto` | owner |
| Capability dropped (the platform keeps its data) | `release_change` | not read; released | `policy:auto` | owner |
| Sign-in no longer required | `policy_change` | not read; released | owner | owner |
| `DROP`, `ALTER TABLE ... DROP/RENAME`, `TRUNCATE`, `DELETE` without `WHERE` newly appears | `destructive_definition`, one-way | not read; one-way only if the agent says `--one-way` | owner | owner |

`policy:auto` is a subject holding the reviewer role in the framework's own `BuildChangeGovernancePolicy`; the evaluator is `evaluateBuildChangeGovernance`, unchanged. The verify gate and the preview are not permissions and run in `personal` and `review-all`. `record` runs neither, by definition.

In `record` mode the Host still asks the app's root path once after publishing, only to say whether the release went live. That is not a check of the change, and no entry claims a guarantee for it. When the runtime refuses the build or the build does not answer, the version stays recorded, because the record is the only promise of this mode. The address goes back to what served before, the entry says the release failed and what the address serves now, `status` shows both versions, and the command exits non-zero.

That version is recorded but not live, and every path treats that state the same way. A submit whose working tree equals the current version, while the address serves another, releases the current version as it is. No new version is recorded. In `record` mode the Host publishes it, marks it serving, and writes a `release` note that says it went live now. In a governed mode the content goes through every gate first. The diff is against what the address serves, because that is what is about to change for users. On approval the Host marks it serving and writes the note with the guarantees that held. A submit with new edits records a new version on top, and the release takes both live. If anything fails after the platform took a release, the Host puts the address back on what served before, writes what it can, and answers with `reason: "record_failed"`, never with a bare error. That holds for `create` too: the new app is taken down again, so the name stays free.

Turning the dial up from `record` does not inherit what `record` let through. The governed modes read the writable roots, the protected paths and the verify command from the Host's own overlay, not from the app's copy, which `record` does not protect. They also compare a change with what the address serves, not with the current version. So a version recorded in `record` mode that never went live is diffed, guarded and classified before a governed change takes it live, whether that change adds edits or submits the version as it is. When only the governed modes have run, the two are the same version.

What is checked is what ships. A change may only touch the scaffold's writable roots, and a path outside them is refused before any check runs. The backbone takes a content hash of the draft when it diffs it and again after the checks; the Host keeps that hash with a change that waits for the owner and compares it once more on the copy it is about to publish. A draft that changed in between is rejected as `draft_changed_after_check`. This matters because nothing can promise that an agent's processes are quiet when its turn ends. `npm ci && npm test` runs in a copy outside the app directory, because the tests are code the agent wrote. Directories that agents and editors keep for themselves (`.claude/`, `.codex/`, `.vscode/`, `.idea/`) are not part of a version.

The preview stays up until the change is settled and is removed right after. PneumaSpace stores bundles by content, so the release reuses the bytes the preview uploaded. Removing the preview first cost one more upload and one bundle deletion, about 8 s each in the live run.

When the owner has to decide, the agent gets `needs_approval` with a plain-language disclosure and is told to stop. For a one-way change, the disclosure also says what approving costs, and whether this Host can put stored data back (below). Approving and denying both take the owner role; the Host answers 403 to anyone else. `approve` refuses to run without a terminal. That is a speed bump, not a security boundary: on one trusted machine an agent with a shell can reach anything the owner can, and the Host takes the approving subject from the request body. A real boundary needs an authenticated owner, which PneumaSpace's organization edition has and this stack does not.

## One-way changes and undo

`undo` restores code, not data, and the live run showed what that means after a destructive change. Asked to drop a column, Claude Code pointed out on its own that the versions before the drop read that column. After the drop was approved and released, `undo` to the previous version reported success: its health check opens the root path as an anonymous visitor, which never touches the table. Every signed-in request then answered 500 with `no such column: todos.created_at`.

The health check cannot see that failure, so the Host no longer relies on it here. This is what it does now:

- **The preset says which changes are one-way.** A rule can carry `one_way: true`. In `policy/personal.json` only the destructive-SQL rule does. A change it finds carries `one_way: { reason }` in its entry, and the reason is the rule's own disclosure. In `record` mode nothing classifies risk, so the agent says it: `submit --one-way "<what is lost>"`. The governed modes refuse that flag.
- **The owner is told the cost before approving.** After this change, going back to an earlier version needs the owner's confirmation. The disclosure says whether this Host has declared a data snapshot capability, and so what such an undo would do.
- **Undo walks back.** Each `undo` goes to the version the current one was built on: v5, then v4, then v3. `undo --to <version>` goes straight to one of those. A version that is not behind the current one cannot be an undo target; to bring it back, submit its files again. Each step republishes the older version, checks that it answers, and only then moves the record and puts the files back. A new change after an undo gets a fresh number on top of the version undo landed on.
- **Undo past a one-way change waits for the owner, in every mode, `record` included.** Both outcomes deserve a person's attention. Putting the data back throws away what was stored since the snapshot. Not putting it back can leave the older version unable to read today's data. So the undo is refused until the owner confirms, and the refusal says which case applies:
  - (a) This Host can put stored data back. The data returns to the snapshot the refusal names, taken before the one-way version at the time it names. Everything stored since then is set aside and will not be in the app. When the capability says where it keeps that data, the refusal says it too.
  - (b) This Host cannot put stored data back, or took no snapshot before that version. Only code returns, and the older version may fail on today's data.

  The message also lists each one-way version and why. It reaches the agent through the HTTP API (`reason: "crosses_one_way_change"`, and `data_restore: "snapshot"` or `"none"` for the case) and through the CLI, which adds what to do next and exits 2. Nothing is touched.
- **The owner confirms.** `undo --accept-one-way` takes a terminal and the owner role, exactly like `approve`. The CLI prints the refusal, then asks the owner to type `accept` to a question that names the case. The Host answers 403 to any other subject. The entry records `one_way_crossed` (`by: "data_restored"` with the snapshot, or `by: "accepted"`) and `confirmed_by`, and in case (a) `set_aside` when the capability says where the replaced data went. The flag kept its name: in both cases the owner accepts what crossing the one-way change costs.
- **How the data comes back.** A Host built with a `DataSnapshotCapability` saves the stored data right before a release takes a one-way change live for the first time. The rule looks at what goes live, not at the submit: the release itself, and every recorded version it takes live along with it, which in `record` mode can be a version whose own release failed. When any of these is one-way, the Host takes the snapshot first and attaches it to the base of the oldest one-way one, which is where an undo looks for it. If saving fails, nothing goes live (`data_snapshot_failed`). In `record` mode the version stays recorded and not live, and the next release, with new edits or without, tries the snapshot again, because that version is still among what goes live. A confirmed undo past that change then goes in this order, through `restoreWithData`: the capability checks the snapshot it is given, then the older code goes out and has to answer, then the data is put back, then the app has to answer again, and only then does the record move. Code goes first because the build that dropped the data can drop it again: the PneumaSpace template creates its tables when the app starts, so an agent's column drop usually runs at startup too. If the data came back while that build was still the release, the next request would wake it on the restored data. When a step fails:
  - The capability refuses the snapshot, for example because the name in the history is not one it made for this app: nothing is released, no data is touched, the record stays, and the undo is refused as `data_snapshot_refused` (HTTP 409). The CLI says that nothing changed.
  - The older code does not go out: no data is touched, and the address serves what it served.
  - The data cannot be put back once the older code is out (the server is gone, the copy fails): the address goes back to what it served, and the record stays.
  - The app does not answer once its data is back: the newer code is not put back, because it must not run on that data. The record names the older version, which is what is in place, and the undo fails and says so.
  - The record cannot be written once the data is back: the address stays on the older code, and the error says to run undo again once the record can be written, and not to submit before that.

  One window remains. Between the older code going out and the data swap, the older code serves on the newer data and may answer errors. It loses nothing by that: the swap sets that data aside together with everything stored since the snapshot, unless the older version's own startup deletes something. Writes the app makes between the snapshot and the new build's first start are not in the snapshot either.

`PNEUMA_DATA_SNAPSHOT` names the capability the Host is started with. Unset, the Host has none. `postgres-template` is the one this example ships, as a practice (next section). Any other value stops the Host at start with a plain error.

## Practice: declaring that stored data can be put back

This is a practice, not something the framework or PneumaSpace promises. The framework defines `DataSnapshotCapability` and never supplies one. PneumaSpace leaves backups to the storage layer and says where each binding's data lives. This example shows one way a Host can fill that gap on one trusted machine, modelled on a database fork flow such as Neon's branching. PostgreSQL's `CREATE DATABASE new TEMPLATE old` is the local stand-in for a branch: a full copy made inside the server. The code is `src/data-snapshot-postgres.ts`.

Setup, on the compose stack:

1. Start PostgreSQL: `docker compose --profile postgres up -d`. This adds the `postgres` service (PostgreSQL 16) at `postgres:5432` on the stack's network, where the gateway finds it.
2. Put new databases on PostgreSQL, before an app first declares one (`"db": {}` in `pneuma-space.json`):

   ```sh
   curl -X PUT http://127.0.0.1:8081/api/policy -H 'content-type: application/json' -d '{"db_backend":"postgres"}'
   ```

   From then on, the first publish that declares `db` gives the app its own PostgreSQL role and database. An app that already has a database keeps it. PneumaSpace does not move data between engines; switching one app with `PUT /api/apps/<name>/policy` gives it a new, empty PostgreSQL database.
3. Tell the Host. In `.env`:

   ```sh
   PNEUMA_DATA_SNAPSHOT=postgres-template
   PNEUMA_DATA_SNAPSHOT_URL=postgresql://postgres:pneuma-local@postgres:5432/postgres
   ```

   Then run `docker compose --profile postgres up -d` again so the Host restarts with them. With the name set and no URL, the Host stops at start and says what is missing. `status` now shows `data snapshot: postgres-template`.

**Snapshot.** Right before a release takes a one-way change live for the first time, the Host asks PneumaSpace (`GET /api/apps/<name>/state`) which PostgreSQL database the app uses. An app on SQLite, or with no database, is refused with what to do, and the change is not released. Then the Host stops the app's instance (`POST /api/apps/<name>/stop`; the next request wakes it), ends any sessions left on the database, and copies it with `CREATE DATABASE ... TEMPLATE`. A waking app can reconnect in between, so that step is tried a few times. The copy is then closed to every role that is not a superuser, the app's own role included. Its name is the ref: `snap_<app>_<version>_<time>`, for example `snap_notes_v3_20261123t224812`. The app part is never shortened to fit PostgreSQL's 63 bytes; the version part gives way instead. Last, the copy is marked: over the admin connection, the Host sets its comment to a short JSON that names the app, the version, the database it was copied from, and the time. If marking fails, the snapshot fails and nothing goes live.

**Restore.** The ref comes from the app's history, and the coding agent can write that file. Restoring runs as a superuser. So before anything else, the Host checks that the ref is a snapshot it made for this app. The name has to start with `snap_<app>_`. The database has to be on the server, owned by a superuser and carry the mark, and the mark has to name this app and the database PneumaSpace gives it now. That database has to be on the server too. (The owner of a database can set its comment, which is why the owner is checked too; the app's own role cannot create or own a snapshot.) One function makes these checks, and it runs twice. The first time is the capability's `check`, on a confirmed undo before the older code goes out: a ref that fails is refused in plain words as `data_snapshot_refused`, and nothing has changed. No code was released, the app was not stopped, and nothing was renamed. The second time is at the start of the restore itself, because the server can change in between; a ref that fails then is still refused before the app is stopped. The owner's confirmation text names the snapshot and its time, so they can see what would be copied in. Then the Host stops the app and ends its sessions. It renames the app's database to `<database>_replaced_<time>`; nothing is dropped. Then it creates the app's database again as a copy of the snapshot, owned by the app's own role, and closes it to other roles as PneumaSpace does. If that copy fails, the Host renames the old database back and reports that nothing changed. If even that fails, the error says where the data is and the one command that brings it back. The snapshot stays, so the same restore can be run again.

Limits, stated plainly:

- Each snapshot and each restore is a full copy. The time and disk they take grow with the database.
- A snapshot is taken only right before a one-way change. A restore therefore drops from the app everything stored since that moment. It is kept only in the replaced database.
- Only the PostgreSQL database is covered. Files (`files`), key-value data (`kv`) and objects stay as they are.
- Apps whose data is in SQLite are not covered. Neither is an app that got its database before the policy said `postgres`.
- `PNEUMA_DATA_SNAPSHOT_URL` is superuser access to every app's database on that server. That is acceptable on one trusted machine only.
- The change record is a history for people and agents to read, not an authority. It lives where the coding agent works, and nothing protects it against tampering. The capability checks every ref it reads from it, as above, and that check is what keeps one app's snapshot out of another app.
- The app is stopped while its database is copied or swapped. A request in that moment wakes it, and during a restore it can briefly fail to reach its database.
- Snapshots and replaced databases stay on the server until someone drops them.

## What the example leans on

| From | Used for |
| --- | --- |
| `@pneuma-framework/host-kit/change-record` | Versions, history with guarantees, the current version, multi-level restore, the one-way refusal, `restoreWithData`. |
| `@pneuma-framework/host-kit/governed-change` | Sequencing and gates: empty change, protected paths on the diff, fail-closed verify, before/after evidence. |
| `@pneuma-framework/host-kit/workspace` | Tree copy, list, diff. |
| `@pneuma-framework/core/enterprise-governance` | Risk routes and the approval decision. |
| `@pneuma-framework/core/release-rollout`, `release-rollout-store` | What the address serves: stage and promote on every publish that answered, undo included. |
| `@pneuma-framework/core/build-thread` | Intent, proposal, decision and receipt turns. |
| `@pneuma-framework/backend-claude-code`, `backend-codex` | Host-driven code-agent lanes. |
| PneumaSpace `appctl` | Template, bundle rules, publish. |
| PneumaSpace admin API | Removing throwaway previews. For the practice: where an app's data lives (`state`) and stopping its instance (`stop`). |
| Bun's built-in PostgreSQL client | The practice's snapshot and restore statements. |

## Gaps this example found

Each is a place the example had to work around. They are the input for a real integration, not defects of the example.

In pneuma-framework:

1. `publishVerifiedVersion` and `HostRuntimeAdapter` are reachable only through the `host-kit` root barrel, which imports the `core` root and with it the MCP SDK. The example uses the rollout primitives directly instead.
2. `HostRuntimeAdapter` assumes the Host owns processes and a `data_dir` (`startPublished`, `stopPublished`). A managed runtime owns both, so the shape does not fit.
3. There is no control plane where the agent calls the Host. `AgentBackend` only goes Host to agent; the served Host here is new code.
4. Rollback is one step deep (`active` and `previous`), so `undo` twice is a redo. Closed in this change: undo goes by the change record and walks back along base versions, and `undo --to` goes straight back. The rollout state now records only what the address serves, and undo promotes the older version as a new candidate, because the rollout state's own rollback can only swap `active` and `previous` and would misstate a multi-level undo.
5. Risk classification is left entirely to the Host. Here it is a preset of declarative rules; the framework has no place for such a preset. Still open for the preset, which stays a file the Host is started with (it now also says which rules make a change one-way). Local state has a home now: versions, history and the current version are the framework's change record inside the app directory. Whether a change to app code that none of the app's own tests covered needs the owner is such a preset decision; this example records and prints the fact and leaves the rule out of scope.
6. `buildGovernedProposal` diffed the draft, ran `verify` in that same draft, and the caller released it, so a verify step that executes agent-written code could add files that were never diffed. Closed in this change: the backbone now returns the draft's signature and, with `sealDraft`, rejects a draft that changed during `verify`. It is opt-in, because a Host whose `verify` writes into the draft on purpose would be rejected; other Hosts are not protected until they turn it on.
7. `buildGovernedProposal` checked protected paths but knew nothing of the scaffold's writable roots or of a Host's own ignore list. Closed in this change, as the options `writableRoots` and `walkOptions`.

In PneumaSpace:

1. No way to fetch the source of a release, and `publish` strips test files, so the platform cannot be the source of truth for "continue elsewhere". The artifact directory is. That is now by design: the change record in the app directory is the source of truth for versions, and the platform only has to run them.
2. No snapshot, fork or preview primitive. Preview here is a publish under a throwaway name followed by remove and purge; undo restores code and leaves data. The throwaway publish uploads the whole bundle with its `node_modules` (8.6 s for the template's `pg` and `redis`), and purging the last app that references a bundle deletes it (8.3 s). The Host avoids paying twice only by ordering its calls around content addressing. Data snapshots are the storage layer's job by PneumaSpace's own design: its app contract leaves backups to the storage layer and exposes `GET /api/apps/<name>/state` to say where each binding's data lives, which is what a `DataSnapshotCapability` needs. The practice above builds on exactly that. Preview remains the open platform gap.
3. No publish SDK; a Host shells out to `appctl`.
4. The gateway constructs its Docker client unconditionally. With the socket mounted it starts under colima. Whether it starts without the socket when only isolate and static apps are used is still unchecked, so the compose file keeps the mount.
5. On one machine nobody is authenticated, so the owner role is a name, not a principal.
6. The app template's `AGENTS.md` tells the agent to publish with `appctl`, in two places. A Host that governs publishing can only contradict it in prose and put its own text first. There is no place in the template to say "this is how changes ship here".
7. The repository's `.dockerignore` keeps only `gateway/` and `shared/`, and BuildKit applies it to a local checkout used as a build context. An image that needs `cli/` and `templates/` cannot take the checkout as one context; the compose file passes those two directories as contexts of their own.
8. The console can remove, purge, change the access or policy of, and publish over an app a Host manages, and nothing marks an app as managed elsewhere. The Host's overview page and the README warn about it; the fix belongs to PneumaSpace (pandazki/pneuma-space#36).
