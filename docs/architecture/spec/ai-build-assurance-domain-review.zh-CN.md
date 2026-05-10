# AI Build Assurance Domain Review 中文版

**状态：** M37 之后的当前领域审查锚点，不是 ADR，也不是实现 milestone。
**日期：** 2026-05-10
**English version:** [ai-build-assurance-domain-review.md](./ai-build-assurance-domain-review.md)  
**目的：** 让 post-RC Build Assurance lane 持续对齐 Pneuma 的原始目标：让 Builder 通过 Build Agent 构建业务功能的过程，具备企业可接受的工程约束、责任链、验证和恢复能力。

## 1. 为什么需要这次审查

到 M37 为止，framework 已经有一组相当完整的 primitive：

- 通过 `definition.apply` 和 `definition.apply_change_set` 治理 app-definition 变更；
- 通过 BuildThread 记录 semantic Builder conversation；
- 通过 Code Change Lane 产生 source-code proposal / apply / rollback evidence；
- runtime mode 和 health diagnostics；
- release rollout state 和 rollback helpers；
- HostExtension slots，用于 Host-owned open-ended contributions；
- credential rebinding evidence，以及真实下游 Host 对 credential helpers 的采用；
- Build Change Assurance cases、approval-time review packets、durable local assurance storage 和 recovery drill matrices。

这会带来一个诱惑：看到下一个技术缺口，就继续加一个 primitive。这个 review 仍然是刻意放慢这件事的锚点。

项目目标不是：

```text
Builder 把 artifact 发布到 marketplace
  -> 别人下载
  -> framework 证明 cryptographic origin 和第三方篡改风险
```

这个以后可能成为分发安全问题，但它不是现在的中心问题。

项目目标更接近：

```text
Builder 让 Build Agent 创建或修改业务功能
  -> framework 辅助约束 scope、披露风险、验证工作、
     保留决策证据、从失败中恢复、支持 rollback
  -> 企业可以把这个过程当作工程控制平面接受
```

所以这里的 “audit” 不应该被理解成被动的合规日志。在 Pneuma 里，audit 是 build control loop 的一部分。它帮助非专家 Builder 做可负责的决策，同时让 framework 收束 AI coding 的不确定性。

## 2. 不漂移声明

Pneuma 不应该漂移成通用 artifact trust platform。

当前 assurance 问题是：

> 这次 AI-assisted business-function change 是否经过了一个边界清晰、可审查、已验证、可恢复的过程？

不是：

> 我们能否证明这个 package 是 Alice 本人写的，并且没有被互联网上的第三方改过？

digest、provenance 和 signing 以后仍然可能出现，但它们只能作为 build/release assurance story 里的辅助证据，不是顶层叙事。

## 3. 已有拼图

assurance concern 其实已经分散存在于多个地方。

| 已有拼图 | 已经保证了什么 | 还没有统一什么 |
|---|---|---|
| `definition.apply` | 单个 framework definition mutation 被治理、授权、执行、重启和验证。 | 不描述 Builder 更大的产品意图或跨 lane scope。 |
| `definition.apply_change_set` | 一个 Builder intent 可以变成一个 approved app-definition change-set。 | 覆盖 framework definition rows，不覆盖 Host-owned source artifacts 或 release migration plan。 |
| BuildThread | Builder request、agent proposal、Builder decision 和 execution receipt 是 semantic turns。 | 记录 turns，但不计算 readiness 或 risk posture。 |
| Code Change Lane | Draft source changes 有 diff evidence、guardrails、stale-base checks、apply、rollback 和 receipts。 | 不处理 schema migration timing、release readiness 或 product-scope drift。 |
| Runtime Diagnostic Surface | Preview/published runtime mode 和 health facts 可见。 | 是 runtime evidence，不是 build-change lifecycle。 |
| Release Rollout | Active/candidate/previous releases 可以 stage、promote、restart、rollback。 | 不知道 candidate 的 build-change evidence 是否完整。 |
| Credential Rebinding Evidence | Share/fork/install credential requirements 可以无 secret 表达。 | 是 credential evidence，不是 general change assurance。 |
| `doctor-host` | Host-authored contracts 可以在 Host 被认为 coherent 前检查。 | 还不验证某一次 AI build change 从 intent 到 release 是否完整。 |

M32-M37 没有替代这些系统，而是定义了把它们组合起来的视角。

## 4. 核心 assurance 场景

以下是这个模型必须覆盖的真实工程场景。

### 4.1 Agent 写了 bug

Builder 提出一个有用的变更，Agent 改了 source 或 definition，但引入了 bug。

framework 的职责：

- pre-proposal checks 应该在 Builder approval 前拦住明显无效的 draft；
- pre-apply checks 应该阻止 stale 或 unsafe apply；
- post-apply checks 应该让 proposal 失败，并在可能时恢复旧 source；
- runtime health checks 应该阻止 release readiness；
- receipt evidence 应该明确失败发生在哪个阶段。

失败不只是负面结果。一个 failed-but-rolled-back change 是成功的工程控制。

### 4.2 Agent 不必要地删列或删能力

Builder 只是想加一个功能，但 Agent 扩大 scope，删除了 column、table、view、operation、module 或 capability。

framework 的职责：

- proposal evidence 必须把 destructive 或 capability-removing changes 和 additive work 分开披露；
- destructive change 需要更强的 impact language 和 approval；
- removed column 必须包含 data impact 和 recovery limitation；
- Host 应该能在 apply 前拒绝“scope 超出 Builder intent”的 proposal。

这不只是 permission control，而是 scope control。

### 4.3 Schema migration 时机

Builder 发布一个改变数据形状的版本。当前阶段不追求 online migration；可控停机可以接受。

framework 的职责：

- migration timing 必须显式：publish 前、publish downtime 中、candidate health 后，或者不需要 migration；
- release readiness 应该知道 migration evidence 是否存在；
- rollback semantics 必须明确：app-only rollback、schema rollback、data snapshot restore，还是 irreversible migration with warning；
- 如果 active data 可能被改动，migration 前应该有 snapshot 或 backup evidence。

关键不是“零停机”。关键是不能有无法解释的 half-success。

### 4.4 Builder 反悔或重新理解需求

Builder 可能不是 developer 或产品经理。他们可能提出模糊需求，批准了过大的 proposal，或者看到结果后改变主意。

framework 的职责：

- 模糊 intent 应该允许变成 `agent_clarification` turn，而不是立刻 proposal；
- 未批准 draft 可以 discard；
- 已批准但未发布的变更可以变成 revert/corrective proposal；
- 已发布变更在数据语义允许时可以 rollback 到 previous version；
- irreversible migration limitation 必须在决策前可见，而不是反悔后才说。

反悔不是异常路径，而是自然语言创造过程中的常规路径。

### 4.5 Builder 必须负责

企业不能说“这是 AI 做的”，然后失去责任链。Builder 或指定 approver 对决策负责，而 framework 对证据质量负责。

framework 的职责：

- 记录谁提出、谁 proposal、谁批准、批准时看到了什么；
- 保存 checks、diffs、migration plans、impact、execution、recovery、release 的 evidence refs；
- 让 denied、failed、rolled-back、superseded 成为一等 outcome；
- reviewer 能重建一个 release 为什么被允许或被阻止。

Builder 对决策负责。framework 让这种负责变得合理。

## 5. 生命周期重构

assurance lifecycle 不是新的 runtime。它是用来对齐已有上下文的方式。

```text
Builder Intent
  -> Clarification / Scope Boundary
  -> Agent Proposal
  -> Impact + Risk Classification
  -> Pre-Proposal Checks
  -> Builder Approval / Denial
  -> Apply + Migration
  -> Post-Apply Verification
  -> Release Readiness
  -> Publish / Rollback / Corrective Proposal
```

映射到当前 primitives：

| 生命周期步骤 | 已有支持 | 缺口 |
|---|---|---|
| Builder Intent | BuildThread `user` turn | 没有显式 scope-quality assessment。 |
| Clarification | BuildThread `agent_clarification` | 没有规则说明什么时候 unclear intent 必须先 clarify。 |
| Agent Proposal | BuildThread `agent_proposal`、Code Change Lane proposal、definition change-set proposal | 没有统一的 proposal risk shape，覆盖 definition、code、migration、release。 |
| Impact + Risk | definition.apply impact、Code Change Lane diff/checks | destructive/schema/data/migration risks 尚未 normalized。 |
| Pre-Proposal Checks | Code Change Lane `pre_proposal`、doctor-host contracts | 尚未泛化到 definition/app/release proposals。 |
| Approval / Denial | Permission ledger、BuildThread `user_decision` | approval evidence 已存在，但不总是绑定到完整 business change。 |
| Apply + Migration | definition.apply、Code Change Lane apply、release helper | migration timing 和 data backup evidence 不是一等概念。 |
| Post-Apply Verification | Code Change Lane `post_apply`、runtime health、release checks | 没有统一 readiness assessment。 |
| Publish / Rollback | Release Rollout、definition rollback、Code Change Lane rollback receipts | rollback limits 和 corrective proposal semantics 需要共享词汇。 |

## 6. 当前领域对象：Build Change Assurance

已经接受的缺失概念不是 “artifact provenance”，而是围绕一次 Builder-owned change attempt 的 **Build Change Assurance**。

工作定义：

> Build Change 是一次由 Builder 拥有的 business-function change attempt，从 intent 到 proposal、decision、execution、verification、release readiness 和 recovery。

它不一定是一个 framework Operation。它可能跨越：

- app-definition rows；
- Host-owned source code；
- HostExtension bundles；
- runtime config；
- schema/data migration；
- release rollout state；
- credential binding prerequisites。

常见 identity 字段：

```text
build_change_id
app_id
version_id or candidate_version_id
thread_id
builder_subject
```

当前 readiness 词汇：

```text
clarifying
proposed
blocked_before_approval
awaiting_approval
denied
applying
failed_recovered
failed_unrecovered
verified
ready_for_publish
published
rolled_back
superseded
```

初始 state machine 应该保持小。重点是不要把所有失败都压成 “error”，也不要把所有撤销都压成 “rollback”。

## 7. 当前 Evidence Ref Model

framework 不应该把所有 log 复制进一个巨大的 record。Evidence 应该通过引用组合。

```ts
type EvidenceRef =
  | { kind: "build_thread_turn"; thread_id: string; turn_id: string }
  | { kind: "permission_ledger_record"; request_id: string }
  | { kind: "code_change_receipt"; proposal_id: string }
  | { kind: "definition_history"; app_id: string; version: number }
  | { kind: "runtime_health"; runtime_id: string; checked_at_ms: number }
  | { kind: "release_rollout"; app_id: string; rollout_id: string }
  | { kind: "host_check"; check_id: string; status: "passed" | "failed" | "skipped" };
```

当前 assessment inputs：

```ts
type BuildChangeReadiness =
  | "needs_clarification"
  | "blocked"
  | "awaiting_approval"
  | "ready_to_apply"
  | "verified"
  | "ready_to_publish"
  | "published"
  | "failed_recovered"
  | "failed_unrecovered"
  | "rolled_back"
  | "superseded";
```

当前 assurance case：

```ts
interface BuildChangeAssuranceCase {
  build_change_id: string;
  app_id: string;
  thread_id: string;
  builder_subject: string;
  intent_summary: string;
  scope_summary: string;
  risk_classification: BuildChangeRisk[];
  readiness: BuildChangeReadiness;
  evidence_refs: EvidenceRef[];
  blocking_reasons: string[];
  rollback_notes?: string[];
  migration_notes?: string[];
}
```

这是 `@pneuma-framework/core` 中已经接受的 v0 helper shape。重要设计方向仍然是：**assurance 组合 evidence refs 和 readiness reasons；它不替代底层系统。**

## 8. Risk Classification Vocabulary

一个最小词汇表比模糊的 “risk score” 更有用。

| Risk | 含义 | 需要的 evidence 方向 |
|---|---|---|
| `additive_ui` | 增加或修改 UI，不改变 stored data shape。 | Diff/preview evidence。 |
| `source_code_change` | 修改 Host-owned source artifact。 | Code Change Lane proposal、diff、guardrails、receipt。 |
| `definition_additive` | 增加 table/column/operation/view/policy，不移除已有 capability。 | definition.apply impact 和 history。 |
| `policy_change` | 修改 access、visibility 或 approval semantics。 | policy impact 和 approver evidence。 |
| `destructive_definition` | 删除 table/column/view/operation/policy，或移除 capability。 | explicit destructive impact、backup/recovery evidence。 |
| `data_migration` | 改变 stored data shape 或 semantics。 | migration timing、backup、verification、rollback limitation。 |
| `credential_boundary` | 增加或修改 credential requirements。 | no-secret requirement/evidence 和 rebinding plan。 |
| `release_change` | 修改 active/candidate/previous published state。 | rollout checks 和 release transition evidence。 |

这个词汇表应该让 Builder 能理解，也让 Developer 能使用。它不是安全分类法。

## 9. Migration 和 Release 的位置

Schema/data migration 是 build-change assurance story 的一部分，不是独立部署平台。

当前项目立场：

- 当前阶段可以接受 downtime；
- online migration 不是默认要求；
- framework 应该优先选择显式 migration mode 和 evidence，而不是隐藏的复杂机制；
- 对低频 build-time changes，最坏情况下 reset and retry 可以接受；
- 要避免的是 half-success 和 half-rollback。

当前 migration modes：

| Mode | 含义 |
|---|---|
| `none` | 变更不影响 stored data shape。 |
| `before_publish` | migration 在 candidate 被标记 publish-ready 前运行。 |
| `publish_downtime` | active runtime 被有意停掉，migration 运行，然后 candidate 启动。 |
| `carry_forward_with_receipt` | 新版本从旧数据加显式 migration receipt 开始。 |
| `irreversible_with_backup` | migration 不能干净 rollback；必须有 backup/snapshot 和 warning。 |

目前这大概率是 framework contract + Host implementation boundary：

- framework 定义词汇和 evidence requirements；
- Host 提供实际 migration commands 和 backup strategy；
- release readiness 消费结果。

## 10. 责任边界

| Concern | Framework 应拥有 | Host / Developer 应拥有 |
|---|---|---|
| Business-change lifecycle vocabulary | 是 | Host 可以加 domain labels。 |
| Evidence ref shape | 是 | Host 提供具体 evidence producers。 |
| Risk classification base vocabulary | 是 | Host 可以把 domain tools 映射到 risks。 |
| Guardrail command content | 否 | 是。 |
| Preview and product checks | 否 | 是，通过 framework check hooks。 |
| Migration strategy implementation | 否 | 是。 |
| Migration mode vocabulary | 大概率是 | Host 为每个 profile/change 选择 mode。 |
| Approval UI | 否 | 是。 |
| Approval evidence contract | 是 | Host 负责渲染。 |
| Production incident response | 否 | Host/meta-app product。 |
| Marketplace artifact signing | 当前不是 | 后续 distribution lane，如有需要。 |

这个边界让 framework 聚焦在 AI-build control plane，同时保留四层模型。

## 11. M32-M37 已经确定了什么

第一条 assurance lane 已经被接受为 `@pneuma-framework/core` 里的 value-object / helper surface，而不是 runtime database 或 compliance backend。

已确定：

1. 第一个 aggregate 是 `BuildChangeAssuranceCase`。
2. 它位于 `@pneuma-framework/core`，以 evaluator、validator、local/reference store 和 Host-facing helper 的形式存在。
3. Evidence 通过 `BuildChangeEvidenceRef` 引用；源系统仍然是权威事实。
4. Approval-time disclosure 由 `BuildChangeReviewPacket` 表达。
5. 预期 negative paths 由 `BuildChangeRecoveryDrillScenario` 测试。
6. 下游采用路径记录在 `docs/developer/build-assurance-adoption.zh-CN.md`。

这让 assurance lane 保持在 Creation Host control loop 里：

```text
Review Packet before approval
  -> Assurance Case after state transition
  -> Durable Host store
  -> Recovery Drill Matrix in Host tests
```

## 12. M37 之后仍然开放的压力点

下一步工作应该来自具体下游压力，而不是抽象扩张。

开放压力点：

1. 多少 migration evidence 应该成为 framework-required，多少应该由 Host 声明？
2. assurance cases 什么时候需要从 local/reference storage 升级成 production retention adapter？
3. enterprise approval assignment、reviewer routing、retention policy 应该如何和 Permission Center 组合？
4. corrective proposals 和 superseded decisions 在真实 Host UI 里应该如何展示？
5. 哪一个下游 Host 应该从零上下文验证 adoption guide？

除非有具体下游场景要求，否则不要从 UI、marketplace signing、production IAM 或 online migration 重新启动这条 lane。

## 13. 最终对齐

assurance lane 应该用一个问题判断：

> 非专家 Builder 和企业 reviewer 能否理解 Agent 想改什么、披露了哪些风险、跑了哪些检查、批准了什么、实际发生了什么，以及如何恢复？

如果答案是 yes，它就在推进 Pneuma 的原始目标。

如果它主要变成 external artifact authenticity，它就已经漂移了。
