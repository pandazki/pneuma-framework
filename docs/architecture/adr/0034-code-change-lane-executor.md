# ADR-0034: Code Change Lane Executor

**Status:** Accepted  
**Date:** 2026-05-07  
**Related:** [ADR-0031](./0031-open-ended-definition-artifact-boundary.md), [ADR-0032](./0032-build-thread-primitive.md), [ADR-0033](./0033-scaffold-project-contract.md)

## Context

ADR-0031 decided that open-ended UI/module artifacts are Host-owned artifacts in RC v0. ADR-0032 introduced BuildThread as the semantic transcript. ADR-0033 introduced Scaffold Project as the Developer-authored source boundary and guardrail contract.

After external Host pressure, one gap remained too concrete to leave as documentation only: a Developer can declare source boundaries and guardrails, but every Host still has to implement the same proposal/apply loop:

```text
draft workspace
  -> pre-proposal checks
  -> proposal evidence
  -> Builder approval
  -> pre-apply checks
  -> file apply
  -> post-apply checks
  -> receipt / rollback evidence
```

For simple Bun + TypeScript + JS generated apps, this loop is not optional. Without a framework helper, downstream Hosts will keep re-implementing stale base checks, protected path checks, diff evidence, rollback-on-validation-failure, and BuildThread receipt wiring.

## Decision

Accept Code Change Lane as an additive RC 0.1.3 primitive in `@pneuma-framework/core`.

Exports:

- `prepareCodeChangeProposal`
- `applyCodeChangeProposal`
- `PreparedCodeChangeProposal`
- `CodeChangeProposalEvidence`
- `CodeChangeExecutionReceipt`
- `CodeChangeCheckEvidence`

The lane consumes:

- `ScaffoldProjectManifest`
- `source_root`
- `draft_root`
- optional `BuildThreadStore` + `thread_id`

`prepareCodeChangeProposal`:

- validates the Scaffold Project manifest;
- computes changed files and a text diff between `source_root` and `draft_root`;
- records base and draft snapshots for changed files;
- runs `pre_proposal` guardrails;
- returns `ok: false` before approval if checks fail;
- appends `agent_proposal` to BuildThread when a store/thread is supplied.

`applyCodeChangeProposal`:

- records Builder decision when a store/thread is supplied;
- rejects denied proposals without mutation and records a `rejected` receipt;
- runs `pre_apply` guardrails;
- rejects draft files that changed after proposal evidence was produced;
- enforces `writable_roots` before mutation;
- copies approved changed files from draft to source;
- runs `post_apply` guardrails;
- restores a backup and records `failed_validate_rolled_back` if post-apply checks fail;
- appends `host_execution_receipt` to BuildThread when a store/thread is supplied.

Built-in framework checks:

- `diff-computable`
- `protected-paths-unchanged`
- `base-snapshot-unchanged`

`preview-health` is intentionally delegated to a Host-supplied `framework_check_runner`, because the framework does not know the Host's preview endpoint or health semantics.

## Consequences

### Positive

- Downstream Hosts get a concrete bridge from Scaffold Project contract to executable source changes.
- Builder approval remains proposal-level: one intent, one evidence bundle, one decision.
- Failed `pre_proposal` checks do not become approval prompts.
- Stale source, stale draft, and protected path changes fail before mutation.
- Failed post-apply checks roll back source files and produce receipt evidence.
- BuildThread becomes the transcript source for code-change proposal / decision / receipt.

### Negative / Limits

- The framework still does not create draft workspaces.
- The framework still does not launch opencode or another code agent.
- The diff is intentionally simple text evidence, not a semantic merge engine.
- The executor does not own approval UI.
- The Host still owns preview lifecycle, product-specific checks, and source-control strategy.

These limits preserve the four-layer boundary. Code Change Lane governs source-change evidence and apply semantics without turning the framework into a specific Creation Host.

## Verification

RC 0.1.3 adds tests for:

- proposal evidence before approval;
- protected path rejection before approval;
- approved source apply with BuildThread receipt;
- stale base and stale draft rejection before mutation;
- post-apply failure rollback.
