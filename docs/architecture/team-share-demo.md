# Team Share Package: M54, A Governed Loop Out Of The Box On PneumaSpace

**Date:** 2026-11-24
**Status:** Current team-share package for Milestone 54 — An out-of-the-box governed loop on PneumaSpace
**Audience:** teammates with zero context on either repository who understand normal software
**Format:** 30-minute share, about 10 minutes of it a live demo on one laptop
**Code:** pneuma-framework main `5d2f1a5`; PneumaSpace `6e73538` (the commit `examples/space-all-in-one/compose.yaml` pins)
**Chinese version:** [team-share-demo.zh-CN.md](./team-share-demo.zh-CN.md)

> This file replaces the 60–70 minute package for the RC 0.3.0 baseline + 0.4.0 state (2026-05-12). That text is in git history: `git show 9c947e0:docs/architecture/team-share-demo.md`.

This file holds two things: a click-by-click script for the live demo, and a slide-by-slide outline of the deck around it. Both rest on the milestone snapshot, [`milestone-54-snapshot.md`](../archive/milestone-54-snapshot.md). The demo retells the no-context end-to-end run of 2026-11-24, written up in [pneuma-framework#17](https://github.com/pandazki/pneuma-framework/issues/17). Commands come from the [example README](../../examples/space-all-in-one/README.md) and the CLI's usage text in `examples/space-all-in-one/bin/pneuma.mjs`.

## Outcome

After the share, the team should be able to say:

```text
One governed loop, with one knob, now runs out of the box on a runtime built for these apps:
an agent with no context can create, change and hand over an app, and the person who owns it
can see, decide and go back without being a programmer.
```

They should also know what is not done: the Host that joins the two repositories is an example to copy, not a package to import; undo does not bring stored data back on the default stack; on one machine the owner is not authenticated; PneumaSpace's local admin API accepts cross-site writes (pandazki/pneuma-space#43); positioning, naming and packaging have not started.

## One-Sentence Framing

> One governed loop, with one knob, now runs out of the box on PneumaSpace: an agent with no context can create, change and hand over an app, and the owner can see, decide and go back without being a programmer.

中文讲法：

> 一条受治理的回路、一个旋钮，现在在 PneumaSpace 上开箱即用：一个没有任何上下文的 agent 能创建、修改并交接一个应用，应用的主人不必是程序员，也能看清、做决定、回到以前。

## Opening Narrative

Say this over slide 1. Learn it by heart.

> People can now build a small app of their own by talking to an agent. What they cannot do is the work around the app: keep versions, plan a change, decide how the data is stored, recover when something goes wrong. The question these two projects exist to answer is: when agent coding becomes a basic capability inside any agent product, how do we give it infrastructure that works out of the box? In the next thirty minutes I will show, live, the first time that question has a working answer for one person with a coding agent, and I will say exactly where it is still only an example.

## Share Run Of Show

| Time | Section | Slides | Goal |
|---:|---|---|---|
| 0:00–3:00 | The question and the people | 1–2 | The room knows which problem and which users. |
| 3:00–11:00 | The model | 3–7, pause | Three layers, the thesis, the loop and its knob, the record, declared reversibility. |
| 11:00–21:00 | Live demo | 8 | The story of #17, on screen. |
| 21:00–24:30 | Evidence and boundary | 9–10 | What was verified, and what was not. |
| 24:30–30:00 | Where this goes | 11–13 | The worry, the next phase, four decisions. |

Questions come after 30:00. "Questions To Expect" below has the answers ready.

## Before The Talk

### What you need

- Docker with a recent Compose and buildx; the Host image uses additional build contexts. The README's runs used colima and Docker Desktop on macOS. On Linux, Docker Engine with the Compose and buildx plugins is enough.
- Bun 1.4.5 (the version the repository pins) and Node 24 or newer. Any Node 18+ runs the CLI; the host-driven step needs 24+, and with an older Node the app's own share of the tests is recorded as unknown.
- A logged-in Codex or Claude Code. #17 used codex-cli 0.167.0; the README's earlier runs also used Claude Code 2.1.330.
- A clone of pneuma-framework at `5d2f1a5` or later. For the host-driven step only, a clone of pandazki/pneuma-space for its `appctl`, at `6e73538`, the commit the compose file pins.
- Network access for the first build. It pulls `node:24`, redis and rustfs, and fetches PneumaSpace from GitHub at the pinned commit.

### Bring the stack up (the day before)

```sh
git clone https://github.com/pandazki/pneuma-framework.git
cd pneuma-framework
bun install --frozen-lockfile            # once, at the repo root; the host-driven step needs it
cd examples/space-all-in-one
docker compose up -d --build             # PneumaSpace + the Host; first build pulls node:24, redis, rustfs
```

To build PneumaSpace from a local checkout instead of the pinned commit, copy `.env.example` to `.env` and set `PNEUMA_SPACE_CONTEXT` to the checkout's path.

In the terminal you will use for the host-driven step:

```sh
cd examples/space-all-in-one
export PNEUMA_SPACE_CLI=/path/to/pneuma-space/cli/appctl.ts
```

### If the default ports are taken

The last run needed this: another stack of this example held the default project name, network and ports, and 21 unrelated containers were running (#17). The stack listens on four ports, all on 127.0.0.1. When one is taken, set another in `.env`:

| Variable | Default | What listens there |
| --- | --- | --- |
| `PNEUMA_SPACE_HTTP_PORT` | 8080 | the apps, at `/apps/<name>/` |
| `PNEUMA_SPACE_ADMIN_PORT` | 8081 | the PneumaSpace console and admin API |
| `PNEUMA_SPACE_OBJECT_PORT` | 9000 | the object store |
| `PNEUMA_HOST_PORT` | 8090 | the Host: the owner page and the API the CLI calls |

A second stack beside a first one needs its own compose project name, Docker network name, ports and apps directory. From a second checkout (`git worktree add`, for instance), put these lines in that checkout's `.env`. From the same checkout, put them in another file and pass it to every `docker compose` command for that stack with `--env-file`. That file replaces `.env` for the command, so repeat any line of `.env` you rely on, such as `PNEUMA_SPACE_CONTEXT`.

```sh
COMPOSE_PROJECT_NAME=pneuma-second
PNEUMA_SPACE_NETWORK=pneuma-second
PNEUMA_SPACE_HTTP_PORT=48360
PNEUMA_SPACE_ADMIN_PORT=48361
PNEUMA_SPACE_OBJECT_PORT=48362
PNEUMA_HOST_PORT=48363
PNEUMA_APPS_DIR=/path/to/second-apps    # create it first, so that it is yours
```

```sh
docker compose --env-file second.env up -d --build
```

The Host writes its own address into `.pneuma-framework/host.json` of the apps directory when it starts, so the CLI in that directory finds the second Host with nothing set. With moved ports, every address in this runbook changes: apps at `PNEUMA_SPACE_HTTP_PORT` instead of 8080, the owner page at `PNEUMA_HOST_PORT` instead of 8090, the console at `PNEUMA_SPACE_ADMIN_PORT` instead of 8081. The agent sessions start in `PNEUMA_APPS_DIR` instead of `examples/space-all-in-one/apps`, and every `docker compose` command, the log command included, takes `--env-file second.env`.

The host-driven step does not go through the served Host. It talks to PneumaSpace itself and reads the addresses from its environment, with the defaults 8081, 8080 and `./apps` (`src/space.ts`, `src/config.ts`). The README does not cover this case. With moved ports, export these in that terminal as well, and check them in the dry run:

```sh
export PNEUMA_SPACE_ADMIN=http://127.0.0.1:48361
export PNEUMA_SPACE_INGRESS=http://127.0.0.1:48360
export PNEUMA_SPACE_PUBLIC=http://127.0.0.1:48360
export PNEUMA_APPS_DIR=/path/to/second-apps
```

### Check that everything is healthy

In `examples/space-all-in-one`:

```sh
docker compose ps
curl -si http://127.0.0.1:8090/apps | grep -i pneuma-host-api
node bin/pneuma.mjs list
open http://127.0.0.1:8090/              # the owner page (open is macOS; use the browser elsewhere)
open http://127.0.0.1:8081/              # the PneumaSpace console
```

What you should see:

- `docker compose ps`: six services up (gateway, runner, rustfs, redis, screenshot, host), the gateway healthy. `postgres` appears only with `--profile postgres`, which this demo does not use.
- `curl`: `pneuma-host-api: 2`.
- `list` on a fresh stack: `no apps yet. Create one with: node .pneuma-framework/pneuma.mjs create <name>`. If it says the Host is older than this CLI and to rebuild it, run `docker compose up -d --build` again.
- Port 8090: the owner page, headed "My apps". Port 8081: the PneumaSpace console.
- `apps/` now holds `AGENTS.md`, `CLAUDE.md` and `.pneuma-framework/`. The Host wrote them when it started. This is what the agent will find.

### Get the owner link

```sh
docker compose logs host | grep "owner link"
```

The line ends with `http://127.0.0.1:8090/#owner=<token>`. Open it in the browser tab you will present from. The page moves the token into that tab's session storage and takes it out of the address bar, so decisions work in that tab only. Keep it open. The link survives a Host restart, but a page opened before the restart asks for it again. Do not show the log line on the projector, and do not paste the link into an agent session: the demo shows that the agent does not have it.

### Pre-create, so the demo does not wait

1. **A full dry run, the same day.** Run the whole Live Script below once, sections 1 to 7, on an app called `reading-rehearsal` (put that name in the prompts). It shows that this machine and this agent login work today and how long each step takes here, and it leaves a complete history to show if a live step stalls.
2. **A waiting change, within the hour before the talk.** Run sections 1 to 3 on `reading-waiting` and leave its deletion waiting. If the live deletion in section 3 does not stop, section 4 uses this one. Its preview ends itself 3600 s after it was published (the default `PNEUMA_PREVIEW_TTL`); after that, "Show it to me again" on the page publishes it again, which took about 10 s in the README's run.
3. **Do not create `reading-list`.** The demo creates it. `list` will show the two rehearsal apps beside it, with `reading-waiting`'s change waiting; say so when it appears.
4. **Terminals**, with a large font. Start each from a plain terminal, not from inside another agent: an agent started from another agent's terminal inherits its markers, and the record may then name the agent `unknown`.
   - T1 in `examples/space-all-in-one/apps`, for the agent sessions.
   - T2 in `examples/space-all-in-one`, with `PNEUMA_SPACE_CLI` exported, for the host-driven step.
   - Optional T3, off screen: `docker compose logs -f host`.
5. **Browser**: the owner tab on http://127.0.0.1:8090/, and one tab for the app.
6. **The agent**: start it once in a scratch directory and check that it answers. Start Codex as `codex -c sandbox_workspace_write.network_access=true`: its default sandbox blocks loopback connections, so `npm test` cannot open its port and `submit` cannot reach the Host. Claude Code asks before it runs `npm` and `node`; allow both.

## Story Before The Demo

Say this in one breath before section 1:

> Someone who reads a lot wants a small app for a reading list. They use a coding agent they already have, and they know nothing about versions, deploys or databases. A Host is running on this laptop with PneumaSpace under it. The agent gets no instructions about any of this: everything it needs is written in the directory it starts in. I play the owner.

## Live Script (about 10 minutes)

The budget per section is a plan, not a measurement; measured times from earlier runs are given where they exist. When a section runs over its budget, take its fallback line and move on.

| # | Section | Budget |
|---:|---|---:|
| 1 | An agent with no context creates the app | 2:30 |
| 2 | A second session: an ordinary change goes live by itself | 1:30 |
| 3 | The same session: a change that deletes stored data stops | 1:30 |
| 4 | The owner decides on the page | 1:30 |
| 5 | Going back past the one-way change | 1:00 |
| 6 | `list` and `history`: the record | 0:45 |
| 7 | The same loop host-driven, then a plain go-back | 1:15 |

The go-back past the one-way change comes in section 5 and the ordinary go-back at the end of section 7. The order is forced: once the one-way version is live, every go-back from it crosses it, so an ordinary go-back needs a newer version first. #17 ran in the same order.

Prompts to type. They are in the owner's voice and say nothing about the tooling, because the demo shows that the agent finds the protocol in the app directory.

| Section | English | 中文 |
|---|---|---|
| 1 | Make me a new app called reading-list: a list of books I want to read. Each book can have a short note, and I can tick it off when I've read it. Keep the list saved. | 帮我做一个叫 reading-list 的新应用：记下我想读的书，每本书可以写一句备注，读完了可以打勾。列表要保存下来。 |
| 2 | Add a search box that filters the books by title. | 加一个搜索框，按书名筛选。 |
| 3 | I don't want the notes any more. Remove them, including the ones already saved. | 备注我不想要了。把它去掉，已经存下的备注也一起删掉。 |
| 6 (optional) | How many apps do I have, and is anything waiting for me? | 我有几个应用？有没有什么在等我确认？ |
| 7 (host-driven intent) | Show how many books are still unread at the top. | 在页面顶部显示还有几本书没读。 |

### 1. An agent with no context creates the app

In T1 (`examples/space-all-in-one/apps`):

```sh
codex -c sandbox_workspace_write.network_access=true     # or: claude
```

Type prompt 1.

What you should see:

- The agent reads `AGENTS.md` in the apps directory and runs `node .pneuma-framework/pneuma.mjs create reading-list`. The CLI answers `published v1 at <address>` and `The app directory is …/apps/reading-list. Open it with your coding agent.` `create` took about 14 s in the README's run.
- It moves into `reading-list/`, edits, runs `npm test`, then `node .pneuma-framework/pneuma.mjs submit "<what was asked>"`. The answer starts `published v2 at http://127.0.0.1:8080/apps/reading-list/`, followed by `risks: …; approved by: policy:auto` and `recorded agent: codex (detected from …)`, or `claude-code`.
- While it works, put `reading-list/AGENTS.md` on screen. It opens with "This app is governed: read this part first".

Then open the app in the app tab and add two books, each with a note. Section 3 needs stored data to delete. If the app asks you to sign in, PneumaSpace's local login asks only for a name.

Key line:

> I did not tell it how to publish. It found the protocol in the directory, created the app, and published v2 through the Host's loop.

What to point at:

- `approved by: policy:auto`: the standing policy approved a routine change, and the record says so.
- In #17 this step started earlier still, in an empty directory outside any repository: the agent cloned the repository and brought the stack up itself, and reached a running app with stored data in 6 min 21 s and 30 commands, with no human input.

Fallback: if the agent reports that the sandbox stopped `submit`, nothing was released; restart Codex with the flag above. If the CLI cannot reach the Host, it names the address it tried and where that address came from; check `docker compose ps`. If the budget runs out, say what the agent is doing and switch to `reading-rehearsal` on the owner page, whose history shows the same v1 and v2.

### 2. A second session: an ordinary change goes live by itself

Quit the agent. Start a new session in the app directory:

```sh
cd reading-list
codex -c sandbox_workspace_write.network_access=true     # or: claude
```

Type prompt 2.

What you should see:

- The new session knows nothing of the first. It reads `AGENTS.md`, usually runs `status` and `history` first, then edits, tests and submits.
- `published v3 at …`, with risks such as `source_code_change, additive_ui` and `approved by: policy:auto`. Once submitted, a change the standing policy approves took 10 to 15 s in the README's run, most of it `npm ci` and one upload.
- On the owner page, reading-list's history shows the change in the words you typed, marked "Checked and tried out" and "approved automatically as a routine change".

Key line:

> Nothing about the app lived in the first session. The second one picked it up from the directory, and a routine change went live without anyone approving it by hand. It is still on the record.

Fallback: if the answer is `needs_approval`, the preset found a risk in the change; read the reasons out and continue with section 4. If it is `rejected (…)`, nothing was released; read the line under it (a protected file, for example) as the loop doing its job. If time is short, type prompts 2 and 3 as one message: in #17 the agent split such a request by itself, released the search box, and stopped at the deletion.

### 3. The same session: a change that deletes stored data stops

Type prompt 3 in the same session.

What you should see:

- `submit` answers `needs_approval <id>: nothing was released.`, then `risks: …` with `destructive_definition`, the disclosure lines, `preview: <address> (it ends itself at …)`, `Show this to the owner. They can open the preview, then decide with: node .pneuma-framework/pneuma.mjs approve <id>   (or deny)`, and `Or on the Host's page, opened from the owner link the Host printed when it started: http://127.0.0.1:8090/app/reading-list/change/<id>`.
- The agent stops and hands you the preview, the page link and the command. In #17 the agent did not try to approve.

Key line:

> The agent was asked to delete stored data, and the Host stopped the change. The agent cannot approve it; the decision comes to me.

What to point at:

- The app still serves v3. Nothing was released.
- If the agent does try `approve`, the CLI refuses without a terminal, and the Host answers 403 to an agent as approver. On one machine that is a speed bump, not a security boundary (slide 10).

Fallback: if the change went live as routine, say so plainly: the example preset's SQL rules are text patterns, and the agent's code held no statement they match. That is a known limit of the preset, not of the loop. Continue sections 4 to 7 on `reading-waiting`.

### 4. The owner decides on the page

In the owner tab, open http://127.0.0.1:8090/, or paste the link the agent gave into that same tab. "Waiting for you" lists the change above the app cards. Click it.

What you should see on "A change is waiting for you":

- "Nothing changes until you decide."
- "Now" and "With this change" side by side: two pictures, each with a link to the real thing. The second is the preview, a short-lived app on PneumaSpace.
- "What was checked": the tests that passed and how many are the app's own, that it started when tried out, how many files changed.
- "Why it needs you": only the risk the standing policy could not approve.
- "This one can't be taken back": "If you go back later, only the app goes back. The data this change removes stays removed, and the older version may not work with your data."

Click "Let it go live". The confirmation, "Before this goes live", says that everyone who opens reading-list gets this version right away. "Go live" stays disabled until you tick "I understand: going back later won't bring this data back." Tick it and click "Go live". The page says "It's live now."

Open the app: the notes are gone and the books are still there.

Key line:

> This page is for someone who is not a programmer. It shows before and after, says why I am asked, and makes me confirm that the data does not come back. Only then does the change go live.

What to point at:

- In the app's history: the new version, v4 if the steps went as above, marked "Can't be undone by going back" and "you confirmed it".
- "Details" holds the version id, the risk names, the change id and the terminal command for the same decision.

Fallback: if "Let it go live" is held back because the preview is no longer running, click "Show it to me again", look, then decide. If the page says to open it from your owner link, this tab does not hold the token; open the link from the Host's log again. The same decision in a terminal: `node .pneuma-framework/pneuma.mjs approve <id>`, then type `approve`.

### 5. Going back past the one-way change

In reading-list's history ("Changes"), on the version before the deletion (v3, with the search box), click "Go back to this".

What you should see on "Go back to v3?":

- "These changes will be undone:", listing the deletion.
- Under "Your stored data": "Your stored data can't be put back. Only the app goes back; the data stays as it is now, so the older version may not work with it."
- A box to tick, "I understand: the older version may not work with my data as it is now.", and "Go back".

Tick it and click "Go back". One of two things happens. Both are honest; say which one you got.

- **As in #17:** the older code does not start on today's data. The Host puts the address back on v4, nothing else moves, and the attempt is recorded as a `restore` that was `rejected`, reason `published_unhealthy`. The page shows the Host's own sentence, which in #17 was "could not republish v3 (GET / -> 500 internal error); the address is back on v4". The page has no plain sentence for this case yet; that is friction 4 in #17.
- **The older code starts:** the app runs v3's code and the notes do not come back. The history says "Only the app went back; your stored data stayed as it was."

Key line:

> On this stack nothing saved a copy of the data. The Host said so before I approved, says so again now, and records what happened. It does not pretend the data came back.

Fallback: the same in a terminal: `node .pneuma-framework/pneuma.mjs undo --to v3 --accept-one-way "<why>"` prints the refusal, then asks you to type `accept`.

### 6. `list` and `history`: the record

Optional, about 20 s: in T1 (`examples/space-all-in-one/apps`), start a fresh agent and type prompt 6. In #17 a no-context agent answered correctly in about 20 s with two commands, `list` and `status`, including the refused go-back.

Or run the commands yourself in T1:

```sh
node .pneuma-framework/pneuma.mjs list
node .pneuma-framework/pneuma.mjs history reading-list
```

What you should see:

- `list`: a first line saying how many apps the Host has, its mode, and what waits for the owner; then each app with its version, its address, and its last change (when, by which agent, what was asked).
- `history`: one line per attempt, oldest first, with the time, the kind, the outcome, the version, the agent with `[agent-driven]` or `[host-driven]`, and the words you used. Under each: the files, the approval (`policy:auto` or `user:me`), the tests, `guarantees: …`, a `ONE-WAY: …` line on the deletion, and the go-back attempt from section 5.

Key line:

> Everything I just did is here, in plain fields, inside the app's own directory. Another agent or another Host continues from it.

What to point at:

- `guarantees: verified, previewed, approved, sealed` on a released change. A guarantee that is absent was not given.
- `node .pneuma-framework/pneuma.mjs history reading-list --json` shows `"channel": "owner-page"` on the decision made on the page.

### 7. The same loop host-driven, then a plain go-back

In T2 (`examples/space-all-in-one`, `PNEUMA_SPACE_CLI` exported):

```sh
bun run drive change reading-list "Show how many books are still unread at the top" --agent codex
```

What you should see: this time the product starts the agent itself, on a draft, and takes the result through the same loop. The command prints `published v5 at …`, `changed: …` and `risks: …; approved by: policy:auto`. In #17 this took 64 s and was recorded as `codex [host-driven]`. If the entry says that how many tests are the app's own is unknown, that is friction 3 in #17: this lane runs the checks with the machine's Node.

Then, in the owner tab, in reading-list's history, click "Go back to this" on v4. "Go back to v4?" says under "Your stored data": "Your stored data stays as it is. Going back changes the app, not the data in it." Click "Go back". The page says "Done. The app is back to that version." In #17 this was recorded as a `restore` with outcome `rolled_back`. (If section 5 took the app back to v3, v5 was built on v3, and the plain go-back goes to v3.)

Key line:

> Same app directory, same history, another driver: this time a product started the agent. And an ordinary go-back is one click, because nothing one-way is in the way.

Fallback: if `drive` refuses because the working tree holds edits that were never submitted, it names them; run `node .pneuma-framework/pneuma.mjs discard` in `apps/reading-list` and run it again. Without a login, `--agent scripted` takes a change through the same loop. Never run the host-driven step and an agent session on the same app at the same moment.

## Architecture Readback

```text
  the owner's coding agent                      an agent product
  (Codex, Claude Code)                          (starts the agent itself)
  edits apps/<name>/ in place,                  bun run drive change <name> "<intent>"
  node .pneuma-framework/pneuma.mjs submit                        |
            |                                           |
            v                                           v
  +-------- layer 3: the Host (today the example examples/space-all-in-one) --------+
  |  layer 2, the governed loop: writable roots and protected paths -> npm test ->   |
  |  preview -> approval (policy:auto or the owner) -> release -> change record      |
  |  knob: record | personal | review-all      preset: policy/personal.json          |
  |  owner page + owner link                                                         |
  +------------------------------------+---------------------------------------------+
                                       | appctl publish --manager, admin API
                                       v
  layer 1, PneumaSpace (the runtime): gateway, runner, object store, redis
  previews as ephemeral apps (ADR 0038), apps managed by the Host (ADR 0039)

  apps/<name>/: AGENTS.md, CLAUDE.md, .pneuma-framework/ (versions/, history.jsonl, record.json)
  both control planes read and write this one directory and one history
```

| Demo moment | Concept | Where it lives |
|---|---|---|
| The agent finds the protocol | The app directory describes itself | `AGENTS.md`, `CLAUDE.md` and `.pneuma-framework/` in each app; the Host's block in the apps directory |
| v2 and v3 go live with `policy:auto` | One loop, `personal` mode, risk rules as a preset | `policy/personal.json`; `@pneuma-framework/core/enterprise-governance` |
| The deletion stops at `needs_approval` | No approval record, no change; the preset's one-way rule | [ADR-0039](./adr/0039-change-record-floor-and-declared-reversibility.md); `policy/personal.json` |
| Before and after on the page | The preview is an ephemeral app | PneumaSpace ADR 0038 |
| Only the Host releases the app | Managed apps (`X-Pneuma-Space-Manager`) | PneumaSpace ADR 0039 |
| "Can't be undone by going back" | Declared reversibility | `DataSnapshotCapability`, `restoreWithData` in `@pneuma-framework/host-kit/change-record` |
| `history` with guarantees | The change record | `.pneuma-framework/history.jsonl`, `.pneuma-framework/versions/`, `.pneuma-framework/record.json` |
| `drive change … --agent codex` | The host-driven control plane | `examples/space-all-in-one/src/drive.ts` |
| Release, probe, put the address back | Release-and-settle, in the example and not in host-kit | `examples/space-all-in-one/src/host.ts` (2338 lines) |

Say the last row out loud. Slide 11 starts from it.

## What This Proves / Does Not Prove Yet

In talk-track words: for one person with a Claude Code or Codex subscription, the loop works out of the box. An agent with no context created an app, a second one changed it, the change that deleted data waited for the owner, and the owner decided and went back on a page written for a non-programmer. A product that starts the agent itself uses the same loop over the same directory and history.

What it does not prove: that a product can import the Host (it copies the example); that undo brings data back (the default stack declares no snapshot); that the owner is a real, authenticated person (on one machine, no); that PneumaSpace's local front door is closed (space #43); that one preset covers build time and run time; that Claude Code, many users, hosting or Kubernetes were covered in this final run; that anyone has started positioning, naming or packaging; that the record yet helps the next similar app. The snapshot's [What This Does Not Prove Yet](../archive/milestone-54-snapshot.md#what-this-does-not-prove-yet) has each line with why it matters.

## Deck Outline: 30 Minutes, Slide By Slide

The Live Script above is the demo. This is the deck around it: what each slide carries, how long it takes, and what the presenter says.

| # | Slide | Time | Hero image |
|---:|---|---:|---|
| 1 | The question | 1:30 | — |
| 2 | The apps and the three roles | 1:30 | — |
| 3 | Three layers | 1:30 | `m54-system-architecture` |
| 4 | The thesis | 1:00 | — |
| 5 | The loop and its one knob | 2:00 | `m54-end-to-end-loop` |
| 6 | The record, and what "guarantees" means | 1:30 | — |
| 7 | Declared reversibility | 1:30 | — |
| — | Pause for questions on the framing; skip if no hands | 0:30 | — |
| 8 | Live demo | 10:00 | — |
| 9 | What was verified | 1:30 | `m54-coverage` |
| 10 | What is not proven | 2:00 | — |
| 11 | Strategic read | 1:30 | — |
| 12 | Recommended next phase | 1:30 | `m54-roadmap` |
| 13 | Decision gate | 2:30 | — |

Total: 30:00.

### Slide 1 — The question (1:30)

On the slide: the title, then the owner's question as written: "agent coding 作为基础能力，可以被集成到任意的 agent 产品下时，如何提供一个开箱即用的，agent native 的 infra", with the English under it: "When agent coding becomes a basic capability that can be built into any agent product, how do we provide infrastructure that works out of the box and is agent native?"

- Say the Opening Narrative.
- Ordinary people can build their own apps with an agent. They cannot do version control, change planning, persistence design or disaster recovery.
- Those should be capabilities and presets the software provides, which a developer presets by scenario and cost, so the user works with an ordinary agent and carries no extra mental load.
- This share covers how far M54 got on that question, and where it stops.

### Slide 2 — The apps and the three roles (1:30)

On the slide: the apps are short or long lived, changed again and again, rarely visited, highly custom, with vague requirements, quickly built and quickly discarded. Roles: Developer, Builder, End User.

- These apps are unlike traditional software. That is why there is a separate, lighter runtime for them.
- The Developer builds an agent product and adopts the open-source project. The Builder is the ordinary person. The End User uses the app.
- In the demo one person plays Builder, owner and End User. The Developer is whoever assembled the Host; today that is the example.

### Slide 3 — Three layers (1:30) · image `m54-system-architecture`

On the slide: (1) PneumaSpace, the runtime. (2) The framework's loop kernel, the governance. (3) A pre-assembled headless Host that joins the two by a preset.

- pneuma-framework came first, for auditable development. PneumaSpace was started for the runtime sub-problem: a lighter runtime for apps of this kind.
- Before M54 the two repositories did not reference each other.
- Layer 3 did not exist before this milestone. It is what "integrated into any agent product" means.
- Today layer 3 is `examples/space-all-in-one`, an example to copy and not a package to import. Say it now; slides 10 and 11 come back to it.

### Slide 4 — The thesis (1:00)

On the slide, in bold: "One governed loop, with one knob, now runs out of the box on a runtime built for these apps: an agent with no context can create, change and hand over an app, and the person who owns it can see, decide and go back without being a programmer." Under it: "Proven for: the individual with a coding agent (agent-driven), and a product that starts the agent itself (host-driven), over the same app directory and one history." And: "Not the same as: an importable Host for integrators, multi-user or hosted operation, or data that always comes back on undo."

- Read the thesis word for word.
- "Out of the box" is proven for a person with a Claude Code or Codex subscription. For a Developer integrating it into an agent product it is shown by reference only.
- The demo will show each clause of the thesis.

### Slide 5 — The loop and its one knob (2:00) · image `m54-end-to-end-loop`

On the slide: edit in place → `submit` → writable roots and protected paths → `npm test` → preview → approval → release under the app's stable address → record. The knob, `PNEUMA_GOVERNANCE`: `record`, `personal`, `review-all`.

- Two control planes over one app directory: agent-driven (`node .pneuma-framework/pneuma.mjs submit`) and host-driven (`bun run drive change <app> "<intent>" --agent codex|claude-code|scripted`).
- `record`: nothing checked, everything recorded. `personal`: checks and a preview always; `policy:auto` approves ordinary changes; the owner decides risky ones. `review-all`: the owner decides every change. The demo runs in `personal`.
- In the governed modes the rule is: no approval record, no change.
- Which change is risky is a preset file (`policy/*.json`), not code. This is where a developer presets by scenario and cost.

### Slide 6 — The record, and what "guarantees" means (1:30)

On the slide: one history entry. What was asked, what changed, and which guarantees held: `verified`, `previewed`, `approved`, `sealed`. One-way changes are recorded.

- The record is the floor under every mode ([ADR-0039](./adr/0039-change-record-floor-and-declared-reversibility.md), `@pneuma-framework/host-kit/change-record`). Even `record` mode keeps it.
- A guarantee names what was done for that entry. If it is absent, it was not given. An entry in `record` mode, an undo and a data snapshot carry none.
- The record lives in the app directory (`.pneuma-framework/`), so another agent or another Host continues the same history.
- It is a history for people and agents to read, not an authority: the coding agent can write that file.

### Slide 7 — Declared reversibility (1:30)

On the slide: whether a change can be undone is something a Host declares. `DataSnapshotCapability {snapshot, restore, check?}`. With it, `restoreWithData` puts code and data back together. Without it, going back past a one-way change puts back code only, and only after the owner confirms.

- The first-run stack declares no snapshot capability. The demo shows that default.
- The owner is told the cost before approving a one-way change, and again before going back past it.
- A practice for apps on PostgreSQL (`postgres-template`) exists and was run live. It is a practice, not a default, and nothing ends its snapshots yet (pneuma-framework#14).
- The snapshot's "Rollback / Reversibility Path" section has the detail.

### Pause (0:30)

"Any questions on the framing before the demo?" Skip if there are no hands.

### Slide 8 — Live demo (10:00)

On the slide: "Live: reading-list", and the seven section titles of the Live Script.

- Say the Story Before The Demo.
- Follow the Live Script and watch the budget per section.
- If a step stalls, switch to the rehearsal app. Do not debug on stage.
- End with `history` on screen.

### Slide 9 — What was verified (1:30) · image `m54-coverage`

On the slide: the image, or a screenshot of the snapshot's [M54 Verification Matrix](../archive/milestone-54-snapshot.md#m54-verification-matrix).

- CI on framework `5d2f1a5`: the offline gate passes. The full `bun test` on the head of PR #16 before its merge, run during the follow-up work and not written in a PR body: 1849 pass, 2 skip, 0 fail.
- PneumaSpace `6e73538`: `npm run test:unit` rerun by the reviewer on the space #42 branch before merging it: 612 pass, 1 skip, 0 fail; docker 122/122 and acceptance 64/64 as stated by the PR author; `test:k8s` not run.
- Live: #17 is the story just shown (first run 6 min 21 s, returning change 2 min 16 s, host-driven change 64 s, four frictions). The example README's Status table records the runs of 2026-11-23/24 in 39 rows, and a "Not run live" list.
- Several failure paths are covered by tests and not by a live run.

### Slide 10 — What is not proven (2:00)

On the slide, one line each:

1. Layer 3 as a package: there is no importable pre-assembled Host; an integrator copies the example.
2. Data on undo by default: the first-run stack declares no snapshot capability.
3. A real owner: on one machine the owner is not authenticated.
4. The runtime's own front door: under `local` mode PneumaSpace's admin API accepts cross-site writes (space #43).
5. One preset surface: build-time and run-time presets are still two halves.
6. Other agents and scale: Claude Code not in the final run; multi-user, hosted and Kubernetes paths not rerun.
7. The second half of the original ask: positioning, naming, packaging and promotion have not started.
8. Reuse across apps: the record is the raw material; nothing derives preferences from it yet.

- Read each line. Do not soften any of them.
- Stress the first three. On line 3: `approve` asks for a terminal and the page asks for a link the agent could read. Both stop an honest agent, not a hostile process.
- On line 2: PneumaSpace's cheap path (immutable releases, a quiescent point at release, files plus SQLite) is not used; only the PostgreSQL practice exists.
- Point to the snapshot's [What This Does Not Prove Yet](../archive/milestone-54-snapshot.md#what-this-does-not-prove-yet) and the open issues: framework #14 and #17, space #41 and #43.

### Slide 11 — Strategic read (1:30)

On the slide: (1) The worry is not the loop; it is where the loop lives. (2) "Cannot be broken" is honest today, but thin. (3) The product question is open while the engineering is ahead of it.

- (1) The example Host carries logic the framework should own: publish, probe, put the address back, what serves now, previews. Five review rounds kept finding defects in that code and did not converge, because the example infers facts the runtime owns. Every integrator would inherit that.
- (2) The default path says truthfully that data does not come back. For ordinary people the promise becomes real only when a snapshot at release is the default on the default storage.
- (3) One product or two, who the first design partner is, and what the entry project is are all open. The engineering can now carry that discussion; a week ago it could not.
- The snapshot's [Strategic Read](../archive/milestone-54-snapshot.md#strategic-read) has the three paragraphs.

### Slide 12 — Recommended next phase (1:30) · image `m54-roadmap`

On the slide: "Make layer 3 real: a pre-assembled Host a product can import, with reversibility on by default." Five workstreams, and the constraint.

- (a) Release-and-settle and preview move into host-kit; the example Host shrinks to wiring. (b) PneumaSpace reports what serves, and takes a snapshot at the release quiescent point for files plus SQLite.
- (c) One preset that spans build time and run time. (d) Close the local front door (space #43) and decide the owner's identity on one machine.
- (e) Positioning and the entry project: the owner's call, deferred by the owner on 2026-11-23.
- The constraint: no new product surface inside the example until (a) is done. See the snapshot's [Recommended Next Phase](../archive/milestone-54-snapshot.md#recommended-next-phase) and [roadmap.md](./roadmap.md).

### Slide 13 — Decision gate (2:30)

On the slide, word for word:

1. Do we accept that the integrator story is "copy the example" for now, and make "import a Host" the next milestone?
2. Is one product with two layers (PneumaSpace as the entry, the governed loop as the layer on top) the outward shape, or do the two stay separate products?
3. Do we promise "undo brings your data back" by default, which commits PneumaSpace to snapshots at release?
4. Is there a first design partner, and is it an individual-developer audience or an agent-product team?

- Read the four questions word for word. Add no opinion.
- Wait. Ask each person for a yes or a no on each question.
- Write the answers down for the owner; the snapshot's [Team Decision Gate](../archive/milestone-54-snapshot.md#team-decision-gate) holds the same four questions.

## Reference Deck Assets

| Slide | Image | What it shows |
|---|---|---|
| 3 | [`m54-system-architecture.png`](./spec/images/m54-system-architecture.png) | The three layers, the two control planes entering the Host, and the one app directory both of them use. |
| 5 | [`m54-end-to-end-loop.png`](./spec/images/m54-end-to-end-loop.png) | The loop from an edit to a record entry, with the knob and the point where the owner comes in. |
| 9 | [`m54-coverage.png`](./spec/images/m54-coverage.png) | Coverage by layer and by decision: which layers are partial, which ADR-0039 decisions are full, and the one that is not. For what was run live against what only tests cover, use the verification matrix. |
| 12 | [`m54-roadmap.png`](./spec/images/m54-roadmap.png) | M54 closed, then the next phase "make layer 3 real" with its workstreams. No dates. |

The four images are in `docs/architecture/spec/images/`, each in English and as a `.zh-CN` version, with the SVG sources beside them.

To produce the deck:

1. Read this file and the [M54 snapshot](../archive/milestone-54-snapshot.md) once, for tone.
2. Build the 13 slides from the outline; put the images in once they exist.
3. Screenshot the snapshot's "M54 Verification Matrix" for slide 9.
4. Rehearse slide 1 (with the Opening Narrative), slide 4 and slide 13 until they are word for word. Everything else can be paraphrased.

## Questions To Expect

**Can I import this into my product?**
Not yet. What is importable today is `@pneuma-framework/host-kit/change-record` (914 lines) and `governed-change` (210 lines). The Host that joins them to PneumaSpace (publish, probe, put the address back, what serves now, previews) is `examples/space-all-in-one/src/host.ts`, 2338 lines, and an integrator would copy it. The recommended next phase moves that logic into host-kit. Decision-gate question 1.

**Does undo bring my data back?**
Not on the default stack. It declares no data snapshot, so going back past a one-way change puts back code only, after the owner confirms, and the Host says so before the approval and again before the go-back. A practice for apps on PostgreSQL copies the database before a one-way change and was run live; it covers PostgreSQL only, needs superuser access to the server, and nothing ends its snapshots (#14). Making data come back by default commits PneumaSpace to snapshots at release. Decision-gate question 3.

**What stops the agent from approving its own change?**
On one machine, three speed bumps and no login. `approve` needs a terminal, which a coding agent runs without. The Host answers 403 when an agent, or `policy:auto`, approves a risky change. The page decides only with the owner link printed in the Host's log. An agent with a shell could read that log, so this stops an honest agent, not a hostile process. A real agent product replaces it with its own login. In #17 the agent did not try.

**Why two repos?**
pneuma-framework came first, for auditable development: the loop, the record, the governance. PneumaSpace was started for the runtime sub-problem, a lighter runtime for small apps that are changed often and visited rarely. They are layers 1 and 2; the Host is the layer that joins them. Before M54 they did not reference each other. Whether the outward shape is one product with two layers or two products is open. Decision-gate question 2.

**Was Claude Code tested?**
Yes, live, earlier in the milestone (the README's Status table: agent-driven and host-driven lanes, a risky change, the PostgreSQL practice). Not in the final no-context run, #17, which used Codex.

**If I copy the app directory, does the data come with it?**
No. The directory carries the code, every version and the history, so another Host continues the same history. Stored data lives in PneumaSpace, in named Docker volumes. #17 lists this as friction 1: the README could say where the data lives and how to move it.

**Is it safe to run on my laptop?**
On one trusted machine. Under `local` mode PneumaSpace's admin API accepts cross-site writes from any web page (space #43), and the screenshot browser's request filter has known holes. The record lives where the agent works and is not protected against tampering.

**How much should we trust it?**
The milestone's work happened in about 26 hours (2026-11-23 14:09 to 2026-11-24 about 16:30 JST). CI and the test counts on slide 9 hold, and #17 passed end to end. Several failure paths are covered by tests and not by a live run. The close-out PRs were merged on CI and the author's live checks without a full review round, by the owner's decision. Five review rounds kept finding defects in the example Host's release-and-settle code and did not converge.

**What about many users, hosting, or Kubernetes?**
Not rerun in this milestone. PneumaSpace's `test:k8s`, hosted and multi-replica suites were not rerun.

**Is "agent native" what we call it?**
Positioning, naming, packaging and promotion have not started. The term "agent native" is in use elsewhere for a different idea.

**Does it learn from my earlier apps?**
No. The record is the raw material for that; nothing derives preferences from it yet.

## Tips For The Presenter

- **Slides 1 to 7 are the least rehearsed part of any technical share.** Learn the Opening Narrative and slide 4 word for word; paraphrase the rest.
- **Do the dry run on the day, on the same machine, network and agent login.** Note how long each section took. If section 1 ran far over its budget, plan to show it on `reading-rehearsal` and run sections 2 to 7 live.
- **Section 4 is the checkpoint.** If sections 1 to 4 worked live, the demo has made its point. When time is short, show sections 5 to 7 on `reading-rehearsal` rather than improvising.
- **Section 5 may be refused.** On this stack that is the honest result. Do not try again.
- **Never tell the agent how to use the tooling,** even when it hesitates. Answer as an owner who is not a programmer would. A tooling hint means the demo no longer shows what it claims.
- **An idle app sleeps** (after 60 idle seconds in #17) and wakes on the next request. If the app looks asleep, reload it.
- **Slide 13: do not answer the four questions for the room.** If someone says yes to all four, ask the next person.
- **Point, do not re-argue.** "Can I import it?": slides 10 and 11. "Does the data come back?": slide 7 and section 5. "Can the agent approve itself?": section 3 and slide 10.
- **Make the screen readable.** Zoom the browser and the terminals. The owner page switches between English and Chinese at the top.

## Links

- [Milestone 54 snapshot](../archive/milestone-54-snapshot.md): sections "Milestone Thesis", "End-To-End Loop", "Demo Story", "M54 Verification Matrix", "What This Does Not Prove Yet", "Strategic Read", "Recommended Next Phase", "Team Decision Gate", "Evidence".
- [roadmap.md](./roadmap.md) and [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md).
- [examples/space-all-in-one/README.md](../../examples/space-all-in-one/README.md): running the stack, both control planes, the owner page, the modes, one-way changes and undo, the PostgreSQL practice.
- [ADR-0039: change record floor and declared reversibility](./adr/0039-change-record-floor-and-declared-reversibility.md) and the [Change Record guide](../developer/change-record.md).
- [pneuma-framework#17](https://github.com/pandazki/pneuma-framework/issues/17), the end-to-end run this demo retells, and [#3](https://github.com/pandazki/pneuma-framework/issues/3), the earlier trial.
