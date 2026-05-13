# M44 Runtime / Data Governance DDD Design（中文版）

**日期：** 2026-05-13
**状态：** 待 owner review 草稿
**英文版：** [2026-05-13-m44-runtime-data-governance-ddd-design.md](./2026-05-13-m44-runtime-data-governance-ddd-design.md)
**相关锚点：** `docs/architecture/spec/ai-build-assurance-domain-review.md`、`docs/architecture/spec/production-readiness-boundary.md`、`docs/architecture/spec/enterprise-governance-domain-review.md`

## 1. 顶层定位

M40-M43 已经关闭了第一条 enterprise governance loop：

```text
Builder intent
  -> Build Agent proposal
  -> review packet
  -> role-based governance approval
  -> Build Assurance publish gate
```

这是必要的，但还不足以支撑下一步 production-facing claim。

下一个缺口不是另一个人类审批模型，而是同一个 control loop 里的 runtime/data outcome 侧：

```text
Approved change
  -> apply / publish / migrate / restart / rollback
  -> observe what actually happened
  -> reconcile or fail closed
  -> leave evidence the Builder, Reviewer, Owner, and Operator can understand
```

这个设计继续保持四层产品模型：

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

framework 应该提供 runtime/data governance 的共享 contracts。Creation Host 仍然拥有 provider implementation、process management、deployment integration 和 product UX。

## 2. 这不是什么

这个设计不是：

- cloud control plane；
- data-provider selection；
- serverless database integration plan；
- production IAM；
- zero-downtime migration tooling；
- hosted audit backend；
- provider marketplace；
- Build Assurance 或 Enterprise Governance 的替代品。

Provider deep dive 可以暴露有价值的概念，但 provider-specific architecture 不能变成 Pneuma 的领域模型。Provider integration 后续应该放在 Provider Capability Matrix 和 Host-owned provider packages 下。

## 3. 为什么现在重新做 DDD

M43 之后，模型已经可以回答：

- 谁请求了变化；
- Agent 提出了什么；
- approval 前展示了什么 review packet；
- 哪条 governance route 生效；
- 谁批准或拒绝；
- Build Assurance 是否阻止 publish。

但模型还不能很好回答：

- approved change 被 apply 到哪个 runtime instance；
- restart 之后，是否有 stale preview/published process 继续参与；
- version publish 时使用了什么 data policy；
- migration/carry-forward/restore 是否产生了 evidence；
- observed runtime/provider state 是否匹配 desired state；
- apply/publish/migration 半成功时发生了什么；
- 哪个 receipt 把 definition、source、runtime、data、provider、release 这些 lanes 串起来解释结果。

这些不是 provider 问题。它们是 AI build assurance 问题。

## 4. 当前模型盘点

| 已有 primitive | 健康职责 | 剩余 runtime/data 缺口 |
|---|---|---|
| BuildThread | Builder、Agent、proposal、decision、execution receipt 的 semantic transcript。 | 需要 stable refs 指向 runtime/data control receipts，而不是 opaque Host blobs。 |
| Build Change Review Packet | approval-facing scope、risks、checks、recovery plan。 | 可以描述 migration risk，但不能表达 actual data evolution outcome。 |
| Build Assurance Case | 一个 Build Change 的 readiness 和 evidence refs。 | 需要 first-class runtime observation 与 data evolution receipt evidence refs。 |
| Enterprise Governance Decision | 判断 required roles 是否批准了变化。 | approval 只表示变化可以继续，不证明 runtime/data outcome。 |
| Code Change Lane | source proposal/apply/rollback，包含 guardrails 和 receipts。 | source receipts 不标识 runtime generation 或 data boundary。 |
| `definition.apply_change_set` | governed framework definition mutation。 | definition result 是一条 lane，不是完整 applied runtime/data outcome。 |
| Runtime Diagnostic Surface | runtime mode、health、readiness helper vocabulary。 | diagnostics 是 observations，不是 durable desired/observed/reconcile model。 |
| Release Rollout | active/candidate/previous release slots 和 transition state。 | release slot state 不定义 version data policy 或 runtime generation semantics。 |
| Credential Broker Utilities | no-secret session/OAuth/credential refs 和 rebinding evidence。 | credential refs 还没有绑定 runtime/provider attachment generation。 |
| Provider Capability Matrix | provider/profile capability declarations 和 fail-closed behavior。 | persistence/data evolution capabilities 仍然太粗。 |

缺的是连接组织，不是新的顶层产品。

## 5. 推荐领域概念

工作名称：

```text
Runtime / Data Governance
```

它是 framework vocabulary，用来回答：

> 当 approved AI-assisted change 进入 preview、publish、migration、restart 或 rollback 后，Host 如何证明它想达到什么 runtime/data state、实际观察到什么、尝试了什么 reconcile、留下什么 evidence？

这个名字刻意避免 provider-specific terms，也避免暗示 framework 运行基础设施。framework 拥有 contracts 和 validators；Hosts 执行它们。

## 6. 核心语言

### Runtime Intent

Host-authored statement：期望的 runtime/data state。

例子：

- preview version `v3` 应该正在运行；
- published version `v2` 应该是 active；
- runtime 应该在 source apply 后 restart；
- data 应该按 published version 隔离；
- data 应该从 `v1` carry forward 到 `v2`，并留下 migration receipt；
- credential requirement `github-public-read` 应该以 no-secret ref 的方式对 runtime 可用；
- semantic index 应该在 publish readiness 前从 source rows 重建。

Runtime Intent 不是 shell command。它是 desired state，可能触发 lifecycle verbs、provider calls、checks 或 release transitions。

### Runtime Observation

Host/runtime/provider 实际观察到什么的 append-only statement。

例子：

- health endpoint 对某个 runtime generation 有响应；
- config fingerprint 匹配预期 app version；
- process id 和 service URL 属于 current generation；
- published version 能服务 End User route；
- data migration receipt 存在；
- credential binding ref 可用，但不暴露 secret；
- provider check 失败或超时。

Observation 是 evidence input，不授予 authority。

### Runtime Generation

具体 runtime attachment 的单调身份。

它回答：

```text
这个 runtime process / service URL / internal token / credential attachment / provider connection 还是当前的吗？
```

现有 scoped tokens 解决了这个问题的一部分。Runtime Generation 把 stale actor detection 提升为共享领域概念。

### Reconcile Attempt

一次有边界的尝试：把 observed state 推向 intent。

例子：

- 启动 preview runtime；
- restart active published runtime；
- checks 通过后 promote candidate；
- rollback active release；
- 在 publish downtime 期间运行 migration；
- rebuild derived index；
- 重新检查 provider credential availability；
- 因缺少 required data evidence 而 fail closed。

Reconcile Attempt 有 status、steps、observations、recovery classification 和 receipt。

### Data Evolution Policy

声明 app data 在版本之间如何变化。

初始 policy vocabulary：

| Policy | 含义 |
|---|---|
| `isolated-version-data` | 每个 published version 拥有自己的 data boundary。Rollback 回到该 version 的数据。 |
| `carry-forward-with-receipt` | 新 version 从旧数据开始，并必须记录 migration/carry-forward evidence。 |
| `provider-managed-snapshot` | provider 通过 capability declarations 和 receipts 暴露 snapshot/restore 语义。 |
| `provider-managed-branch` | provider 通过 capability declarations 和 receipts 暴露 branch/fork 语义。 |

framework 应该 validate declaration 和 receipt shape。Host/provider package 实现实际 storage behavior。

### Data Evolution Receipt

证明 data boundary 被移动、复制、迁移、snapshot、restore，或有意保持 isolated 的 evidence。

它应该包含：

- source app/version/data boundary；
- target app/version/data boundary；
- policy；
- migration/check ids；
- provider profile id；
- provider opaque receipt refs（如适用）；
- status 和 recovery classification；
- 默认不包含 secrets，也不包含 raw database dump。

### Runtime Control Receipt

把一次 runtime/data attempt 关联回 AI build loop 的通用 envelope。

它应该引用：

- BuildThread id；
- build change id；
- proposal 或 review packet id；
- governance decision id（如适用）；
- assurance case id；
- app id / version id / profile id；
- runtime generation id；
- runtime intent id；
- observations；
- data evolution receipt ids；
- release rollout refs；
- recovery drill refs（如适用）。

它不替代专门 evidence，而是让专门 evidence 可导航。

## 7. Aggregate candidates

### ApplicationRuntimeTarget

Identity：

```text
app_id + version_id + mode
```

Mode 初始为：

```text
preview | published
```

Owns：

- profile id；
- expected definition/source fingerprint；
- data evolution policy；
- current runtime generation id；
- latest observation summary。

Invariants：

- published target 必须指向 immutable app version；
- preview target 可以指向 mutable working state；
- 当 process identity、service URL、internal token 或 provider attachment 改变时，current generation 改变。

### RuntimeGeneration

Identity：

```text
runtime_generation_id
```

Owns：

- target ref；
- created/stopped timestamps；
- current/stale status；
- service URL ref；
- internal authority scope metadata，但绝不包含 raw tokens；
- provider attachment refs。

Invariants：

- stale generation 不能 authorize mutation；
- stale generation 仍然可以产生 observation evidence；
- generation id 必须出现在 start/restart/promote/rollback receipts。

### RuntimeObservation

Identity：

```text
observation_id
```

Owns：

- target ref；
- runtime generation id；
- check results；
- observed fingerprints；
- provider/data evidence refs；
- timestamp。

Invariants：

- append-only；
- failed observation 也是合法 evidence；
- observation 本身不能满足 governance approval。

### ReconcileAttempt

Identity：

```text
reconcile_attempt_id
```

Owns：

- runtime intent ref；
- before observations；
- executed steps；
- after observations；
- status；
- recovery classification；
- runtime control receipt。

Invariants：

- 一个 attempt 属于一个 intent；
- partial success 必须可见；
- 如果同时触及 Host lane 和 framework lane，receipt 必须声明两者。

### DataEvolutionReceipt

Identity：

```text
data_evolution_receipt_id
```

Owns：

- source 和 target data refs；
- selected Data Evolution Policy；
- provider profile id；
- migration/backup/restore/check refs；
- status；
- recovery classification。

Invariants：

- 不包含 raw secrets；
- 默认不包含 raw data dump；
- `carry-forward-with-receipt` 没有 receipt 时不能被视为 publish-ready；
- provider-managed snapshot/branch 仍然返回 framework-shaped evidence。

## 8. Bounded Context placement

| 概念 | Framework 拥有 | Creation Host 拥有 |
|---|---|---|
| Runtime Intent | type、validator、status vocabulary | 从 product actions 创建 intents |
| Runtime Observation | type、validator、evidence vocabulary | 收集 health/provider/process facts |
| Runtime Generation | identity/status contract 和 stale semantics | 生成 ids，绑定 process/provider attachments |
| Reconcile Attempt | receipt shape 和 recovery vocabulary | execution、retries、stop/start/migrate/rollback implementation |
| Data Evolution Policy | allowed policy values 和 receipt contract | 按 profile/version 选择 policy |
| Provider Capability Matrix extension | provider-neutral capability fields | real SDKs、credentials、rate limits、storage behavior |
| Runtime Control Receipt | cross-lane evidence envelope | 存储并在 Host UX 渲染 |

这保持 framework scope 很窄：共享语义，而不是基础设施所有权。

## 9. 与现有 Assurance / Governance 的集成

### Build Assurance

增加 runtime/data refs 作为 evidence kinds：

```text
runtime_observation
runtime_control_receipt
data_evolution_receipt
runtime_generation
```

Build Assurance 可以在不知道 provider internals 的情况下，因为缺少 runtime/data evidence 而阻止 publish。

### Enterprise Governance

Governance 仍然回答：

```text
Is the required human route satisfied?
```

Runtime/Data Governance 回答：

```text
After that route is satisfied, what actually happened?
```

`data_migration`、`credential_boundary`、`release_change` 等高风险 route 可以要求 runtime/data receipts 才能进入 publish readiness。

### Release Rollout

ReleaseRolloutState 仍然是 release slot model。Runtime/Data Governance 包在它周围：

- stage/promote/rollback 创建 Runtime Intents；
- health/config/provider checks 创建 Observations；
- URL/process changes 推进 Runtime Generation；
- rollback failures 产生 Reconcile Attempt receipts。

### Provider Capability Matrix

Provider Capability Matrix 应该增加 persistence/data-evolution declarations，但不能引入 provider-specific branches。

候选 capability shape：

```ts
interface PersistenceCapability {
  capability_id: string;
  data_evolution_policies: readonly DataEvolutionPolicyKind[];
  schema_migration: {
    supported: boolean;
    transactional: "yes" | "no" | "partial" | "unknown";
    requires_downtime_disclosure: boolean;
  };
  backup_restore: {
    snapshot_supported: boolean;
    restore_supported: boolean;
    receipt_required: boolean;
  };
  branching: {
    supported: boolean;
    receipt_required: boolean;
  };
  stale_attachment_behavior: "reject" | "warn" | "host-defined";
  failure_behavior: "fail-closed" | "host-defined";
}
```

Build Agent 应该看到 capability contract，而不是 provider-specific instructions。

## 10. 设计选项

### Option A — Document-Only Alignment

只更新文档解释 runtime/data outcome governance，所有 shape 继续 Host-owned。

优点：

- 最快；
- 没有 API surface；
- 不容易 overbuild。

缺点：

- 下游 Hosts 会继续发明不兼容的 receipt/generation/data-policy shapes；
- Build Assurance 很难稳定消费 runtime/data evidence；
- provider pressure 会反复暴露同类 gap。

### Option B — Contract-First Runtime/Data Governance

增加 core value objects、validators 和 evidence ref extensions。暂时不做 provider adapter 或 durable controller。

优点：

- 与 BuildThread、Sharing Governance、Credential Broker、Build Assurance 的风格一致；
- 给 Hosts 共享语言；
- provider/UX/process ownership 仍留在 Host；
- 不依赖 production infra 就可以测试；
- 直接支撑 0.3.x enterprise-readiness path。

缺点：

- 增加新的 contract surface；
- 文档必须精确，避免 Developer 误以为这是 deployment platform。

### Option C — Full Runtime Controller

构建 persistent controller store 和 reconciler。

优点：

- 产品 demo 更强；
- local process examples 的 Host boilerplate 更少。

缺点：

- 很可能把 Creation Host responsibility 拉进 framework；
- 在 data/provider capability semantics 稳定前太早；
- 增加 framework 变成某个特定 Host SDK 的风险。

**推荐：** Option B。

## 11. 推荐 M44 范围

M44 应该是 contract-first slice：

1. 增加 `runtime-data-governance` core module，包含 types 和 validators：
   - `RuntimeIntent`；
   - `RuntimeObservation`；
   - `RuntimeGeneration`；
   - `ReconcileAttempt`；
   - `DataEvolutionPolicy`；
   - `DataEvolutionReceipt`；
   - `RuntimeControlReceipt`。
2. 扩展 Build Assurance evidence refs，加入 runtime/data evidence kinds。
3. 扩展 Provider Capability Matrix，加入 provider-neutral persistence/data-evolution capability declarations。
4. 增加测试：
   - stale generation cannot authorize mutation；
   - failed observation remains evidence；
   - carry-forward policy requires data receipt before publish readiness；
   - provider-managed snapshot/branch can be declared without provider-specific logic；
   - runtime control receipt correlates BuildThread、governance、assurance、release、data evidence refs。
5. 更新 developer docs 和 team-share narrative。

M44 不应该集成真实 remote persistence provider。那应该在 contract 稳定后作为后续 provider lane。

## 12. 验收标准

M44 完成时，framework 应该能用 test-backed contracts 回答：

1. 期望的 runtime/data state 是什么？
2. 实际观察到的 runtime/data state 是什么？
3. 哪个 runtime generation 是 current？
4. stale actor 是否被拒绝或记录为 stale？
5. 这个 version movement 应用了什么 data evolution policy？
6. required migration/backup/restore/carry-forward evidence 是否存在？
7. 哪个 reconcile attempt 推进、失败或恢复了状态？
8. receipt 关联了哪些 BuildThread / governance / assurance / release evidence？

## 13. M44 之后的后续 lanes

潜在后续方向：

- real persistence provider adapter pressure；
- executable provider parity runner；
- data migration dry-run helper；
- Host UI for runtime/data receipts；
- runtime generation binding for credential broker calls；
- fresh Creation Host project 的 downstream validation。

除非 contract 自身无法验证，否则这些不应该并入 M44。
