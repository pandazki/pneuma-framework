# 3 · Assemble the Host

*The bounded `v0` exists — now put it behind the loop.* The Host wires the
governed loop together. The striking thing about it is how little plumbing it
writes: it **consumes** the framework and the reference adapters, and supplies
the effects as closures.

![The Creation Host consuming five framework packages and supplying runAgent/verify/observe closures, while owning project state, profile reading, and the product UI](/diagrams/guide-assembly.png)

> Source: `examples/clean-room-release-host`.

## What it consumes

```text
@pneuma-framework/host-kit/workspace         copy / list / diff / protected-root checks
@pneuma-framework/host-kit/governed-change   buildGovernedProposal — the fail-closed gate
@pneuma-framework/backend-codex              the Codex app-server code-agent lane
@pneuma-framework/adapter-vercel             the Vercel REST deploy lane
@pneuma-framework/adapter-neon               Neon branching for Preview Data Rehearsal
```

The Host keeps only what is genuinely its own: the project/version state, the
profile reading, the runtime/preview process management, and its product UI.

## The proposal gate, in closures

The heart of the loop is `buildGovernedProposal`. The framework owns the
sequence and the fail-closed gating; the Host passes the effects:

```ts
import { buildGovernedProposal } from "@pneuma-framework/host-kit/governed-change";
import { runCodexAgent, isCodexTurnCompletionTimeout } from "@pneuma-framework/backend-codex";

const proposal = await buildGovernedProposal({
  draftId, activeRoot, draftRoot,
  protectedRoots: profile.protectedRoots,

  // run one agent turn against the draft (may throw on timeout)
  runAgent: (root) => runCodexAgent({ draftRoot: root, prompt, baseInstructions }),
  isAgentTimeout: isCodexTurnCompletionTimeout,

  // the scaffold's own verify is the gate (+ a runtime smoke)
  verify: (root) => runVerify(root),

  // gather schema + bundle evidence for before/after
  observe: (root) => gatherEvidence(root),
});
```

What the framework guarantees, so you don't have to remember it:

1. a recoverable agent **timeout falls through** to verification (fail-closed);
   any other error aborts,
2. an **empty change** is rejected,
3. a change touching a **protected root** is rejected — checked on the diff, not
   the agent's promises,
4. a draft that **fails verify** is rejected,
5. only then is a proposal assembled with **before/after evidence**.

## The two surfaces

The studio (the Host) and the published app (the Generated App) deliberately use
different visual languages — a *light operational console* vs the app's own
product UI — so a viewer always knows which framework layer they are looking at:
the Builder governing the app, or the End User using it.

## Preview, two ways

- **Disposable in-memory preview** — start the active (or draft) version on a
  throwaway runtime with no database. Safe to click around; nothing is written.
- **Preview Data Rehearsal on a Neon branch** — `adapter-neon` creates a
  copy-on-write branch from production (so it has *real data*), the Host runs the
  draft's migration against the **branch**, and previews against it. Writes hit
  the branch only; production is untouched; the branch is deleted when the
  preview stops. Data is never merged back — only the verified forward migration
  reaches production at publish.

## Publish, with a receipt

`adapter-vercel` runs the deploy as a content-addressed two-phase upload, polls
to `READY`, and returns a structured receipt (deployment id, url, file count).
The Host runs the Neon migration first, smoke-tests a *reachable* endpoint, and
records the receipt — because "deployed" is not the same as "reachable".

## Iterate until satisfied

A proposal is not one-shot. While a proposal is un-applied, running the agent
again **stacks** fixes onto the same draft (re-gated by `verify` every turn);
you can **preview the draft** before approving; and after apply or rollback the
stale preview is stopped. The loop is *evolve → preview/rehearse → refine →
approve → publish*.

Now run all of it for real. → **[4 · Run the loop](./end-to-end)**
