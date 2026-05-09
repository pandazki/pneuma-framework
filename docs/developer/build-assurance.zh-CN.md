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
} from "@pneuma-framework/core";

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

## Reference Host Demo

M33 已经把这个 primitive 接进 M16 Reference Creation Host：

```bash
bun examples/m16-reference-creation-host/run.ts --port 8883
```

在这个 demo 里，Assurance card 会随着 Builder 的操作变化：

| Step | Assurance readiness |
|---|---|
| Priority Queue 被提出 | `awaiting_approval` |
| Builder 批准，并且 post-apply preview check 通过 | `verified` |
| Publish health checks 通过 | `ready_to_publish` |

这张卡刻意放在 approval 和 publish controls 旁边。它不只是一个 inspector tab。Builder 应该在继续前就能看懂：为什么某个按钮可用、不可用，或者为什么当前不安全。

## 当前边界

- v0 是内存 value object 和 evaluator。它不负责持久化 case。
- 它不替代 BuildThread、permission ledger、Code Change Lane、app history、runtime diagnostics 或 rollout state。
- 它不自行决定产品 policy。Host 决定哪些 readiness state 可以打开 apply、publish 或 rollback 按钮。
- 它不实现 online schema migration。migration modes 是 Host policy 和 evidence 的词汇，不是 migration runner。
