# Milestone 26 Snapshot — Code Change Lane Hardening

**Date:** 2026-05-08  
**Status:** Closed as a post-RC stabilization milestone. This is not a `pneuma-rc-0.1.4` release tag.  
**Input:** DevBoard Studio upstream practice report, especially gap log #38, #40, and the V6/V7 Code Change Lane findings.

## What M26 Proved

`pneuma-rc-0.1.3` made Code Change Lane executable. M26 made the same lane more reviewable and less awkward for real Creation Hosts.

The milestone deliberately stayed inside the existing model:

```text
Scaffold Project Manifest
  + BuildThread
  + Builder approval
  -> governed source-code change
```

It did not introduce HostExtension, runtime diagnostics, distribution packaging, or `AgentBackend.runTurn`. Those remain later lanes.

## Closed Findings

| Finding | M26 result |
|---|---|
| Framework diff was whole-file `-/+` for existing-file edits (#38) | `proposal.evidence.diff` now renders a line-based unified diff while keeping the wire shape as a string. |
| Builder rejection reused `failed_framework` | Rejections now produce `status: "rejected"` in Code Change Lane and BuildThread receipts. |
| Rejecting required the full apply input shape | Added `rejectCodeChangeProposal({ proposal, reason, thread_store, thread_id })`. |
| Framework synthesized `agent_proposal` could duplicate Host domain proposal turns | Added `record_agent_proposal_turn: false` opt-out on `prepareCodeChangeProposal`. |
| File-level protected carve-outs inside writable roots were rejected (#40) | Validator now allows file-looking protected paths inside writable roots while keeping protected directories fail-closed. |
| `source_roots: ["."]` was rejected | Scaffold materialization source roots now allow `"."` as the workspace root. |
| Missing `.env` in `share_exclude` hard-failed even when the array existed | Validator normalizes `.env` into `share_exclude` instead of forcing each Host to write it manually. |
| Unknown `framework_check` diagnostics were too terse | Validator diagnostics now list valid framework check ids. |

## Boundary Decisions

M26 does not package agent-generated source code into portable share/install/fork artifacts. That is the future HostExtension/distribution lane, not a hardening patch.

M26 also does not standardize DevBoard's widget runtime hook as a framework primitive. The framework-level concept should be extension slots and bundles; DevBoard widgets are a reference Host shape.

## Developer-Facing Changes

Updated guides:

- [Code Change Lane](../developer/code-change-lane.md) / [中文版](../developer/code-change-lane.zh-CN.md)
- [Scaffold Project Contract](../developer/scaffold-project-contract.md) / [中文版](../developer/scaffold-project-contract.zh-CN.md)

The important downstream note is practical: a Host can now keep host-authored registry/type files near agent-authored generated files, review smaller modify-existing diffs, and record rejection as a first-class audit outcome.

## Verification

Commands run from the M26 worktree:

```bash
bun test packages/core/test/build-thread.test.ts packages/core/test/code-change-lane.test.ts packages/core/test/host-authoring.test.ts
bun run typecheck
tmp_config=$(mktemp -d) && printf '{"auths":{}}\n' > "$tmp_config/config.json" && DOCKER_CONFIG="$tmp_config" bun test
```

Results:

- Targeted contract tests: `36 pass`, `0 fail`, `105 expect() calls`.
- Typecheck: pass.
- Full suite with temporary Docker config: `1225 pass`, `0 fail`, `4556 expect() calls`, `184 files`.

Why temporary Docker config: the local Docker Desktop credential helper blocked `docker build` during the first full-suite attempt. Re-running Docker smoke with `DOCKER_CONFIG` containing only `{"auths":{}}` passed, and the full suite passed with the same environment.

## Next

Recommended sequence remains:

1. M27 — Runtime diagnostic surface.
2. M28 — HostExtension / extension slot distribution primitive.
3. M29 — `AgentBackend.runTurn` and receipt automation.

M26 reduces friction for the existing Code Change Lane so those larger lanes can build on a cleaner base.
