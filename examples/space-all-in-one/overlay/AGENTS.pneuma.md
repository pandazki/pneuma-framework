# This app is governed: read this part first

This directory is a published app under a governed change loop. Its address, versions and history are in `.pneuma/`. Any coding agent can pick it up; the rules in this part are the whole protocol.

The part after this one, "PneumaSpace app template", describes the platform, the manifest and the SDK. Use it for writing code. It also explains publishing with `appctl`: **do not do that here.** In this directory a change goes live only through `submit`, described next.

## Changing this app (read this before the first edit)

1. See where things stand: `node .pneuma/pneuma.mjs status` (active version, address, uncommitted files, anything waiting for the owner) and `node .pneuma/pneuma.mjs history` (what was asked for and what changed, newest last).
2. Edit files in place. You may change `src/`, `public/app/`, `pneuma-space.json`, `package.json`, `package-lock.json` and this file. `sdk/`, `ui/`, `public/ui.css`, `public/ui.js`, `pneuma.scaffold.json` and `CLAUDE.md` are protected; a change that touches them is refused. Put your own styles and browser scripts under `public/app/`. `pneuma.scaffold.json` is the machine-readable form of these boundaries.
3. Submit: `node .pneuma/pneuma.mjs submit "<one sentence: what the user asked for>"`. The host copies your working tree, runs `npm ci --ignore-scripts && npm test`, boots the draft on PneumaSpace under a throwaway name, and only then releases it.
4. Read the answer:
   - `published`: the change is live at the printed address as a new version.
   - `rejected`: nothing was released. The reason and the tail of the failing output are printed; fix the working tree and submit again, or run `node .pneuma/pneuma.mjs discard` to put the working tree back to the active version.
   - `needs_approval`: the change is risky (it widens who can reach the app, or drops or rewrites stored data). Stop, show the user the printed disclosure, and let them decide. Only the owner runs `approve`; an agent never does.
5. To go back one version: `node .pneuma/pneuma.mjs undo "<why>"`. It restores the previous code and republishes it. Stored data is not rolled back, so keep schema changes additive.

A request to change the app is finished only when `submit` has answered. Files you edited and did not submit are not live; the next agent finds them listed as uncommitted and cannot tell whether they were meant.

`npm test` opens a port on 127.0.0.1 and `submit` calls the host at `PNEUMA_HOST` (default `http://127.0.0.1:8090`). If you run in a sandbox that blocks either, ask for permission to run that command outside it; do not skip the step. If `status` cannot reach the host at all, the stack is down: `docker compose up -d` in the `space-all-in-one` example of pneuma-framework.

## Notes for the next agent

Add a line here when you learn something the next agent needs (a data-model decision, a constraint the user stated). The next agent may be a different product; this file and `.pneuma/history.jsonl` are all it gets.

