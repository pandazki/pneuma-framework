# Creation Host Implementation Kit

**读者：** 已经理解四层模型，并准备组装真实 Creation Host 的 Developer。
**English version:** [host-kit.md](./host-kit.md)

`@pneuma-framework/host-kit` 是 0.4.0 implementation-framework 的第一层。它不替代 `@pneuma-framework/core`；它把已有 core contracts 组装成 Host 必须运行的 Builder-facing loop。

```text
core
  primitives, contracts, validators, evidence

host-kit
  explicit Host adapters + orchestration helpers

reference-creation-host
  canonical consumer and living conformance example
```

## 它是什么

Host Kit 帮助 Creation Host 把一个受治理的 Builder intent 跑完整：

1. BuildThread context。
2. optional backend code-agent draft generation。
3. Code Change Lane proposal evidence。
4. enterprise approval route。
5. guarded code apply。
6. Preview Data Rehearsal。
7. publish readiness gate。
8. local 或 adapter-backed publish / rollback state。
9. Runtime/Data Receipt evidence。

这个包存在的原因是：每个 Host 否则都要重写 BuildThread、Code Change Lane、Build Assurance、Enterprise Governance、Runtime / Data Governance 和 Release Rollout 之间的胶水代码。

## 它不拥有什么

Host Kit 明确不拥有：

- product UX；
- user identity 或 role mapping；
- provider SDKs；
- credential storage；
- migration engine implementation；
- source layout；
- deployment target；
- generated application domain model。

Developer 仍然通过显式 adapter 提供这些东西。Host Kit 只拥有调用顺序、validation、fail-closed gate 和 evidence vocabulary。

## 最小 Host wiring

```ts
import {
  evaluateHostKitApproval,
  runHostKitCodeAgentDraft,
  prepareHostKitCodeChangeReview,
  applyApprovedHostKitCodeChange,
  createDockerRuntimeAdapter,
  runPreviewDataRehearsal,
  publishVerifiedVersion,
  rollbackPublishedVersion,
} from "@pneuma-framework/host-kit";
```

当前 public surface 有意保持很小。Host 提供：

- `ScaffoldProjectManifest`；
- source 和 draft roots；
- guardrail command runner；
- governance policy 和 decisions；
- optional `AgentBackend`，用于真实 code-agent draft generation；
- `DataEvolutionAdapter`；
- `HostRuntimeAdapter`；
- `ReleaseRolloutStore`。

## Approval Route

`evaluateHostKitApproval()` 是 Enterprise Governance 的 Host-facing wrapper。

M45 的关键 invariant：

```text
Builder self-approval 不能满足 required Reviewer route。
```

这让 Creation Host 可以表达“Bob 提出了变更，独立 Reviewer 审阅了风险”，而不是把一次点击同时当作 request 和 review。

## Code Agent Draft

`runHostKitCodeAgentDraft()` 会让一个 `AgentBackend` 在 draft workspace 上工作，并在任何 review packet 或 apply step 继续之前验证结果 source。

这个 helper 故意停在 draft boundary：

```text
Builder intent
  -> code agent edits draft workspace
  -> Host verifies expected draft shape
  -> Code Change Lane prepares review packet
  -> Reviewer approval
  -> guarded apply into source
```

Build-phase Agent 不 publish、不 migrate，也不绕过 governance。opencode 这样的真实 backend 可以生成 draft，但 Host Kit 仍然拥有 fail-closed handoff 到 review/apply 的边界。

## Code Change Lane

`prepareHostKitCodeChangeReview()` 调用 core Code Change Lane，然后创建 Build Assurance review packet。

它返回：

- prepared code-change proposal；
- changed files 和 diff；
- guardrail checks；
- proposed change list；
- risk classification；
- migration mode；
- recovery plan。

`applyApprovedHostKitCodeChange()` 会在 approval decision 不允许时拒绝 apply。它不会绕过 Scaffold Project guardrails。

## Preview Data Rehearsal

`runPreviewDataRehearsal()` 是 Host-owned migration implementation 外面的 kit-level semantic wrapper。

Host 拥有真正的 migration engine。比如 Bun/TypeScript Host 可以用 Drizzle 完成 SQLite/Postgres migration。Host Kit 只要求这个顺序：

```text
clone representative data
  -> run data evolution on the clone
  -> validate DataEvolutionReceipt
  -> continue only when receipt.status = completed
```

如果 rehearsal 失败，本次 attempt 终止。Host Kit 不会 auto-retry 或 auto-repair。后续 Corrective Proposal 是新的 Build-phase Agent turn。

## Publish And Rollback

`publishVerifiedVersion()` 会在缺少 required data receipt 时 fail closed。receipt 有效时，它通过 `HostRuntimeAdapter` 启动 published runtime，等待 ready checks，stage release candidate，promote，并返回 `RuntimeControlReceipt`。如果 readiness 或 rollout promotion 在 runtime 启动后失败，Host Kit 会 best-effort 调用 `stopPublished()`，再返回失败。

`rollbackPublishedVersion()` 使用已有 Release Rollout state machine。它不会创造第二套 release model。

## Optional Docker Adapter

`createDockerRuntimeAdapter()` 是一个可选的 `HostRuntimeAdapter` implementation，用于 local smoke tests。

Docker 仍然是 adapter，不是 framework semantic。同一个 publish helper 可以接受任何实现了下面接口的 adapter：

```text
startPreview
stopPreview
startPublished
stopPublished
waitUntilReady
```

## Reference Host

canonical consumer 是：

```text
examples/reference-creation-host/
```

它用 Team Notes Board 证明 M45 loop：

```text
v0:
  notes list

Builder intent:
  Add a review queue.

v1:
  review_status field
  review queue surface
  carry-forward data receipt
```

运行：

```bash
bun test packages/host-kit/test/*.test.ts
bun test examples/reference-creation-host/reference-host.test.ts examples/reference-creation-host/open-ended-host-kit.test.ts examples/reference-creation-host/ui-state.test.ts
PORT=8893 bun run --cwd examples/reference-creation-host serve
```

运行真实 opencode code-agent path：

```bash
PNEUMA_KEEP_REFERENCE_HOST_WORKSPACE=1 bun run --cwd examples/reference-creation-host real-agent
```

默认 live model：

```text
openrouter/anthropic/claude-opus-4.7
```

workbench 有三栏：

- BuildThread conversation；
- Generated App Preview；
- Governance & Evidence。

## Adoption Checklist

用 Host Kit 构建新的 Creation Host 时，按这份 checklist 对齐：

1. 定义 Host 的 scaffold/project boundary：writable roots、protected paths、guardrails、lifecycle commands 和 evidence requirements。
2. 决定 first draft 是 deterministic 生成，还是由真实 `AgentBackend` 生成；无论哪种，都要先 verify draft，再准备 review evidence。
3. 每个有意义的 Builder intent 都应经过 BuildThread、review packet 和 `evaluateHostKitApproval()`。
4. 对 source/data risks 要求 reviewer approval；不要让 Builder self-approval 满足这条 route。
5. policy 要求 receipt 时，publish 前必须在 clone 或 representative target 上 rehearse data evolution。
6. rollout state 要按 generated application 隔离，不要整个 Host workspace 共用一份。
7. Docker、local processes 和未来 cloud deploy 都应被看作 `HostRuntimeAdapter` implementations，而不是 framework semantics。
8. 保留 failed-attempt evidence，让下一轮 Build-phase Agent turn 能基于证据修正，而不是猜。

Reference Host 用一个刻意很小的 Team Notes Board example 实现了这份 checklist。生产 Host 应替换 deterministic domain logic、identity mapping、migration implementation 和 runtime adapter，但保留调用顺序。
