# space-all-in-one

一个跑在 [PneumaSpace](https://github.com/pandazki/pneuma-space) 上的无界面 Creation Host。一条 `docker compose up`，你已经在用的 coding agent（Claude Code、Codex）就有了一个在本机发布小型有状态应用的地方，并且之后的每次修改都走 framework 的受治理回路。

[English](./README.md)

这个示例回答了其他示例留给 Host 作者的两个问题：

- **Published Application 跑在哪？** 跑在 PneumaSpace 上：应用是目录加清单，发布是上传，闲置休眠，数据跨版本保留。
- **谁驱动回路？** 两边都行。同一条回路既可以由 agent 驱动（agent 改完后提交），也可以由 Host 驱动（Host 启动 agent），操作的是同一个应用目录。

## 现状

2026-11-23 在 macOS 上端到端实跑过：先用 colima（Docker 29.5、Compose 5.7、buildx 0.38），又用 Docker Desktop（Docker 29.9）跑了一遍，Bun 1.4.5，本机 Node 26、镜像内 Node 24，Claude Code 2.1.330，codex-cli 0.167.0。

| 跑了什么 | 结果 |
| --- | --- |
| 全仓库的 `bun run typecheck` 和 `bun test` | 通过。这里的离线测试用的是内存版 PneumaSpace 和脚本化的 agent CLI。 |
| `docker compose up -d --build`，固定提交和本地检出两种来源 | 五个服务都起来，gateway 为 healthy。 |
| `create` | 容器内 `appctl init`、`npm ci && npm test`、预览启动、正式发布，约 14 秒。 |
| agent 驱动，Claude Code（在应用目录里 `claude -p`） | 先读 `status` 和 `history`，改代码，跑测试，提交。没人告诉它协议，也没有去调 `appctl`，直接发布成功。 |
| agent 驱动，Codex（在应用目录里 `codex exec`） | 同样走通，前提是实跑逼出来的两处修正：协议现在放在 `AGENTS.md` 最前面，沙箱要放开网络（见下）。 |
| 受保护路径 | Codex 第一次尝试改了 `public/ui.css` 和 `public/ui.js`，`submit` 返回 `rejected (protected_file_changed)`，没有发布任何东西。 |
| 危险修改（"把 `created_at` 这一列删掉"） | 得到 `needs_approval`。Claude Code 停下并原样转述了风险说明。没有终端时 `approve` 拒绝执行；Host 对 `agent:claude-code` 和 `policy:auto` 的批准请求都返回 403。在终端提示处以 `user:me` 批准后，它作为下一个版本发布。 |
| Host 驱动的三条通道：`scripted`、`claude-code`、`codex` | 各发布了一个版本，并把工作区更新到新版本。 |
| `undo`、`discard`、撤销之后再提交 | 地址、工作区、历史三者一致。 |
| Linux 上的文件属主 | 在 Linux 原生的 bind mount 上复现了（colima 虚拟机内的目录）：Host 以 root 运行时，留下的文件本机用户改不了。现在 Host 启动时会切换成应用目录的属主；这样跑创建、提交、撤销，所有文件都归用户所有。 |

没有实跑的部分：`deny`；一台完整的 Linux 机器（只在虚拟机自己的文件系统上验证了 Host 这一侧）；不挂 Docker socket 的网关；用 PostgreSQL 做应用数据库。

在这台机器上，一次由常设策略批准的变更耗时 10 到 15 秒，大部分花在 `npm ci` 和一次 bundle 上传上。

## 跑起来（agent 驱动）

需要 Docker（较新的 Compose，Host 镜像用了 additional build contexts），以及本机任意 Node 18+ 用来跑产物自带的 CLI。

```sh
cd examples/space-all-in-one
docker compose up -d --build            # PneumaSpace + Host
node bin/pneuma.mjs create todo         # 拷模板、验证、预览、发布 v1
open http://127.0.0.1:8080/apps/todo/
```

然后用你的 agent 打开 `apps/todo/` 提需求：

```sh
cd apps/todo
claude        # 或者 codex
> 加一个存在数据库里的待办列表，带一个新增表单
```

目录里的 `AGENTS.md`（Claude Code 通过 `CLAUDE.md` 读到）开头就是完整协议：就地修改，然后 `node .pneuma/pneuma.mjs submit "<用户要什么>"`。PneumaSpace 自己的指南排在协议后面。这个顺序有讲究：指南的结尾是"用 `appctl` 发布"，协议追加在它后面的时候，Codex 改完文件就停了，没有提交，还动了两个受保护文件。Host 会拷一份工作区，按差异检查受保护路径，跑 `npm ci --ignore-scripts && npm test`，把草稿用临时名字在 PneumaSpace 上真实启动一次，完成批准，最后才发布到应用的稳定地址。

随时可以换 agent，应用的任何状态都不在 agent 的会话里。

Codex 需要多一个设置。它的默认沙箱禁止回环连接，所以 `npm test` 开不了端口，`submit` 也连不到 Host。用 `codex -c sandbox_workspace_write.network_access=true` 启动，或者在它请求时批准那条命令。两样都没有的话，Codex 会改完文件、报告提交被沙箱拦下，什么也不会发布。Claude Code 在执行 `npm` 和 `node` 之前会询问，两个都允许即可。

```sh
node .pneuma/pneuma.mjs status          # 当前版本、地址、未提交的文件、等你决定的变更
node .pneuma/pneuma.mjs history         # 每次尝试：谁、要什么、风险、谁批的、结果
node .pneuma/pneuma.mjs undo "原因"     # 回退一个版本（只回代码）
node .pneuma/pneuma.mjs approve <id>    # 由你本人在终端里批准高风险变更
```

想用本地的 PneumaSpace 检出来构建，把 `.env.example` 拷成 `.env`，把 `PNEUMA_SPACE_CONTEXT` 设成检出目录的路径。

在 Linux 上，Host 必须以你的身份写应用文件，否则你的 agent 改不了它们。这一步是自动的：Host 以 root 启动后，会切换成挂载进来的应用目录的属主（`host-entrypoint.sh`）。仓库里带了一个空的 `apps/`，保证这个目录在 Docker 挂载之前就归你所有。如果把 `PNEUMA_APPS_DIR` 指到别处，请先自己建好那个目录，由 Docker 代建的目录属于 root。Linux 上不需要 Docker Desktop，Docker Engine 加 Compose 和 buildx 插件就够了。

## 跑起来（Host 驱动）

这是桌面版 agent 产品会嵌入的形态：产品自己持有对话，自己启动 code agent。它跑在你的机器上而不是容器里，因为 `claude` 和 `codex` 的登录态在本机。需要 Bun、Node 24+、一份 PneumaSpace 检出（用它的 `appctl`），以及上面的 compose 栈。

```sh
bun install                                                   # 仓库根目录执行一次
cd examples/space-all-in-one
export PNEUMA_SPACE_CLI=/path/to/pneuma-space/cli/appctl.ts

bun run drive change todo "给每一项加截止日期" --agent claude-code
bun run drive change todo "按截止日期排序" --agent codex
bun run drive change todo "留个备注" --agent scripted         # 不需要登录，用来走通回路
```

两种控制面读写同一个 `apps/todo/`，所以 Host 驱动的一轮和 agent 驱动的一次修改会叠在同一条历史上。不要同时对同一个应用用两种方式操作，每个进程只串行化自己的操作。

`claude-code` 通道里没有人回答权限询问，所以适配器允许列表之外的工具调用会被拒绝。通道会把每次拒绝打印成 `[claude:denied ...]`。

## 产物

Host 不保存任何应用状态，全部跟着应用目录走。把目录拷到另一台机器、交给任何一个 Host，历史可以原样接续（`test/host.test.ts` 里有这个用例）。

| 路径 | 内容 |
| --- | --- |
| `AGENTS.md`、`CLAUDE.md` | 怎么改这个应用：PneumaSpace 指南加变更协议 |
| `pneuma-space.json` | 运行时要提供什么（能力声明） |
| `pneuma.scaffold.json` | framework 的 `ScaffoldProjectManifest`：可写目录、受保护路径、把关的检查 |
| `.pneuma/pneuma.mjs` | 零依赖 CLI，与 Host 通信 |
| `.pneuma/history.jsonl` | 每次尝试一行 |
| `.pneuma/build-threads.json` | framework 的 BuildThread 记录 |
| `.pneuma/release-rollout.json` | framework 的发布状态（当前和上一个版本） |
| `.pneuma/versions/vN/` | 每个已发布版本的干净源码 |

## 治理：一条回路，一个旋钮

没有批准记录就没有变更，变的只是谁来批。

| 从磁盘读到的信号 | 风险 | `personal`（默认） | `review-all` |
| --- | --- | --- | --- |
| 源码或浏览器资源变更 | `source_code_change`、`additive_ui` | `policy:auto` | owner |
| `pneuma-space.json` 新增能力 | `definition_additive` | `policy:auto` | owner |
| 移除能力（平台保留其数据） | `release_change` | `policy:auto` | owner |
| 不再要求登录 | `policy_change` | owner | owner |
| 新出现 `DROP`、`ALTER TABLE ... DROP/RENAME`、`TRUNCATE`、不带 `WHERE` 的 `DELETE` | `destructive_definition` | owner | owner |

`policy:auto` 是 framework 自己的 `BuildChangeGovernancePolicy` 里持有 reviewer 角色的一个主体，评估器是原样的 `evaluateBuildChangeGovernance`。verify 门和预览不是许可，任何模式下都会跑。

预览会保留到这次变更有了结果，之后立刻清除。PneumaSpace 按内容存 bundle，所以正式发布可以直接复用预览已经上传的字节。先清预览的话，要多付一次上传和一次 bundle 删除，实跑里各约 8 秒。

需要 owner 决定时，agent 拿到 `needs_approval` 和一段人话披露，并被告知停下。`approve` 在没有终端时拒绝执行。这只是减速带，不是安全边界：在一台可信机器上，有 shell 的 agent 能做 owner 能做的一切，而且 Host 是从请求体里读取批准主体的。真正的边界需要经过认证的 owner，PneumaSpace 的组织版有，这个栈没有。

`undo` 只回代码不回数据，实跑显示了这在破坏性变更之后意味着什么。被要求删掉一列时，Claude Code 自己指出：删列之前的版本都要读这一列。删列被批准并发布之后，`undo` 回上一个版本报告成功：它的健康检查是以匿名访客身份打开根路径，根本碰不到那张表。之后每个登录用户的请求都返回 500，报 `no such column: todos.created_at`。再 `undo` 一次（等于重做）才把应用救回来。披露里写了"Undo restores code only"，但还没有写明撤销从此不能用，也没有任何东西拦住这次撤销。

## 这个示例发现的缺口

每一条都是示例不得不绕路的地方，是正式集成的输入。

pneuma-framework：

1. `publishVerifiedVersion` 和 `HostRuntimeAdapter` 只能从 `host-kit` 的根入口拿到，而根入口会连带引入 `core` 根入口和 MCP SDK。示例改为直接使用 rollout 原语。
2. `HostRuntimeAdapter` 假设 Host 自己管进程和 `data_dir`，托管运行时两者都自己管，形状对不上。
3. 没有"agent 调 Host"这个方向的控制面。`AgentBackend` 只有 Host 调 agent，这里的服务端是新写的。
4. 回滚只有一层（`active` 和 `previous`），连续两次 `undo` 等于重做。
5. 风险分类完全留给 Host。这里的清单差异加 SQL 启发式只是起点。

PneumaSpace：

1. 取不回某个版本的源码，`publish` 还会剔除测试文件，所以平台当不了"换地方继续改"的真相源，产物目录才是。
2. 没有快照、分叉、预览的原语。这里的预览是用临时名字发布后再 remove 加 purge；撤销只回代码，数据不动。临时发布要上传带 `node_modules` 的整个 bundle（模板自带 `pg` 和 `redis`，8.6 秒），purge 掉最后一个引用某个 bundle 的应用会删除它（8.3 秒）。Host 只是靠着围绕内容寻址安排调用顺序，才避免了付两次。
3. 没有发布 SDK，Host 只能调 `appctl`。
4. 网关无条件构造 Docker 客户端。挂着 socket 时它在 colima 下能启动。只用 isolate 和 static 时不挂 socket 能否启动仍未验证，所以 compose 保留了挂载。
5. 单机上没有人经过认证，owner 角色只是一个名字，不是一个主体。
6. 应用模板的 `AGENTS.md` 有两处让 agent 用 `appctl` 发布。接管发布的 Host 只能用文字去否定它，并把自己的说明放在前面。模板里没有一个位置可以写"这里的变更是这样上线的"。
7. 仓库的 `.dockerignore` 只保留 `gateway/` 和 `shared/`，而 BuildKit 会把它应用到作为构建上下文的本地检出上。需要 `cli/` 和 `templates/` 的镜像没法把检出当成一个上下文来用，compose 文件把这两个目录分别作为独立的上下文传入。
