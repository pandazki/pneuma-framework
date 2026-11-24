# This app is governed: read this part first

This directory is a published app with a recorded history. Its address, versions and history are in `.pneuma/`. Any coding agent can pick it up; the rules in this part are the whole protocol.

The part after this one, "PneumaSpace app template", describes the platform, the manifest and the SDK. Use it for writing code. It also explains publishing with `appctl`: **do not do that here.** In this directory a change goes live only through `submit`, described next.

## Changing this app (read this before the first edit)

1. See where things stand: `node .pneuma/pneuma.mjs status` and `node .pneuma/pneuma.mjs history`. `status` shows the active version, the address, uncommitted files and anything waiting for the owner. It also says which mode the host runs in and what `submit` does there. `history` shows what was asked for, what changed and what was guaranteed for each attempt, newest last. To see every app this host manages, with its version, address, last change and anything waiting for the owner, run `node .pneuma/pneuma.mjs list`.
2. Edit files in place. You may change `src/`, `public/app/`, `pneuma-space.json`, `package.json`, `package-lock.json` and this file. `sdk/`, `ui/`, `public/ui.css`, `public/ui.js`, `pneuma.scaffold.json` and `CLAUDE.md` are protected. Put your own styles and browser scripts under `public/app/`. `pneuma.scaffold.json` is the machine-readable form of these boundaries.
3. Add a test for every change in behaviour, and run `npm test` before you submit. Put it under `src/` in a file named `*.test.ts`, for example `src/app.test.ts`: `npm test` runs the SDK's own tests and yours (`node --test '**/*.test.ts'`; an app made from an earlier template runs `node --test 'sdk/*.test.ts' 'src/**/*.test.ts'`). If the `test` script in `package.json` names neither `src/` nor `**/`, add `'src/**/*.test.ts'` to it. Test files are not published. When `src/app.ts` exports the handler, the template's part below shows a test that serves it on a free port. Otherwise, the smallest test that checks the app through a real request starts `src/server.ts` on a free port and asks it for a page:

   ```ts
   import test from 'node:test';
   import assert from 'node:assert/strict';
   import { spawn } from 'node:child_process';
   import { once } from 'node:events';
   import { createServer } from 'node:net';
   import type { AddressInfo } from 'node:net';

   test('GET / answers with the home page', async (t) => {
     // Find a free port, then start the app on it, the way the platform starts it.
     const probe = createServer().listen(0, '127.0.0.1');
     await once(probe, 'listening');
     const port = (probe.address() as AddressInfo).port;
     probe.close();
     const app = spawn(process.execPath, ['src/server.ts'], { env: { ...process.env, PNEUMA_SPACE_PORT: String(port) }, stdio: 'inherit' });
     t.after(() => app.kill());

     // The app needs a moment before it listens.
     let res: Response | undefined;
     for (let attempt = 0; !res && attempt < 50; attempt++) {
       res = await fetch(`http://127.0.0.1:${port}/`).catch(() => undefined);
       if (!res) await new Promise((resolve) => setTimeout(resolve, 100));
     }
     assert.ok(res, 'the app did not answer');
     assert.equal(res.status, 200);
     assert.match(await res.text(), /<html/i);
   });
   ```

   Change the path, the method and the assertions to what you changed. Files under `public/` are served by the platform, not by `src/server.ts`, so a request in this test does not reach them; put the logic of a browser script in a module that a test can import. The host runs `npm test` again and records how many of the tests that ran are the app's own. When a change touches `src/` or `public/app/` and none of them ran, `submit` says so in one line.
4. Submit: `node .pneuma/pneuma.mjs submit "<one sentence: what the user asked for>"`. What the host does next depends on its mode, which `status` names:
   - `record`: it records your working tree as the next version and publishes it. Nothing checks or approves it, and the boundaries above are not enforced. If your change drops or rewrites stored data (a dropped column, rewritten rows), say so: add `--one-way "<what is lost>"`.
   - `personal` or `review-all`: it copies your working tree, refuses a change to a protected path or outside the paths above, runs `npm ci --ignore-scripts && npm test`, boots the draft on PneumaSpace as an ephemeral app under a throwaway name (the preview), and releases it only after it is approved.
5. Read the answer:
   - `published`: the change is live at the printed address as a new version.
   - `rejected`: nothing was released. The reason and the tail of the failing output are printed; fix the working tree and submit again, or run `node .pneuma/pneuma.mjs discard` to put the working tree back to the active version.
   - `needs_approval`: the change is risky (it widens who can reach the app, or drops or rewrites stored data). Stop, show the user the printed disclosure and the preview's address, and let them decide. Only the owner runs `approve`; an agent never does.
   - `recorded ... but it did not go live` (record mode): the version is in the history, the address still serves what it served before, and the command exits non-zero. Fix the cause and submit again, or undo.
6. To go back: `node .pneuma/pneuma.mjs undo "<why>"` goes back one version each time (v5, then v4, then v3). `undo --to <version> "<why>"` goes straight to an earlier one. Undo republishes that version's code. It does not roll back stored data, so keep schema changes additive. If going back would cross a change that dropped or rewrote stored data, undo refuses and says why, also when the host can put that data back (that would throw away what was stored since). Then stop and show the user the message. Only the owner can confirm going back, in a terminal.

A request to change the app is finished only when `submit` has answered. Files you edited and did not submit are not live; the next agent finds them listed as uncommitted and cannot tell whether they were meant.

`npm test` opens a port on 127.0.0.1 and `submit` calls the host. The CLI finds the host at the address the host recorded in `.pneuma/host.json`; `--host <url>` or `PNEUMA_HOST` overrides it. If you run in a sandbox that blocks either connection, ask for permission to run that command outside it; do not skip the step. If `status` cannot reach the host, the message names the address it tried and where that address came from. The host may be running on another address, or not running: ask the user for its address rather than starting anything yourself, then pass `--host <url>`.

## Notes for the next agent

Add a line here when you learn something the next agent needs (a data-model decision, a constraint the user stated). The next agent may be a different product; this file and `.pneuma/history.jsonl` are all it gets.
