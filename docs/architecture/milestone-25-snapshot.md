# Milestone 25 Snapshot: Alice Creation Host Prototype

**Status:** Closed after a Developer-first runnable prototype, M25 model/server tests, browser verification, screenshot evidence, and roadmap/docs update.

**Date:** 2026-05-06

**Chinese version:** [milestone-25-snapshot.zh-CN.md](./milestone-25-snapshot.zh-CN.md)

## Why M25 Exists

M24 proved the post-M23 contract set can carry the mawidget / dev-board story as executable contract pressure:

```text
Alice authors a Creation Host contract set.
Bob builds dev-board.
Charlie installs Bob's artifact with his own credentials.
Dave forks to a different provider profile.
```

The remaining gap was not another primitive. It was the Developer's cognitive path.

For a new Developer, the hard part is not first understanding why Charlie install is allowed or why Dave fork must remove Apple Notes. The hard part is earlier:

```text
Am I building an app?
Am I building an app builder?
What does the framework own?
What does my Creation Host own?
What does the Builder's generated app own?
What must the Build Agent know, and what must it never specialize?
```

M25 turns that path into a runnable prototype so the RC sharing example starts from Alice's mental model rather than from Bob's finished app.

## What Changed

### 1. Developer-First Prototype Example

M25 adds:

```text
examples/m25-alice-creation-host-prototype/
```

The prototype can be started with:

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run examples/m25-alice-creation-host-prototype/run.ts --port 8886
```

Open:

```text
http://127.0.0.1:8886/
```

It is a workbench for Alice, not a generated app UI. The primary axis is a 10-step Developer cognition path:

```text
1. Name the four-layer product boundary
2. Choose the Host profile exposed to Builders
3. Package Bob's Build Agent
4. Declare provider capability contracts
5. Create Bob's dev-board Generated Application
6. Run a Builder agent session
7. Prepare a portable share artifact
8. Validate Charlie install
9. Validate Dave fork to remote profile
10. Make the RC judgment
```

![M25 Alice Creation Host Prototype](./assets/m25-alice-creation-host-prototype.png)

### 2. Alice's Mental Path Is Now Executable

The model exposes each stage with:

- `developer_question`;
- `mental_shift`;
- `alice_action`;
- `framework_contracts`;
- `evidence_ids`;
- `inspector_focus`.

The core idea is deliberate:

```text
Developer cognition path
  -> Host contract decisions
  -> Builder session constraints
  -> share/fork evidence
  -> RC judgment
```

This keeps the example from becoming a vague story page or a demo that only makes sense to people who already lived through M1-M24.

### 3. M24 Pressure Evidence Is Reused, Not Copied Into Core

The M25 model imports the M24 pressure story from:

```text
examples/m24-creation-host-rc-pressure-walkthrough/pressure-story.ts
```

It then evaluates the same contract health inside the prototype:

```text
Build Agent Package validator
Provider Capability Matrix validator
Host Authoring Kit cross-contract validator
Share Artifact validator
Sharing Governance Bundle validator
M24 RC pressure evaluator
```

This preserves the boundary we already corrected: pressure-story concepts stay in examples/tests. Core exports framework contracts and validators, not demo scenario builders.

### 4. The Generated App Is Present But Subordinate

The UI shows Bob's `dev-board@v3` with:

- GitHub issues / PRs;
- Linear project work;
- GitHub CI attention;
- Apple Notes context.

But that preview is not the first mental model. It is evidence for stage 5 after Alice has already understood:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

This is the crucial M25 correction: we explain why the Creation Host exists before explaining how the generated app evolves.

## What M25 Proves

M25 proves the pre-RC material can be presented from the Developer's outside-in path:

```text
Alice starts with product-layer confusion
  -> learns the four-layer boundary
  -> turns Host choices into Build Agent and provider contracts
  -> gives Bob a constrained Builder agent session
  -> produces a portable no-secret share artifact
  -> validates Charlie install and Dave fork with governance evidence
  -> sees exactly which productization gaps remain
```

This is important because the project's top-level promise is not "use the framework to make one app." The promise is:

```text
Developer builds a Creation Host
  -> Builder creates Generated Applications through an agent
  -> End Users use Published Applications
```

M25 makes that mental route demonstrable.

## What M25 Does Not Prove

M25 is not production readiness. It does not implement:

- a real macOS app;
- real OAuth or account binding;
- a real credential broker;
- a real Postgres adapter;
- signed share artifacts;
- marketplace/share transport;
- production install/fork governance UI;
- team/org admin workflows.

Those remain productization lanes. M25 closes the Developer-cognition prototype lane.

## Verification

M25 was verified with:

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test examples/m25-alice-creation-host-prototype/prototype-model.test.ts examples/m25-alice-creation-host-prototype/run.test.ts
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run examples/m25-alice-creation-host-prototype/run.ts --smoke-exit
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test packages/core-domain packages/core packages/cli tests/pressure/creation-host-rc-pressure.test.ts examples/m24-creation-host-rc-pressure-walkthrough/run.test.ts examples/m25-alice-creation-host-prototype/prototype-model.test.ts examples/m25-alice-creation-host-prototype/run.test.ts
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run typecheck
git diff --check
```

Browser verification:

```text
http://127.0.0.1:8886/
Run full path -> RC path ready
Console warnings/errors -> none
Screenshot -> docs/architecture/assets/m25-alice-creation-host-prototype.png
```

After Docker became available, full `bun test` passed:

```text
1194 pass
0 fail
4448 expect() calls
Ran 1194 tests across 181 files.
```

The M25-specific tests, M24 pressure tests, Docker release smoke tests, core/core-domain/CLI sweep, typecheck, browser console check, and diff whitespace check passed.

## Recommended Next Step

Return to candidate-release review with M25 as the RC sharing/demo prototype:

```text
M24 contract pressure
  + M25 Developer cognitive walkthrough
  + docs/index health
  + full test/typecheck/diff verification
  -> tag RC or identify one final blocker
```
