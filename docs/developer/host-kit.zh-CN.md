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
2. Code Change Lane proposal evidence。
3. enterprise approval route。
4. guarded code apply。
5. Preview Data Rehearsal。
6. publish readiness gate。
7. local publish / rollback state。
8. Runtime/Data Receipt evidence。

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
  prepareHostKitCodeChangeReview,
  applyApprovedHostKitCodeChange,
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
- `DataEvolutionAdapter`；
- `HostRuntimeAdapter`；
- `ReleaseRolloutStore`。

## Approval Route

`evaluateHostKitApproval()` 是 Enterprise Governance 的 Host-facing wrapper。

M45 的关键 invariant：

```text
Builder self-approval 不能满足 required Reviewer route。
```

这让 Creation Host 可以表达“Bob 提出了变更，Alice 审阅了风险”，而不是把一次点击同时当作 request 和 review。

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

`publishVerifiedVersion()` 会在缺少 required data receipt 时 fail closed。receipt 有效时，它通过 `HostRuntimeAdapter` 启动 published runtime，等待 ready checks，stage release candidate，promote，并返回 `RuntimeControlReceipt`。

`rollbackPublishedVersion()` 使用已有 Release Rollout state machine。它不会创造第二套 release model。

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
bun test examples/reference-creation-host/reference-host.test.ts examples/reference-creation-host/ui-state.test.ts
PORT=8893 bun run --cwd examples/reference-creation-host serve
```

workbench 有三栏：

- BuildThread conversation；
- Generated App Preview；
- Governance & Evidence。

