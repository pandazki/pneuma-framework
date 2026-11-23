# space-all-in-one

A headless Creation Host on [PneumaSpace](https://github.com/pandazki/pneuma-space). One `docker compose up` gives a coding agent you already use (Claude Code, Codex) a place to publish small stateful apps on your own machine and to keep changing them under the framework's governed loop.

[中文版](./README.zh-CN.md)

The example answers two questions the other examples leave to the Host author:

- **Where does the Published Application run?** On PneumaSpace: an app is a directory and a manifest, publishing is an upload, an idle app sleeps and its data outlives every release.
- **Who drives the loop?** Either side. The same loop runs agent-driven (the agent edits and submits) and host-driven (the Host starts the agent), over the same app directory.

## Status

Run end to end on 2026-11-23 on macOS with colima (Docker 29.5, Compose 5.7, buildx 0.38) and again with Docker Desktop (Docker 29.9), Bun 1.4.5, Node 26 on the machine and Node 24 in the image, Claude Code 2.1.330 and codex-cli 0.167.0.

| What was run | Result |
| --- | --- |
| `bun run typecheck` and `bun test` for the whole repository | Pass. The offline tests here use an in-memory PneumaSpace and scripted agent CLIs. |
| `docker compose up -d --build`, from the pinned commit and from a local checkout | Five services up, gateway healthy. |
| `create` | `appctl init` in the container, `npm ci && npm test`, preview boot, release. About 14 s. |
| Agent-driven, Claude Code (`claude -p` in the app directory) | Read `status` and `history`, edited, ran the tests, submitted. Published without being told the protocol and without calling `appctl`. |
| Agent-driven, Codex (`codex exec` in the app directory) | The same, after two fixes the run forced: the protocol now comes first in `AGENTS.md`, and the sandbox needs network access (below). |
| Protected paths | Codex's first attempt edited `public/ui.css` and `public/ui.js`; `submit` answered `rejected (protected_file_changed)` and nothing was released. |
| A risky change ("drop the `created_at` column") | `needs_approval`. Claude Code stopped and relayed the disclosure. `approve` refused to run without a terminal, and the Host answered 403 to `agent:claude-code` and to `policy:auto`. Approved at the terminal prompt as `user:me`, it was released as the next version. |
| Host-driven lanes: `scripted`, `claude-code`, `codex` | Each published a version and brought the working tree up to date. |
| `undo`, `discard`, a submit after an undo | Address, working tree and history all moved together. |
| Linux file ownership | Reproduced on a Linux-native bind mount (a directory inside the colima VM): a Host running as root left files the machine's user could not edit. The Host now starts as the owner of the apps directory; with that, create, submit and undo left every file owned by the user. |

Not run live: `deny`, a Linux machine as a whole (only the Host side was checked, on the VM's own filesystem), the gateway without the Docker socket, and PostgreSQL as an app's database.

A change takes 10 to 15 s on that machine when the standing policy approves it. Most of it is `npm ci` and one bundle upload.

## Run it (agent-driven)

Needs Docker with a recent Compose (the Host image uses additional build contexts) and any Node 18+ on the machine for the artifact CLI.

```sh
cd examples/space-all-in-one
docker compose up -d --build            # PneumaSpace + the Host; first build pulls node:24, redis, rustfs
node bin/pneuma.mjs create todo         # copies the PneumaSpace template, verifies, previews, publishes v1
open http://127.0.0.1:8080/apps/todo/
```

Then open `apps/todo/` with your agent and ask for a change:

```sh
cd apps/todo
claude        # or: codex
> add a todo list stored in the database, with a form to add items
```

`AGENTS.md` in the directory (Claude Code reads it through `CLAUDE.md`) opens with the whole protocol: edit in place, then `node .pneuma/pneuma.mjs submit "<what was asked>"`. The PneumaSpace guide follows it. The order matters: the guide ends with "publish with `appctl`", and with the protocol appended after it Codex edited the files, never submitted, and touched two protected ones. The Host copies the working tree, checks the diff against the protected paths, runs `npm ci --ignore-scripts && npm test`, boots the draft on PneumaSpace under a throwaway name, has the change approved, and only then releases it under the app's stable address.

Switch agents whenever you like. Nothing about the app lives in the agent's session.

Codex needs one setting. Its default sandbox blocks loopback connections, so `npm test` cannot open its port and `submit` cannot reach the Host. Start it with `codex -c sandbox_workspace_write.network_access=true`, or approve the command when it asks. Without either, Codex edits the files, reports that the sandbox stopped the submit, and nothing is released. Claude Code asks before it runs `npm` and `node`; allow both.

```sh
node .pneuma/pneuma.mjs status          # active version, address, uncommitted files, anything waiting for you
node .pneuma/pneuma.mjs history         # every attempt: who, what was asked, risks, who approved, result
node .pneuma/pneuma.mjs undo "why"      # back one version (code only)
node .pneuma/pneuma.mjs approve <id>    # you, in a terminal, for a risky change
```

To build PneumaSpace from a local checkout instead of the pinned commit, copy `.env.example` to `.env` and set `PNEUMA_SPACE_CONTEXT` to the checkout's path.

On Linux the Host has to write app files as you, or your agent cannot edit them. It does this by itself: started as root, it becomes whoever owns the mounted apps directory (`host-entrypoint.sh`). The repository ships an empty `apps/` so that the directory is yours before Docker mounts it. If you point `PNEUMA_APPS_DIR` somewhere else, create that directory yourself first; a directory Docker has to create belongs to root. Docker Desktop is not needed on Linux: Docker Engine with the Compose and buildx plugins is enough.

## Run it (host-driven)

This is the shape a desktop agent product embeds: the product owns the conversation and starts the code agent itself. It runs on your machine, not in the container, because that is where `claude` and `codex` are logged in. It needs Bun, Node 24+, a PneumaSpace checkout for `appctl`, and the compose stack above for PneumaSpace itself.

```sh
bun install                                                   # once, at the repo root
cd examples/space-all-in-one
export PNEUMA_SPACE_CLI=/path/to/pneuma-space/cli/appctl.ts

bun run drive change todo "add a due date to each item" --agent claude-code
bun run drive change todo "sort by due date" --agent codex
bun run drive change todo "leave a note" --agent scripted     # no login needed; exercises the loop
```

Both control planes read and write the same `apps/todo/`, so a host-driven turn and an agent-driven edit stack on one history. Do not run both against one app at the same moment; each process serialises its own operations only.

Nobody answers a permission prompt in the `claude-code` lane, so a tool call outside the adapter's allow-list is denied. The lane prints each denial as `[claude:denied ...]`.

## The artifact

The Host keeps no state about an app. Everything travels in the app directory, so copying it to another machine and pointing any Host at it continues the same history (`test/host.test.ts` does exactly that).

| Path | What it is |
| --- | --- |
| `AGENTS.md`, `CLAUDE.md` | How to work on the app. The PneumaSpace guide plus the change protocol. |
| `pneuma-space.json` | What the runtime must provide (capabilities). |
| `pneuma.scaffold.json` | The framework's `ScaffoldProjectManifest`: writable roots, protected paths, the checks that gate a change. |
| `.pneuma/pneuma.mjs` | Zero-dependency CLI that talks to a Host. |
| `.pneuma/history.jsonl` | One line per attempt, in plain fields. |
| `.pneuma/build-threads.json` | The framework's BuildThread transcript. |
| `.pneuma/release-rollout.json` | The framework's rollout state (active and previous). |
| `.pneuma/versions/vN/` | Clean source of every released version. |

## Governance: one loop, one dial

No change is applied without an approval record. What varies is who approves.

| Signal, read from disk | Risk | `personal` (default) | `review-all` |
| --- | --- | --- | --- |
| Source or browser assets changed | `source_code_change`, `additive_ui` | `policy:auto` | owner |
| Capability added to `pneuma-space.json` | `definition_additive` | `policy:auto` | owner |
| Capability dropped (the platform keeps its data) | `release_change` | `policy:auto` | owner |
| Sign-in no longer required | `policy_change` | owner | owner |
| `DROP`, `ALTER TABLE ... DROP/RENAME`, `TRUNCATE`, `DELETE` without `WHERE` newly appears | `destructive_definition` | owner | owner |

`policy:auto` is a subject holding the reviewer role in the framework's own `BuildChangeGovernancePolicy`; the evaluator is `evaluateBuildChangeGovernance`, unchanged. The verify gate and the preview are not permissions and run in every mode.

The preview stays up until the change is settled and is removed right after. PneumaSpace stores bundles by content, so the release reuses the bytes the preview uploaded. Removing the preview first cost one more upload and one bundle deletion, about 8 s each in the live run.

When the owner has to decide, the agent gets `needs_approval` with a plain-language disclosure and is told to stop. `approve` refuses to run without a terminal. That is a speed bump, not a security boundary: on one trusted machine an agent with a shell can reach anything the owner can, and the Host takes the approving subject from the request body. A real boundary needs an authenticated owner, which PneumaSpace's organization edition has and this stack does not.

`undo` restores code, not data, and the live run showed what that means after a destructive change. Asked to drop a column, Claude Code pointed out on its own that the versions before the drop read that column. After the drop was approved and released, `undo` to the previous version reported success: its health check opens the root path as an anonymous visitor, which never touches the table. Every signed-in request then answered 500 with `no such column: todos.created_at`. A second `undo` (a redo) brought the app back. The disclosure says "Undo restores code only"; it does not yet say that undo stops being usable, and nothing stops the undo itself.

## What the example leans on

| From | Used for |
| --- | --- |
| `@pneuma-framework/host-kit/governed-change` | Sequencing and gates: empty change, protected paths on the diff, fail-closed verify, before/after evidence. |
| `@pneuma-framework/host-kit/workspace` | Tree copy, list, diff. |
| `@pneuma-framework/core/enterprise-governance` | Risk routes and the approval decision. |
| `@pneuma-framework/core/release-rollout`, `release-rollout-store` | Active and previous version, promote, rollback. |
| `@pneuma-framework/core/build-thread` | Intent, proposal, decision and receipt turns. |
| `@pneuma-framework/backend-claude-code`, `backend-codex` | Host-driven code-agent lanes. |
| PneumaSpace `appctl` | Template, bundle rules, publish. |
| PneumaSpace admin API | Removing throwaway previews. |

## Gaps this example found

Each is a place the example had to work around. They are the input for a real integration, not defects of the example.

In pneuma-framework:

1. `publishVerifiedVersion` and `HostRuntimeAdapter` are reachable only through the `host-kit` root barrel, which imports the `core` root and with it the MCP SDK. The example uses the rollout primitives directly instead.
2. `HostRuntimeAdapter` assumes the Host owns processes and a `data_dir` (`startPublished`, `stopPublished`). A managed runtime owns both, so the shape does not fit.
3. There is no control plane where the agent calls the Host. `AgentBackend` only goes Host to agent; the served Host here is new code.
4. Rollback is one step deep (`active` and `previous`), so `undo` twice is a redo.
5. Risk classification is left entirely to the Host. The manifest-diff and SQL heuristics here are a start, not a classifier.

In PneumaSpace:

1. No way to fetch the source of a release, and `publish` strips test files, so the platform cannot be the source of truth for "continue elsewhere". The artifact directory is.
2. No snapshot, fork or preview primitive. Preview here is a publish under a throwaway name followed by remove and purge; undo restores code and leaves data. The throwaway publish uploads the whole bundle with its `node_modules` (8.6 s for the template's `pg` and `redis`), and purging the last app that references a bundle deletes it (8.3 s). The Host avoids paying twice only by ordering its calls around content addressing.
3. No publish SDK; a Host shells out to `appctl`.
4. The gateway constructs its Docker client unconditionally. With the socket mounted it starts under colima. Whether it starts without the socket when only isolate and static apps are used is still unchecked, so the compose file keeps the mount.
5. On one machine nobody is authenticated, so the owner role is a name, not a principal.
6. The app template's `AGENTS.md` tells the agent to publish with `appctl`, in two places. A Host that governs publishing can only contradict it in prose and put its own text first. There is no place in the template to say "this is how changes ship here".
7. The repository's `.dockerignore` keeps only `gateway/` and `shared/`, and BuildKit applies it to a local checkout used as a build context. An image that needs `cli/` and `templates/` cannot take the checkout as one context; the compose file passes those two directories as contexts of their own.
