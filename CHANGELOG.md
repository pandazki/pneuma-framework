# Changelog

All notable changes to `pneuma-framework` are recorded here. The project follows
the four-layer model (Framework → Creation Host → Generated Application →
Published Application); entries describe what changed in the **framework** and its
reference packages, not in any particular Host.

Format is loosely based on [Keep a Changelog](https://keepachangelog.com/). Until
1.0 the framework ships TypeScript source consumed by Bun (via `file:`/git), not
built `dist` artifacts on the npm registry.

## [Unreleased]

### Added

- **The change record, the framework's lightest mode** (`@pneuma-framework/host-kit/change-record`,
  also exported from the host-kit root). It records versions of an app directory and
  restores them, and does nothing else: no check runs, nobody approves, stored data is
  not touched, and there is no locking. Layout: `.pneuma/versions/v<N>/`, an append-only
  `.pneuma/history.jsonl`, and `.pneuma/record.json`. By default a version leaves out
  host-kit's usual ignores, `.pneuma`, a top-level `data/`, the directories coding agents and
  editors keep for themselves (`.claude`, `.codex`, `.vscode`, `.idea`) and `.DS_Store`, so a
  restore never deletes an agent's settings and Finder never makes the tree dirty; host-kit's
  `defaultTreeWalkOptions()` is unchanged. Every entry carries `guarantees`;
  the floor writes none, so an empty list means recorded only, and a governed layer
  names what held (`GUARANTEES`: `verified`, `previewed`, `approved`, `sealed`). A restore
  refuses to go back past a version declared one-way unless the Host put stored data
  back through a `DataSnapshotCapability` it declares (`restoreWithData`) or the caller
  passes `acceptOneWay`, and the restore entry records which. The framework supplies no
  data capability. Reading tolerates history lines without `guarantees` and adopts a
  `versions/` directory that has no `record.json`. New helper:
  `defaultTreeWalkOptions()` in `@pneuma-framework/host-kit/workspace`. See
  [Change Record](docs/developer/change-record.md).
- **`pneuma-framework record`** (`init`, `save`, `history`, `status`, `restore`) puts the
  same floor in front of a coding agent that has no Host. `record init` records `v1` and
  adds a short marked section to the app's `AGENTS.md`. `@pneuma-framework/cli` now
  depends on `@pneuma-framework/host-kit` and loads only its `change-record` subpath, on
  demand.
- **`@pneuma-framework/backend-claude-code`**, a reference adapter that runs one
  coding turn through `claude -p` with stream-json output. Success is the final
  `result` event, never the exit code alone; tool calls the CLI denied are returned
  to the caller.
- **`examples/space-all-in-one`**, a headless Creation Host on PneumaSpace with two
  control planes over one governed loop: the coding agent edits and submits, or the
  Host starts the agent. Which change carries which risk, and which risks a standing
  policy may approve, is a preset file the Host is started with, not code. See its
  README for what a live run verified.
- **`examples/space-all-in-one` answers "what apps do I have?"** (#9). `GET /apps` and `list` return a
  summary per app: current version, address, the last change (when, which agent, what was asked),
  changes waiting for the owner, uncommitted files, and whether the address serves another version.
  The Host keeps a marked block in the apps directory's `AGENTS.md`, a `CLAUDE.md` pointing at it, and
  a copy of the CLI there, so an agent started in that directory can list, inspect (`status <name>`,
  `history <name>`) and create apps. `pneuma.mjs guide` prints a block for an agent's user-level
  instructions, and `guide --write <file>` adds or replaces it between markers in the file named; it
  first checks that the Host's apps are in the directory it names. The app's `AGENTS.md` mentions
  `list`. A file in `.pneuma/pending/` that is not a waiting change in the shape the Host writes is
  left out and named in one line by `status`, `list` and the owner page (`malformed_pending`); it
  cannot be approved or denied, and every other waiting change still can.
- **`examples/space-all-in-one` refuses what only a browser would send.** The Host has no login
  and now serves a page people open in a browser, where any other page can post to 127.0.0.1. A
  request that changes anything must not carry `Origin` or `Sec-Fetch-Site` and must say
  `content-type: application/json`; every request must call the Host `localhost`, `127.0.0.1` or
  `[::1]`, the host name in `PNEUMA_HOST_URL`, or the address in `PNEUMA_HOST_BIND` when that is not a
  wildcard. Any other name, a LAN address or `host.docker.internal` included, gets 403
  `wrong_host_name`, whose message says to set `PNEUMA_HOST_URL` to the address with that name. The
  CLI sends a JSON body on every write. This is not authentication.
- **`examples/space-all-in-one` serves an owner page at `/`, replacing the overview page.** It
  shows an ordinary person what their agents built: a card per app with a picture, its name, when it
  last changed and one plain state; changes waiting for them first; one app's history in their own
  words (`intent`), with what stood behind each change from `guarantees` and one-way changes marked;
  a waiting change as before and after pictures with links that open the real thing, what was
  checked, why it needs them, and two decisions; and going back, with what happens to stored data
  from what the Host knows. Record terms, ids and terminal commands sit under "Details". English and
  Chinese, phone width, light and dark, ⌘K/Ctrl+K search over apps. The server decides and words
  each view and sends it as JSON in the page; a small React client (`web/`) lays it out with
  components from Beautiful UI (MIT, © 2026 Shane Levine, copied into `web/beautifui/` with the
  license). `web/build.ts` (Bun's bundler, Tailwind, bundled Inter and JetBrains Mono) writes
  `web/dist`, which the Host image builds in its own stage and nothing commits; new devDependencies
  of the example only. A nonce Content-Security-Policy for scripts (`style-src` and `font-src`
  `'self'`, no `unsafe-inline`), no frames, data rendered as text. Deciding needs the **owner link**
  the Host prints at start (`/#owner=<token>`, a token kept with mode 0600 in the Host's state
  volume, so it survives a restart): the page's writes (`POST /owner/...`) carry it in a header,
  must come from the Host's own origin and say JSON. The JSON API keeps refusing anything a browser sends. A decision or undo made
  on the page passes the same gates and writes the same history entry as the CLI's, plus
  `"channel": "owner-page"`; the README says this has the strength of the CLI's "must be a terminal"
  check and that a real agent product replaces it with its own login. **Pictures** come from a new
  `screenshot` compose service (headless Chrome over the DevTools protocol): taken when a version
  goes live, while `status` says a waiting change's preview stands, and once a day, in a fresh context
  with no cookie (an app that asks visitors to sign in gets a placeholder that says so), with the
  page's own requests limited to its own origin and https (a WebSocket and a frame from another site
  are not filtered, which the README says); stored in the Host's own state volume (`PNEUMA_HOST_STATE`)
  and served as `image/jpeg`. Without the service the page shows placeholders and nothing else
  changes. A preview that no longer stands is said so, approving waits, and "Show it to me again"
  publishes the checked draft again through `AppHost.preview()`. Another manager on PneumaSpace, an
  unfinished undo, an address nobody saw answer, a malformed waiting change, and an app nobody
  manages yet (which a decision will mark) are each said in plain words where they matter, and each
  refusal a decision can meet is one sentence, with the Host's words under "Details". The CLI's
  `submit` names the change's page as the other way to decide. `AppHost` gains `undoPlan()` and
  `autoApproved`, and `resolve`/`undo` take a channel. An approval names the subject who said yes
  beside the standing policy only when that subject holds the owner role, and the page says "you
  confirmed it" only for the app's owner. Going back is tied to the plan that was shown: `undo` takes
  `from`, the version the plan started from (`undoPlan().from`, or `from` on a `crosses_one_way_change`
  refusal), and answers 409 `plan_changed` when the current version is another one. The page sends it
  with "Go back" and then shows the new plan; the CLI's `undo --accept-one-way` sends it with the
  confirmation. Run on the compose stack in headless Chrome.
  `bun run dev:page` serves the page over fixture apps in every state, without Docker.
- **`examples/space-all-in-one` serves a read-only overview page at `/`** (#10; replaced by the owner page above). It shows every app
  with the summary `list` gives, each app's status and history (intent, agent, risks, approver,
  guarantees, one-way marks, test coverage), and each change waiting for the owner with its
  disclosure and the terminal command that decides it. One self-contained page: no script, no form,
  no external asset, a Content-Security-Policy that allows neither script nor form, every value
  escaped, light and dark. It links to each app and to the PneumaSpace console
  (`PNEUMA_SPACE_CONSOLE`, set in compose). The README names the console and the actions of it that
  go around the Host (remove, purge, access, policy, publish over an app); the console asks for the
  Host's name before them, since the Host marks its apps as managed (below, pandazki/pneuma-space#36).
- **`buildGovernedProposal` can check what a Host releases** (`@pneuma-framework/host-kit`).
  Three optional inputs: `walkOptions` (the Host's own `TreeWalkOptions` for the
  backbone's diff and signature), `writableRoots` (a changed path outside all of them
  is rejected as `outside_writable_roots` before `verify` runs) and `sealDraft` (a
  draft that changed while `verify` ran is rejected as `draft_changed_during_verify`).
  Every `GovernedProposal` carries `draftSignature`, taken with the diff, for the Host
  to compare right before it releases. Also new: `treeSignature(root, options)` and
  `TreeWalkOptions.ignoredPaths`, which skips a path at one place (a top-level `data/`)
  rather than a name at any depth. A caller that passes none of the new inputs gets
  the previous behaviour; code that builds `GovernedProposal` values itself or
  switches exhaustively over `ProposalRejectionReason` has to add the new field and
  reasons. `examples/space-all-in-one` now uses all three instead of its own copies.
- **A Host can name the directory the change record, BuildThread store and release
  rollout store keep their files in** (`stateDir`, default `.pneuma`). New options:
  `ChangeRecordOptions.stateDir`, `FileBuildThreadStoreOptions.stateDir` and
  `FileReleaseRolloutStoreOptions.stateDir`, plus an optional second argument to
  `buildThreadsFilePath(workspace, stateDir?)` and `releaseRolloutFilePath(workspace, stateDir?)`.
  The name is one directory directly under the app directory, never a path; anything
  else throws a `TypeError` when the store or record is opened. With another name
  nothing is read from or written to `.pneuma`, and a `.pneuma` directory is ordinary
  content. The change record's default walk leaves out the state directory in use
  instead of `.pneuma`, and that directory is never part of a version whatever walk
  options are passed. Without the option nothing changes. `pneuma-framework record`
  keeps `.pneuma`, and no other module that uses `.pneuma` takes the option.

### Changed

- **`examples/space-all-in-one` uses PneumaSpace's ephemeral and managed apps** (pin moved to
  pandazki/pneuma-space@6e73538). A preview is published as an ephemeral app (`--ephemeral --ttl`,
  `PNEUMA_PREVIEW_TTL`, default 3600) and discarded in one call instead of remove and purge. A change
  that waits for the owner keeps its preview up until they decide or it ends itself; `submit`,
  `status`, `approve` and the owner page show it as PneumaSpace answers when asked. An app listed
  under the preview's name is the preview only while this Host manages it, it is `registered` and
  its end is ahead; a removed one, one left `purging`, one past its end that PneumaSpace has not swept
  yet, and another app that took the freed name are not. The Host keeps one note of a preview, the app
  id its publish returned (`preview_app_id` in the waiting change's file), and every discard carries
  it (`?app=<id>`), so a discard never ends a later app of the same name; with previews off, deciding
  sends no discard. Once it has ended, `approve` is refused with `preview_gone` and nothing
  changes, until `preview <change-id>` publishes the checked draft again. A preview PneumaSpace
  refuses to publish because the tenant's `ephemeral` quota is used up (each waiting change holds one)
  or the ttl is above its maximum is not a failed check: the change is rejected as `preview_refused`,
  whose detail says nothing was found wrong with it and what to do. When PneumaSpace does not answer,
  the preview is unknown, not gone: `status`, the CLI and the page say so, `approve` is refused with
  `preview_unknown` and says to ask again, and `preview <change-id>` discards and publishes nothing. Every release and preview
  names the Host as its manager (`--manager`, `PNEUMA_MANAGER`, default `pneuma-host`, with the
  overview page as the url), and every write the Host makes to them names it, so a write that does
  not (the console's included) is refused by PneumaSpace. An app managed by another name is refused
  with `managed_elsewhere` before anything is checked or recorded; an app on the Host's record that
  has no manager (every app created before) is marked by its next release or undo, which the result
  says. `status` shows who manages the app. The Host's API level is 2, since the CLI reads these
  fields. The template's `npm test` now runs every `*.test.ts`, so the Host no longer rewrites a new
  app's test script (`coverAppTests` is gone).
- **`examples/space-all-in-one` is on the change record.** Its versions, history and current
  version are now `@pneuma-framework/host-kit/change-record` instead of its own files, under the
  same names, and every entry it writes says which guarantees held. The dial gains a zero
  position, `PNEUMA_GOVERNANCE=record`: a change is recorded and published with nothing checked or
  approved, and a release that fails stays recorded. A submit whose working tree equals such a
  recorded but not live version releases it as it is and records no new version; a governed mode
  takes it through every gate first, against what the address serves. The data snapshot is keyed on
  what goes live: a release that takes a one-way version live for the first time, one recorded
  earlier included, saves the data first and attaches it where `planRestore` looks. A record write
  that fails after a publish puts the address back and answers with `reason: "record_failed"`,
  `create` included, instead of a bare 500. `undo` walks back one version per call and
  `undo --to <version>` goes straight back, instead of swapping with the previous release. The risk
  preset can mark rules `one_way` (the shipped one marks destructive SQL). An undo past such a
  change is refused, in every mode, until the owner confirms it in a terminal
  (`undo --accept-one-way`, `accept_one_way` over HTTP; 403 for any other subject). That holds also
  when the Host can put stored data back, because that drops what was stored since the snapshot.
  The refusal says which case applies: the data returns to the snapshot taken before a named
  version at a named time and what was stored since is set aside, or only code returns and the
  older version may fail on today's data. The HTTP answer carries `data_restore: "snapshot" | "none"`,
  and the restore entry records `confirmed_by` (replacing `accepted_by`). A confirmed undo that puts
  data back releases the older code first, then puts the data back, then checks that the app answers
  again, and only then moves the record, so the build that dropped the data never starts on the
  restored data. A snapshot the capability's check refuses stops the undo before the older code goes
  out (409, `data_snapshot_refused`), and the Host and the CLI say that nothing changed. If the
  data cannot be put back after the older code went out, the address returns to what it served; if
  the app does not answer once its data is back, the newer code is not put back. The preset parser now
  refuses unknown fields. App directories made by the earlier version are adopted on first open,
  and an app's copy of the CLI is replaced when it is older than the Host's. See its README.
- **`examples/space-all-in-one` ships one data snapshot practice, `postgres-template`.** Opt in with
  `PNEUMA_DATA_SNAPSHOT=postgres-template` and `PNEUMA_DATA_SNAPSHOT_URL` (a superuser connection;
  without it the Host stops at start). For apps whose database PneumaSpace put on PostgreSQL, it
  finds the database through `GET /api/apps/<name>/state`, stops the app, and copies the database
  with `CREATE DATABASE ... TEMPLATE` before a one-way change is released, then marks the copy with a
  comment naming the app, the version and the source database. A confirmed undo renames
  the app's database aside (nothing is dropped) and recreates it from the snapshot under the app's
  role, renaming back if that fails. Because the ref comes from the app's history, which the agent
  can write, restore accepts only a snapshot this capability made for this app: the name has the
  app's prefix, and a superuser-owned database carries a mark for this app and its current
  database. One function makes these checks for both the capability's `check`, which runs before
  the Host releases the older code, and `restore`, which makes them again. Anything else is refused
  before any code is released, the app is stopped or any session is ended, and the owner's
  confirmation names the snapshot. Apps on SQLite are refused with what to do, and the change is
  not released. `compose.yaml` gains PneumaSpace's `postgres` service behind the `postgres` profile;
  without the two variables the stack behaves as before. It is a practice, not something the
  framework or PneumaSpace promises: each copy is full, files and key-value data are not covered,
  and the admin connection reaches every app's database. Unit tests script the SQL; one integration
  test runs only when `PNEUMA_TEST_POSTGRES_URL` is set. Run on the compose stack; the README's
  Status table has the result.

- **`@pneuma-framework/backend-codex` follows the current app-server protocol.**
  A turn now succeeds only when `turn/completed` reports `completed`; `failed` and
  `interrupted` reject. An idle thread no longer ends the turn by itself: current
  CLIs send `idle` before `turn/completed`, so idle only starts a short grace
  period. Requests the server sends to the client are answered in the shape each
  one expects instead of being dropped, which used to hang the turn until timeout.
  Host instructions are sent as the first text input. `runCodexAgent` now returns
  `{ threadId, status, finalMessage }`.
- `bunfig.toml` keeps app directories generated by `examples/space-all-in-one` out
  of `bun test`.
- The repository now targets current Bun (1.4): the lockfile was regenerated with
  it and `@types/bun` moved to 1.4.5 in every workspace. Older Bun is not kept
  working.
- Bun is pinned to 1.4.5, the version that wrote `bun.lock`: `packageManager` in the root
  `package.json` and `bun-version` in every `setup-bun` step. CI installs with
  `bun install --frozen-lockfile`, so a `package.json` that no longer matches `bun.lock` fails
  the job instead of being resolved again on the runner (#7).

### Fixed

- **`examples/space-all-in-one`: an agent in an app directory finds a Host that is not on port 8090** (#4).
  The served Host learns its own address from `PNEUMA_HOST_URL` (compose sets it from
  `PNEUMA_HOST_PORT`; `bun run serve` derives it from where it listens, and refuses
  `PNEUMA_HOST_PORT=0` unless `PNEUMA_HOST_URL` is set) and records it in
  `.pneuma/host.json` of the apps directory and of every app, when it starts and when it creates or
  opens an app. The CLI takes `--host`, else `PNEUMA_HOST`, else the recorded address, else
  `http://127.0.0.1:8090`. When the Host cannot be reached, the message names the address it tried
  and where that address came from, and says the Host may be on another address; it no longer says
  to start the stack. The app's `AGENTS.md` says the same in new apps. At start the Host also brings
  every app's CLI copy up to its own, since an older copy does not read the record; an existing app's
  `AGENTS.md` is versioned with the app and is not rewritten. The Host sends its API level in a
  `pneuma-host-api` header on every answer, and the CLI refuses a Host below the level it was written
  for, or one that sends none, in one line that says to rebuild it (`docker compose up -d --build`).
  A command that changes something asks first, so nothing is changed on such a Host.
- **`examples/space-all-in-one`: `submit` no longer labels the agent by the first marker it finds** (#8).
  It prints the agent it recorded and where the name came from (`--agent`, `PNEUMA_AGENT`, or the
  marker it was detected from), in text and in `--json` (`agent: { name, source, ... }`). When markers
  of more than one agent are set and nothing names the agent, it warns on stderr, records the agent
  as `unknown` with the candidates in `agent_candidates`, and still submits. Entries carry
  `agent_source`, and the Host refuses a request that names one of several candidates. Only the
  variables each agent sets in the shells it starts count as its markers: `CLAUDECODE` and
  `CLAUDE_CODE_ENTRYPOINT` for Claude Code, `CODEX_THREAD_ID` and `CODEX_TOOL_CALL_ID` for Codex.
  Other `CODEX_` variables, such as `CODEX_HOME` from a shell profile, name no agent.
- **`examples/space-all-in-one`: the test check says what it covered** (#5). A new app's `npm test`
  runs the app's own tests, since the template does (pandazki/pneuma-space#35); an app made from an
  earlier template keeps its script, and the check names the test files under `src/` that did not
  run. The app's `AGENTS.md` asks for a test with every change in
  behaviour, says where it goes, and shows the smallest request-level one. Each `npm-test` check
  records `coverage`: how many tests ran (skipped and todo ones not counted), in how many files, and
  how many of them are the app's own, read from the runner's summary and a JUnit report the Host asks
  Node's test runner for; what cannot be read is `unknown`. A test script that picks its own reporter
  runs as written, without the report. `submit` prints one line when a change touched `src/` or
  `public/app/` and no app test ran, naming any test file under `src/` that did not run, and
  `history` shows the note. The scaffold's description of the check now matches
  what it runs.
- **`examples/space-all-in-one`: running beside other services is documented, and the network name is
  one variable** (#6). `compose.yaml` takes `PNEUMA_SPACE_NETWORK` (default `pneuma-all-in-one`) for
  both the network's name and the gateway's setting of the same name, which must agree. The README
  has a section on the four port variables, how the CLI finds the Host, the console's address, and
  a second stack beside the first from an env file. The root README points a developer who wants
  their coding agent to build apps on their machine to the example. `create` no longer names an app
  directory recorded for a different Host than the one `--host` or `PNEUMA_HOST` chose.
- **`planRestore(...).dataRef` names the right snapshot** (`@pneuma-framework/host-kit/change-record`): the one attached to the base of the oldest one-way version being undone, and none when no one-way change is crossed. `restore` gains `keepEdits`. `restoreWithData` uses the plan and takes a Host's own steps in this order: the capability's optional `check` of the ref, then `release` (the target's code goes out), then the data is put back, then `verify`, then the record moves. `DataSnapshotCapability` gains that optional `check({ appRoot, ref })`: it changes nothing, and when it throws the restore is refused as `ChangeRecordRefused` with reason `data_snapshot_refused`, before anything is released and without `putReleaseBack`; `restore` must still check again itself. So a caller can tell a refusal, where nothing happened, from a failure after the release. `putReleaseBack` runs when the data restore fails, or when `verify` fails with no data put back. Code goes first so that newer code, which may drop the data again at startup, is never started on restored data; a `verify` that fails after the data is back does not put the newer code back: the record moves to the target, which is what is in place, and the error propagates. The guide now says that the record is not an authority: a Host checks what it reads from it, the `ref` a capability restores included, before acting with privileges the agent does not have.

- **`pneuma-framework scaffold-host` produced a Host that could not be installed
  when the CLI itself was installed through `file:` under Bun 1.4.** Bun copies
  `file:` dependencies into `node_modules` and nests each package's framework
  dependencies under it, so the copy the CLI ran from had no siblings, and the
  `file:<copy>` paths written into the Host's `package.json` failed at `bun install`.
  The scaffold now gives the Host the specifiers the installing project declares
  (`packages/cli/src/framework-dependency.ts`). This is what broke the
  package-consumption gate on current Bun.
- **Test servers bind `127.0.0.1` instead of the wildcard address.** Thirteen test
  servers took an auto-assigned port on the wildcard address while the code under
  test connected to `127.0.0.1`. On macOS such a bind can be given a port another
  local process already holds on `127.0.0.1`, and that process answers the request;
  the suite then failed intermittently with an unexplained `HTTP 404` on machines
  that run other local servers. Template servers still bind the wildcard address.

## [0.5.0] — 2026-06-23

The **public-API freeze** train. 0.5.0 makes the framework's published surface
explicit and auditable so it can carry a real semver contract: every barrel
`export *` star has been enumerated into named re-exports in place. No symbol was
added, removed, or relocated — every name reachable in 0.4.0 stays reachable from
the same import path. This is a non-breaking freeze, deliberately deferring any
structural surface split (see the SQLite/Drizzle note below) to 0.6.0.

### Changed

- **Public API surface is now explicit and frozen.** The wildcard re-exports in
  the package barrels were replaced with explicit `export { … }` / `export { type … }`
  lists:
  - `@pneuma-framework/core-domain` (`src/index.ts`) — 41 `export *` stars
    enumerated.
  - `@pneuma-framework/runtime` (`src/index.ts`) — 5 `export *` stars enumerated.
  - `@pneuma-framework/core` (`src/index.ts`) — the single
    `runtime-data-governance` `export *` star enumerated.

  Package `exports` maps were not touched; the change is purely about writing the
  re-exported names out so the surface is reviewable and controllable.

- **Viewer SDK promise corrected.** The charter previously implied two built-in
  SDKs (React + Vanilla JS); only the React SDK ships. Docs (README, spec, CLAUDE.md,
  AGENTS.md) now state: a React SDK on top of an **open wire protocol**; a vanilla /
  other-stack SDK is bring-your-own, not shipped.

### Added

- **CI gate** (`.github/workflows/ci.yml`) — a required **offline gate**
  (typecheck + package/template test suites + the local-package-consumption gate)
  on every push and pull request; the network-bound example E2E suites are isolated
  to a separate, non-blocking **live gate**.
- **`description` fields** on all 12 published `package.json` files.
- **`Scope & boundaries`** section in the README — explicit declaration that the
  runtime is Bun-only, what the framework owns, and what is explicitly Host-owned
  (multi-tenant identity / IAM, hosted secret vaults, real provider SDKs, cloud
  deployment control planes, compliance/audit retention).
- **`docs/developer/scaffold-to-host-walkthrough.md`** — a linear, copy-pasteable
  bridge from `scaffold-host` to a runnable Creation Host, plus an honest list of
  current scaffold gaps slated for 0.6.x.
- This release was validated by a fresh clean-room downstream project consuming the
  frozen packages via `file:` — the freeze dropped no symbol.

### Fixed

- **`@pneuma-framework/host-kit` no longer ships `workspace:*` dependencies.** It
  was the only package still leaking `workspace:*`, which broke `file:` consumption
  by downstream projects. Converted to `file:`, and host-kit is now exercised by the
  local-package-consumption gate so the regression cannot recur.
- **`scaffold-host` emits installable framework dependency paths when the CLI is
  installed via `file:`.** Resolution now follows the package graph
  (`import.meta.resolve`) instead of an in-monorepo layout assumption, so a
  scaffolded Host's `bun install` succeeds outside the monorepo.

### Semver intent

- 0.5.x treats the enumerated barrels as the committed public surface. Within
  0.5.x, additions are minor/patch; any removal or relocation of a currently
  reachable symbol is a breaking change reserved for a future major-intent train.

### Removed

- **The five legacy build-thread message helpers are removed (breaking vs 0.4.0).**
  They were thin aliases over the provider-neutral role/content surface and are
  no longer exported from `@pneuma-framework/core`:
  - `PackedAgentMessage`, `AnthropicMessage`, `OpencodeMessage` →
    use `BuildTurnRoleContentMessage`.
  - `pneumaTurnsToAnthropicMessages`, `pneumaTurnsToOpencodeMessages` →
    use `packBuildTurnsForRoleContent`.

### Notes

- The `@pneuma-framework/core-domain` SQLite/Drizzle layer (`repositories/bun-sqlite*`,
  `persistence/sqlite/*`, and `repositories/cell-codec`) is intentionally left in
  the main public barrel for 0.5.0 so this freeze stays non-breaking. It is a
  candidate to move behind a dedicated `/sqlite` subpath export in 0.6.0; that
  relocation is breaking and is deliberately deferred.

## [0.4.0] — 2026-05-31

The **implementation-framework / production-host** train. Where 0.1–0.3 pinned
contracts and governance vocabulary, 0.4.0 makes a real, full-stack Creation Host
*consume* the framework instead of re-deriving it — proven end-to-end against a
real code agent, a real database, and a real cloud deploy. Rolls up M45–M53.

### Added

- **`@pneuma-framework/host-kit`** — the Creation Host Implementation Kit (M45).
  Workspace mechanics (`copy` / `list` / `diff` / protected-root checks) and
  `buildGovernedProposal`: a closure-driven, fail-closed governed-change backbone.
  The Host passes `runAgent` / `isAgentTimeout` / `verify` / `observe`; the
  framework owns the sequencing and the gates.
- **Batteries-included reference adapters** (opt-in packages; the framework core
  never depends on them):
  - `@pneuma-framework/backend-codex` — the Codex app-server code-agent lane,
    with completion-signal-set handling and a fail-closed turn timeout.
  - `@pneuma-framework/adapter-vercel` — Vercel REST deploy (content-addressed
    two-phase upload, READY poll, structured receipt).
  - `@pneuma-framework/adapter-neon` — Neon copy-on-write branching for Preview
    Data Rehearsal.
- **Production Generated App scaffold profile** (M52) — a Developer-authored
  Bun + Hono + React + Drizzle + Zod stack with a Neon boundary and Docker/Vercel
  targets. A profile choice, not framework semantics.
- **Production-profile Creation Host integration** (M53) — the full governed loop
  wired end-to-end: create-from-profile → disposable preview → code-agent draft →
  verify gate → proposal → approve/apply (`vNext`) → publish (Neon migrate +
  Vercel REST) → rollback, with both a deterministic lane and a real-Codex lane.
- **Workflow App Studio** reference Host line (M48), the **Agent Debug Loop**
  (M49 / ADR-0049: budgeted pre-proposal repair attempts, fail-closed to
  no-proposal), and the M50/M51 lifecycle-UX and verification hardening.
- **Documentation site** (`site/`, VitePress, bilingual EN / 简体中文,
  GitHub Pages): top-down Architecture, a second-level Concepts deep-dive section
  (verify gate, proposal evidence, apply/versions, publish receipts, rollback,
  preview rehearsal, the two change models, definition-as-data, BuildThread), a
  goal-driven Build-a-Host guide, a coding-agent router, and a root `llms.txt`.
- **Clean-room reproductions** — `examples/clean-room-release-board` (Generated
  App scaffold) and `examples/clean-room-release-host` (Creation Host studio),
  built from the goal alone and exercising the whole loop against live
  Codex / Neon / Vercel.

### Changed

- All framework packages bumped `0.2.0` → `0.4.0`.
- Host Kit's governed-change backbone is now the canonical proposal gate; the
  reference examples consume it rather than hand-rolling the sequence (M46/M47).

### Notes

- Vercel/Neon adapters and the structured deploy receipt remain Host/example-local
  by design; promoting the receipt into a framework package is a deliberate
  post-RC decision, not a gap.

## [0.3.0] — 2026-05-12 (release-candidate train; snapshot accepted)

Minimum **enterprise-governance** train (M40–M43). Adds a framework-owned
role/route/evaluator vocabulary for build-change governance, without becoming an
identity or audit platform.

- Explicit governance roles — `builder`, `reviewer`, `owner`, `operator`,
  `end_user` — *mapped* by the Host, not authenticated by the framework.
- `BuildChangeGovernancePolicy` routes standard changes to a Reviewer and
  high-risk changes to an Owner.
- Fail-closed decisions: Builder self-approval does not satisfy required review;
  denials block; app mismatch fails closed. Governance is wired into Build Change
  Assurance so `ready_to_publish` blocks when review is required and not allowed.
- Identity, team directory, workflow assignment, credential vaulting, and audit
  retention stay Host-owned.

## [0.2.0] — release-candidate train (developer contract + package consumption)

The first versioned roll-up after post-RC stabilization (M26–M38). Packages the
Developer-facing contract so a fresh downstream Host can install the framework
locally and adopt the assurance loop.

- Hardened **Code Change Lane** (proposal/apply/reject over draft workspaces),
  explicit **runtime composition** (mode, health diagnostics, request
  fallthrough, readiness), and the **HostExtension slot** contract.
- `AgentBackend.runTurn` over BuildThread source-of-truth turns; shared
  **credential utilities** (session hashing, OAuth state, no-secret rebinding
  evidence).
- **Build Assurance** lane: review packets, assurance cases, a durable case
  store, and the recovery-drill matrix, with an adoption guide.
- **Package-consumption gate** (`bun run test:package-consumption`): developer
  packages use `file:` internal deps and focused subpath exports, verified by a
  repo-external smoke gate.

## [0.1.3] — Code Change Lane (executable)

Adds the minimal executable bridge from Scaffold Project + BuildThread to governed
source changes (ADR-0034): prepare proposal evidence from a draft workspace, apply
only after approval, fail stale bases before mutation, roll back failed post-apply
checks.

## [0.1.2] — BuildThread

Adds BuildThread (ADR-0032): the framework-owned semantic transcript of Builder
conversation (proposal / decision / execution-receipt turns) as the portable
source of truth, with backend-native sessions demoted to cache/optimization.

## [0.1.1] — developer-contract clarifications

Surfaces conventions exposed by external (DevBoard) downstream pressure: hidden
runtime, AppConfig, rollout, and Authoring Kit conventions; clarifies the
developer contracts a downstream Host actually consumes.

## [0.1.0] — first developer-facing candidate

The first release candidate (M21–M25):

- **Creation Host Authoring Kit** contracts (`BuildAgentPackageManifest`,
  `ProviderCapabilityMatrix`, `ShareArtifactManifest`, provider parity hooks).
- **Sharing Governance** contracts (`SharingGovernanceManifest`,
  `CredentialRebindingEvidence`, share/fork/install rights, fork lineage,
  no-secret credential rebinding).
- RC pressure evidence (Alice/Bob/Charlie/Dave) and Developer-first onboarding
  (`scaffold-host`, `doctor-host`, the profile contract helpers).

[0.4.0]: https://github.com/pandazki/pneuma-framework/releases/tag/v0.4.0
