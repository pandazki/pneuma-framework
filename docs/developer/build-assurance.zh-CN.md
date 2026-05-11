# Build Change Assurance

**读者：** 正在构建受治理 Builder + Agent change loop 的 Developer  
**English version:** [build-assurance.md](./build-assurance.md)

`Build Change Assurance` 是 framework 用来回答一个问题的语言：

> Builder 要求 Agent 做的这个 change，是否足够清楚、已被批准、已被应用、已被验证、可恢复，并且安全到可以发布？

它不是泛化的 marketplace audit 系统。它是一个很小的 core primitive，让 Creation Host 可以把已有 framework 系统产生的 evidence 组织成一个可读的 case。

## 它处在哪一层

```text
Builder intent
  -> BuildThread proposal / decision / receipt
  -> permission ledger 或 Host approval evidence
  -> Code Change Lane / definition history / Host checks
  -> runtime health 和 release rollout evidence
  -> BuildChangeAssuranceCase
```

assurance case 只保存 evidence references，不复制大段日志。真正的 transcript、approval record、code-change receipt、runtime health、rollout state 仍由原来的系统负责。

## 基本用法

```ts
import {
  assessBuildChangeReadiness,
  createBuildChangeAssuranceCase,
  validateBuildChangeAssuranceCase,
} from "@pneuma-framework/core/build-assurance";

const assessmentInput = {
  intent_status: "clear",
  proposal_status: "proposed",
  approval_status: "approved",
  execution_status: "applied",
  risks: ["definition_additive"],
  checks: [
    { id: "smoke", phase: "post_apply", status: "passed", message: "Preview works." },
  ],
  evidence_refs: [
    { kind: "permission_ledger_record", request_id: "request-1" },
    { kind: "code_change_receipt", proposal_id: "proposal-1" },
  ],
} as const;

const assessment = assessBuildChangeReadiness(assessmentInput);

const assuranceCase = createBuildChangeAssuranceCase({
  build_change_id: "change-1",
  app_id: "app-1",
  thread_id: "thread-1",
  builder_subject: "user:bob",
  intent_summary: "Add a priority queue.",
  scope_summary: "One additive definition change plus post-apply smoke check.",
  risks: ["definition_additive"],
  evidence_refs: [
    { kind: "permission_ledger_record", request_id: "request-1" },
    { kind: "code_change_receipt", proposal_id: "proposal-1" },
  ],
  assessment: assessmentInput,
  migration_mode: "none",
});

const validation = validateBuildChangeAssuranceCase(assuranceCase);
```

如果 Host 只需要即时 gate，例如“approval 按钮能不能亮起”或“publish 是否仍需阻塞”，可以直接使用 evaluator。如果 Host 需要刷新后仍能检查、保留历史，或提供独立的 Assurance tab，就应该使用 store。

## Review Packet

M35 增加了 `BuildChangeReviewPacket`，用于 approval 之前这一刻。assurance case 回答“这个 change 现在处于什么状态？”review packet 回答“Builder 此刻到底被要求批准什么？”

```ts
import {
  createBuildChangeReviewPacket,
  validateBuildChangeReviewPacket,
} from "@pneuma-framework/core/build-assurance";

const reviewPacket = createBuildChangeReviewPacket({
  build_change_id: "team-knowledge-inbox-v1-priority-queue",
  app_id: "team-knowledge-inbox",
  thread_id: "thread-priority",
  builder_subject: "user:builder-alice",
  intent_summary: "Add a Priority Queue for urgent inbox items.",
  scope_boundary: "Additive inbox definition only; no data deletion.",
  proposed_changes: [
    {
      kind: "definition",
      title: "Add priority column",
      summary: "Add priority to inbox_items without deleting existing rows.",
    },
  ],
  risk_classification: ["definition_additive"],
  pre_proposal_checks: [
    {
      id: "proposal-ready",
      phase: "pre_proposal",
      status: "passed",
      message: "Proposal was generated as one governed change-set.",
    },
  ],
  evidence_refs: [
    { kind: "host_check", check_id: "proposal-ready", status: "passed" },
  ],
  recovery_plan: {
    strategy: "discard_unapplied_draft",
    summary: "Before approval, deny the proposal and keep v0 untouched.",
  },
  migration_mode: "none",
});

const packetValidation = validateBuildChangeReviewPacket(reviewPacket);
```

这个 packet 是面向 approval 的：

- `intent_summary` 是 Builder 的业务请求；
- `scope_boundary` 说明哪些内容不在范围内；
- `proposed_changes` 列出会变更的 lane（`definition`、`source`、`host_artifact`、`runtime_config`、`credential`、`migration`、`release`）；
- `pre_proposal_checks` 必须在 Host 请求 approval 前通过；
- `recovery_plan` 告诉 Builder 如果拒绝，或者后续失败，会怎么处理；
- `approval_statement` 会生成“一次业务 intent 一次 approval”的文案，而不是每个 tool call 各批一次。

validator 会保证 packet 不自欺欺人：

- `pre_proposal` check 失败会阻止 approval；
- destructive definition risk 必须明确指出 destructive proposed change，并且给出非空 recovery strategy；
- data migration risk 必须指定非 `none` 的 migration mode。

## Recovery Drill Matrix

M36 增加了一个很小的 recovery drill helper，用于 Host tests 和下游验证。它回答的问题比 assurance case 更窄：

> 如果某条预期失败路径真的发生了，我们是否有对应 readiness state 和 evidence references，能证明它已经恢复，或者至少 fail closed？

```ts
import {
  evaluateBuildChangeRecoveryDrillMatrix,
} from "@pneuma-framework/core/build-assurance-recovery";

const matrix = evaluateBuildChangeRecoveryDrillMatrix(
  [
    {
      id: "post-apply-rollback",
      title: "Post-apply check failure rolls back source",
      build_change_id: "change-1",
      failure_stage: "post_apply",
      simulated_failure: "preview smoke failed after apply",
      expected_readiness: "failed_recovered",
      required_evidence_kinds: ["code_change_receipt", "host_check"],
    },
  ],
  [assuranceCase],
);
```

drill matrix 只检查 evidence references。它不复制日志、不做 incident response，也不决定生产 policy。Creation Host 可以在测试里用它证明：

- pre-proposal guardrail failure 会阻止 approval；
- post-apply smoke failure 会产生 rollback evidence；
- publish health failure 不会进入 `ready_to_publish`；
- rollback failure 会以 `failed_unrecovered` 可见。

## Readiness 状态

| Readiness | 含义 |
|---|---|
| `needs_clarification` | Builder intent 还不清楚，不应该进入 proposal。 |
| `blocked` | 必要 check、disclosure、decision 或 evidence 条件失败。 |
| `awaiting_approval` | proposal 已存在，正在等待 Builder 或 policy approval。 |
| `ready_to_apply` | 已经批准，但 execution 还没开始。 |
| `verified` | 已批准 change 已应用，并且 post-apply checks 通过。 |
| `ready_to_publish` | verified change 还具备通过的 release checks。 |
| `published` | change 已经进入 published release 状态。 |
| `failed_recovered` | execution 失败，但存在 rollback 或 recovery evidence。 |
| `failed_unrecovered` | execution 失败，且 recovery evidence 不充分。 |
| `rolled_back` | change 已显式 rollback。 |
| `superseded` | 后续 change 取代了这条 active decision path。 |

v0 规则刻意保持很窄：

- intent 不清楚 -> `needs_clarification`；
- `pre_proposal` 或 `pre_apply` check 失败 -> `blocked`；
- destructive definition change 没有 explicit impact disclosure -> `blocked`；
- approved + applied + `post_apply` check 通过 -> `verified`；
- verified + release checks 通过 -> `ready_to_publish`；
- post-apply 失败但有 rollback evidence -> `failed_recovered`。

## Risk Vocabulary

| Risk | 使用场景 |
|---|---|
| `additive_ui` | 只增加 UI，没有 source 或 data 风险。 |
| `source_code_change` | 涉及 Host-owned source changes。 |
| `definition_additive` | 增加 framework definition rows，不移除已有结构。 |
| `policy_change` | permission、visibility 或 governance policy 发生变化。 |
| `destructive_definition` | tables、columns、operations、views 或 policy shape 可能被删除或收窄。 |
| `data_migration` | 现有数据需要 migration 或 carry-forward。 |
| `credential_boundary` | credential requirements、rebinding 或 provider boundary 变化。 |
| `release_change` | 涉及 publish、restart、rollback 或 release-state movement。 |

## Evidence References

用 evidence references 指向已有 framework records：

```ts
type BuildChangeEvidenceRef =
  | { kind: "build_thread_turn"; thread_id: string; turn_id: string }
  | { kind: "permission_ledger_record"; request_id: string }
  | { kind: "code_change_receipt"; proposal_id: string }
  | { kind: "definition_history"; app_id: string; version: number }
  | { kind: "runtime_health"; runtime_id: string; checked_at_ms: number }
  | { kind: "release_rollout"; app_id: string; rollout_id: string }
  | { kind: "host_check"; check_id: string; status: "passed" | "failed" | "skipped" };
```

evidence reference 应该稳定、可检查。不要把大段日志塞进 assurance case。

## Migration Modes

`migration_mode` 是可选字段，但在 Host 需要发布期数据纪律时很有用：

| Mode | 含义 |
|---|---|
| `none` | 不涉及数据迁移。 |
| `before_publish` | 迁移应在 release promotion 之前完成。 |
| `publish_downtime` | 发布时可以停机完成迁移。 |
| `carry_forward_with_receipt` | 数据 carry-forward，并产生 migration receipt。 |
| `irreversible_with_backup` | 不可逆步骤前必须提供 backup evidence。 |

## Durable Case Store

M34 增加了一个很窄的 file-backed store，供需要让 assurance case 在页面刷新或进程重启后仍然存在的 Host 使用：

```ts
import {
  createFileBuildChangeAssuranceCaseStore,
} from "@pneuma-framework/core/build-assurance-store";

const assuranceCases = createFileBuildChangeAssuranceCaseStore({
  workspace: "/path/to/creation-host-workspace",
});

await assuranceCases.saveCase(assuranceCase);

const latestForApp = await assuranceCases.listCases({
  app_id: "team-knowledge-inbox",
});

const verifiedCases = await assuranceCases.listCases({
  app_id: "team-knowledge-inbox",
  readiness: "verified",
});
```

v0 store 写入：

```text
<workspace>/.pneuma/build-assurance-cases.json
```

保存语义刻意保持简单：

- 写入前用 `validateBuildChangeAssuranceCase` 校验 case；
- `saveCase` 按 `build_change_id` upsert；
- `listCases` 返回最近保存的 case 在前；
- filter 支持 `app_id`、`thread_id` 和 `readiness`；
- 文件缺失或损坏时返回空列表并输出 warning，而不是杀掉 Host。

这个 store 属于 Creation Host workspace。它不是 Generated Application runtime database，也不是生产级 audit-log backend。真正的源证据仍然存在于 BuildThread、permission ledger、Code Change Lane receipts、app history、runtime diagnostics 和 rollout state。

## Reference Host Demo

M34 已经把这个 primitive 接进 M16 Reference Creation Host：

```bash
bun examples/m16-reference-creation-host/run.ts --port 8883
```

在这个 demo 里，Assurance card 会随着 Builder 的操作变化：

| Step | Assurance readiness |
|---|---|
| Priority Queue 被提出 | `awaiting_approval` |
| Builder 批准，并且 post-apply preview check 通过 | `verified` |
| Publish health checks 通过 | `ready_to_publish` |

Governed Evolution panel 也会在 Builder 点击 Allow 之前展示 review packet 的 approval statement。在 Priority Queue demo 里，这个 packet 会列出五个 additive definition changes：priority column、read operation、view、public read policy 和 public invoke policy。

这张卡刻意放在 approval 和 publish controls 旁边。它不只是一个 inspector tab。Builder 应该在继续前就能看懂：为什么某个按钮可用、不可用，或者为什么当前不安全。

Host 也会持久化这些 case，并通过下面的接口暴露：

```text
GET /api/host/projects/:appId/assurance
```

Assurance inspector tab 会读取 store 中的 recent cases，所以刷新后的 Workbench 仍然可以解释 Builder 为什么可以继续。

## 当前边界

- v0 是 value object、evaluator、validator 和本地 file-backed case store。
- 它不替代 BuildThread、permission ledger、Code Change Lane、app history、runtime diagnostics 或 rollout state。
- 它不自行决定产品 policy。Host 决定哪些 readiness state 可以打开 apply、publish 或 rollback 按钮。
- 它不实现 online schema migration。migration modes 是 Host policy 和 evidence 的词汇，不是 migration runner。
- file store 是 reference/local Host persistence layer，不是 multi-tenant compliance audit backend。

下游实现路径请读 [Build Assurance Adoption 中文版](./build-assurance-adoption.zh-CN.md)。
