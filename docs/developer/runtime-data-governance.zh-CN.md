# Runtime / Data Governance（中文版）

**受众：** 正在构建会 publish、restart、migrate 或 rollback Generated Applications 的 Creation Host Developer
**英文版：** [runtime-data-governance.md](./runtime-data-governance.md)

Runtime / Data Governance 是 framework contract，用来解释一个 approved Build Change 触及 preview、publish、migration、restart、rollback 或 provider data 之后，实际发生了什么。

它不是 provider adapter、deployment platform、cloud control plane，也不是 migration runner。

## 它放在哪里

```text
Builder intent
  -> governance approval
  -> Build Assurance
  -> Runtime Intent
  -> Reconcile Attempt
  -> Runtime Observation / Data Evolution Receipt
  -> Runtime Control Receipt
```

Build Assurance 回答一个 change 是否 clear、approved、verified，并且足够安全进入 publish。Runtime / Data Governance 回答：期望什么 runtime/data state、实际观察到什么、哪些 evidence 解释了 outcome。

## 什么时候使用

这些 contracts 用在：

- publish 需要 migration 或 carry-forward evidence；
- rollback 存在 data limitations；
- runtime restart 改变 active service generation；
- provider data 被 snapshot、restore、branch 或 carry forward；
- Build Assurance 需要 source diff、definition history、release health 之外的 evidence；
- stale preview 或 published runtime 必须被拒绝，或记录为 stale。

## 核心对象

| Object | 含义 |
|---|---|
| `RuntimeIntent` | Host-authored desired runtime/data state，例如 publish、restart、migrate 或 rollback。 |
| `RuntimeGeneration` | 某一次 runtime attachment 的单调身份：process、service URL、internal authority 或 provider connection。 |
| `RuntimeObservation` | Host/runtime/provider 实际观察到的 append-only fact。失败 observation 也是 evidence。 |
| `ReconcileAttempt` | 一次有边界的尝试：把 observed state 推向 intent，包含 steps 和 recovery status。 |
| `DataEvolutionReceipt` | isolated data、carry-forward、migration、snapshot、restore 或 provider-managed branch behavior 的 evidence。 |
| `RuntimeControlReceipt` | 把 runtime/data outcome 关联回 BuildThread、governance、assurance、release、data evidence 的 cross-lane envelope。 |

## Data Evolution Policy

用 `DataEvolutionPolicyKind` 声明 version-data behavior，而不选择具体 provider：

| Policy | 含义 |
|---|---|
| `isolated-version-data` | 每个 published version 拥有自己的 data boundary。Rollback 回到该 version 的数据。 |
| `carry-forward-with-receipt` | 新 version 从旧数据开始，并必须记录 data evolution receipt。 |
| `provider-managed-snapshot` | provider 通过 capability declarations 和 receipts 暴露 snapshot/restore 语义。 |
| `provider-managed-branch` | provider 通过 capability declarations 和 receipts 暴露 branch/fork 语义。 |

`BuildChangeMigrationMode` 仍然是 Build Assurance 的 migration vocabulary。当 Build Change 使用 `carry_forward_with_receipt` 时，publish readiness 会保持 blocked，直到 evidence 包含 `data_evolution_receipt`。

## Runtime Generation

Runtime Generation 是 stale-actor boundary：

```ts
import { assertRuntimeGenerationCanMutate } from "@pneuma-framework/core";

const decision = assertRuntimeGenerationCanMutate(runtimeGeneration);
if (!decision.ok) {
  // Reject internal mutation, record stale observation, or restart current runtime.
}
```

stale generation 仍然可以产生 observation evidence，但不能 authorize mutation。

## Provider Capability Matrix

Provider profiles 可以声明 persistence/data behavior，而不把 provider-specific Build Agent branches 暴露出去：

```ts
{
  capability_id: "relational-store",
  data_evolution_policies: ["isolated-version-data", "carry-forward-with-receipt"],
  schema_migration: {
    supported: true,
    transactional: "partial",
    requires_downtime_disclosure: true,
  },
  backup_restore: {
    snapshot_supported: true,
    restore_supported: true,
    receipt_required: true,
  },
  branching: {
    supported: false,
    receipt_required: false,
  },
  stale_attachment_behavior: "reject",
  failure_behavior: "fail-closed",
}
```

Build Agent 应该看到 capability contracts 和 fail-closed behavior。它不应该在 Builder sessions 中实现 “if SQLite do X, if remote Postgres do Y” 这类逻辑。

## Host 责任

Creation Host 仍然拥有：

- process management；
- provider SDKs；
- migration scripts；
- backup/restore execution；
- credential storage and refresh；
- data-owner communication；
- runtime/data evidence 的 product UX。

framework 只 validate shared shapes 和 evidence references，让不同 Hosts 可以一致地解释 runtime/data outcomes。
