# Milestone 33 Snapshot — Assurance Card in Reference Host

**日期：** 2026-05-09  
**状态：** 已作为 post-RC product-understanding milestone 关闭。这不是 `pneuma-rc-0.1.4` release tag。  
**输入：** M32 创建了 `BuildChangeAssuranceCase` primitive。M33 要验证这套语言能否帮助 Builder 理解 Creation Host 为什么允许 approval、apply 或 publish。

## M33 证明了什么

M33 把 Build Change Assurance 接进了 M16 Reference Creation Host，而不只是停在 core tests。

Builder 现在会在 approval 和 publish controls 旁边看到 Assurance card：

```text
Priority Queue proposed
  -> readiness: awaiting_approval
  -> risk: definition_additive
  -> evidence: Host proposal check + approval prompt reference

Builder approves
  -> readiness: verified
  -> risk: definition_additive
  -> evidence: definition history + post-apply priority queue check

Publish v1
  -> readiness: ready_to_publish
  -> risk: release_change
  -> evidence: runtime health + release rollout
```

这让 demo 从 “点击 Allow，然后点击 Publish” 变成：

```text
Host 能解释为什么下一步现在可用。
```

## Product Boundary

M33 仍然让 Host 拥有 policy：

```text
Core evaluates readiness.
Reference Host uses readiness to explain and gate controls.
Builder sees the evidence path before continuing.
```

framework 不决定所有 Host 都必须在 `verified`、`ready_to_publish` 或某个特定状态下发布。它提供共享语言和 validator。Host 的产品 policy 决定按钮规则。

## Implementation Surface

更新的 example：

- `examples/m16-reference-creation-host/host-server.ts`
- `examples/m16-reference-creation-host/static/index.html`
- `examples/m16-reference-creation-host/static/app.js`
- `examples/m16-reference-creation-host/static/styles.css`

更新的测试：

- `examples/m16-reference-creation-host/run.test.ts`

更新的 guide：

- [Build Change Assurance](../developer/build-assurance.md)
- [中文版](../developer/build-assurance.zh-CN.md)

## Verification

Targeted command：

```bash
bun test examples/m16-reference-creation-host/run.test.ts
```

Targeted result：

- `1 pass`，`0 fail`，`33 expect() calls`。

测试证明：

- Reference Host 页面暴露 `data-testid="assurance-card"`；
- `evolution/start` 返回 `awaiting_approval` 的 assurance case；
- `evolution/approve` 返回 `verified` 的 assurance case；
- `publish v1` 返回 `ready_to_publish` 的 assurance case；
- 完整 create、preview、inspect、evolve、approve、publish、restart、rollback、second-app inspection flow 仍然通过。

## Remaining Boundary

M33 不增加 assurance case 持久化、不发布通用 assurance UI component package，也不迁移下游 DevBoard。这些是独立的产品化步骤。

下一条有价值的路线是 downstream adoption 或 persistence：

```text
M34 option A: add an AssuranceCaseStore for Hosts that want durable cards.
M34 option B: migrate DevBoard Studio to display assurance cards using the M33 shape.
```
