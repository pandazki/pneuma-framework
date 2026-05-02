# M9 Design: Creation-to-Release Integrity

**Date:** 2026-05-02
**Status:** Draft design direction approved in conversation
**Scope:** combine M7 proposal approval and M8 release packaging into one correctness milestone.

中文摘要：

> M9 不再切成几个很小的 milestone。它把 M7 的 proposal-level approval 和 M8 的 release artifact proof 合成一条更完整的工程闭环：一个 Builder-approved capability 要么可恢复地失败，要么成为可验证的 release candidate，并留下团队能理解的证据链。

## Why This Needs To Be One Milestone

M1-M8 deliberately used small milestones to remove core uncertainty:

- M1 proved app definition can be governed data.
- M2 proved governance can leave an enterprise evidence chain.
- M3-M4 proved a real app substrate and reference product shape.
- M5-M7 proved Builder/Agent app evolution and proposal-level approval.
- M8 proved an evolved app state can become a restartable Docker release artifact.

After M8, the next small tasks are all valuable, but each is too small to carry a team milestone alone. Change-set recovery, release rollout protocol, and protocol narrative are not separate product bets. They are one correctness story:

> Does an approved creation request travel safely from proposal to release?

中文：

M8 之后继续用“小 milestone”会让项目看起来永远在补边角。更合理的是把 recovery、release candidate、evidence narrative 合成一个 M9：从 Builder 批准一个需求，到这个需求安全地进入 release path，中间失败也可解释、可恢复。

## M9 Thesis

M9 should prove:

> A Builder-approved capability can be executed as an atomic product intent, recover safely if execution fails, and become a verified release candidate when execution succeeds.

The milestone should be named:

```text
M9 — Creation-to-Release Integrity
```

This is not a new app feature milestone. It is a correctness milestone for the creation loop.

## Product Story

The team-facing story should read like this:

```text
Builder asks for Priority Queue
  -> Agent proposes one change set
  -> Builder approves one product intent
  -> framework applies child changes under a recovery model
  -> failure produces a repairable/revertible state
  -> success creates a release candidate
  -> release candidate passes health + config + API checks
  -> evidence shows what was proposed, approved, applied, recovered or released
```

中文：

团队分享时不要讲“我们做了 recovery，又做了 rollout，又补了 protocol”。应该讲：“用户批准了一个创造请求，系统如何保证它不会半成功地悄悄坏掉；成功后如何进入一个可验证的发布候选版本。”

## Scope

### P1: Change-Set Recovery Semantics

Problem:

`definition.apply_change_set` already gives the right approval unit, but post-approval execution still consists of child `definition.apply` mutations. If child 3 fails after child 1 and 2 succeeded, M7/M8 only promise a recoverable failed state, not a defined product-level recovery path.

M9 should define and implement a v0 recovery model:

- each change set captures a last-good definition fingerprint before child execution;
- child execution records progress as change-set state, not only individual `definition.apply` results;
- failure records `failed_change_index`, applied child ids, observed definition after failure, and recovery options;
- v0 recovery should support `reset_to_last_good` for definition state when the framework can prove last-good is still available;
- if automatic reset is not safe, framework exposes a repair-required state with explicit reason;
- retry must be whole-proposal retry, not partial approval.

Non-goal:

This is not full database ACID across runtime storage, history, logs, and Docker release. It is a framework-level product-intent recovery contract.

中文：

这里要解决的不是“数据库事务”这个抽象词，而是不要让用户批准的一个需求出现非预期半成功。M9 可以接受失败后 reset 回 last-good，也可以进入明确的 repair-required；不能接受的是系统悄悄留在模糊状态。

### P2: Release Candidate / Rollout Protocol v0

Problem:

M8 proves Docker release packaging, but not a release candidate lifecycle. There is no explicit object that says: "this evolved app version is ready to be promoted."

M9 should add a narrow release-candidate protocol:

- create a release candidate from the current evolved workspace;
- attach build manifest path, image tag, source workspace, app definition fingerprint, and verification results;
- run health/config/API checks before marking it ready;
- record failed candidate state without touching any existing release;
- require Builder confirmation before promotion-style deploy actions, preserving existing deploy governance posture;
- do not implement real traffic switching yet unless the minimal local adapter makes it cheap and testable.

Release candidate states:

```text
created
  -> building
  -> verifying
  -> ready
  -> failed
```

Optional local promotion states if v0 includes a local container switch:

```text
ready
  -> promoting
  -> promoted
  -> promotion_failed
```

Non-goal:

No cloud deployment, registry push, zero-downtime rolling update, hosted load balancer, or production rollback automation.

中文：

M9 可以定义 release candidate，不急着承诺真正生产 rolling update。重点是“有一个可验证的新版本对象”，失败不会影响旧版本，成功时证据完整。

### P3: Unified Evidence Narrative

Problem:

M7 has transcript evidence, M8 has release smoke evidence, and M2 has permission ledger evidence. They are individually useful but not yet one story.

M9 should expose one evidence envelope for a creation-to-release run:

- Builder request
- Agent proposal summary
- approval prompt id and decision
- execution principal and approval token metadata
- child change-set progress
- recovery result or release candidate result
- release verification checks
- final status

This can start as a JSON transcript under the M9 example workspace, but the shape should be milestone-neutral enough to become a persistent table later.

Suggested status language:

```text
proposed
approved
applying
recovering
recovered
release_candidate_building
release_candidate_ready
released
failed_repair_required
denied
```

中文：

这部分是团队理解项目的关键。不是“日志更多了”，而是把 Builder request、Agent proposal、approval、execution、recovery、release candidate 连成一条人能读懂的证据链。

### P4: End-to-End Demo And Snapshot

M9 should close only when the demo can show two paths:

1. **Success path**
   - approve proposal;
   - apply change set;
   - create release candidate;
   - verify release candidate;
   - show evidence from proposal to release candidate ready.

2. **Failure/recovery path**
   - approve proposal;
   - inject or simulate a child mutation failure;
   - record partial progress;
   - recover/reset or explicitly enter repair-required;
   - show evidence explaining why no release candidate was produced.

The demo should not depend on statistical opencode planning reliability. Use deterministic/fake path for CI, and keep a real backend-agent path as an optional manual proof if practical.

中文：

M9 demo 必须有成功和失败两条路。否则 recovery semantics 只是“我们觉得有办法”，没有体感证明。

## Architecture Shape

M9 should introduce a small set of framework-level concepts, not app-specific hacks:

```text
DefinitionChangeSetExecution
  id
  intent
  approval_prompt_id
  before_fingerprint
  child_progress
  status
  recovery

ReleaseCandidate
  id
  source_workspace
  definition_fingerprint
  build_manifest_path
  image_tag
  checks
  status

CreationToReleaseEvidence
  run_id
  builder_request
  proposal
  approval
  execution
  release_candidate
  final_status
```

These can live in `packages/core` first. They do not need a full database store in the first slice; JSON workspace persistence is acceptable if the shape is stable and tests cover restart/reload where needed.

## Testing Strategy

M9 should be test-first:

- unit tests for change-set state transitions and failure recording;
- integration tests for `definition.apply_change_set` failure/recovery path;
- release candidate smoke reusing M8's Docker packaging checks;
- one e2e-style milestone example under `examples/m9-creation-to-release-integrity/`;
- snapshot verification that success and failure paths both produce readable evidence.

Verification should include:

```text
bun test packages/core/test/tools/definition-apply.test.ts
bun test examples/m9-creation-to-release-integrity/*.test.ts
bun test examples/m8-release-packaging-hardening/release-packaging-smoke.test.ts
bun run typecheck
git diff --check
```

Docker-dependent tests may stay focused instead of entering the default full suite.

## Boundaries

M9 does not claim:

- full ACID transactionality across every store;
- distributed locks or multi-runtime concurrency;
- production rolling update;
- cloud deployment;
- registry push;
- semantic/vector index;
- release-mode Runtime Agent;
- policy authoring UI;
- statistical LLM planning reliability.

## Why Semantic Index Should Wait

Semantic index is valuable, but it changes the story from correctness to product capability expansion. After M8, the main project risk is not "can Knowledge Inbox do one more useful thing?" It is whether the creation loop is safe enough to trust.

Semantic index should return after M9, when the project can say:

```text
new capability creation is governed,
multi-step execution is recoverable,
release candidate generation is verified,
and the evidence chain is coherent.
```

Then semantic retrieval can become the next app capability pressure test rather than a distraction from creation-loop integrity.

中文：

语义索引应该后置，不是因为它不重要，而是因为它是新能力；M9 要先把“能力被创造出来以后，系统是否正确”这条地基打稳。

## Acceptance Criteria

M9 closes when:

- `definition.apply_change_set` has an explicit failure/recovery state model;
- a failed child mutation cannot leave an unexplained half-success state;
- a successful change set can produce a release candidate with manifest/image/health/config/API checks;
- success and failure demo paths both generate one coherent evidence envelope;
- docs explain the difference between release candidate, release artifact, rollout, and production deploy;
- milestone snapshot includes English and Chinese versions.

