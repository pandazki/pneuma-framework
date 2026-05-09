# Milestone 35 Snapshot — Build Change Review Packet

**日期：** 2026-05-10  
**状态：** 已作为 post-RC assurance milestone 关闭。这不是 `pneuma-rc-0.1.4` release tag。  
**输入：** M32-M34 已经让 Build Change Assurance 可以评估、可以展示、可以持久化。M35 关注 Builder 在批准一个业务 intent 之前应该看到什么。

## M35 证明了什么

M35 增加了 `BuildChangeReviewPacket`：

```text
Builder intent
  -> Agent proposal
  -> Review Packet
  -> one approval statement
  -> assurance case after decision/execution
```

关键变化是：

```text
Approval 是针对一个 Builder intent，不是针对 N 个 tool calls。
```

packet 会列出：

- intent summary；
- scope boundary；
- proposed changes by lane；
- risk classification；
- pre-proposal checks；
- recovery plan；
- migration mode；
- 自动生成的 approval statement。

## 产品边界

Core 拥有 packet shape 和 validation。Creation Host 拥有如何渲染它、以及是否请求 approval。packet 不替代 permission ledger、BuildThread、definition history、Code Change Lane 或 Host-owned approval UI。

这让 assurance lane 继续对齐项目目标：约束并解释 Builder + Build Agent 的业务功能变更，而不是做泛化 artifact trust platform。

## 实现面

更新的 core：

- `packages/core/src/build-assurance.ts`
- `packages/core/test/build-assurance-review-packet.test.ts`
- `packages/core/src/index.ts`

更新的 Reference Host：

- `examples/m16-reference-creation-host/host-server.ts`
- `examples/m16-reference-creation-host/static/app.js`
- `examples/m16-reference-creation-host/run.test.ts`

更新的 guide：

- [Build Change Assurance](../developer/build-assurance.md)
- [中文版](../developer/build-assurance.zh-CN.md)

## Reference Host 证据

`evolution/start` 现在会为 Priority Queue proposal 返回 `review_packet`。这个 packet 列出五个 additive definition changes：

1. Add priority column。
2. Add priority queue read operation。
3. Add priority queue view。
4. Allow public priority queue read。
5. Allow public priority queue invoke。

生成的 approval statement 是：

```text
Approve one Builder intent: Add a Priority Queue for urgent inbox items. Scope: Additive inbox definition only: priority column, read operation, view, and read/invoke policies.
```

recovery plan 是 `discard_unapplied_draft`：批准前拒绝 proposal，保持当前 app definition 不被修改。

## 验证

目标命令：

```bash
bun test packages/core/test/build-assurance-review-packet.test.ts
bun test examples/m16-reference-creation-host/run.test.ts
```

目标结果：

- core review packet：`4 pass`，`0 fail`，`6 expect() calls`；
- M16 E2E：`1 pass`，`0 fail`，`39 expect() calls`。

测试证明：

- packet 可以从 proposal evidence 创建；
- pre-proposal check 失败会阻止 approval；
- destructive definition risk 要求 destructive disclosure 和 recovery；
- data migration risk 要求非 `none` 的 migration mode；
- Reference Host 会在 approval 前暴露这个 packet。

## 剩余边界

M35 不增加通用 approval UI、compliance workflow engine，也不增加 marketplace audit primitive。M36 应该处理下一块 assurance 缺口：negative-path recovery drills。

