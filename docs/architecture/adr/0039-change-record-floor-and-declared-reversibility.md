# ADR-0039: 变更记录是底层，可撤销范围靠声明

**Status**: Accepted
**Date**: 2026-11-23（提出）；2026-11-24（接受）
**Deciders**: Pandazki, Claude (Fable 5.2)
**Tags**: lifecycle, governance, rollback, data-model, host-kit

> 2026-11-24 接受：main 上的代码实现了本决定（framework PR #11、#12、#13、#15、#16）。接受时按 `packages/host-kit/src/change-record.ts` 和 `packages/cli/src/record.ts` 同步了正文：第 2 条的记录形状加上 `one_way_crossed`、`discarded_edits`、`kept_edits`，第 3 条写明恢复记录里的字段，第 4 条加上 `check?` 和 `restoreWithData` 的顺序，第 6 条写明取代了 ADR-0017 和 ADR-0016 的哪一部分，Consequences 里 `record` 的命令数从四条改为五条。
>
> 2026-11-25 补充：第 1 条的 `.pneuma/` 是默认的目录名。Host 可以用 `ChangeRecordOptions.stateDir` 换成应用目录下的另一个目录名（只能是一级目录名，不能是路径）。换名之后不读也不写 `.pneuma`，应用里的 `.pneuma` 目录就是普通内容；正在使用的状态目录无论叫什么，都不会进入版本。`pneuma-framework record` 仍用 `.pneuma`。决定本身不变。

---

## Context

到 0.5.0 为止，framework 对"一次变更"只有一个入口：治理回路（`buildGovernedProposal`，见 [ADR-0034](./0034-code-change-lane-executor.md) 和 [ADR-0038](./0038-creation-host-implementation-kit.md)）。它要求调用方提供 verify 命令、风险策略和批准记录。三件事让这个入口不够用：

1. **最轻的用法没有位置。** 一个人用自己的 coding agent 改自己的应用时，只想要"每次改动留一个版本，能回去"。现在要得到这一点，必须先接受整套治理词汇。
2. **记录格式留在示例里。** `examples/space-all-in-one` 为了让产物自描述、换一个 agent 也能接着改，自己实现了 `.pneuma/versions/vN` 和 `.pneuma/history.jsonl`。framework 没有安放它的地方。`CLAUDE.md` 的原则 6 说构建期卫生是 framework 的职责，但 `shadow-git` 的 `createCheckpoint` 没有任何生产调用方，而且只能从会连带引入 MCP SDK 的 `core` 根入口拿到。
3. **回滚对数据的承诺是假的。** [ADR-0017](./0017-rollback-data-semantics.md) 决定回滚时数据一起倒流。实际只落地了写路径；README 和 site 文档已经写成"只回代码"。示例的实跑暴露了后果：一次被批准的删列发布之后，`undo` 报告成功（它的健康检查是匿名访问根路径），此后每个登录用户的请求都返回 500。

项目所有者在 2026-11-23 给出了方向：

> framework 要提供一个不治理只审计的最轻量级的模式，比如只做最简单的本地版本管理，其他的一律不保证，让个人的 coding agent 或者其他 agent 应用层自己负责治理，这样 framework 概念保留并贯通整个 agent native app dev 的生命周期，并且在未来可以被扩展。

> 「改不坏」可以是一种被抽象声明的能力，而不是「不可变」或者只能「非破坏性更新」。

> 如果一个开发者要声明支持这个，就自己去实现类似 neon 数据库的支持数据库 fork 的开发流程。可以在我们的实践里面加一个示例，但并非是框架级别的承诺。

---

## Options considered

### Option A: 维持单一入口，轻量用法靠"自动批准"策略

继续只有治理回路。个人场景用一条常设策略自动批准低风险变更，这是示例里 `personal` 模式已经在做的事。

- **Pro**: 只有一个概念，不需要新模块。
- **Con**: 最轻的用法仍然要一个 Host、一条 verify 命令和一份策略。记录格式继续由每个 Host 自己发明，换 Host 就读不了历史。

### Option B: 给治理回路加一个"全部跳过"的开关

在 `buildGovernedProposal` 上加选项，关掉 verify、路径检查和批准。

- **Pro**: 改动最小。
- **Con**: 产出的记录带着"被检查过"的形状，实际什么都没检查，读记录的人分不清。"关掉门禁"变成治理回路的一个配置项，会被误用在本该治理的场景里。

### Option C: 记录是独立的底层，治理是写在同一份记录上的上层

把版本和历史做成一个不依赖治理的模块。它只承诺记录本身。治理回路在它之上，通过往记录里写"哪些保证成立"来表达自己做了什么。

- **Pro**: 最轻的用法只需要这一层。同一份记录从个人一直用到企业，读者永远能分清一个版本被保证了什么。
- **Con**: 多一个概念；"只记录"的发布可以把运行中的应用弄坏，这是有意的。

数据随回滚恢复这件事，另外考虑过三种立场：

### Option D1: framework 承诺数据随回滚恢复（ADR-0017 的立场）

- **Pro**: 对普通人最直观，"改回昨天那样"包含数据。
- **Con**: framework 不拥有存储。SQLite 文件、托管 PostgreSQL、键值存储的恢复方式各不相同，一个 framework 级的承诺要么做不到，要么把存储后端绑死。

### Option D2: 禁止破坏性变更

- **Pro**: 撤销永远成立。
- **Con**: 升级本来就会停掉旧功能。禁止它等于禁止应用演进。

### Option D3: 可撤销范围是声明出来的能力

破坏性变更在明确授权下可以发布，并在记录里标成"单向"。越过单向变更的撤销默认被拒绝。Host 可以声明自己能恢复数据，并自己实现它。

- **Pro**: 记录永远说真话；承诺的范围由有能力兑现的一方声明。
- **Con**: 没有声明这项能力的 Host，破坏性变更之后回不到更早的版本。

---

## Decision

选 **Option C** 和 **Option D3**。

### 1. 变更记录（Change Record）

模块 `@pneuma-framework/host-kit/change-record`，只依赖 `./workspace` 和 Node 内置模块。状态放在应用目录自己的 `.pneuma/` 下：

```text
.pneuma/versions/v<N>/   一个版本的文件副本
.pneuma/history.jsonl    只追加，每行一条记录
.pneuma/record.json      { schema_version, version_counter, current_version }
```

它承诺三件事：每个版本是记录时文件的忠实副本；历史只追加；恢复会把工作目录里属于版本的文件还原成那个版本。

它不承诺：有任何检查跑过；有任何人批准过；存储的数据被保存或恢复；并发写入的安全。

版本号不复用。恢复只移动 `current_version`，不产生新版本；恢复之后的新变更拿到新的编号，`base_version` 指向被恢复到的版本。所以可以连续往回走多级。

### 2. 每条记录自己写明保证了什么

```ts
interface ChangeRecordEntry {
  change_id: string;
  at: string;
  kind: string;              // 底层写 create | change | restore，Host 可以写别的
  intent: string;            // 人的原话
  agent: string;
  version?: string;
  base_version?: string;
  changed_paths?: string[];
  guarantees: string[];      // 成立的保证的名字；空数组表示只被记录
  one_way?: { reason: string };
  data_ref?: { capability: string; ref: string };
  one_way_crossed?: {        // 只在恢复记录里：越过了哪些单向变更，依据是什么
    versions: string[];
    by: "data_restored" | "accepted";
    data_ref?: { capability: string; ref: string };
  };
  discarded_edits?: string[]; // 只在恢复记录里：恢复丢掉了哪些未记录的改动
  kept_edits?: string[];      // 只在恢复记录里：工作目录有未记录的改动，恢复没有动任何文件
}
```

Host 通过 `Extra` 加自己的字段。

规则只有一条：**只写成立的保证，缺席就是没有保证。** 底层从不写入任何保证。约定的名字是 `verified`（检查命令在这份内容上通过）、`previewed`（这份内容在发布前作为运行中的应用应答过）、`approved`（存在批准记录）、`sealed`（记录的内容与被检查的内容逐字节相同）。Host 可以加自己的名字。

### 3. 单向变更

一次变更如果让"只把代码放回去"不足以撤销它（例如删掉了存储的数据），它的记录带 `one_way` 和一句人能读懂的原因。谁来标记，取决于谁在负责治理：治理模式下由风险预设里的规则标记，只记录模式下由调用方自己声明。

恢复到单向变更之前的版本，有三种结果，记录里会写明是哪一种：

| 情况 | 结果 |
| --- | --- |
| 什么都没做 | 拒绝（`crosses_one_way_change`），用普通人能读懂的话说明要越过哪些版本、各自的原因 |
| Host 通过声明的能力把数据恢复了 | 允许，记录写 `one_way_crossed: { versions, by: "data_restored", data_ref }` |
| 调用方明确接受后果（`acceptOneWay`） | 允许，记录写 `one_way_crossed: { versions, by: "accepted" }` |

### 4. 数据恢复是 Host 声明的能力

```ts
interface DataSnapshotCapability {
  readonly id: string;
  snapshot(input: { appRoot: string; version: string }): Promise<{ ref: string }>;
  check?(input: { appRoot: string; ref: string }): Promise<void>;   // 可选
  restore(input: { appRoot: string; ref: string }): Promise<void>;
}
```

framework 只定义这个接口，不提供任何实现。Host 在发布单向变更之前对即将被替换的版本取快照，把引用挂在那个版本上。恢复时用的是"被越过的最早一个单向变更之前"的那份快照：从目标版本到那一点之间的变更都能只靠代码撤销，所以那一刻的数据和目标版本的代码对得上。

`check` 是可选的。它只回答这个 `ref` 能不能为这个应用放回，不改任何东西；不能时抛出一句给人读的错误。`restoreWithData` 在发布任何东西之前调用它，它抛错时恢复以 `data_snapshot_refused` 被拒绝，什么都没有动。`restore` 自己仍然要再检查一次：两次调用之间有时间差，而 `ref` 来自 agent 能写的记录。

`restoreWithData` 的顺序是：拒绝条件（含 `check`），Host 的 `release`（目标版本的代码先上线），放回数据，Host 的 `verify`，最后移动记录。代码先走，是为了让删过数据的新代码永远不会在放回的数据上启动。

### 5. 治理是同一份记录上的上层

治理回路不变。通过它发布的版本在记录里带上相应的保证。示例里的旋钮因此有三档：`record`（只记录）、`personal`（策略自动批准低风险变更）、`review-all`（全部由 owner 批准）。这个旋钮属于 Host，不是 framework 的枚举。

选择 `record`，就是 owner 明确选择不经确认地发布：每次提交都直接上线，破坏性的 migration 也一样。根目录 `CLAUDE.md` 的已决定事项里有一条："Deploy and migrate actions require framework-level Builder confirmation unless `unattendedDeploy: true`"。`record` 就是这条规则所说的明确授权，只是换了名字：它由 owner 在 Host 上设定，agent 改不了；每条记录都写着 `guarantees: []`，读者看得出没有人确认过。越过单向变更的撤销仍然要 owner 确认，`record` 模式也一样。

### 6. 对 ADR-0017 和 ADR-0016 的影响

ADR-0017 中"回滚默认连数据一起倒流"不再是 framework 的承诺，由本 ADR 的第 3、4 条取代。它关于"回滚必须如实披露影响"的要求保留，并且是本 ADR 的出发点。定义层的 `app_history` 写路径不受影响。

本 ADR 取代的是一个从未实现的决定：ADR-0017 的破坏性回滚、数据随回滚倒流，代码里只落地了写路径，没有任何回滚把数据带回去过。ADR-0016 中"rollback 是 destructive 的，不保留中间版本数据"一句也在这一部分被取代。现在的立场是：每次变更都被记录；撤销把代码放回；存储的数据只有在 Host 声明了数据快照能力时才回来；撤销放不回去的变更记成单向，越过它往回走要 owner 确认。ADR 只追加，所以 ADR-0016 和 ADR-0017 只在开头加了"superseded in part by ADR-0039"的状态说明，正文不改。

### 7. 不在本决策内

`shadow-git` 不动。它可以在以后成为变更记录的另一种存储方式，届时另写 ADR。

---

## Consequences

### Positive

- 没有 Host 的 coding agent 用 `pneuma-framework record` 五条命令（`init`、`save`、`history`、`status`、`restore`）就有版本和撤销。
- 产物目录自己带着完整历史，换 agent、换 Host 都能读。
- 撤销不再谎报成功：它要么恢复了数据，要么被明确接受，要么被拒绝。
- 示例里"只有一级回滚"的缺口在记录层关闭。

### Negative / Risks

- 版本是目录副本，占磁盘，没有去重。
- 没有锁，同一时刻只能有一个写入方，由调用方保证。
- `one_way` 的可信度取决于标记它的一方。预设里的 SQL 规则是文本匹配，会漏掉拼接出来的语句；只记录模式下全凭调用方如实声明。
- 只在单向变更之前取快照，意味着恢复会丢掉那之后写入的数据。Host 必须在恢复之前把这一点告诉用户。
- "只记录"的发布可能让运行中的应用不可用。这是该模式的定义，不是缺陷。
- 记录放在 coding agent 工作的目录里，agent 能写它的任何一行。记录是给人读的历史，不是权威，也不防篡改：Host 用 agent 没有的权限做事之前，必须检查从记录里读到的东西，例如 `DataSnapshotCapability.restore` 收到的 `ref`。

### Follow-ups

2026-11-24 接受时的状态写在每条末尾。

- `CLAUDE.md` 的原则 6 和 `release-1.0-readiness-review.md` 对 shadow-git 的描述需要与实际对齐。（已做：`CLAUDE.md`、`AGENTS.md` 和 readiness review 的中英文版。）
- `CLAUDE.md` 已决定事项里的"Deploy and migrate actions require framework-level Builder confirmation unless `unattendedDeploy: true`"需要写明：Host 上的 `record` 这类只记录模式，就是这条规则所说的明确授权。否则两者读起来互相矛盾。（已做：`CLAUDE.md` 和 `AGENTS.md`。）
- 示例里加一个真实的 `DataSnapshotCapability` 实现，作为实践，不作为承诺。（已做：示例的 `postgres-template`。没有任何东西结束它留下的快照，见 framework #14。）
- 进 `OPEN-QUESTIONS.md`：保证的名字应该保持开放字符串，还是收成一个受控词表；治理回路是否应该直接接收一个变更记录，而不是由 Host 在两者之间转写。（已做。）
- 运行时一侧的预览原语仍然缺失，见示例 README 的缺口清单。（PneumaSpace 的临时应用（space ADR 0038）提供了预览，示例已改用；预览从空存储启动，见示例 README 的缺口清单。）
