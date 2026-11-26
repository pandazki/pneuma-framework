# Change Record

**读者：** 想为一个 app 目录做本地版本管理的 Developer（有没有 Creation Host 都可以），以及在它之上构建治理层的 Developer。
**英文版：** [change-record.md](./change-record.md)

Change record 是框架的地板（floor）。它记录一个 app 目录的版本，并能恢复它们。除此之外什么都不做。它不治理，只审计。治理由使用它的一方负责：可以是个人 coding agent，可以是人本身，也可以是 Creation Host。

更重的治理闭环（verify gate、approval、preview）是这层地板之上的几层。它们写入同一份记录。每条记录都写明对它保证了什么。

```text
@pneuma-framework/host-kit/change-record   地板：versions、history、restore
pneuma-framework record ...                 同一层地板，给没有 Host 的 coding agent 用
buildGovernedProposal + Host                在地板之上写入带 guarantees 的记录
```

## 磁盘布局

所有内容都在 app 目录里：

```text
.pneuma-framework/versions/v<N>/   组成版本 N 的文件的干净副本
.pneuma-framework/history.jsonl    只追加，每行一条 JSON 记录
.pneuma-framework/record.json      { schema_version: 1, version_counter, current_version }
```

版本号是 `v1`、`v2` 等。计数器从不复用编号，restore 之后也一样。

哪些文件组成一个版本由一个 `TreeWalkOptions` 决定。不传 `walkOptions` 时，版本里不包含：

| 不包含 | 原因 |
|---|---|
| `node_modules`、`dist`、`.work`、`.git`、`.vercel`、`.env`、`.env.local` | host-kit 的 workspace 默认 |
| `.pneuma-framework` | 记录本身 |
| 顶层 `data/` | scaffold 存放运行时数据的位置 |
| `.claude`、`.codex`、`.pneuma`、`.vscode`、`.idea`（目录，任意深度） | coding agent 和编辑器给自己留的东西；`.pneuma` 是 pneuma-skills 的 |
| `.DS_Store`（任意深度） | macOS Finder 留下的文件 |

后两行之所以重要，是因为这份记录本来就是给 coding agent 用的。用户选择"不再询问"时，Claude Code 会写 `.claude/settings.local.json`。如果这个文件进了版本，恢复到更早的版本就会把它删掉。Finder 写的 `.DS_Store` 会被当成未保存的修改，挡住 restore。这两行只是变更记录自己的默认值。治理回路骨架使用的 `defaultTreeWalkOptions()` 不包含它们。

无论传入什么选项，顶层 `.pneuma-framework` 都不会进入版本。传入 `walkOptions` 会替换整个默认值，所以自己传选项的 Host 要自己排除这些。walk 包含的文件会像源码一样被版本化和恢复，所以要把存储的数据排除在外。

## 地板承诺什么

- **每个版本是忠实的副本。** `record` 先把树复制到一个 staging 目录，在这份副本上计算 `changed_paths`，再把它重命名为 `v<N>`。记录描述的就是实际存下来的内容。
- **只追加的 history。** 地板只向 `history.jsonl` 追加，从不改写已有的行。
- **精确恢复文件。** `restore` 让工作区恰好只含目标版本的文件。不在该版本里的文件会被删除。被忽略的路径从不触碰。

## 地板不做什么

- **没有运行任何检查。** 地板不跑测试、构建、lint 或任何命令。
- **没有人批准。** 地板不问任何人。
- **不碰、也不恢复存储的数据。** 地板从不触碰 walk 排除的内容（默认是顶层 `data/`），也不触碰目录之外的任何东西，例如数据库服务器。恢复文件不会把数据放回去。
- **没有锁。** 同一时间只有一个写入者，这是调用方的责任。两个进程同时写同一份记录，可能丢失一个版本或让 history 交错。
- **不防篡改。** 能写这个目录的人就能写这份记录。见[记录不是权威](#记录不是权威)。

需要其中任何一项的 Host 或 agent，要在地板之上自己加，并在它写入的记录里说明。

## 写入顺序

`record` 先写版本目录，再通过临时文件加 rename 写 `record.json`，最后追加 history 行。如果复制失败，其余什么都不写。传入 `from` 时，工作区不会被触碰。

`restore` 先把文件放回，再移动 `current_version`，最后追加 history 行。restore 不创建新版本。

## API

```ts
import {
  openChangeRecord,
  restoreWithData,
  discardData,
  recordedDataRefs,
  ChangeRecordRefused,
  GUARANTEES,
  type DataSnapshotCapability,
} from "@pneuma-framework/host-kit/change-record";

const record = openChangeRecord(appRoot, { walkOptions });

record.record({ intent: "add a dark mode", agent: "codex" });
record.note({ kind: "rejected", intent: "make it pink", agent: "host", extra: { reason: "verify_failed" } });
record.status();            // { current, dirty, changedPaths }
record.planRestore("v2");   // { target, from, undone, oneWay, dataRef? }
record.restore("v2", { agent: "person" });
```

这个模块只 import `./workspace.js` 和 Node 内置模块。它不依赖 `@pneuma-framework/core`，也不依赖 MCP SDK。如果这一点被改变，有测试会失败。

当树与当前版本相同时，`record` 以 `ChangeRecordRefused` 拒绝，reason 为 `no_change`。`restore` 的拒绝理由：

| Reason | 何时 |
|---|---|
| `unknown_version` | 版本不存在，或名字不是版本名。 |
| `already_current` | 目标就是当前版本，并且没有任何修改。 |
| `dirty_working_tree` | 工作区与当前版本不同。传 `discardEdits: true` 可丢弃这些修改，restore 记录会在 `discarded_edits` 里列出它们。也可以传 `keepEdits: true`，让所有文件保持原样：当前版本照常移动，记录在 `kept_edits` 里列出这些修改。 |
| `crosses_one_way_change` | restore 会越过一个单向变更。见下文。 |

`restoreWithData` 多一个理由：`data_snapshot_refused`，即 capability 的 `check` 说这个快照放不回来。见[数据快照 capability](#数据快照-capability)。

每条拒绝消息都是写给人读的，抛出拒绝时什么都没有改变。`detail` 列出涉及的路径、版本或 ref。

`note` 追加一条不创建版本的记录：一次拒绝、一个决定、一次快照。note 可以指向一个已存在的 `version`。因此 note 可以在版本记录之后再声明它是单向的，或给它挂上一个数据快照。

Host 通过 `extra` 添加自己的字段。记录本身使用的字段名不能通过这种方式传入。

## 记录与 guarantees

```ts
interface ChangeRecordEntry {
  change_id: string;
  at: string;                 // ISO 时间
  kind: string;               // 地板写入 "create" | "change" | "restore"
  intent: string;             // 人提出的要求
  agent: string;              // 谁做的修改
  version?: string;           // 这条记录创建或设为当前的版本
  base_version?: string;      // 之前的当前版本
  changed_paths?: string[];
  guarantees: string[];       // 空表示仅记录
  one_way?: { reason: string };
  data_ref?: { capability: string; ref: string };
  one_way_crossed?: { versions: string[]; by: "data_restored" | "accepted"; data_ref? };
  discarded_edits?: string[];
  kept_edits?: string[];
}
```

每条记录都写明对它保证了什么。没写就是没有保证。读者绝不能把一个仅记录的版本误认为检查过的版本。

地板从不设置 guarantee。除非调用方传入名字，否则它写 `guarantees: []`。host-kit 导出四个名字：

| 名字 | 含义 |
|---|---|
| `verified` | 一条检查命令在这份内容上通过了。 |
| `previewed` | 这份内容在发布前作为运行中的 app 响应过。 |
| `approved` | 存在一条批准记录。 |
| `sealed` | 记录下来的内容与被检查的内容逐字节相同。 |

Host 可以添加自己的字符串。只有当名字所指的事情对这份确切内容成立时，才写这个名字。

## 单向变更

有些变更不能靠放回文件来撤销。删除一列的 migration 就是一例。恢复旧版本的代码不会把那一列和它的数据带回来，所以旧版本可能无法运行。

记录时说明：`record({ ..., oneWay: { reason: "dropped notes.body and its data" } })`。CLI 参数是 `--one-way "<reason>"`。也可以之后用 note 声明。

`planRestore(target)` 从创建每个版本的那条记录里取 `base_version`，沿祖先链往回走。`undone` 列出在当前版本的链上、但不在目标版本链上的版本，最新的在前。`oneWay` 列出其中声明了 `one_way` 的记录。

只有 restore 越过单向变更时才有 `dataRef`。它取被撤销的单向版本里最早那个的 base 版本上最新的 `data_ref`；在那个变更之前拍的快照就挂在这个 base 上（见下文）。目标版本和这个 base 之间的一切只靠代码就能撤销，所以 base 时刻的数据与目标版本的代码相符。简单情形下 base 就是目标版本。

restore 越过单向变更只有三种方式：

1. **拒绝。** 默认行为。`restore` 抛出 `crosses_one_way_change`。消息用平实的话写出每个版本和它的原因。
2. **通过声明的 capability 恢复数据。** Host 先把存储的数据放回，再传 `dataRestored: true`。restore 记录写入 `one_way_crossed: { versions, by: "data_restored", data_ref }`。
3. **明确接受。** 有人说无论如何都回去，调用方传 `acceptOneWay: true`。restore 记录写入 `one_way_crossed: { versions, by: "accepted" }`。

无论哪种，记录事后都如实说明。有人授权时，破坏性更新是正当的。记录保留了是谁、以何种方式授权。

## 数据快照 capability

把存储的数据放回，是 Developer 可以实现并声明的一种 capability。框架从不承诺它，也从不提供它。

```ts
interface DataSnapshotCapability {
  readonly id: string;   // 例如 "neon-branch"
  covers?(input: { appRoot: string }): Promise<DataSnapshotCoverage>;   // 可选
  snapshot(input: { appRoot: string; version: string }): Promise<{ ref: string }>;
  check?(input: { appRoot: string; ref: string }): Promise<void>;   // 可选
  restore(input: { appRoot: string; ref: string }): Promise<void>;
  discardAll?(input: { appRoot: string; refs: readonly string[] }): Promise<DataSnapshotDiscarded>;   // 可选
}

type DataSnapshotCoverage = { covered: true } | { covered: false; reason: string };
interface DataSnapshotDiscarded { discarded: readonly string[]; refused?: readonly string[] }
```

`check` 是可选的。它回答 `ref` 能否为这个应用放回，并且什么都不改：能放回就正常返回，不能就抛出一个写给人读的错误。`restoreWithData` 在发布任何东西之前调用它，所以一个会被拒绝的 ref 让 undo 在什么都没改变时就停下。`restore` 仍然必须自己再检查一次。两者之间有时间差，而且 ref 来自记录。让两者保持一致最简单的办法，是两者调用同一个函数。

`covers` 和 `discardAll` 也是可选的，它们的用处见下面的[承诺之前：covers](#承诺之前covers)和[应用离开时：discardAll](#应用离开时discardall)。

下面是一个数据库分支实现的草图（sketch）。它不属于框架，也没有测试。`branches`、`projectOf` 和 `ownBranch` 代表你自己的客户端代码。

```ts
// 仅为草图。
const neonBranches: DataSnapshotCapability = {
  id: "neon-branch",
  async snapshot({ appRoot, version }) {
    const project = projectOf(appRoot);
    const branch = await branches.create(project, { name: `pneuma-${version}-${Date.now()}` });
    return { ref: branch.id };
  },
  async check({ appRoot, ref }) {
    await ownBranch(projectOf(appRoot), ref);   // ref 不是这个项目做的分支时抛错
  },
  async restore({ appRoot, ref }) {
    const project = projectOf(appRoot);
    await ownBranch(project, ref);              // 再查一次：check 之后分支可能变了
    // 让 app 的主分支回到快照分支的数据。
    await branches.resetPrimaryFrom(project, ref);
  },
};
```

在单向变更运行之前拍快照，并把它挂到那一刻的当前版本上：

```ts
const before = record.current()!;
const { ref } = await neonBranches.snapshot({ appRoot, version: before });
record.note({ kind: "snapshot", intent: "data before dropping notes.body", agent: "host",
  version: before, dataRef: { capability: neonBranches.id, ref } });
// 运行 migration，然后：
record.record({ intent, agent, oneWay: { reason: "dropped notes.body and its data" } });
```

`restoreWithData(record, version, capability, input, options?)` 先规划 restore。如果它越过单向变更，并且计划里的 `dataRef` 来自同 id 的 capability，就调用 `capability.check`（capability 有这个方法时），然后 `capability.restore`，再调用 `record.restore(..., { dataRestored: true })`。否则按 `record.restore` 的方式进行，于是适用拒绝或明确的 `acceptOneWay`。

运行应用的 Host 在 `options` 里传入自己的步骤。它们按这个顺序运行：

| 步骤 | 发生什么 |
|---|---|
| 1. 拒绝 | 未知版本、未保存的修改、既没有恢复数据也没有被接受的单向变更。然后，需要放回数据且 capability 有 `check` 时，调用 `capability.check`。此时什么都没碰。 |
| 2. `release` | Host 让目标版本的代码成为运行时将要启动的代码。Host 在这里发布。 |
| 3. 数据 | 需要放回数据时调用 `capability.restore`。 |
| 4. `verify` | Host 在恢复后的数据上再检查一次目标版本。 |
| 5. 记录移动 | 按第 1 步做出的计划：文件放回，当前版本移动，写入记录。第 1 步已经定下的事不再重新判断。 |

代码先于数据，是因为删掉数据的可能正是较新的代码。在启动时建表或改表的应用就是这样。如果数据放回时发布的仍是较新的代码，下一个请求就会在恢复后的数据上启动它，它会再删一次。按这个顺序，数据回来之后运行时只会启动目标版本的代码。

还剩一个窗口，在第 2 步和第 3 步之间。这时较旧的代码跑在较新的数据上，可能返回错误。第 3 步随后替换这份数据，连同快照之后存下的一切，所以较旧的代码在这一刻写入的东西，会和其余较新的数据去同一个地方。

某一步失败时：

- `capability.check` 抛错：restore 以 `ChangeRecordRefused` 拒绝，reason 为 `data_snapshot_refused`。消息是 capability 的原话，`detail` 是这个 ref，`cause` 是 capability 抛出的错误。不发布，不碰数据，不运行 `putReleaseBack`，记录不移动。
- `release` 抛错：后面什么都不运行。不碰数据，记录不移动。发布做到一半的，由这一步自己收拾。
- `capability.restore` 抛错：运行 `putReleaseBack`，发布回到第 2 步之前的样子。记录不移动。
- 没有放回数据时 `verify` 抛错：运行 `putReleaseBack`，记录不移动。
- 数据已经放回后 `verify` 抛错：不运行 `putReleaseBack`。把较新的代码放回到恢复后的数据上，正是这个顺序要防止的事。这时就位的是目标版本的代码和它的数据，所以记录移动到目标版本，错误照样抛出。如果记录还写着较新的版本，Host 的下一步就会把较新的代码发布到恢复后的数据上。Host 在抛错之前，在记录的 `extra` 里写明检查没有通过。
- `putReleaseBack` 也抛错：抛出带着两个错误的 `AggregateError`。
- 第 5 步记录移动不了：什么都不放回。发布、以及已经放回的数据都留在原处，记录仍然写着较新的版本。抛出的是普通的 `Error`，绝不是 `ChangeRecordRefused`。磁盘拒绝写入时，就是磁盘自己的错误。如果这时是记录本身拒绝，比如目标版本的目录不见了，这个拒绝会被包起来：消息说明哪些步骤已经运行，`cause` 是那个拒绝。

所以调用方能分清两类失败。`ChangeRecordRefused` 表示什么都没发生。其他错误都来自发布之后的某一步，调用方必须说明那一步留下了什么。没有 `check` 的 capability 照旧可用；它会拒绝的 ref 那时只在第 3 步、发布之后才暴露出来。

第 5 步不重新规划。记录对 agent 可写，也没有锁，所以这些步骤运行期间历史可能变化，比如多出一行把某个被撤销的版本声明为单向。重新规划会拒绝一次已经发布出去的 restore。所以第 5 步按第 1 步的计划移动记录，记录里写的是第 1 步的决定。

这些步骤运行期间工作区可能被修改，所以传入任何一个步骤都要求输入里带 `keepEdits`（或 `discardEdits`）。两者都没有时，`restoreWithData` 在触碰任何东西之前抛出 `TypeError`。这样，任何拒绝都不会发生在某一步运行之后。放回数据也是一步。没有传 `release` 时，放回数据期间做出的修改会被保留，并列在 `kept_edits` 里，除非输入里写了 `discardEdits`。

### 承诺之前：covers

owner 批准一个单向变更之前，Host 要告诉他越过它的 undo 能做到什么。这个承诺取决于应用：一个复制 PostgreSQL 数据库的 capability，对数据放在 SQLite 里的应用什么也做不了。`check` 帮不上忙，因为它判断的是一个已经存在的 ref。`covers({ appRoot })` 回答更早的那个问题，并且什么都不改：`{ covered: true }`，或者 `{ covered: false, reason }`，`reason` 写给人读（这个应用的数据放在哪里，怎样才能被覆盖）。只有在它答不出来时才抛错，例如平台没有应答。

Host 拿这个回答做什么：

| 回答 | 批准之前 | 发布时 |
|---|---|---|
| `covered: true` | 说明发布之前会先保存数据，保存失败时变更不会上线。 | 取快照。失败时什么都不上线。 |
| `covered: false` | 把这个应用当作没有快照：说明确认后的 undo 只放回代码，数据回不来，并给出原因。 | 不取快照，照常发布；之后越过它的 undo 就是"只回代码"的情况。 |
| 抛错，或者没有 `covers` | 什么都不承诺：说明 Host 会先尝试保存数据，做不到时变更不会上线。 | 尝试取快照。失败时什么都不上线。 |

从批准到发布之间，回答可能变化（应用换了存储引擎）。已经告诉 owner 数据会被保存、或者会尝试保存的 Host，不会在没有快照的情况下发布：这时 `covers` 说不覆盖，它就停下，什么都不发布，并说明原因。框架自己从不调用 `covers`。

### 应用离开时：discardAll

如果没人说清楚，一份快照的寿命就不属于任何人。记录只存 ref。运行时不知道快照存在。restore 还会留下根本不是 ref 的东西，比如它为了不丢掉快照之后写入的数据而挪到一边的那份数据。放着不管，它们会比应用活得更久，还可能挡住运行时删除这个应用：一份仍归应用角色所有的数据库副本，会让这个角色删不掉。

所以 capability 为一个应用创建的东西，由它自己结束，什么时候结束由 Host 决定。`discardAll({ appRoot, refs })` 告诉 capability：这个应用要离开了，放掉你为它创建的一切。`refs` 是记录里属于这个 capability 的全部 ref。它们是最少要放掉的，不是全部，原因有两个：记录可能缺一份快照（Host 取了快照、还没写进记录就崩溃了），而 restore 挪到一边的东西不是 ref。所以 capability 还要在自己的存储里找它为这个应用做过的东西。ref 来自 agent 能写的记录，所以 capability 只放掉它为这个应用做的 ref，其他的列在 `refused` 里。它在为这个应用持有的东西一件不剩时返回，`discarded` 写明放掉了什么；调用两次是安全的。有东西放不掉时，它抛出一个错误，说明已经放掉了什么、还剩什么。

`discardData(record, capability)` 收集这些 ref（`recordedDataRefs(record, capability.id)`）然后发问：

```ts
const outcome = await discardData(record, capability);
if (!outcome.asked) {
  // 没有 discardAll：什么都没有问。告诉对方哪些会留下：outcome.refs，以及 restore 挪到一边的东西。
} else {
  // outcome.discarded：capability 放掉了什么。outcome.refused：不是它为这个应用做的 ref。
}
// outcome.others：另一个 capability 写下的 ref（Host 换过 capability）。没有人被问到它们。
```

它不往记录里写任何东西，也不碰任何文件。capability 抛出的错误原样抛出。

什么时候调用：至少在应用被清除或彻底移除时，在运行时彻底删除（purge）它之前，针对记录里的全部内容。运行时不能 purge 的 Host（之后由人到别处 purge）也在同一时刻调用，因为之后的 purge 会遇到同样的残留。如果它抛错，就在 purge 之前停下并说明：purge 很可能会因为剩下的东西失败，而保留记录，下次重试时这些 ref 还在。

这里没有决定的：应用还在时，快照保留多久。每一个被记录的版本都可能是 undo 的目标，删掉某次 undo 要用的快照，那次 undo 就变成只回代码。在应用离开之前什么时候放掉一份快照，是 Host 自己的事；为此需要的按 ref 调用，会和那个决定一起出现。见 ADR-0039 在 2026-11-26 的补充。

## 记录不是权威

记录是给人和 agent 读的历史：要求了什么，发布了什么，哪些保证成立。它不是权威来源。它放在 coding agent 工作的目录里，agent 可以写它的任何一行。这个模块不让记录防篡改，也不应该有任何东西依赖它防篡改。

Host 常常持有 agent 没有的权限：数据库服务器的管理员连接、部署凭据、owner 的确认。所以 Host 在用这类权限做事之前，必须检查它从记录里读到的任何东西。特别是，`DataSnapshotCapability.restore` 收到的 `ref` 是从记录里读回来的。capability 只能接受它自己为同一个应用做的 ref，并且要在触碰任何东西之前，对照 agent 写不了的地方（数据库服务器、分支 API）核实这一点。给它一个做同样检查的 `check`，这样伪造的 ref 会在 Host 发布任何东西之前就被拒绝。需要人确认时，把将要用到的东西给他看，例如快照的名字，让他看得见。

## CLI

在没有 Host 的 app 目录里工作的 coding agent 可以使用同一层地板：

```text
pneuma-framework record init    [--dir <app>] [--agent <name>] [--no-agents-md]
pneuma-framework record save    "<what the person asked for>" [--dir] [--agent] [--one-way "<reason>"] [--json]
pneuma-framework record history [--dir] [--json]
pneuma-framework record status  [--dir] [--json]
pneuma-framework record restore <version> [--dir] [--agent] [--discard-edits] [--accept-one-way] [--json]
```

`--dir` 默认为当前目录。`--agent` 默认为 `unknown`。

`record init` 把当前树记录为 `v1`。除非指定 `--no-agents-md`，它会先在 app 的 `AGENTS.md` 顶部放一小段说明，文件不存在时会创建。这段说明用 begin 和 end HTML 注释标记，不会重复添加。它告诉任何 coding agent：修改前先读 `record history`；完成一个请求后运行 `record save`；`record restore` 可以回退；这里不检查也不批准它的工作；当一个变更让旧版本无法在存储的数据上运行时，用 `--one-way` 说明。这段说明属于 `v1`，所以 `init` 之后工作区是干净的。

`record history` 每条记录打印一行：时间、kind、版本、guarantees（为空时打印 `recorded only`）、intent，以及是谁做的。单向记录带有 `[ONE-WAY: <reason>]`。越过单向变更的 restore 会说明是怎样越过的。

`record restore` 被拒绝时打印平实语言的拒绝消息并以 1 退出。CLI 从不恢复数据，所以它只能通过 `--accept-one-way` 越过单向变更。

退出码：0 完成，1 被拒绝或失败，2 参数错误。带 `--json` 时，拒绝会在 stdout 打印 `{ refused, message, detail }`。

## 治理闭环在上面

`buildGovernedProposal` 运行 agent、diff draft、拒绝受保护路径、运行 Host 的 `verify`，然后返回一个 proposal。它不写版本。Host 记录它发布的内容，并写上真正成立的 guarantees：

```ts
const record = openChangeRecord(appRoot, { walkOptions });   // 与 backbone 相同的 walkOptions
try {
  const proposal = await buildGovernedProposal({ ..., walkOptions, sealDraft: true });
  // 批准（现在或之后）；然后把 draft 复制到将要发布的位置
  const sealed = treeSignature(releaseCopy, walkOptions) === proposal.draftSignature;
  record.record({
    from: releaseCopy, intent, agent,
    guarantees: [GUARANTEES.verified, GUARANTEES.approved, ...(sealed ? [GUARANTEES.sealed] : [])],
    extra: { draft_id: proposal.draftId },
  });
} catch (err) {
  if (err instanceof GovernedProposalRejected) {
    record.note({ kind: "rejected", intent, agent, extra: { reason: err.reason } });
  } else throw err;
}
```

一个人通过 CLI 保存的版本，和一个通过 Host gate 的版本，位于同一份 history 里。前者写着 `recorded only`，后者写出检查了什么。读者不需要知道是哪个工具写的，也能分辨它们。

## 读取旧记录

读取是宽容的，接管（adoption）是尽力而为的：

- 没有 `guarantees` 的 history 行读作 `[]`。
- 不是合法 JSON 的行（例如因崩溃被截断的行）会被跳过。下一次追加会从新的一行开始。
- 有 `.pneuma-framework/versions/v<N>/` 但没有 `record.json` 的目录，读作 counter = 找到的最大 N，current = 找到的最大 N。下一次 `record` 会写出 `record.json`。
- `schema_version` 不是 1 的 `record.json` 不会被猜测，读取时抛错。

祖先链使用命名每个版本的第一条记录（restore 除外）。没有这样一条记录的被接管版本，就是链的终点。

## 相关

- [Creation Host Implementation Kit 中文版](./host-kit.zh-CN.md)：`buildGovernedProposal`、`walkOptions`、`sealDraft`。
- [Code Change Lane 中文版](./code-change-lane.zh-CN.md)：core 的 proposal 与 apply 契约。
