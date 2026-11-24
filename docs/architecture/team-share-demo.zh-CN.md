# 团队分享材料：M54，在 PneumaSpace 上开箱即用的受治理回路

**日期：** 2026-11-24
**状态：** Milestone 54（M54 — An out-of-the-box governed loop on PneumaSpace）当前的团队分享材料
**受众：** 对两个仓库都没有任何背景、但了解普通软件的团队成员
**形式：** 30 分钟分享，其中约 10 分钟在一台笔记本上现场演示
**代码：** pneuma-framework main `5d2f1a5`；PneumaSpace `6e73538`（`examples/space-all-in-one/compose.yaml` 固定的提交）
**English version:** [team-share-demo.md](./team-share-demo.md)

> 本文件取代原先针对 RC 0.3.0 基线 + 0.4.0 状态（2026-05-12）的 60–70 分钟分享材料。旧文本保存在 git 历史里：`git show 9c947e0:docs/architecture/team-share-demo.zh-CN.md`。

本文件包含两部分：现场演示的逐步操作脚本，以及演示前后幻灯片的逐页提纲。两者都以里程碑快照 [`milestone-54-snapshot.zh-CN.md`](../archive/milestone-54-snapshot.zh-CN.md) 为准。演示复述的是 2026-11-24 那次无上下文端到端运行，记录在 [pneuma-framework#17](https://github.com/pandazki/pneuma-framework/issues/17)。命令取自[示例 README](../../examples/space-all-in-one/README.zh-CN.md) 和 `examples/space-all-in-one/bin/pneuma.mjs` 里 CLI 的用法说明。

## 分享结束时的目标

分享结束后，团队应该能说出：

```text
一条受治理的回路、一个旋钮，现在在一个为这类应用打造的运行时上开箱即用：
一个没有任何上下文的 agent 能创建、修改并交接一个应用，
应用的主人不必是程序员，也能看清、做决定、回到以前。
```

团队也应该知道哪些还没做到：把两个仓库连起来的 Host 目前是一个照着抄的示例，不是可以导入的包；在默认栈上，回退不会把存储的数据带回来；在单机上，主人没有经过身份认证；PneumaSpace 本地的管理 API 接受跨站写入（pandazki/pneuma-space#43）；定位、命名和打包都还没有开始。

## 一句话讲法

> 一条受治理的回路、一个旋钮，现在在 PneumaSpace 上开箱即用：一个没有任何上下文的 agent 能创建、修改并交接一个应用，应用的主人不必是程序员，也能看清、做决定、回到以前。

English:

> One governed loop, with one knob, now runs out of the box on PneumaSpace: an agent with no context can create, change and hand over an app, and the owner can see, decide and go back without being a programmer.

## 开场白

在第 1 页上讲。请背下来。

> 现在，人们已经能通过和 agent 对话，做出属于自己的小应用。做不到的是应用周边的那些事：保留版本、规划一次改动、决定数据怎么存、出问题时恢复。这两个项目要回答的问题是：当 agent coding 成为可以集成进任何 agent 产品的基础能力时，我们怎样给它提供开箱即用的基础设施？接下来三十分钟，我会现场演示这个问题第一次有了可用的答案——对一个用着 coding agent 的个人而言；同时我会讲清楚，它在哪些地方还只是一个示例。

## 分享流程

| 时间 | 环节 | 幻灯片 | 目标 |
|---:|---|---|---|
| 0:00–3:00 | 问题和人 | 1–2 | 大家清楚要解决什么问题、面向哪些用户。 |
| 3:00–11:00 | 模型 | 3–7，暂停 | 三层结构、论点、回路和它的旋钮、记录、声明式可逆性。 |
| 11:00–21:00 | 现场演示 | 8 | 把 #17 的过程在屏幕上重现。 |
| 21:00–24:30 | 证据与边界 | 9–10 | 验证了什么，没有验证什么。 |
| 24:30–30:00 | 接下来去哪 | 11–13 | 担忧、下一阶段、四个决定。 |

提问放在 30:00 之后。下面的“可能被问到的问题”里准备好了回答。

## 分享之前

### 需要准备的

- Docker，带较新的 Compose 和 buildx；Host 镜像用到了 additional build contexts。README 里的运行在 macOS 上用过 colima 和 Docker Desktop。在 Linux 上，Docker Engine 加 Compose、buildx 插件就够了。
- Bun 1.4.5（仓库固定的版本）和 Node 24 或更新版本。任何 Node 18+ 都能跑 CLI；Host 驱动这一步需要 24+，Node 更旧时，测试里属于应用自己的那部分会记为 unknown。
- 一个已经登录的 Codex 或 Claude Code。#17 用的是 codex-cli 0.167.0；README 更早的运行也用过 Claude Code 2.1.330。
- 一份 pneuma-framework 的克隆，`5d2f1a5` 或更新。仅为 Host 驱动这一步，还需要一份 pandazki/pneuma-space 的克隆，用它的 `appctl`，检出到 compose 文件固定的提交 `6e73538`。
- 第一次构建需要联网：它会拉取 `node:24`、redis 和 rustfs，并从 GitHub 按固定提交获取 PneumaSpace。

### 把栈跑起来（提前一天）

```sh
git clone https://github.com/pandazki/pneuma-framework.git
cd pneuma-framework
bun install --frozen-lockfile            # 仓库根目录执行一次；Host 驱动这一步需要
cd examples/space-all-in-one
docker compose up -d --build             # PneumaSpace + Host；第一次构建会拉取 node:24、redis、rustfs
```

如果要用本地的 PneumaSpace 检出、而不是固定提交来构建，把 `.env.example` 拷成 `.env`，把 `PNEUMA_SPACE_CONTEXT` 设成检出的路径。

在准备用来做 Host 驱动那一步的终端里：

```sh
cd examples/space-all-in-one
export PNEUMA_SPACE_CLI=/path/to/pneuma-space/cli/appctl.ts
```

### 默认端口被占用时

上一次运行就遇到了这种情况：另一套本示例的栈占着默认的项目名、网络和端口，机器上还跑着 21 个无关的容器（#17）。这套栈在 127.0.0.1 上占四个端口。某个端口被占用时，在 `.env` 里换一个：

| 变量 | 默认值 | 在那里监听的是 |
| --- | --- | --- |
| `PNEUMA_SPACE_HTTP_PORT` | 8080 | 各个应用，地址是 `/apps/<name>/` |
| `PNEUMA_SPACE_ADMIN_PORT` | 8081 | PneumaSpace 控制台和管理 API |
| `PNEUMA_SPACE_OBJECT_PORT` | 9000 | 对象存储 |
| `PNEUMA_HOST_PORT` | 8090 | Host：主人页面，以及 CLI 调用的 API |

在已有的一套栈旁边再跑一套，需要另一个 compose 项目名、Docker 网络名、另一组端口和另一个应用目录。如果用的是仓库的第二份检出（例如 `git worktree add`），把下面几行写进那份检出的 `.env`。如果用的是同一份检出，把它们写进另一个文件，并在这套栈的每条 `docker compose` 命令上用 `--env-file` 传入。这个文件在该命令里会取代 `.env`，所以 `.env` 里你依赖的行（比如 `PNEUMA_SPACE_CONTEXT`）要再写一遍。

```sh
COMPOSE_PROJECT_NAME=pneuma-second
PNEUMA_SPACE_NETWORK=pneuma-second
PNEUMA_SPACE_HTTP_PORT=48360
PNEUMA_SPACE_ADMIN_PORT=48361
PNEUMA_SPACE_OBJECT_PORT=48362
PNEUMA_HOST_PORT=48363
PNEUMA_APPS_DIR=/path/to/second-apps    # 先自己建好，这样它归你所有
```

```sh
docker compose --env-file second.env up -d --build
```

Host 启动时会把自己的地址写进应用目录的 `.pneuma/host.json`，所以在那个目录里运行的 CLI 不用设置任何东西就能找到第二个 Host。端口换了之后，本手册里的所有地址都要跟着换：应用在 `PNEUMA_SPACE_HTTP_PORT` 而不是 8080，主人页面在 `PNEUMA_HOST_PORT` 而不是 8090，控制台在 `PNEUMA_SPACE_ADMIN_PORT` 而不是 8081。agent 会话从 `PNEUMA_APPS_DIR` 启动，而不是 `examples/space-all-in-one/apps`；每条 `docker compose` 命令，包括看日志的那条，都要加 `--env-file second.env`。

Host 驱动这一步不经过正在运行的 Host 服务。它自己和 PneumaSpace 通信，并从环境变量里读地址，默认是 8081、8080 和 `./apps`（`src/space.ts`、`src/config.ts`）。README 没有覆盖这种情况。端口换了之后，在那个终端里也导出下面这些，并在彩排时确认：

```sh
export PNEUMA_SPACE_ADMIN=http://127.0.0.1:48361
export PNEUMA_SPACE_INGRESS=http://127.0.0.1:48360
export PNEUMA_SPACE_PUBLIC=http://127.0.0.1:48360
export PNEUMA_APPS_DIR=/path/to/second-apps
```

### 确认一切正常

在 `examples/space-all-in-one` 里：

```sh
docker compose ps
curl -si http://127.0.0.1:8090/apps | grep -i pneuma-host-api
node bin/pneuma.mjs list
open http://127.0.0.1:8090/              # 主人页面（open 是 macOS 的命令；其他系统直接用浏览器打开）
open http://127.0.0.1:8081/              # PneumaSpace 控制台
```

应该看到：

- `docker compose ps`：六个服务都在运行（gateway、runner、rustfs、redis、screenshot、host），gateway 显示 healthy。`postgres` 只有加 `--profile postgres` 时才会出现，本次演示不用它。
- `curl`：`pneuma-host-api: 2`。
- 全新栈上的 `list`：`no apps yet. Create one with: node .pneuma/pneuma.mjs create <name>`。如果它说 Host 比这个 CLI 旧、要求重建，再运行一次 `docker compose up -d --build`。
- 8090 端口：主人页面，标题是「我的应用」（My apps）。8081 端口：PneumaSpace 控制台。
- `apps/` 里现在有 `AGENTS.md`、`CLAUDE.md` 和 `.pneuma/`，是 Host 启动时写进去的。agent 找到的就是这些。

### 拿到主人链接

```sh
docker compose logs host | grep "owner link"
```

这一行的结尾是 `http://127.0.0.1:8090/#owner=<token>`。在你要用来演示的那个浏览器标签页里打开它。页面会把 token 移进这个标签页的 session storage，并从地址栏里去掉，所以只有在这个标签页里才能做决定。别关掉它。这个链接在 Host 重启后仍然有效，但重启前打开的页面会要求你重新打开链接。不要把这行日志投到屏幕上，也不要把链接贴进 agent 的会话：演示要展示的正是 agent 拿不到它。

### 提前准备，演示时不用等

1. **当天完整彩排一遍。** 用一个叫 `reading-rehearsal` 的应用，把下面的现场脚本第 1 到第 7 节完整跑一遍（提示词里换成这个名字）。它能确认这台机器和这个 agent 登录今天可用、每一步在这里要多久，还会留下一份完整的历史，现场某一步卡住时可以拿来展示。
2. **分享前一小时内，准备一个等待中的改动。** 用 `reading-waiting` 跑第 1 到第 3 节，让它的删除改动停在等待状态。如果现场第 3 节的删除没有停下来，第 4 节就用这一个。它的预览在发布 3600 秒后自行结束（`PNEUMA_PREVIEW_TTL` 的默认值）；过了这个时间，点页面上的「再给我看一次」（Show it to me again）会重新发布，README 的运行里这一步大约 10 秒。
3. **不要提前创建 `reading-list`。** 它由演示创建。`list` 会把两个彩排应用也列出来，其中 `reading-waiting` 有一个改动在等待；出现时说明一下。
4. **终端**，字号调大。每个终端都从普通终端启动，不要从另一个 agent 里面启动：从另一个 agent 的终端里启动的 agent 会继承那个 agent 的标记，记录里的 agent 可能因此变成 `unknown`。
   - T1 在 `examples/space-all-in-one/apps`，用来开 agent 会话。
   - T2 在 `examples/space-all-in-one`，已导出 `PNEUMA_SPACE_CLI`，用来做 Host 驱动那一步。
   - 可选的 T3，不投屏：`docker compose logs -f host`。
5. **浏览器**：主人标签页打开 http://127.0.0.1:8090/，另开一个标签页给应用。
6. **agent**：先在一个临时目录里启动一次，确认它有回应。Codex 用 `codex -c sandbox_workspace_write.network_access=true` 启动：它的默认沙箱禁止回环连接，`npm test` 开不了端口，`submit` 也连不到 Host。Claude Code 在执行 `npm` 和 `node` 之前会询问，两个都允许。

## 演示之前的故事

在第 1 节之前一口气讲完：

> 有个很爱读书的人，想要一个记书单的小应用。他用的是自己本来就有的 coding agent，对版本、部署、数据库一无所知。这台笔记本上跑着一个 Host，下面是 PneumaSpace。agent 拿不到任何关于这套工具的说明：它需要知道的一切，都写在它启动的那个目录里。我来扮演应用的主人。

## 现场脚本（约 10 分钟）

每节的时间是计划，不是测量值；以前运行中测到的时间会在有的地方注明。某一节超时，就走它的备选方案，接着往下讲。

| # | 环节 | 时间 |
|---:|---|---:|
| 1 | 一个没有上下文的 agent 创建应用 | 2:30 |
| 2 | 第二个会话：普通改动自己上线 | 1:30 |
| 3 | 同一个会话：删除已存数据的改动停下来 | 1:30 |
| 4 | 主人在页面上做决定 | 1:30 |
| 5 | 越过单向改动往回退 | 1:00 |
| 6 | `list` 和 `history`：记录 | 0:45 |
| 7 | 同一条回路改由 Host 驱动，然后一次普通回退 | 1:15 |

越过单向改动的回退放在第 5 节，普通回退放在第 7 节末尾。这个顺序是被迫的：单向版本上线之后，从它往回退都要越过它，所以普通回退需要先有一个更新的版本。#17 的顺序也是这样。

要输入的提示词。它们用的是主人的口吻，不提任何工具，因为演示要展示的是 agent 自己在应用目录里找到协议。

| 环节 | English | 中文 |
|---|---|---|
| 1 | Make me a new app called reading-list: a list of books I want to read. Each book can have a short note, and I can tick it off when I've read it. Keep the list saved. | 帮我做一个叫 reading-list 的新应用：记下我想读的书，每本书可以写一句备注，读完了可以打勾。列表要保存下来。 |
| 2 | Add a search box that filters the books by title. | 加一个搜索框，按书名筛选。 |
| 3 | I don't want the notes any more. Remove them, including the ones already saved. | 备注我不想要了。把它去掉，已经存下的备注也一起删掉。 |
| 6（可选） | How many apps do I have, and is anything waiting for me? | 我有几个应用？有没有什么在等我确认？ |
| 7（Host 驱动的需求） | Show how many books are still unread at the top. | 在页面顶部显示还有几本书没读。 |

### 1. 一个没有上下文的 agent 创建应用

在 T1（`examples/space-all-in-one/apps`）里：

```sh
codex -c sandbox_workspace_write.network_access=true     # 或者：claude
```

输入提示词 1。

应该看到：

- agent 读应用目录里的 `AGENTS.md`，运行 `node .pneuma/pneuma.mjs create reading-list`。CLI 回答 `published v1 at <address>` 和 `The app directory is …/apps/reading-list. Open it with your coding agent.`。README 的运行里 `create` 大约 14 秒。
- 它进入 `reading-list/`，修改，跑 `npm test`，再运行 `node .pneuma/pneuma.mjs submit "<用户要什么>"`。回答以 `published v2 at http://127.0.0.1:8080/apps/reading-list/` 开头，接着是 `risks: …; approved by: policy:auto` 和 `recorded agent: codex (detected from …)`，或者 `claude-code`。
- 它工作的时候，把 `reading-list/AGENTS.md` 放到屏幕上。它的开头是 “This app is governed: read this part first”。

然后在应用标签页里打开应用，加两本书，每本写一句备注。第 3 节需要有已存的数据可删。如果应用要求登录，PneumaSpace 的本地登录只问一个名字。

关键句：

> 我没有告诉它怎么发布。它在目录里找到了协议，创建了应用，并通过 Host 的回路发布了 v2。

指给大家看：

- `approved by: policy:auto`：常设策略批准了一个例行改动，记录里写明了这一点。
- 在 #17 里，这一步开始得更早：在一个不属于任何仓库的空目录里，agent 自己克隆了仓库、把栈跑起来，6 分 21 秒、30 条命令就得到了一个带存储数据的运行中应用，全程无人介入。

备选方案：如果 agent 报告沙箱拦下了 `submit`，说明什么都没发布；按上面的参数重启 Codex。如果 CLI 连不上 Host，它会说出试了哪个地址、这个地址从哪里来；检查 `docker compose ps`。如果时间用完，说明 agent 正在做什么，然后在主人页面上切到 `reading-rehearsal`，它的历史里有同样的 v1 和 v2。

### 2. 第二个会话：普通改动自己上线

退出 agent。在应用目录里开一个新会话：

```sh
cd reading-list
codex -c sandbox_workspace_write.network_access=true     # 或者：claude
```

输入提示词 2。

应该看到：

- 新会话对第一个会话一无所知。它读 `AGENTS.md`，通常先运行 `status` 和 `history`，然后修改、测试、提交。
- `published v3 at …`，风险类似 `source_code_change, additive_ui`，`approved by: policy:auto`。README 的运行里，常设策略批准的改动从提交到上线用了 10 到 15 秒，大部分时间花在 `npm ci` 和一次上传上。
- 在主人页面上，reading-list 的「改动记录」（Changes）用你输入的原话列出这次改动，标着「检查过，也试运行过」（Checked and tried out）和「例行改动，自动通过」（approved automatically as a routine change）。

关键句：

> 关于这个应用的一切都不在第一个会话里。第二个会话从目录里接了过来，一个例行改动在没有任何人手动批准的情况下上线了。它照样在记录里。

备选方案：如果回答是 `needs_approval`，说明预设在这次改动里发现了风险；把原因念出来，接着做第 4 节。如果是 `rejected (…)`，说明什么都没发布；把下面那行原因（比如动了受保护的文件）当作回路在正常工作来讲。时间紧的话，把提示词 2 和 3 合成一条发出去：在 #17 里，agent 自己把这样的请求拆开，搜索框上线了，删除停了下来。

### 3. 同一个会话：删除已存数据的改动停下来

在同一个会话里输入提示词 3。

应该看到：

- `submit` 回答 `needs_approval <id>: nothing was released.`，然后是带 `destructive_definition` 的 `risks: …`、几行披露说明、`preview: <address> (it ends itself at …)`、`Show this to the owner. They can open the preview, then decide with: node .pneuma/pneuma.mjs approve <id>   (or deny)`，以及 `Or on the Host's page, opened from the owner link the Host printed when it started: http://127.0.0.1:8090/app/reading-list/change/<id>`。
- agent 停下来，把预览、页面链接和命令交给你。在 #17 里，agent 没有尝试自己批准。

关键句：

> agent 被要求删除已存的数据，Host 把这个改动拦了下来。agent 不能批准它，决定权交到了我手上。

指给大家看：

- 应用仍然在提供 v3。什么都没有发布。
- 如果 agent 真的去试 `approve`，CLI 会因为没有终端而拒绝，Host 也会对以 agent 身份批准的请求回答 403。在单机上，这是减速带，不是安全边界（第 10 页）。

备选方案：如果这个改动被当作例行改动上线了，直说：示例预设里的 SQL 规则是文本模式匹配，agent 的代码里没有它们能匹配的语句。这是预设已知的局限，不是回路的局限。第 4 到第 7 节改用 `reading-waiting`。

### 4. 主人在页面上做决定

在主人标签页里打开 http://127.0.0.1:8090/，或者把 agent 给的链接粘进同一个标签页。「等你确认」（Waiting for you）把这个改动列在应用卡片上方。点开它。

在「有一个改动等你确认」（A change is waiting for you）页面上应该看到：

- 「在你决定之前，什么都不会改变。」（Nothing changes until you decide.）
- 「现在」（Now）和「改动之后」（With this change）并排：两张截图，各带一个打开真实页面的链接。第二个是预览，一个 PneumaSpace 上的短期应用。
- 「检查了什么」（What was checked）：通过的测试，其中多少是应用自己的；试运行时启动了；改了几个文件。
- 「为什么需要你」（Why it needs you）：只列常设策略不能批准的那项风险。
- 「这个改动无法撤回」（This one can't be taken back）：「以后如果回退，只有应用会回去。这次删掉的数据不会回来，旧版本也可能无法正常使用你的数据。」

点「让它上线」（Let it go live）。确认框「上线之前」（Before this goes live）说明所有打开 reading-list 的人会立刻用上这个版本。在勾选「我明白：以后回退也找不回这些数据。」之前，「上线」（Go live）按钮一直不可用。勾上，点「上线」。页面显示「已经上线了。」（It's live now.）

打开应用：备注没了，书还在。

关键句：

> 这个页面是给不是程序员的人用的。它展示改动前后，说明为什么要问我，还要我确认这些数据不会回来。之后改动才上线。

指给大家看：

- 在应用的改动记录里：新版本（如果前面按计划进行，是 v4）标着「无法通过回退撤销」（Can't be undone by going back）和「你确认过」（you confirmed it）。
- 「详细信息」（Details）里有版本号、风险名称、改动 id，以及在终端里做同一个决定的命令。

备选方案：如果「让它上线」因为预览已经不在运行而不可用，点「再给我看一次」，看过之后再决定。如果页面提示要用主人链接打开，说明这个标签页没有 token；从 Host 的日志里重新打开链接。在终端里做同一个决定：`node .pneuma/pneuma.mjs approve <id>`，然后输入 `approve`。

### 5. 越过单向改动往回退

在 reading-list 的「改动记录」里，找到删除之前的那个版本（v3，带搜索框），点「回到这个版本」（Go back to this）。

在「回到v3的版本？」（Go back to v3?）页面上应该看到：

- 「这些改动会被撤回：」（These changes will be undone:），列出那次删除。
- 「你的数据」（Your stored data）下面：「数据无法恢复。只有应用会回去，数据保持现在的样子，旧版本可能无法正常使用它。」
- 一个要勾选的框「我明白：旧版本可能无法正常使用现在的数据。」，以及「回退」（Go back）。

勾上，点「回退」。会出现两种结果之一。两种都是如实的结果；说出你遇到的是哪一种。

- **和 #17 一样：** 旧代码在现在的数据上启动不了。Host 把地址放回 v4，其他什么都不动，这次尝试被记为一次 `restore`，结果 `rejected`，原因 `published_unhealthy`。页面显示 Host 自己的原话，#17 里是 “could not republish v3 (GET / -> 500 internal error); the address is back on v4”。页面对这种情况还没有一句平实的说明；这是 #17 里的第 4 个摩擦点。
- **旧代码启动成功：** 应用运行 v3 的代码，备注没有回来。历史里写着「只有应用回去了，数据保持原样。」

关键句：

> 这套栈上没有任何东西保存过数据副本。我批准之前 Host 就说了，现在又说一遍，并把发生的事记了下来。它不会假装数据回来了。

备选方案：在终端里做同样的事：`node .pneuma/pneuma.mjs undo --to v3 --accept-one-way "<原因>"` 会先打印拒绝的理由，再要求你输入 `accept`。

### 6. `list` 和 `history`：记录

可选，约 20 秒：在 T1（`examples/space-all-in-one/apps`）里启动一个全新的 agent，输入提示词 6。在 #17 里，一个没有上下文的 agent 用两条命令（`list` 和 `status`）、大约 20 秒就答对了，包括那次被拒绝的回退。

或者在 T1 里自己运行：

```sh
node .pneuma/pneuma.mjs list
node .pneuma/pneuma.mjs history reading-list
```

应该看到：

- `list`：第一行说 Host 上有几个应用、处于什么模式、有什么在等主人；然后每个应用一段：版本、地址、最近一次改动（什么时候、哪个 agent、要的是什么）。
- `history`：每次尝试一行，从旧到新：时间、类型、结果、版本、agent 及 `[agent-driven]` 或 `[host-driven]`，以及你用的原话。每行下面：改了哪些文件、批准（`policy:auto` 或 `user:me`）、测试、`guarantees: …`、删除那一条上的 `ONE-WAY: …`，以及第 5 节那次回退尝试。

关键句：

> 我刚才做的每一件事都在这里，用平实的字段写着，就在应用自己的目录里。另一个 agent 或另一个 Host 可以从这里接着做。

指给大家看：

- 已发布改动上的 `guarantees: verified, previewed, approved, sealed`。没有出现的保证，就是没有给出。
- `node .pneuma/pneuma.mjs history reading-list --json` 会在页面上做的那个决定上显示 `"channel": "owner-page"`。

### 7. 同一条回路改由 Host 驱动，然后一次普通回退

在 T2（`examples/space-all-in-one`，已导出 `PNEUMA_SPACE_CLI`）里：

```sh
bun run drive change reading-list "在页面顶部显示还有几本书没读" --agent codex
```

（英文演示时用 `"Show how many books are still unread at the top"`。需求原样记进历史，中英文都可以。）

应该看到：这一次由产品自己启动 agent，在草稿上工作，再把结果送进同一条回路。命令会打印 `published v5 at …`、`changed: …` 和 `risks: …; approved by: policy:auto`。在 #17 里这一步用了 64 秒，记为 `codex [host-driven]`。如果条目里写着应用自己的测试有多少是 unknown，那是 #17 里的第 3 个摩擦点：这条通道用本机的 Node 跑检查。

然后在主人标签页里，在 reading-list 的改动记录中，点 v4 上的「回到这个版本」。「回到v4的版本？」页面在「你的数据」下面写着：「数据保持不变。回退改变的是应用本身，不是里面的数据。」点「回退」。页面显示「完成，应用已经回到那个版本。」在 #17 里这一步记为一次 `restore`，结果 `rolled_back`。（如果第 5 节把应用退回了 v3，那么 v5 是在 v3 上做的，这次普通回退回到 v3。）

关键句：

> 同一个应用目录，同一份历史，换了一个驱动方：这次是产品启动了 agent。而普通回退只需要点一下，因为中间没有单向改动挡着。

备选方案：如果 `drive` 因为工作区里有从未提交的修改而拒绝，它会列出这些文件；在 `apps/reading-list` 里运行 `node .pneuma/pneuma.mjs discard`，再运行一次。没有登录时，`--agent scripted` 也能让一个改动走完同一条回路。绝对不要在同一时刻对同一个应用同时用 Host 驱动和 agent 会话。

## 架构回顾

```text
  主人的 coding agent                           一个 agent 产品
  （Codex、Claude Code）                        （自己启动 agent）
  就地修改 apps/<name>/，                       bun run drive change <name> "<需求>"
  node .pneuma/pneuma.mjs submit                        |
            |                                           |
            v                                           v
  +-------- 第 3 层：Host（目前是示例 examples/space-all-in-one） ----------------+
  |  第 2 层，受治理的回路：可写目录和受保护路径 -> npm test ->                    |
  |  预览 -> 批准（policy:auto 或主人） -> 发布 -> 变更记录                        |
  |  旋钮：record | personal | review-all      预设：policy/personal.json         |
  |  主人页面 + 主人链接                                                           |
  +------------------------------------+-------------------------------------------+
                                       | appctl publish --manager，管理 API
                                       v
  第 1 层，PneumaSpace（运行时）：gateway、runner、对象存储、redis
  预览是临时应用（ADR 0038），应用由 Host 管理（ADR 0039）

  apps/<name>/：AGENTS.md、CLAUDE.md、.pneuma/（versions/、history.jsonl、record.json）
  两种控制面读写的是同一个目录、同一份历史
```

| 演示中的时刻 | 概念 | 在哪里 |
|---|---|---|
| agent 找到协议 | 应用目录自己说明自己 | 每个应用里的 `AGENTS.md`、`CLAUDE.md`、`.pneuma/`；应用目录里 Host 写入的那一段 |
| v2、v3 以 `policy:auto` 上线 | 一条回路，`personal` 模式，风险规则是预设 | `policy/personal.json`；`@pneuma-framework/core/enterprise-governance` |
| 删除停在 `needs_approval` | 没有批准记录，就没有改动；预设里的单向规则 | [ADR-0039](./adr/0039-change-record-floor-and-declared-reversibility.md)；`policy/personal.json` |
| 页面上的改动前后对比 | 预览是一个临时应用 | PneumaSpace ADR 0038 |
| 只有 Host 能发布这个应用 | 受管理的应用（`X-Pneuma-Space-Manager`） | PneumaSpace ADR 0039 |
| 「无法通过回退撤销」 | 声明式可逆性 | `@pneuma-framework/host-kit/change-record` 里的 `DataSnapshotCapability`、`restoreWithData` |
| 带保证的 `history` | 变更记录 | `.pneuma/history.jsonl`、`.pneuma/versions/`、`.pneuma/record.json` |
| `drive change … --agent codex` | Host 驱动的控制面 | `examples/space-all-in-one/src/drive.ts` |
| 发布、探测、把地址放回去 | 发布与收尾（release-and-settle），在示例里，不在 host-kit 里 | `examples/space-all-in-one/src/host.ts`（2338 行） |

把最后一行念出来。第 11 页从这里讲起。

## 证明了什么 / 还没证明什么

用讲稿的话说：对一个订阅了 Claude Code 或 Codex 的个人，这条回路开箱即用。一个没有上下文的 agent 创建了应用，第二个 agent 修改了它，删除数据的改动等着主人，主人在一个为非程序员写的页面上做了决定、也回退了。一个自己启动 agent 的产品，在同一个目录、同一份历史上用的是同一条回路。

它没有证明的：产品可以导入这个 Host（现在是抄示例）；回退会把数据带回来（默认栈没有声明快照）；主人是一个真实的、经过认证的人（单机上不是）；PneumaSpace 本地的前门已经关上（space #43）；一个预设能同时覆盖构建期和运行期；这次最终运行覆盖了 Claude Code、多用户、托管或 Kubernetes；有人开始做定位、命名或打包；记录已经能帮到下一个相似的应用。快照的[“还没有证明的事”](../archive/milestone-54-snapshot.zh-CN.md#还没有证明的事)一节逐条写了每一项为什么重要。

## 幻灯片提纲：30 分钟，逐页

上面的现场脚本是演示本身。这里是演示前后的幻灯片：每页放什么、讲多久、讲什么。

| # | 幻灯片 | 时间 | 主图 |
|---:|---|---:|---|
| 1 | 问题 | 1:30 | — |
| 2 | 这些应用和三种角色 | 1:30 | — |
| 3 | 三层结构 | 1:30 | `m54-system-architecture` |
| 4 | 论点 | 1:00 | — |
| 5 | 回路和它唯一的旋钮 | 2:00 | `m54-end-to-end-loop` |
| 6 | 记录，以及“保证”是什么意思 | 1:30 | — |
| 7 | 声明式可逆性 | 1:30 | — |
| — | 暂停，回答关于框架的问题；没人举手就跳过 | 0:30 | — |
| 8 | 现场演示 | 10:00 | — |
| 9 | 验证了什么 | 1:30 | `m54-coverage` |
| 10 | 还没证明什么 | 2:00 | — |
| 11 | 战略判断 | 1:30 | — |
| 12 | 建议的下一阶段 | 1:30 | `m54-roadmap` |
| 13 | 决策关口 | 2:30 | — |

合计：30:00。

### 第 1 页 — 问题（1:30）

页面上：标题，然后是主人的原话：“agent coding 作为基础能力，可以被集成到任意的 agent 产品下时，如何提供一个开箱即用的，agent native 的 infra”，下面附英文：“When agent coding becomes a basic capability that can be built into any agent product, how do we provide infrastructure that works out of the box and is agent native?”

- 讲开场白。
- 普通人能借助 agent 做出自己的应用，但做不了版本管理、改动规划、持久化设计和灾难恢复。
- 这些应该成为软件提供的能力和预设，由开发者按场景和成本预先设好，用户用一个普通的 agent，没有额外的心智负担。
- 这次分享讲 M54 在这个问题上走到了哪里、停在哪里。

### 第 2 页 — 这些应用和三种角色（1:30）

页面上：这些应用有的短命有的长寿，一改再改，很少被访问，高度定制，需求模糊，做得快也扔得快。角色：Developer、Builder、End User。

- 这些应用和传统软件不一样。所以要为它们单独做一个更轻的运行时。
- Developer 做 agent 产品，是这个开源项目的采用者。Builder 是普通人。End User 使用应用。
- 演示里由一个人同时扮演 Builder、主人和 End User。Developer 是组装这个 Host 的人；今天就是这个示例。

### 第 3 页 — 三层结构（1:30）· 图 `m54-system-architecture`

页面上：(1) PneumaSpace，运行时。(2) 框架的回路内核，治理。(3) 一个预先组装好的无界面 Host，用一份预设把前两者连起来。

- pneuma-framework 先有，做的是可审计的开发。PneumaSpace 是为运行时这个子问题开的：给这类应用一个更轻的运行时。
- M54 之前，两个仓库互不引用。
- 第 3 层在这个里程碑之前不存在。“集成进任何 agent 产品”指的就是它。
- 今天第 3 层是 `examples/space-all-in-one`，是照着抄的示例，不是可以导入的包。现在就说清楚；第 10、11 页会回到这一点。

### 第 4 页 — 论点（1:00）

页面上，加粗：“一条受治理的回路、一个旋钮，现在在一个为这类应用打造的运行时上开箱即用：一个没有任何上下文的 agent 能创建、修改并交接一个应用，应用的主人不必是程序员，也能看清、做决定、回到以前。”下面：“已证明适用于：用 coding agent 的个人（agent 驱动），以及自己启动 agent 的产品（Host 驱动），两者共用同一个应用目录和同一份历史。”以及：“不等于：给集成方的可导入 Host、多用户或托管运行、回退时数据总能回来。”

- 逐字念出论点。
- “开箱即用”对订阅了 Claude Code 或 Codex 的个人已经证明。对要把它集成进 agent 产品的 Developer，只是通过参考实现展示过。
- 演示会逐句展示论点。

### 第 5 页 — 回路和它唯一的旋钮（2:00）· 图 `m54-end-to-end-loop`

页面上：就地修改 → `submit` → 可写目录和受保护路径 → `npm test` → 预览 → 批准 → 发布到应用的稳定地址 → 记录。旋钮 `PNEUMA_GOVERNANCE`：`record`、`personal`、`review-all`。

- 一个应用目录上有两种控制面：agent 驱动（`node .pneuma/pneuma.mjs submit`）和 Host 驱动（`bun run drive change <app> "<intent>" --agent codex|claude-code|scripted`）。
- `record`：什么都不检查，什么都记录。`personal`：总是检查、总是预览；`policy:auto` 批准普通改动；有风险的由主人决定。`review-all`：每个改动都由主人决定。演示用的是 `personal`。
- 在受治理的模式下，规则是：没有批准记录，就没有改动。
- 哪个改动有风险，由一个预设文件（`policy/*.json`）决定，而不是代码。开发者就是在这里按场景和成本预先设定。

### 第 6 页 — 记录，以及“保证”是什么意思（1:30）

页面上：一条历史记录。要的是什么、改了什么、哪些保证成立：`verified`、`previewed`、`approved`、`sealed`。单向改动会被记录。

- 记录是所有模式下的底线（[ADR-0039](./adr/0039-change-record-floor-and-declared-reversibility.md)，`@pneuma-framework/host-kit/change-record`）。连 `record` 模式也保留它。
- 一个保证说明的是对这条记录实际做了什么。没有出现，就是没有给出。`record` 模式下的记录、回退和数据快照都不带任何保证。
- 记录放在应用目录里（`.pneuma/`），所以另一个 agent 或另一个 Host 可以接着同一份历史往下做。
- 它是给人和 agent 读的历史，不是权威：coding agent 能写这个文件。

### 第 7 页 — 声明式可逆性（1:30）

页面上：一个改动能不能撤回，是 Host 声明的。`DataSnapshotCapability {snapshot, restore, check?}`。有它，`restoreWithData` 会把代码和数据一起放回去。没有它，越过单向改动的回退只放回代码，而且要主人确认之后才做。

- 首次运行的栈没有声明快照能力。演示展示的就是这个默认情况。
- 主人在批准单向改动之前会被告知代价，越过它往回退之前会再被告知一次。
- 针对 PostgreSQL 应用有一个实践（`postgres-template`），跑过现场。它是实践，不是默认，而且还没有任何东西会清理它的快照（pneuma-framework#14）。
- 细节见快照的[“回滚与可撤销路径”](../archive/milestone-54-snapshot.zh-CN.md#回滚与可撤销路径)一节。

### 暂停（0:30）

“演示之前，关于框架有什么问题吗？”没人举手就跳过。

### 第 8 页 — 现场演示（10:00）

页面上：“Live: reading-list”，以及现场脚本七节的标题。

- 讲“演示之前的故事”。
- 按现场脚本走，盯着每节的时间。
- 某一步卡住，就切到彩排应用。不要在台上调试。
- 以屏幕上的 `history` 收尾。

### 第 9 页 — 验证了什么（1:30）· 图 `m54-coverage`

页面上：这张图，或者快照里[“M54 验证矩阵”](../archive/milestone-54-snapshot.zh-CN.md#m54-验证矩阵)一节的截图。

- 框架 `5d2f1a5` 上的 CI：离线关卡通过。PR #16 合并之前，在它的 head 上跑的完整 `bun test`（跟进工作期间跑的，没有写进 PR 正文）：1849 pass，2 skip，0 fail。
- PneumaSpace `6e73538`：评审者在合并 space #42 之前，在它的分支上重跑 `npm run test:unit`：612 pass，1 skip，0 fail；docker 122/122 和 acceptance 64/64 是 PR 作者给出的结果；`test:k8s` 没有跑。
- 现场：#17 就是刚才演示的过程（首次运行 6 分 21 秒，回头改动 2 分 16 秒，Host 驱动的改动 64 秒，四个摩擦点）。示例 README 的 Status 表用 39 行记录了 2026-11-23/24 的运行，另有一份 “Not run live” 清单。
- 有几条失败路径只有测试覆盖，没有现场跑过。

### 第 10 页 — 还没证明什么（2:00）

页面上，每项一行：

1. 第 3 层作为一个包：没有可以导入的预组装 Host；集成方抄示例。
2. 默认情况下回退带回数据：首次运行的栈没有声明快照能力。
3. 一个真实的主人：在单机上，主人没有经过认证。
4. 运行时自己的前门：在 `local` 模式下，PneumaSpace 的管理 API 接受跨站写入（space #43）。
5. 一个统一的预设面：构建期和运行期的预设还是两半。
6. 其他 agent 和规模：最终运行没有用 Claude Code；多用户、托管和 Kubernetes 路径没有重跑。
7. 原始问题的后半部分：定位、命名、打包和推广都还没有开始。
8. 跨应用复用：记录是原材料；还没有任何东西从中提炼偏好。

- 每一行都念出来。哪一行都不要淡化。
- 重点讲前三条。讲第 3 条时：`approve` 要求终端，页面要求一个 agent 也读得到的链接。两者拦得住老实的 agent，拦不住恶意进程。
- 讲第 2 条时：PneumaSpace 的低成本路径（不可变的发布、发布时的静止点、文件加 SQLite）没有用上；目前只有 PostgreSQL 的实践。
- 指向快照里[“还没有证明的事”](../archive/milestone-54-snapshot.zh-CN.md#还没有证明的事)一节和未关闭的 issue：framework #14、#17，space #41、#43。

### 第 11 页 — 战略判断（1:30）

页面上：(1) 担忧的不是回路本身，而是回路放在哪里。(2) “改不坏”今天是诚实的，但很薄。(3) 产品问题还悬而未决，工程已经走在前面。

- (1) 示例 Host 承担了本该由框架负责的逻辑：发布、探测、把地址放回去、现在提供的是什么、预览。五轮评审一直在这部分代码里发现缺陷，没有收敛，因为示例在推断本该由运行时掌握的事实。每个集成方都会继承这一点。
- (2) 默认路径如实地说数据不会回来。对普通人来说，只有当“发布时做快照”成为默认存储上的默认行为时，这个承诺才变得真实。
- (3) 是一个产品还是两个、第一个设计伙伴是谁、入口项目是什么，都还没有定。现在的工程已经撑得起这场讨论；一周前还撑不起。
- 快照的[“战略判断”](../archive/milestone-54-snapshot.zh-CN.md#战略判断)一节有完整的三段。

### 第 12 页 — 建议的下一阶段（1:30）· 图 `m54-roadmap`

页面上：“让第 3 层成真：一个产品可以导入的预组装 Host，默认开启可逆性。”五条工作线，以及约束。

- (a) 发布与收尾、预览挪进 host-kit；示例 Host 缩成接线。(b) PneumaSpace 报告现在提供的是什么，并在发布的静止点为文件加 SQLite 做快照。
- (c) 一个同时覆盖构建期和运行期的预设。(d) 关上本地前门（space #43），并决定单机上主人的身份。
- (e) 定位和入口项目：由主人决定，主人在 2026-11-23 决定暂缓。
- 约束：在 (a) 完成之前，示例里不再增加新的产品界面。见快照的[“建议的下一阶段”](../archive/milestone-54-snapshot.zh-CN.md#建议的下一阶段)一节和 [roadmap.md](./roadmap.md)。

### 第 13 页 — 决策关口（2:30）

页面上，逐字：

1. 我们是否接受目前给集成方的说法是“抄示例”，并把“导入一个 Host”作为下一个里程碑？
2. 对外的形态是一个产品、两层（PneumaSpace 是入口，受治理的回路是上面那层），还是两者保持为两个独立产品？
3. 我们是否默认承诺“回退会把你的数据带回来”？这意味着 PneumaSpace 要承担发布时做快照。
4. 有没有第一个设计伙伴？面向的是个人开发者，还是 agent 产品团队？

- 逐字念出四个问题。不加任何观点。
- 等。请每个人对每个问题给出是或否。
- 把答案记下来交给主人；快照的[“团队决策关口”](../archive/milestone-54-snapshot.zh-CN.md#团队决策关口)一节是同样的四个问题。

## 幻灯片素材

| 幻灯片 | 图（占位名） | 应该画什么 |
|---|---|---|
| 3 | `m54-system-architecture` | 三层结构，两种控制面进入 Host，以及两者共用的那一个应用目录。 |
| 5 | `m54-end-to-end-loop` | 从一次修改到一条记录的回路，旋钮，以及主人介入的位置。 |
| 9 | `m54-coverage` | 哪些现场跑过，哪些只有测试，哪些完全没跑。 |
| 12 | `m54-roadmap` | M54 已关闭，然后是下一阶段“让第 3 层成真”及其工作线。不写日期。 |

这四张图目前都还不存在。在它们出来之前，第 3 页可以用“架构回顾”里的示意图，第 9 页可以用快照验证矩阵的截图。

制作幻灯片：

1. 把本文件和 [M54 快照](../archive/milestone-54-snapshot.zh-CN.md) 各读一遍，把握语气。
2. 按提纲做 13 页；图出来之后放进去。
3. 第 9 页截快照里的“M54 验证矩阵”。
4. 把第 1 页（连同开场白）、第 4 页和第 13 页练到一字不差。其余的可以用自己的话讲。

## 可能被问到的问题

**我能把它导入我的产品吗？**
还不能。今天能导入的是 `@pneuma-framework/host-kit/change-record`（914 行）和 `governed-change`（210 行）。把它们和 PneumaSpace 连起来的 Host（发布、探测、把地址放回去、现在提供的是什么、预览）是 `examples/space-all-in-one/src/host.ts`，2338 行，集成方得把它抄过去。建议的下一阶段会把这部分逻辑挪进 host-kit。对应决策关口第 1 问。

**回退会把我的数据带回来吗？**
在默认栈上不会。它没有声明数据快照，所以越过单向改动的回退只放回代码，要主人确认之后才做；Host 在批准之前和回退之前都会说明这一点。针对 PostgreSQL 应用的实践会在单向改动之前复制数据库，跑过现场；它只覆盖 PostgreSQL，需要服务器的超级用户权限，而且没有任何东西会清理它的快照（#14）。要让数据默认能回来，PneumaSpace 就得承担发布时做快照。对应决策关口第 3 问。

**什么能阻止 agent 批准它自己的改动？**
在单机上，有三道减速带，没有登录。`approve` 需要终端，而 coding agent 运行时没有终端。agent 或 `policy:auto` 去批准有风险的改动时，Host 回答 403。页面只有在持有 Host 日志里打印的主人链接时才能做决定。有 shell 的 agent 读得到那份日志，所以这拦得住老实的 agent，拦不住恶意进程。真正的 agent 产品会用它自己的登录来替代。在 #17 里，agent 没有尝试。

**为什么是两个仓库？**
pneuma-framework 先有，做的是可审计的开发：回路、记录、治理。PneumaSpace 是为运行时这个子问题开的：给改得勤、访问得少的小应用一个更轻的运行时。它们是第 1 层和第 2 层；Host 是把两者连起来的那一层。M54 之前它们互不引用。对外是一个产品两层，还是两个产品，还没有定。对应决策关口第 2 问。

**测过 Claude Code 吗？**
测过，在里程碑早些时候跑过现场（README 的 Status 表：agent 驱动和 Host 驱动两条通道、一次有风险的改动、PostgreSQL 实践）。最终那次无上下文运行 #17 用的是 Codex，没有用 Claude Code。

**拷走应用目录，数据会跟着走吗？**
不会。目录里带着代码、每一个版本和历史，所以另一个 Host 可以接着同一份历史往下做。存储的数据在 PneumaSpace 里，放在 Docker 命名卷中。#17 把这列为第 1 个摩擦点：README 可以说明数据在哪里、怎么搬。

**在我的笔记本上跑安全吗？**
只适用于一台可信的机器。在 `local` 模式下，PneumaSpace 的管理 API 接受任何网页发来的跨站写入（space #43），截图浏览器的请求过滤也有已知漏洞。记录放在 agent 工作的地方，没有防篡改保护。

**我们该信它几分？**
这个里程碑的工作在大约 26 小时内完成（东京时间 2026-11-23 14:09 至 2026-11-24 约 16:30）。第 9 页上的 CI 和测试数字成立，#17 端到端通过。有几条失败路径只有测试覆盖，没有现场跑过。收尾的 PR 依据 CI 和作者的现场检查合并，没有经过完整一轮评审，这是主人的决定。五轮评审一直在示例 Host 的发布与收尾代码里发现缺陷，没有收敛。

**多用户、托管、Kubernetes 呢？**
这个里程碑没有重跑。PneumaSpace 的 `test:k8s`、托管和多副本测试套件都没有重跑。

**我们就叫它 “agent native” 吗？**
定位、命名、打包和推广都还没有开始。“agent native” 这个词在别处已经被用来指另一种东西。

**它会从我以前的应用里学习吗？**
不会。记录是做这件事的原材料；还没有任何东西从中提炼偏好。

## 给讲者的提示

- **第 1 到第 7 页是任何技术分享里练得最少的部分。** 把开场白和第 4 页背下来；其余的用自己的话讲。
- **当天彩排，用同一台机器、同一个网络、同一个 agent 登录。** 记下每一节用了多久。如果第 1 节远超时间，就计划用 `reading-rehearsal` 展示它，第 2 到第 7 节现场做。
- **第 4 节是检查点。** 如果第 1 到第 4 节现场都成功了，演示的目的已经达到。时间紧时，第 5 到第 7 节用 `reading-rehearsal` 展示，不要临场发挥。
- **第 5 节可能被拒绝。** 在这套栈上，这就是如实的结果。不要再试一次。
- **永远不要告诉 agent 怎么用这套工具**，哪怕它犹豫。像一个不是程序员的主人那样回答。一句工具提示，就会让演示不再证明它要证明的东西。
- **闲置的应用会休眠**（#17 里是闲置 60 秒后），下一个请求会把它唤醒。应用看起来睡着了，就刷新一下。
- **第 13 页：不要替大家回答这四个问题。** 如果有人说四个都是“是”，就去问下一个人。
- **指过去，不要重新争论。** “我能导入吗？”：第 10、11 页。“数据会回来吗？”：第 7 页和第 5 节。“agent 能自己批准吗？”：第 3 节和第 10 页。
- **让屏幕看得清。** 放大浏览器和终端。主人页面顶部可以在中文和英文之间切换。

## 链接

- [Milestone 54 快照](../archive/milestone-54-snapshot.zh-CN.md)：其中的“Milestone 主张”、“端到端回路”、“演示故事”、“M54 验证矩阵”、“还没有证明的事”、“战略判断”、“建议的下一阶段”、“团队决策关口”、“证据”各节。
- [roadmap.md](./roadmap.md) 和 [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md)。
- [examples/space-all-in-one/README.zh-CN.md](../../examples/space-all-in-one/README.zh-CN.md)：跑起这套栈、两种控制面、主人页面、各个模式、单向改动和回退、PostgreSQL 实践。
- [ADR-0039：变更记录底线与声明式可逆性](./adr/0039-change-record-floor-and-declared-reversibility.md)，以及[变更记录指南](../developer/change-record.zh-CN.md)。
- [pneuma-framework#17](https://github.com/pandazki/pneuma-framework/issues/17)，本次演示复述的端到端运行；[#3](https://github.com/pandazki/pneuma-framework/issues/3)，更早的一次试用。
