# Milestone 45 Snapshot

**Milestone:** M45，Creation Host Implementation Kit v0
**状态：** Closed
**日期：** 2026-05-16
**English version:** [milestone-45-snapshot.md](./milestone-45-snapshot.md)

## 决策

M45 开启 0.4.0 implementation-framework lane。

已接受方向：

```text
@pneuma-framework/core
  primitives, contracts, validators, evidence

@pneuma-framework/host-kit
  reusable Creation Host assembly helpers

examples/reference-creation-host
  canonical consumer and living conformance example
```

这保持了顶层模型：

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

Host Kit 不是隐藏的 Creation Host product。它是 Developer 构建 Creation Host 时使用的显式 adapter orchestration layer。

## 交付内容

### `@pneuma-framework/host-kit`

新增 package：

```text
packages/host-kit/
```

当前提供：

- `evaluateHostKitApproval`
- `prepareHostKitCodeChangeReview`
- `applyApprovedHostKitCodeChange`
- `runPreviewDataRehearsal`
- `dataEvolutionReceiptAllowsPublish`
- `publishVerifiedVersion`
- `rollbackPublishedVersion`
- `HostRuntimeAdapter`
- `DataEvolutionAdapter`

### Approval Boundary

Host Kit 包装 Enterprise Governance，并保留关键 invariant：

```text
Builder self-approval 不能满足 required Reviewer approval。
```

这是 Reference Host 所需的最小 enterprise governance shape。

### Code Change Lane

Host Kit 从 core Code Change Lane proposal 准备 Build Assurance review packet。它携带：

- changed files 和 diff；
- guardrail checks；
- source 和 migration proposed changes；
- risk classification；
- migration mode；
- recovery plan。

`applyApprovedHostKitCodeChange` 会在 approval 不允许时拒绝 apply。

### Preview Data Rehearsal

Host Kit 定义 semantic gate：

```text
clone representative data
  -> run Host-owned data evolution
  -> validate DataEvolutionReceipt
  -> continue only when receipt.status = completed
```

migration engine 仍然是 Host-owned。Host Kit 拥有 call order 和 fail-closed gate。

### Publish And Rollback

`publishVerifiedVersion` 会在缺少 required data receipt 时 fail closed，然后启动 published runtime，等待 ready evidence，stage/promote rollout state，并返回 `RuntimeControlReceipt`。

`rollbackPublishedVersion` 复用已有 Release Rollout state machine。

### Reference Host

新增 canonical consumer：

```text
examples/reference-creation-host/
```

它实现 Team Notes Board：

```text
v0:
  notes list

Builder intent:
  Add a review queue.

v1:
  review_status field
  review queue preview
  carry-forward data receipt
```

Bob 是 Builder。Alice 是 Reviewer。

## Workbench

![M45 Reference Host Workbench](./images/m45-reference-host-workbench.png)

workbench 有三栏：

- BuildThread conversation；
- Generated App Preview；
- Governance & Evidence。

它故意保持 local 和 small，但它是 product workbench，不是 wireframe。

## 验证

必要验证已通过：

```bash
bun test packages/host-kit/test/*.test.ts
bun test examples/reference-creation-host/reference-host.test.ts examples/reference-creation-host/ui-state.test.ts
bun run typecheck
git diff --check
```

Browser evidence：

```text
create v0
ask agent
Bob approval blocked
Alice approval succeeds
preview starts
publish succeeds
rollback succeeds
```

截图：

```text
docs/architecture/images/m45-reference-host-workbench.png
```

## Demo Route

运行：

```bash
PORT=8893 bun run --cwd examples/reference-creation-host serve
```

打开：

```text
http://127.0.0.1:8893/
```

按这个顺序点击：

```text
Create v0
Ask Agent
Bob approve
Alice approve
Preview
Publish
Rollback
```

关键不是 note table 多了一个字段。关键是一个 Builder intent 穿过 BuildThread、proposal、reviewer route、code-change guardrails、data rehearsal、publish receipt 和 rollback evidence。

## Pruning Candidates

M45 不删除历史 examples。它只标记 replacement coverage。

| Old example | Replacement coverage | Recommendation |
|---|---|---|
| `examples/m16-reference-creation-host/` | Creation、preview、inspect/evolve/approve/publish/rollback 现在由 `examples/reference-creation-host/` 更好表达。 | owner review 后删除或归档。 |
| `examples/m18-open-ended-personal-focus-site/` | Team Notes Board 没覆盖它。M45 是 schema/data/code-change pressure，不是 open-ended UI/module pressure。 | 保留到 open-ended pressure v2 基于 Host Kit 重建。 |
| `examples/m43-enterprise-governance-demo/` | Reviewer route 已覆盖，但 M43 仍直接解释 enterprise governance narrative。 | 保留到 governance UX 完整合入 Reference Host。 |

## 剩余风险

1. deterministic agent path 证明 orchestration seam，不证明真实 code-agent quality。
2. local runtime adapter 仍然是 reference adapter，不是 cloud deployment provider。
3. data evolution handler 故意很小；真实 Host 仍需要 provider-specific migration implementation。
4. open-ended UI/module artifacts 还没有基于 Host Kit 重建。
5. 历史 examples 仍需 replacement coverage review 后再清理。

## 下一步 lanes

接下来最有价值的 lanes：

1. 在同一 seam 上给 Reference Host 加 real-agent pressure path；
2. 增加 optional Docker adapter smoke，但不把 Docker 变成默认；
3. 基于 Host Kit 重建 open-ended app pressure；
4. replacement coverage 被接受后清理历史 examples。

