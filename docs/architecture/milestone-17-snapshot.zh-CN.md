# Milestone 17 Snapshot：安全与架构接受门

**日期：** 2026-05-04
**状态：** 已闭合：完成安全修复、架构接受、lifecycle ADR、integration 边界整理和回归验证
**读者：** 对 Pneuma 没有预备知识的团队成员
**范围：** M17 修了什么、哪些模型决策已经正式接受，以及为什么下一步是 open-ended app pressure，而不是直接 release-candidate review。
**English version:** [Milestone 17 Snapshot](./milestone-17-snapshot.md)

## 摘要

M16 证明 Pneuma 已经有一个连贯的 Reference Creation Host：

```text
Developer 配置 Creation Host
  -> Builder 创建和演进 Generated Applications
  -> Builder 发布、监控、重启、回滚 Published Applications
```

M17 没有新增产品功能。它问的是一个更接近 release-readiness 的问题：

> 现在有没有安全或架构问题，会让 release-candidate review 变得不诚实？

答案是有，而且 M17 已经把关键问题收掉：

- 外部 HTTP 调用方不能再伪造 reserved `framework` 身份；
- framework lifecycle 调用现在通过 private internal runtime token；
- query Operation 和 View source invoke 检查默认 fail closed；
- rollback 在 pre-rollback backup 之后失败时，会写入 durable failure evidence；
- ADR-0029 和四制品模型被明确接受；
- lifecycle 被 ADR-0030 固定为 runtime subsystem；
- Linear/OpenRouter package 被标记为 reference integration，而不是 framework core semantics。

M17 还暴露了一个重要旧假设：Priority Queue 过去依赖 query 默认 public。现在 proposal 显式包含 `invoke operation:list_priority_queue` 和 `read view:priority_queue` 两条 policy。

## 已接受的架构

M17 正式接受这个模型：

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

同时接受这个 primitive 边界：

```text
Operation + definition-as-data 是核心 creation primitive。
Lifecycle scripts 是 semantic tools 后面的 runtime subsystem。
具体 integration 是 reference integration，除非未来由 ADR 提升边界。
```

这很重要，因为项目已经偏离了最早的 v0 plan。现在这个偏离不是 accidental branch outcome，而是被明确接受的架构决策。

## 发生了什么变化

| 区域 | 变化 |
|---|---|
| HTTP trust boundary | `x-pneuma-user-id: framework` 只有在带上 runtime internal token 时才有效，否则拒绝。 |
| Lifecycle runtime calls | framework 生成 `PNEUMA_INTERNAL_HTTP_TOKEN` 并传给 child runtime；内部 definition calls 发送 `x-pneuma-internal-token`。 |
| Query policy default | GET/query Operation invoke 检查现在始终使用 `resourceDefaultAccess: "restricted"`，不再继承 app default public。 |
| View visibility | View 只有在 `read view:<id>` 和 `invoke operation:<source>` 都允许时才出现在 `/api/config.views`。 |
| Rollback evidence | mid-rollback failure 会追加 `definition_rollback_failed`，包含 target version、backup version、error、recovery hint 和 impact。 |
| Architecture docs | Creation Host model 记录 M17 接受边界，并明确 RC 前必须有 open-ended pressure。 |
| ADRs | 新增 ADR-0030：lifecycle subsystem contract。 |
| Integration packages | `adapter-linear` 和 `provider-openrouter` 被标记为 private `reference-integration`。 |
| Priority Queue proposal | 新增显式 invoke policy，并调整 per-mutation demo 顺序，保证 View rediscovery 在 fail-closed 语义下仍成立。 |

## 已关闭的安全问题

| 问题 | M17 前的风险 | M17 闭合方式 |
|---|---|---|
| Framework identity spoofing | 任何能访问 HTTP 端口的人都可以设置 `x-pneuma-user-id: framework`，尝试调用内部 definition / rollback operations。 | Public HTTP 没有有效 `x-pneuma-internal-token` 时拒绝 reserved framework identity；lifecycle-owned calls 带 private token。 |
| Query GET 继承 public posture | 漏写 policy rule 时，query-backed data 可能在 public app 下匿名暴露。 | Query invoke checks 现在 restricted default；测试覆盖匿名 GET 无显式 policy 的拒绝。 |
| View source invoke 继承 public posture | source query Operation 没有显式 invoke policy 时，View 仍可能可见。 | `/api/config.views` 使用同一套 restricted source Operation invoke decision。 |
| Rollback 半失败无证据 | backup 之后失败，可能留下难以诊断的中间状态。 | 失败时写 `definition_rollback_failed`；这是 recovery evidence，不是 cross-store transaction 声明。 |

## 验证报告

安全与治理回归：

```text
bun test packages/runtime/test/runtime.test.ts \
  packages/runtime/test/api-config.test.ts \
  packages/runtime/test/framework-operations.test.ts \
  packages/core/test/tools/definition-apply.test.ts

202 pass
0 fail
1345 expect() calls
```

Priority Queue fail-closed 回归：

```text
bun test examples/m5-knowledge-inbox-builder-evolution/evolve.test.ts \
  examples/m6-real-agent-evolution/evolve-through-backend.test.ts \
  examples/m6-real-agent-evolution/trace.test.ts \
  examples/m7-live-agent-approval-protocol/run.test.ts \
  examples/m13-host-agent-evolution/host-evolution.test.ts \
  examples/m13-host-agent-evolution/run.test.ts \
  templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts

23 pass
0 fail
229 expect() calls
```

Creation Host 回归：

```text
bun test examples/m16-reference-creation-host \
  packages/core/test/creation-host.test.ts \
  examples/m14-host-publish-rollout/publish-rollout.test.ts

5 pass
0 fail
50 expect() calls
```

M16 smoke verification：

```text
bun run examples/m16-reference-creation-host/run.ts --port 0 --smoke-exit

knowledge inbox preview + inspect: passed
evolution approval: completed with 3 priority rows
publish v1: active team-knowledge-inbox-v1 previous team-knowledge-inbox-v0
restart active: healthy
rollback: active team-knowledge-inbox-v0
team decision log preview + inspect: passed
smoke verification: passed
```

静态检查：

```text
bun run typecheck
exit 0

git diff --check
exit 0
```

Full-suite caveat 仍然保留：M16 里记录过的旧 M3 Docker full-suite timeout 这次没有被重新声明为绿色结果。M17 使用的是聚焦的 security、governance 和 Creation Host regression tests。

## 已经证明的事情

| 结论 | 证据 |
|---|---|
| Framework identity 不再能被 header spoof | Runtime 没有 internal token 时拒绝 reserved framework principal；lifecycle calls 会带 token。 |
| Query/View 暴露是 fail-closed | GET/query 和 `/api/config.views` 都需要显式 invoke permission。 |
| Rollback failure 可诊断 | `definition_rollback_failed` history entry 指向 pre-rollback backup。 |
| 模型替换被接受 | Creation Host model 和 roadmap 已记录 ADR-0029 + 四制品模型接受。 |
| Lifecycle 被固定，但没有变回核心 primitive | ADR-0030 定义 lifecycle semantic tools、env、markers 和 internal token boundary，定位是 subsystem。 |
| 具体 integration 不是 core semantics | package metadata 和 docs 把 Linear/OpenRouter 标为 reference integration。 |
| 旧 demo 能承受更严格安全语义 | Priority Queue 现在显式声明 invoke/read policies，M5/M6/M7/M13/M16 回归通过。 |

## 没有证明的事情

M17 不声称：

- cross-store ACID rollback transactionality；
- local internal token 之外的 hosted multi-tenant service identity；
- production IAM、assignment、retention 或 admin workflow；
- zero-downtime deploy 或 production traffic switching；
- 任意 app generation；
- open-ended UI/code-heavy app creation；
- hot reload；
- Published app 内稳定 Runtime Agent；
- 完整 Pneuma 2.x dogfood coverage。

## 战略判断

M17 是 gate，不是 feature milestone。它的价值在于阻止项目带着两个隐藏问题进入 RC：

```text
所谓 enterprise security，但 framework identity 可以被伪造；
所谓 public app behavior，但缺失 query policy 会被默认暴露。
```

它也让架构叙事不再含糊。被接受的故事现在是：

```text
通过 governed Operation semantics 构建应用。
Lifecycle 是 runtime plumbing。
Creation Host 产品化 Builder experience。
具体 vendor 留在 reference integration。
```

## 下一个 milestone

M18 应该是 **open-ended app pressure**，然后再进入 release-candidate review。

Knowledge Inbox 和 Team Decision Log 都是 schema-driven business apps。它们很有价值，但形态太相似。M19 RC review 前，framework 需要一个更开放的压力线：webcraft-style app、UI/code-heavy generated surface，或者等价的开放式 creation path。

M18 的问题是：

> 当 generated app 不主要是 table/list/workflow product 时，四制品模型和 Operation-centered primitive story 还成立吗？

如果成立，M19 就可以成为真正的 release-candidate review。如果不成立，M18 应该先暴露缺失抽象，而不是把项目锁进过窄的 framework shape。
