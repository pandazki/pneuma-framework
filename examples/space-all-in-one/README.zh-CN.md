# space-all-in-one

一个跑在 [PneumaSpace](https://github.com/pandazki/pneuma-space) 上的无界面 Creation Host。一条 `docker compose up`，你已经在用的 coding agent（Claude Code、Codex）就有了一个在本机发布小型有状态应用的地方，并且之后的每次修改都走 framework 的受治理回路。

[English](./README.md)

这个示例回答了其他示例留给 Host 作者的两个问题：

- **Published Application 跑在哪？** 跑在 PneumaSpace 上：应用是目录加清单，发布是上传，闲置休眠，数据跨版本保留。
- **谁驱动回路？** 两边都行。同一条回路既可以由 agent 驱动（agent 改完后提交），也可以由 Host 驱动（Host 启动 agent），操作的是同一个应用目录。

## 现状

2026-11-23 在 macOS 上端到端实跑过：先用 colima（Docker 29.5、Compose 5.7、buildx 0.38），又用 Docker Desktop（Docker 29.9）跑了一遍，Bun 1.4.5，本机 Node 26、镜像内 Node 24，Claude Code 2.1.330，codex-cli 0.167.0。

接下来几行对应 Host 改用 framework 的变更记录，以及数据快照实践。它们是同一天稍后在 colima 栈上跑的，对象是前一次实跑留下的应用目录和两个新建的应用。再往后六行对应临时应用和受管应用，2026-11-24 在同一个 colima 栈上跑，对象是这些应用目录和一个新应用 `pvlab`。从"合并后的构建"到"地址不明"这几行，是当天稍后在合并了 PR #11 第二轮和 PR #12 评审修正的构建上跑的，用的是 `pvlab` 和另一个新应用 `pvnote`，两者事后都已删除。从"栈上的主人页面"起的几行对应主人页面；最后一行是合并之后在 `main` 上做的无上下文端到端实跑。

| 跑了什么 | 结果 |
| --- | --- |
| 全仓库的 `bun run typecheck` 和 `bun test` | 通过。这里的离线测试用的是内存版 PneumaSpace 和脚本化的 agent CLI。 |
| `docker compose up -d --build`，固定提交和本地检出两种来源 | 五个服务都起来，gateway 为 healthy。 |
| `create` | 容器内 `appctl init`、`npm ci && npm test`、预览启动、正式发布，约 14 秒。 |
| agent 驱动，Claude Code（在应用目录里 `claude -p`） | 先读 `status` 和 `history`，改代码，跑测试，提交。没人告诉它协议，也没有去调 `appctl`，直接发布成功。 |
| agent 驱动，Codex（在应用目录里 `codex exec`） | 同样走通，前提是实跑逼出来的两处修正：协议现在放在 `AGENTS.md` 最前面，沙箱要放开网络（见下）。 |
| 受保护路径 | Codex 第一次尝试改了 `public/ui.css` 和 `public/ui.js`，`submit` 返回 `rejected (protected_file_changed)`，没有发布任何东西。 |
| 危险修改（"把 `created_at` 这一列删掉"） | 得到 `needs_approval`。Claude Code 停下并原样转述了风险说明。没有终端时 `approve` 拒绝执行；Host 对 `agent:claude-code` 和 `policy:auto` 的批准请求都返回 403。在终端提示处以 `user:me` 批准后，它作为下一个版本发布。之后另一个变更以同样方式被拒绝；`agent:codex` 和 `policy:auto` 发来的拒绝请求得到 403。 |
| 变更的边界 | 可写目录之外的文件：`rejected (outside_writable_roots)`。一个在运行时写出新源文件并改写受保护文件的测试：变更发布后两者都不在版本里，工作区也没有被动过。 |
| Host 驱动的三条通道：`scripted`、`claude-code`、`codex` | 各发布了一个版本，并把工作区更新到新版本。 |
| `undo`、`discard`、撤销之后再提交 | 地址、工作区、历史三者一致。 |
| Linux 上的文件属主 | 在 Linux 原生的 bind mount 上复现了（colima 虚拟机内的目录）：Host 以 root 运行时，留下的文件本机用户改不了。现在 Host 启动时会切换成应用目录的属主；这样跑创建、提交、撤销，所有文件都归用户所有。 |
| 用这个 Host 打开上面那次实跑留下的应用目录 | 两个目录都接到了变更记录上，版本和历史保持原样，之前那次删列被声明为单向。实跑发现一个问题：目录里带的是旧 Host 的命令行，它把 `undo --to v4` 当成普通撤销发了出去。现在 Host 打开应用时会替换过期的那份。 |
| `record` 模式：提交、发布后应用不应答、撤销 | 新建应用和一次改动都以只记录的方式发布。带语法错误的改动被记为 `release_failed (published_unhealthy)`，地址回到之前的版本，命令退出码为 1。`undo` 回到了那个版本。在最终代码上重跑时暂停了 runner，让新版本无法应答：版本被记录但没有上线，`status` 写的是地址没能放回去，而不是断言它在提供哪个版本。runner 恢复后，不加改动再 `submit`，那个版本被原样发布，没有产生新版本。跨档位也跑了一次：`record` 模式下没上线的版本，切到 `personal` 模式后不加改动提交，照常经过检查、预览和常设策略。平台直接拒绝发布的情形没有实跑。 |
| 连续多次 `undo`，以及 `undo --to` | v21、v20、v19 一步一级，再用 `--to v16` 一步到位。每次之后地址都能应答。从 v16 执行 `--to v21` 被拒绝：v21 不在 v16 的来路上。 |
| 批准删列之后 `undo`，没有快照（前一次实跑留下的 SQLite 应用） | 被拒绝，说明只有代码会回来，旧版本可能在今天的数据上出错。没有终端时 `--accept-one-way` 被拒绝。这种情形下 owner 的确认没有实跑。 |
| 实践 `postgres-template` 上栈：`--profile postgres`，`db_backend` 设为 `postgres`，应用的第一个数据库落在 PostgreSQL 上 | Claude Code 的一次改动首次声明 `db` 时，新应用的数据库建在了 PostgreSQL 上。通过应用写入了两行。 |
| 实践 `postgres-template`：批准删列时先取快照；`undo` 被拒绝，说明数据会回到那份快照 | Claude Code 转述了披露，包括批准的代价，然后停下。批准后 Host 先建出快照数据库，再发布。未经确认的 `undo` 被拒绝，并写明快照的名字、时间和被替换的数据会放在哪里。在最终代码上重跑：快照数据库带有这个能力写下的标记。往历史里伪造一行，指向同一个应用更早、没有标记的快照，owner 确认之后它被拒绝，此时还没有发布任何东西。 |
| 实践 `postgres-template`：owner 确认；那一列和之前的行回来，之后写入的行留在被替换的数据库里 | 与描述一致。被删的列和之前的两行都回来了，删列之后写入的那一行在改名后的数据库里，应用能应答登录用户的请求，也能再写入新行。在最终代码上重跑了两次，全程每半秒发一个登录用户的请求：旧代码跑在新数据上的那一刻有一个请求返回 500，其余都是 200；那一列没有被再删一次；冷启动没有让第二次探测超时。 |
| 固定提交换到 pandazki/pneuma-space@c7ba4c4（临时应用和受管应用），2026-11-24：在同一组 volume 和应用目录上重建栈，`create` 一个新应用 | 网关列出原有的四个应用，都没有管理方、没有结束时刻。`create` 期间，预览作为临时应用存在（访问级别 `tenant`，结束时刻在发布后 3600 秒，管理方 `pneuma-host`）；随后正式发布为持久应用，管理方 `pneuma-host`，url 是概览页；一秒后预览已经不在。 |
| `personal` 模式下等 owner 决定的变更 | `submit`、`status` 和概览页都显示预览的地址和结束时刻，访问它返回 200。待决定变更的文件里没有预览字段。批准之后，正式发布完成时预览被丢弃；拒绝同样如此。 |
| owner 决定之前预览没有了 | 在 PneumaSpace 上（点出管理方名字）丢弃预览后：`status` 和概览页写明当前没有预览以及原因，`approve` 在提示之前就停下，批准请求返回 409 `preview_gone`；变更继续等待。`preview <id>` 用 2.5 秒重新发布，之后批准照常发布。在 `review-all` 模式下设 `PNEUMA_PREVIEW_TTL=60`，PneumaSpace 在发布后约一分钟自行结束了预览，之后同样的拒绝、`preview` 和批准依次发生。 |
| 没有点出管理方的写操作 | 不带 `--manager` 的 `PUT /api/apps/pvlab/access`、`POST /api/apps/pvlab-pv…/discard` 和 `appctl remove pvlab` 都返回 409，什么都没变。Host 自己的提交、批准和撤销都成功。 |
| 由别的名字管理的应用，以及有管理方之前建的应用 | 用 `appctl --manager other-host` 覆盖发布 `pvlab` 之后，`status` 点出 `other-host` 和出路，`submit` 和 `undo` 都在记录任何东西之前以 `managed_elsewhere` 被拒绝。`appctl unmanage pvlab --manager other-host` 之后，下一次提交把它标记为这个 Host 的，并在结果里说明。之前建的 `scratch` 和 `notes` 各做了一次修改和一次撤销；第一次写操作标记了它们，并用一句话说明；取消管理之后的一次撤销再次标记了 `scratch`。`ledger` 和 `todo` 保持未受管，等它们的下一次变更。 |
| 用更早的模板建的应用（`npm test` 只跑 `sdk/*.test.ts`） | 给 `notes` 加 `src/live.test.ts` 的变更给出警告：应用自己的测试一个也没有运行，尽管 `src/` 下有测试文件，并列出了这个文件；之后撤销了这个变更。 |
| 合并后的构建（PR #11 第二轮、PR #12 评审修正和这次的工作），2026-11-24：在同一组 volume 上重建；CLI 的级别检查 | 重建之前，新的 CLI 对着正在运行的 Host 打印 `the Host at http://127.0.0.1:8090 is older than this CLI; rebuild it: ...`，退出码 3。重建之后，每个应答都带 `pneuma-host-api: 2`（这次的工作把它从 1 提到 2），`list` 正常。 |
| Host 的名字；格式不对的待决定变更 | 用 127.0.0.1 访问 `/apps` 返回 200，用 `host.docker.internal` 和 `0.0.0.0` 返回 403 `wrong_host_name`，并点出 PNEUMA_HOST_URL。只有 `change_id` 的待决定文件，`status`（退出码 0）、`list` 和概览页都用一行点出它；对它批准、拒绝和 `preview` 都返回 409 `malformed_pending`。旁边一个真正的待决定变更照常批准，发布之后它的临时预览被丢弃。 |
| agent 标记；guide | 在 Claude Code 的 shell 里设了 `CODEX_HOME` 和 `CODEX_COMPANION_SESSION_ID`，`submit` 记下 `claude-code (detected from CLAUDECODE, CLAUDE_CODE_ENTRYPOINT)`，stderr 没有输出。一次真实的 `codex exec`（codex-cli 0.167.0）在它的 shell 里列出这些变量：`CODEX_APPLY_PATCH_PRESERVE_LINE_ENDINGS`、`CODEX_CI`、`CODEX_PERMISSION_PROFILE`、`CODEX_SANDBOX`、`CODEX_SANDBOX_NETWORK_DISABLED`、`CODEX_SESSION_ID`、`CODEX_THREAD_ID`、`CODEX_TOOL_CALL_ID`、`CODEX_VERSION`。`guide` 给每个路径加了引号；不带文件的 `guide --write` 退出码 1，并说明它需要什么。 |
| 重试的单向发布沿用第一次的快照（`record` 模式，应用在 PostgreSQL 上） | 一个先删掉 `note` 列、然后启动失败的构建：`release_failed (published_unhealthy)`，地址回到 v2，有一条 `snapshot_taken -> v2`。不加改动再提交，v3 原样上线，没有取第二份快照。owner 的撤销点出那份快照，那一列和两行都回来了。在 `personal` 模式下关掉预览：披露里写着"unless it kept a snapshot from before an earlier attempt"，批准后的发布同样失败，重新提交的变更批准后发布成功，仍然只有一份快照（v4 的，即这次尝试的基础版本）；撤销再次把数据带了回来。之后清除这个应用时失败了，因为两个归它的角色所有的被替换数据库还在；手动删掉它们和两份快照之后，清除成功。 |
| 没做完的撤销：提交和批准被拒绝 | 发布状态写着地址上跑的是 v6，而记录写的是 v8：`status` 说 Host 无法担保并说明原因，没有"Submitting with no new edits"那一行；`submit` 退出码 3，历史没有变化；预览已经没有的待决定变更，批准返回 409 `serving_uncertain` 而不是 `preview_gone`，`preview <id>` 同样被拒绝，什么都没有发布。`undo` 让状态恢复正常。这里发现的两处疏漏已经修正：CLI 的 approve 让 owner 重新发布预览，而 Host 会因为地址上跑的是什么拒绝这次批准；`list` 和概览页在那一行前面加了"the last release of v6 did not go live"。逼真的版本（owner 撤销期间把一个版本目录挪开）没有实跑。 |
| 地址不明：报告，不拒绝 | `record` 模式，runner 暂停：`recorded v4, but it did not go live`，地址"could not be put back on v2 and may still serve the rejected build"，`status` 说下一次应答的发布或撤销会让它恢复。恢复 runner 后，同样的提交把 v4 原样发布，那一行消失。`personal` 模式关掉预览、runner 暂停、版本一致：`rejected (published_unhealthy)`，`status` 停在 v4 并带着同一行；恢复之后，下一次提交发布了 v6（没有在应用的第一个版本上试）。关掉预览时，`needs_approval` 写着"They can open the preview"，已改为"They decide with"。 |
| 栈上的主人页面，2026-11-24：用这个分支在同一组 volume 和应用目录上重建 | 主人页面取代了上面几行提到的概览页；概览页上显示的每一行，在主人页面上都有它的位置。在 Linux 上，Host 的镜像在单独的阶段里构建了页面（`app.js` 237 KB，`app.css` 41 KB），截图镜像装好了中文和 emoji 字体。每个应答（包括页面的）都带 `pneuma-host-api: 2`；`list`、`status` 和 `GET /apps` 照常工作，用 `host.docker.internal` 访问 `/apps` 返回 403。 |
| 截图 | Host 启动时通过 `screenshot` 服务给四个应用截了图。给一个临时应用加一行中文的改动，上线后被截图，中文清楚。要求访客登录的版本没有截图（`needs_sign_in`，不存文件），卡片上是说明原因的占位图。发现并修好两处：那张卡片起初显示的是上一个版本的截图；每张截图右边都有浏览器的滚动条。 |
| 主人链接 | Host 启动时打印在日志里。`restart host` 之后日志打印的是同一个链接，仍然有效；错误的令牌被拒绝（`owner_link_required`）。`/state/owner-token` 在 Host 的状态卷里，权限 0600。 |
| 页面加载什么 | 在无界面 Chrome 里，每个视图都只从 Host 加载，没有内容安全策略的报告；页面有了自己的图标之后，控制台里也没有错误（之前浏览器会去要 `/favicon.ico`，记下一个 404）。英文页面上，改动的中文 intent 里混进了日文字形；页面的字体栈现在先列出中文字体。 |
| 应用源上的页面 | 在 :8080 上一个应用的页面里，带主人令牌 `fetch` 页面的批准路由，被浏览器在预检时拦下，Host 对预检回答 403；对这个路由和 JSON API 的批准各发一个 no-cors POST，都返回 403。什么都没有记录。 |
| 在页面上做决定，无界面 Chrome，临时应用 | 一个去掉登录要求的改动在等待。它的预览在 PneumaSpace 上（点出管理方名字）被丢弃后，页面显示预览没有在运行，“让它上线”先不可点并说明原因。“再给我看一次”重新发布了预览（约 10 秒），页面写明它什么时候结束，批准后发布。带理由说不、回退一个版本也都正常；回退起初被拒绝，因为 agent 有一处没提交的改动，页面用平常话说明了这一点。每条记录都和终端里同样决定写下的记录逐字段一致，只多一项 `"channel": "owner-page"`；唯一的区别是回退把 owner（`user:me`）记为 `agent`，而 CLI 记下它检测到的 agent，或者 `unknown`。`submit` 在终端的做法下面打印了这个改动在页面上的地址。 |
| 页面上的别的管理方，以及格式不对的待决定变更 | 一个临时应用交给 `other-host` 管理，同时有一个等待中的改动，和一个只有 `change_id` 的待决定文件。首页用一行点出这个文件；应用页写明谁在运行它，以及这里不能让改动上线、也不能回退；改动页先不让批准，保留“这次不要”，之后点它也成功了（预览仍是这个 Host 的，被丢弃了）；回退页说明了为什么不能回退。页面的路由分别返回 409 `managed_elsewhere` 和 `malformed_pending`。 |
| SQLite 应用上的单向改动，数据快照做法开着，PneumaSpace 的 `db_backend` 是 `sqlite` | 删列的改动在等待。Host 的告知和页面的确认都说会先保存数据。在页面上批准，返回 `data_snapshot_failed`（这个能力只能复制 PostgreSQL 数据库）：什么都没有上线，页面用一句话说明，改动也不再等待。“数据放不回去”这条路在 `todo` 上展示：越过它声明为单向、没有快照的 v5，页面说明数据放不回去，勾选确认之前“回退”不可点。没有真的执行。 |
| 在 `review-all` 下做的改动，在 `personal` 下批准 | 为了一次提交把 Host 用 `review-all` 重建，之后换回 `personal`。改动仍在等待，页面批准了它，但记录里的批准者只有 `policy:auto`：批准时会按 Host 当时所在模式的常设策略重新评估，而 `personal` 的策略会自己批准源码改动。CLI 走的是同一步。此后已修正：说"批准"的主体持有 owner 角色时（`user:me`），记录里也写上它；其他主体的批准（比如通过 JSON API 发来的）不写进批准者，页面也只在批准者里有应用的 owner 时才说"你确认过"。 |
| 无上下文的端到端实跑，2026-11-24：pneuma-framework `5d2f1a5`，pin 在 pandazki/pneuma-space@6e73538；三个全新的 Codex 会话（codex-cli 0.167.0，用 `env -i` 启动）、主人页面、一次 Host 驱动的改动。记录在 pandazki/pneuma-framework#17 | 每一步都按声明的那样结束。从空目录到一个带存储数据、正在运行的应用用了 6 分 21 秒、30 条命令，没有人工输入；从克隆出来的仓库不用缓存构建也通过了。在应用目录里打开的回访改动（2 分 16 秒）把搜索框在 `policy:auto` 下作为 v3 上线，把删掉一列及其数据的那个改动停在 `needs_approval`；agent 没有尝试批准它。主人在页面上批准了它：v4，`user:me`，单向。越过它往回走，在这个没有数据快照的栈上没有成功：v3 的代码在改过的数据上起不来，地址回到 v4，记录写着 `restore rejected (published_unhealthy)`。"我有几个应用，有没有在等我的？"用了两条命令。一次 Host 驱动的 Codex 改动在 64 秒内发布了 v5，一次普通的回退回到了 v4。issue 里列了四处摩擦。这次没有覆盖：Claude Code、页面上的 `deny`，以及 Codex 的默认沙箱。 |

没有实跑的部分：一台完整的 Linux 机器（只在虚拟机自己的文件系统上验证了 Host 这一侧）；不挂 Docker socket 的网关。pandazki/pneuma-framework#3 那次首次试跑之后做的改动已经在栈上跑过。把 Host 换到另一个端口后，不设任何环境变量，在应用目录里 `status` 可以正常工作；连不上时的消息会写明尝试的地址和它的来源。在应用所在的目录里，用 Host 放在那里的那份 CLI 运行 `list`，得到四个应用的摘要。概览页列出了四个应用，页面里没有脚本。带浏览器 `Origin` 的写请求、`text/plain` 的写请求、用别的主机名发起的读请求，都被拒绝。同时带有两个 agent 标记的一次提交被记为 `unknown`，两个候选都保留；它的历史记录写明跑了 11 个 SDK 测试，应用自己的测试一个也没有。没有实跑的：与第一个栈并存的第二个栈（只用 `docker compose config` 检查过）；agent 按 `guide` 输出的说明回答问题；在浏览器里打开概览页（只抓取过，没有渲染）。临时应用和受管应用这部分没有实跑的：超过 PneumaSpace 上限的预览 ttl（离线测过）；Host 问应用由谁管理时 PneumaSpace 没有应答；`default` 之外租户的 `ephemeral` 配额；别的管理方管着应用时拒绝一个等待中的变更；控制台要求输入管理方名字的提示（只试了管理 API 和 `appctl`）。取代概览页的主人页面和截图服务在 2026-11-24 上了栈（见上面几行）。在栈上没有实跑的：在页面上确认、越过单向改动的回退（临时应用在那个栈上没法让单向改动上线，`todo` 保持原样没动）；页面上先做数据快照的批准（需要把 PneumaSpace 的全局 `db_backend` 设为 `postgres`，它一直是 `sqlite`）；页面对没做完的撤销、对没人见到地址回应这两种情况的措辞（Host 这一侧以前实跑过；页面的措辞是对着示例数据和在测试里检查的）。

在这台机器上，一次由常设策略批准的变更耗时 10 到 15 秒，大部分花在 `npm ci` 和一次 bundle 上传上。

## 跑起来（agent 驱动）

需要 Docker（较新的 Compose，Host 镜像用了 additional build contexts），以及本机任意 Node 18+ 用来跑产物自带的 CLI。

```sh
cd examples/space-all-in-one
docker compose up -d --build            # PneumaSpace + Host
node bin/pneuma.mjs create todo         # 拷模板、验证、预览、发布 v1
open http://127.0.0.1:8080/apps/todo/
open http://127.0.0.1:8090/             # 你的应用、它们的历史、等你决定的变更
docker compose logs host | grep "owner link"   # 打开这个链接，才能在那个页面上做决定
```

然后用你的 agent 打开 `apps/todo/` 提需求：

```sh
cd apps/todo
claude        # 或者 codex
> 加一个存在数据库里的待办列表，带一个新增表单
```

目录里的 `AGENTS.md`（Claude Code 通过 `CLAUDE.md` 读到）开头就是完整协议：就地修改，然后 `node .pneuma/pneuma.mjs submit "<用户要什么>"`。PneumaSpace 自己的指南排在协议后面。这个顺序有讲究：指南的结尾是"用 `appctl` 发布"，协议追加在它后面的时候，Codex 改完文件就停了，没有提交，还动了两个受保护文件。在默认的 `personal` 模式下，Host 会拷一份工作区，按差异检查受保护路径，跑 `npm ci --ignore-scripts && npm test`，把草稿作为临时应用、用临时名字在 PneumaSpace 上真实启动一次（即预览），完成批准，最后才发布到应用的稳定地址。

新应用里的 `npm test` 既跑 SDK 的测试，也跑应用自己的测试：固定版本的模板脚本是 `node --test '**/*.test.ts'`，处理函数放在 `src/app.ts`，测试可以直接导入它（pandazki/pneuma-space#35）。用更早的模板建的应用保留它原来的脚本；如果那个脚本不跑 `src/` 下的测试，下一次提交时下面说的测试检查会指出来，并列出没有运行的文件。`AGENTS.md` 要求每个行为变化都带一个测试，并给出向应用发一个真实请求的最小写法。每个条目的 `npm-test` 检查记下跑了多少个测试、其中多少个是应用自己的。跳过的和 todo 的测试没有运行，不计入。为了区分两者，Host 通过 `NODE_OPTIONS` 让 Node 的测试运行器在平常的输出之外再写一份 JUnit 报告。Node 低于 24、测试脚本自己指定了 reporter，或者换了别的测试运行器时，应用自己的那部分记为 unknown，检查的通过与否和没有这份报告时完全一样。一次变更改了 `src/` 或 `public/app/`、却没有跑任何应用自己的测试时，`submit` 会用一行话说明，并列出 `src/` 下没有运行的测试文件。`history` 会显示跑了什么。两者都不拦变更。

随时可以换 agent，应用的任何状态都不在 agent 的会话里。

`submit` 会打印它记下的 agent，以及这个名字从哪里来：`--agent`、`PNEUMA_AGENT`，或者 agent 在自己的 shell 里设的环境变量（Claude Code 是 `CLAUDECODE` 或 `CLAUDE_CODE_ENTRYPOINT`，Codex 是 `CODEX_THREAD_ID` 或 `CODEX_TOOL_CALL_ID`；其他 `CODEX_` 变量，比如 `CODEX_HOME`，是人或别的工具设的，不指明任何 agent）。从另一个 agent 的终端里启动的 agent，会把那个 agent 的变量也继承下来。两组变量同时存在、又没有任何东西指明是谁时，`submit` 会给出警告，把 agent 记为 `unknown`，两个候选都记在条目里，提交照常进行。设 `PNEUMA_AGENT` 或传 `--agent` 即可指明。

Codex 需要多一个设置。它的默认沙箱禁止回环连接，所以 `npm test` 开不了端口，`submit` 也连不到 Host。用 `codex -c sandbox_workspace_write.network_access=true` 启动，或者在它请求时批准那条命令。两样都没有的话，Codex 会改完文件、报告提交被沙箱拦下，什么也不会发布。Claude Code 在执行 `npm` 和 `node` 之前会询问，两个都允许即可。

```sh
node .pneuma/pneuma.mjs list            # 所有应用：版本、地址、最近一次变更、等你决定的变更
node .pneuma/pneuma.mjs status          # 当前版本、地址、未提交的文件、等你决定的变更
node .pneuma/pneuma.mjs history         # 每次尝试：谁、要什么、风险、谁批的、结果
node .pneuma/pneuma.mjs undo "原因"     # 回退一个版本；再运行一次就继续往回退
node .pneuma/pneuma.mjs undo --to v2 "原因"   # 直接回到更早的某个版本
node .pneuma/pneuma.mjs approve <id>    # 由你本人在终端里批准高风险变更
node .pneuma/pneuma.mjs preview <id>    # 等你决定的变更的预览自行结束之后，把它重新发布出来
```

### 我有哪些应用？

`list` 一次就能回答：有几个应用，每个应用的版本和地址，最近一次变更（什么时候、哪个 agent、要的是什么），等 owner 决定的变更，改了但没提交的文件，以及地址上跑的是否不是当前版本。Host 的 `GET /apps` 返回同样的内容，`list --json` 会把它打印出来。

存放应用的目录也会自我描述，供在那里启动的 agent 读取。Host 启动时会往里面写：`AGENTS.md` 里一段带标记的内容（如果还没有 `CLAUDE.md`，再写一个内容为 `@AGENTS.md` 的 `CLAUDE.md`），一份 CLI 拷贝 `.pneuma/pneuma.mjs`，以及它自己的地址 `.pneuma/host.json`。那段内容说明这个目录是什么，给出 Host 的地址和命令，并说明改某个应用要走那个应用自己的协议。每个文件只在过期时重写，标记之外的文字保持不动。在这个目录里，不用选定应用，`node .pneuma/pneuma.mjs list`、`create <name>`、`status <name>` 和 `history <name>` 都能用。

对于在其他任何地方启动的 agent，在应用目录里运行 `node .pneuma/pneuma.mjs guide`。它会打印一小段说明，可以贴进 agent 的用户级指令：Host 的地址、应用在哪里、带完整路径的命令。它会先向 Host 要应用列表，只要有一个应用不在这个目录里就拒绝：`PNEUMA_APPS_DIR` 换了位置之后，旧目录里留下的地址记录就是这个样子。`guide --write <文件>` 把这段说明加进你指定的文件，放在开始和结束标记之间，之后再运行就替换它。它不写其他任何文件。除非你把 agent 的用户级指令文件交给 `guide --write`，这个示例不会碰它。

### 你的应用页面、主人链接，以及 PneumaSpace 控制台

Host 在它自己的地址上（默认 http://127.0.0.1:8090/）为这些应用的主人提供一个页面。它只有四部分，没有别的：没有聊天，也不能在这里做新应用。

- **我的应用。** 每个应用一张卡片：一张截图、名字、上次什么时候由哪个 agent 改动，以及一个直白的状态：运行正常、有改动等你确认、上次的改动没有上线、无法确认正在运行的版本。等你确认的改动排在最前面，在卡片之上。
- **一个应用。** 一张大截图，和一个在新窗口打开应用的链接。它的历史，用的是这个人自己的话（每次改动的 `intent`）：什么时候、哪个 agent、背后有什么保证（来自记录里的 `guarantees`）：“检查过，也试运行过 · 你确认过”“例行改动，自动通过”“未经检查直接上线”。单向改动会标出来，并写明原因。每个更早的版本都有“回到这个版本”。
- **等你确认的改动。** 现在的应用和改动之后的应用并排放着，各带一个打开真实应用的链接。要求是什么、检查了什么、为什么需要你（只列出常设策略不能自动批准的风险），以及两个决定：让它上线，或者这次不要。单向改动需要第二次、有意识的确认，确认里写明存储的数据会怎样。改动等待期间，它的预览作为 PneumaSpace 上的临时应用存在：页面给出链接，并写明它什么时候自动结束。预览结束了或被丢弃之后，页面会说明这一点，先不让“让它上线”可点（谁都看不到的内容，Host 不让批准），并提供“再给我看一次”，把检查过的草稿重新发布出来（`AppHost.preview`）；“这次不要”任何时候都能用。
- **回退。** 哪些改动会被撤销，存储的数据会怎样，依据的是 Host 知道的情况：数据快照能力保存的那份副本，以及在那之后写入的东西会被放到一边；或者只有应用本身回去。点“回退”时会带上这份计划所依据的版本；页面画出之后如果又有版本上线，Host 返回 409 `plan_changed`，什么都不变，页面改为显示现在的计划。

什么卡住了一个应用，页面在相关的地方用平常话说出来：PneumaSpace 上由别的管理方运行它（这里不能让改动上线，也不能回退，但可以说不）；上次回退没有做完（再回退一次、应用有了回应之前，改动都不能上线）；某次发布之后没人见到地址有回应（什么都不卡，下一次有回应的发布会让它恢复）；等待中的改动里有一个文件不是 Host 写的格式（它没法决定：让你的 AI 助手看看，或者删掉它）。PneumaSpace 没有登记管理方的应用，在决定之前页面就说明让改动上线或回退会把这个 Host 记为它的管理方，之后那一行也会说明已经这样记了。被拒绝的决定用一句话说明，Host 的原话放在“详细信息”里。

版本号、保证和风险的名字、改动 id、每个决定对应的终端命令，都放在“详细信息”里。页面有英文和中文（按浏览器的语言选择，顶部可以切换），手机宽度可用，有浅色和深色（在你用开关选定之前跟随系统设置）。⌘K 或 Ctrl+K，或者搜索按钮，可以按名字和最近改动的文字筛选应用。

它是怎么做的：服务器决定每个视图要显示什么、怎么措辞（`src/page.ts`、`src/page-words.ts`，结构在 `src/page-model.ts`），把它以 JSON 放进页面；一个小的 React 19 客户端（`web/src/`）用 [Beautiful UI](https://www.beautifului.dev) 的组件把它排出来，这些组件取自它的组件仓库，不是照着仿的。Beautiful UI 采用 MIT 许可证，© 2026 Shane Levine：复制来的文件放在 `web/beautifui/`，附这份许可证（`web/beautifui/LICENSE`），改动过的文件在开头写明改了什么。`web/build.ts` 用 Bun 的打包器打包客户端，用 Tailwind 编译样式表，输出到 `web/dist`：`app.js`（约 240 KB，压缩后 72 KB）、`app.css`（约 40 KB），以及 Inter 和 JetBrains Mono 字体（约 190 KB，附 OFL 许可文件）。构建出的文件开头写着其中打包了什么及其许可：Beautiful UI、React（MIT）、clsx（MIT）、class-variance-authority（Apache-2.0）。Host 的镜像在单独的构建阶段里构建 `web/dist`，只把它复制过去；`bun run dev:page` 启动时构建，`bun run build:page` 手动构建，`web/dist` 不提交。构建需要这个示例的这些 devDependencies，版本固定：`react` 和 `react-dom` 19.2.5、`class-variance-authority` 0.7.1、`tailwindcss` 和 `@tailwindcss/cli` 4.3.5、`shadow-plugin` 2.1.1（Beautiful UI 样式表用的阴影）、`@fontsource-variable/inter` 和 `@fontsource-variable/jetbrains-mono` 5.3.0，以及 React 的类型定义。运行时不从网络加载任何东西。agent 或人写下的每个值都作为数据到达客户端，并作为文本显示。内容安全策略只让页面运行它自己的脚本（每次响应一个 nonce，没有 `unsafe-inline`），样式、字体、图片和请求都只来自 Host 自己，不嵌入任何框架，也不能被嵌入：应用永远不会在 Host 的源下运行，在页面上只以截图和链接出现。`bun run dev:page` 不用 Docker，就能在覆盖所有状态的示例应用上提供这个页面（`test/page-dev.ts`）。

**主人链接。** 能连到这个端口的人都能读这个页面，就像谁都能读 `GET /apps`。要在页面上做决定，需要主人链接。Host 生成一次随机令牌，放在它自己的状态卷里（`owner-token`，只有 Host 的用户能读，不在任何应用目录里），每次启动都打印链接：`docker compose logs host | grep "owner link"` 会显示 `http://127.0.0.1:8090/#owner=<令牌>`。请你自己打开它。令牌放在网址的片段（`#` 之后）里，浏览器不会把片段发给任何服务器；页面把它移进这个标签页的会话存储，并从地址栏里去掉。每个决定都在请求头里带上它，从页面自己的源发出，内容是 JSON；来自别的网站的请求、或者没有令牌的请求都会被拒绝，CLI 使用的 JSON API 依旧拒绝浏览器发出的任何写请求。Host 重启后链接依然有效；要作废它，删掉状态卷里的 `owner-token` 再重启，用旧链接打开的页面会提示这一点。在页面上做的决定，要过和终端里一样的关口（verify、受保护路径、预览，以及“没有批准记录，就没有改动”），写下的历史记录也一样，只多一项 `"channel": "owner-page"`。它以应用 owner 的身份做决定，也就是终端里 `approve` 默认发送的那个主体。

它的强度和 CLI 的“必须在终端里”检查相同：能挡住一个诚实的 agent 批准它自己的改动，挡不住同一台机器上的恶意进程，那样的进程读 Host 的日志和在终端里打字一样容易。真正的 agent 产品会用它自己的登录来替换它。

**截图。** `compose.yaml` 里的 `screenshot` 服务是一个无界面的 Chrome。Host 通过 DevTools 协议请它给应用截图：某个版本上线时（在探测有了回应之后），某个等待中的改动带有预览地址时，以及一天之后再截一次（`PNEUMA_SCREENSHOT_REFRESH_HOURS`）；从不因为有人打开了页面而截图。截图是 JPEG 文件，存在 Host 自己的状态卷里，不在任何应用目录里，以 `image/jpeg` 加 `nosniff` 提供。每次截图都在一个没有 cookie 的全新浏览器上下文里进行，所以要求访客登录的应用没有截图，页面会在占位图上说明原因，而不是显示登录页。Host 本可以通过 PneumaSpace 的本地登录（只要一个名字）登录进去，但那样截图就会把某个人的数据展示给每个能读这个页面的人，所以它不这么做。被截图的页面在自己进程里发出的请求（页面本身、子资源、`fetch` 和 XHR、它的 worker）只能去它自己的源，或者走 https，所以这些请求碰不到控制台的 API，也碰不到 compose 网络上的其他服务。有两类请求不经过这道过滤：WebSocket，以及来自其他站点的 frame 发出的任何请求，Chrome 把这种 frame 放在它自己的进程里。通过它们，预览里还没人批准的脚本在被截图时，仍然能向 compose 网络上的每个服务发请求。WebSocket 握手是一个 GET，页面读不到回应；在用无界面 Chrome 158 做的一次试验里，来自其他站点的 https frame 向一个私网地址发出了明文 http 的 GET 和 POST，Chrome 自己的规则没有拦住。在这个栈上，网关的管理 API 不需要登录就接受写操作。它会拒绝对这个 Host 管理的应用、却没有点出这个 Host 的写操作，而这类请求做不到点出；但有些调用不需要点名，比如停掉一个应用的实例。如果这在你的机器上要紧，就不要截图。没有这个服务，或者 `PNEUMA_SCREENSHOT_CDP` 为空时，每张卡片显示占位图，其他一切不变：上线、批准和撤销从不等待截图。`status` 说等待中改动的预览还在时（以 PneumaSpace 那一刻的回答为准），它会被截图；改动不再等待之后，这张截图就被删掉。页面上的“再给我看一次”是带主人链接的 `POST /owner/apps/<name>/changes/<id>/preview`，调用的和 `node .pneuma/pneuma.mjs preview <id>` 是同一个 `AppHost.preview`。

JSON API 对浏览器有自己的规则。在浏览器里打开 Host 的端口，意味着同一个浏览器里的任何其他页面都能向它发请求，而 Host 没有登录。所以 API 拒绝只有浏览器才会发出的东西：会改动状态的请求不能带 `Origin` 或 `Sec-Fetch-Site`，并且必须声明 `content-type: application/json`；所有请求（包括页面的请求）都必须用 `localhost`、`127.0.0.1`、`[::1]`、`PNEUMA_HOST_URL` 里的主机名，或者 `PNEUMA_HOST_BIND` 的地址（仅当它是一个具体地址、不是 `0.0.0.0` 这类通配地址时）来称呼 Host。用其他名字（包括局域网地址和 `host.docker.internal`）都会得到 403 `wrong_host_name`；要用这样的名字访问 Host，把 `PNEUMA_HOST_URL` 设成带这个名字的地址，Host 也会把它作为 CLI 的地址记到每个应用里。CLI 三条都满足。这能挡住网页通过 API 去创建、提交、批准或撤销；它不是认证，机器上的程序仍然可以做这些事。

PneumaSpace 控制台是 PneumaSpace 自己的管理页面，地址是 http://127.0.0.1:8081/（`PNEUMA_SPACE_ADMIN_PORT`）。它不用登录就能打开，显示每个应用在平台一侧的情况：运行时、休眠或唤醒、发布编号、请求数，以及管理方。这个 Host 发布的每个应用、发布的每个预览，都是受管应用（PneumaSpace ADR 0039）：管理方是这个 Host 的名字（`PNEUMA_MANAGER`，默认 `pneuma-host`），操作的地方是 Host 的页面。控制台要移除、清除、丢弃这样的应用，修改它的访问权限、策略、owner 或租户，或者覆盖发布它之前，会先点出这个 Host，要人输入它的名字；管理 API 和 `appctl` 对同样的写操作，不带这个名字（`X-Pneuma-Space-Manager`、`appctl --manager`）就答 409。输入名字就绕过了 Host，之后 Host 的历史和发布状态就和线上的实际情况对不上了。这是防误操作的护栏，不是安全边界：名字不是秘密，任何有写权限的人都能带上它。

### 这个 Host 写哪些应用

每次要对 PneumaSpace 上的应用做写操作（提交、批准、撤销）之前，Host 先问 PneumaSpace 这个应用由谁管理，`status` 会显示这个回答（`on PneumaSpace: ...`）：

- 由这个 Host 管理：照常写，并点出自己的名字。
- 由别的名字管理：在检查、记录、发布任何东西之前，以 `managed_elsewhere`（409）拒绝。消息给出两条出路：如果那是这个 Host 以前的名字，用这个名字设置 `PNEUMA_MANAGER` 启动 Host；如果那个管理方已经不再管这个应用，由 owner 用 `appctl unmanage <app> --manager <name>` 结束它。Host 从不自己点出别的管理方的名字，因为绕过管理方是人的决定。拒绝一个等待中的变更照常可以：它不对应用写任何东西。
- 没有管理方，但这个 Host 的记录里有这个应用（这次固定版本之前建的所有应用，或者后来被人取消管理的）：照常写，而因为写操作点出了 Host 的名字，它会把应用标记为由 Host 管理，这也正是 PneumaSpace 对管理方下一次发布的预期。结果里用一句话说明（`PneumaSpace had no manager for todo; this submit marked it as managed by pneuma-host`）。历史里不写：应用由谁管理是 PneumaSpace 的事实，记在它的审计日志里，`status` 每次去问。改成拒绝的话，在有管理方之前建的应用就全都动不了了；而向这个 Host 要求变更的人，已经选择了这个 Host。
- PneumaSpace 没有应答：照常写，发布时 PneumaSpace 会按同一条规则把关。

想用本地的 PneumaSpace 检出来构建，把 `.env.example` 拷成 `.env`，把 `PNEUMA_SPACE_CONTEXT` 设成检出目录的路径。

在 Linux 上，Host 必须以你的身份写应用文件，否则你的 agent 改不了它们。这一步是自动的：Host 以 root 启动后，会切换成挂载进来的应用目录的属主（`host-entrypoint.sh`）。仓库里带了一个空的 `apps/`，保证这个目录在 Docker 挂载之前就归你所有。如果把 `PNEUMA_APPS_DIR` 指到别处，请先自己建好那个目录，由 Docker 代建的目录属于 root。Linux 上不需要 Docker Desktop，Docker Engine 加 Compose 和 buildx 插件就够了。

## 与其他服务并排运行

这套栈在 127.0.0.1 上占四个端口。某个端口被占用时，在 `.env` 里换一个：

| 变量 | 默认值 | 在那里监听的是 |
| --- | --- | --- |
| `PNEUMA_SPACE_HTTP_PORT` | 8080 | 各个应用，地址是 `/apps/<name>/` |
| `PNEUMA_SPACE_ADMIN_PORT` | 8081 | PneumaSpace 控制台和管理 API |
| `PNEUMA_SPACE_OBJECT_PORT` | 9000 | 对象存储 |
| `PNEUMA_HOST_PORT` | 8090 | Host：你的应用页面，以及 CLI 调用的 API |

CLI 会自己找到 Host。compose 把 Host 的地址告诉它（`PNEUMA_HOST_URL`，由 `PNEUMA_HOST_PORT` 拼成），Host 在启动时、创建或打开应用时，把地址记进应用目录和每个应用里的 `.pneuma/host.json`。在某个应用的目录里或在应用目录里的 agent 不需要导出任何变量。在本目录里运行 `node bin/pneuma.mjs`，Host 启动过一次之后，它会读到记在 `apps/` 里的地址；应用目录放在别处时，运行那个目录里的拷贝，或者直接指明 Host。CLI 依次取：`--host <url>`、`PNEUMA_HOST`、记下的地址、`http://127.0.0.1:8090`。连不上 Host 时，它会说出试了哪个地址、这个地址是从哪里来的。Host 启动时还会把每个应用里的 CLI 拷贝更新成自己的版本，因为早先 Host 留下的拷贝不读这份记录。它不会改写已有应用的 `AGENTS.md`，那个文件随应用一起进版本。所以在这之前创建的应用里，那句旧话还在：连不上 Host 就说明整个栈没起来；CLI 自己的提示会说清它试了什么。

PneumaSpace 控制台在 `http://127.0.0.1:<PNEUMA_SPACE_ADMIN_PORT>/`。它是 PneumaSpace 自己的管理页面，不是 Host 的；它的哪些操作会绕过 Host，见上文。

在第一套栈旁边再跑一套，需要另一个 compose 项目名、Docker 网络名、另一组端口和另一个应用目录。网络名在 `compose.yaml` 里出现两次，一次是网络本身的名字，一次是 gateway 的 `PNEUMA_SPACE_NETWORK`；变量 `PNEUMA_SPACE_NETWORK` 同时设定两处。如果用的是仓库的第二份检出（例如 `git worktree add`），把下面几行写进那份检出的 `.env`。如果用的是同一份检出，把它们写进另一个文件，并在这套栈的每条 `docker compose` 命令上用 `--env-file` 传入；这个文件在该命令里会取代 `.env`，所以 `.env` 里你依赖的行（比如 `PNEUMA_SPACE_CONTEXT`）要再写一遍。

```sh
COMPOSE_PROJECT_NAME=pneuma-second
PNEUMA_SPACE_NETWORK=pneuma-second
PNEUMA_SPACE_HTTP_PORT=48360
PNEUMA_SPACE_ADMIN_PORT=48361
PNEUMA_SPACE_OBJECT_PORT=48362
PNEUMA_HOST_PORT=48363
PNEUMA_APPS_DIR=/path/to/second-apps    # 先自己建好，这样它归你所有
```

然后运行 `docker compose --env-file second.env up -d --build`，再运行一次 `node bin/pneuma.mjs create notes --host http://127.0.0.1:48363`。此后在 `/path/to/second-apps` 或 `/path/to/second-apps/notes` 里运行 `node .pneuma/pneuma.mjs`，不用设置任何东西就能连到第二个 Host。第一套栈保持默认值不变。

## 跑起来（Host 驱动）

这是桌面版 agent 产品会嵌入的形态：产品自己持有对话，自己启动 code agent。它跑在你的机器上而不是容器里，因为 `claude` 和 `codex` 的登录态在本机。需要 Bun 1.4.5（仓库在 `package.json` 里固定的版本）、Node 24+、一份 PneumaSpace 检出（用它的 `appctl`），以及上面的 compose 栈。

```sh
bun install --frozen-lockfile                                 # 仓库根目录执行一次
cd examples/space-all-in-one
export PNEUMA_SPACE_CLI=/path/to/pneuma-space/cli/appctl.ts

bun run drive change todo "给每一项加截止日期" --agent claude-code
bun run drive change todo "按截止日期排序" --agent codex
bun run drive change todo "留个备注" --agent scripted         # 不需要登录，用来走通回路
```

host 驱动的 Host 运行在你的机器上，按默认端口找 PneumaSpace。栈运行在别的端口或别的项目名下时（见“与其他服务并排运行”一节），要给它 compose 栈用的同一组位置：`PNEUMA_SPACE_ADMIN`（管理 API，例如 `http://127.0.0.1:48361`）、`PNEUMA_SPACE_INGRESS` 和 `PNEUMA_SPACE_PUBLIC`（应用的地址）、`PNEUMA_APPS_DIR`，以及栈设置了的 `PNEUMA_MANAGER`。管理方名字不一致时，PneumaSpace 会拒绝这次发布，因为应用由栈里的 Host 管理。

两种控制面读写同一个 `apps/todo/`，所以 Host 驱动的一轮和 agent 驱动的一次修改会叠在同一条历史上。不要同时对同一个应用用两种方式操作，每个进程只串行化自己的操作。

Host 驱动的变更、owner 的批准和 `undo` 都会把某个版本写回工作区。工作区里还有没提交过的修改时，这三者都会拒绝开始，并列出是哪些文件。先提交或 `discard`。如果在它们运行期间工作区被改动，版本照常发布，工作区保持原样，并附一条说明。

`claude-code` 通道里没有人回答权限询问，所以适配器允许列表之外的工具调用会被拒绝。通道会把每次拒绝打印成 `[claude:denied ...]`。

## 产物

Host 不保存任何应用状态，全部跟着应用目录走。把目录拷到另一台机器、交给任何一个 Host，历史可以原样接续（`test/host.test.ts` 里有这个用例）。

版本、历史和当前版本属于 framework 的变更记录（`@pneuma-framework/host-kit/change-record`，见 [Change Record](../../docs/developer/change-record.zh-CN.md)）。Host 把自己的字段（结果、风险、批准、检查、地址）写进同一批记录。这个 Host 早先版本留下的应用目录已经有同名的 `versions/` 和 `history.jsonl`。第一次打开时，Host 用 `app.json` 里的计数器和发布状态记下的地址版本写出 `record.json`，于是从原来的地方接着走。旧的历史行读作 `guarantees: []`。那些版本从未说明自己是不是单向的，所以 Host 会对每个版本应用一次预设里的单向规则，把发现的用一条 note 声明出来。在实跑留下的 `todo` 应用上，这会标出那次删列。早先的 Host 留下的、正在等 owner 决定的变更，在被读取时也按同样方式分类，它的披露会补上代价那一句。

| 路径 | 内容 |
| --- | --- |
| `AGENTS.md`、`CLAUDE.md` | 怎么改这个应用：PneumaSpace 指南加变更协议 |
| `pneuma-space.json` | 运行时要提供什么（能力声明） |
| `pneuma.scaffold.json` | framework 的 `ScaffoldProjectManifest`：可写目录、受保护路径、把关的检查 |
| `.pneuma/pneuma.mjs` | 零依赖 CLI，与 Host 通信 |
| `.pneuma/host.json` | Host 的地址，由 Host 在启动时、创建或打开这个应用时写入。CLI 用它，除非 `--host` 或 `PNEUMA_HOST` 指定了别的地址 |
| `.pneuma/versions/vN/` | 每个已记录版本的干净源码，framework 的变更记录 |
| `.pneuma/history.jsonl` | 每次尝试一行，带有成立的保证，变更记录的历史 |
| `.pneuma/record.json` | 变更记录的版本计数器和当前版本 |
| `.pneuma/build-threads.json` | framework 的 BuildThread 记录 |
| `.pneuma/release-rollout.json` | framework 的发布状态：地址上跑的是哪个版本（当前和上一个） |

## 治理：一份记录，一个旋钮

每种模式都写同一份记录。旋钮改变的是一个版本被记录之前发生什么。由 `PNEUMA_GOVERNANCE` 设定。

- `record`，零档：`submit` 把工作区记录为下一个版本并发布，仅此而已。不跑 verify 命令，不预览，不检查可写目录和受保护路径，不做风险分类，不需要批准。CLI 会用一句话说明这次变更没有经过任何检查或批准。
- `personal`（默认）和 `review-all`：没有批准记录就没有变更，变的只是谁来批。

每条记录都写明对它成立的保证，用 framework 定下的名字。没写就是没有保证。

| 记录 | `guarantees` |
| --- | --- |
| 在 `personal` 或 `review-all` 下发布 | `verified`、`approved`、`sealed`，预览跑过时还有 `previewed` |
| 等 owner 决定，或被拒绝 | 检查挣到的部分：`verified`，预览通过时还有 `previewed`。还没有批准记录。 |
| 被检查拦下 | 失败之前通过的部分，常常是空的。检查之后被改过的草稿：空。 |
| 已批准但发布失败 | `verified`、`approved`，预览跑过时还有 `previewed`。没有记录下任何版本，所以没有 `sealed`。 |
| 早先记录下的版本，被治理模式的提交原样发布 | `release` 记录写着那次发布成立的保证：`verified`、`approved`、`sealed`，预览跑过时还有 `previewed`。 |
| `record` 模式下的一切、撤销、数据快照 | 空 |

撤销记录不对它设为当前的那个版本作任何声明；那个版本自己的记录写着它发布时成立了什么。

哪种变更算哪种风险，是一份预设，不是代码。Host 启动时读取一个 JSON 文件（默认 `policy/personal.json`，可用 `PNEUMA_POLICY_FILE` 指定别的），把里面的规则应用到磁盘上的内容。下面这张表就是那份示例预设，面向"一个人在可信机器上跑自己的应用"这个场景。其中的 SQL 规则是文本匹配：它会拦下一条写在字符串里、根本不会执行的 `DROP`，也会漏掉用变量拼出来的删除。把它当作起点，按你的场景写自己的预设。

一份预设有四类规则和一个列表：

| 预设里的字段 | 含义 |
| --- | --- |
| `change` | 每次变更都带的风险，以及变更只落在指定路径下时改用的较轻风险。 |
| `paths` | 改动落在这些路径下就带上某种风险，比如支付相关代码一律要 owner 批。 |
| `manifest` | `pneuma-space.json` 的每类事实对应什么风险：新增或移除能力、运行时变化、不再要求登录。 |
| `content` | 对改动文件做文本匹配。匹配到的内容比变更前出现得更多才算命中。 |
| `auto_approve` | 常设策略可以自行批准的风险。其余风险一律等 owner。 |

历史里会记下每次决定所依据的预设。

| 从磁盘读到的信号 | 风险 | `record` | `personal`（默认） | `review-all` |
| --- | --- | --- | --- | --- |
| 源码或浏览器资源变更 | `source_code_change`、`additive_ui` | 不读，直接发布 | `policy:auto` | owner |
| `pneuma-space.json` 新增能力 | `definition_additive` | 不读，直接发布 | `policy:auto` | owner |
| 移除能力（平台保留其数据） | `release_change` | 不读，直接发布 | `policy:auto` | owner |
| 不再要求登录 | `policy_change` | 不读，直接发布 | owner | owner |
| 新出现 `DROP`、`ALTER TABLE ... DROP/RENAME`、`TRUNCATE`、不带 `WHERE` 的 `DELETE` | `destructive_definition`，单向 | 不读；只有 agent 加了 `--one-way` 才算单向 | owner | owner |

`policy:auto` 是 framework 自己的 `BuildChangeGovernancePolicy` 里持有 reviewer 角色的一个主体，评估器是原样的 `evaluateBuildChangeGovernance`。verify 门和预览不是许可，在 `personal` 和 `review-all` 下都会跑。`record` 按定义两样都不跑。

`record` 模式下，Host 发布之后仍会访问一次应用的根路径，只为说明这次发布有没有上线。这不是对变更的检查，没有任何记录为它声明保证。运行时拒绝了这次构建、或者构建起来后不应答时，版本照样留在记录里，因为记录是这个模式唯一的承诺。地址回到之前在跑的版本，记录写明发布失败以及地址现在跑的是什么，`status` 同时显示两个版本，命令以非零退出。

这个版本记录了但没有上线，每条路径都用同一套规则对待这种状态。工作区等于当前版本、而地址上跑的是另一个版本时，提交会把当前版本原样发布，不记录新版本。`record` 模式下，Host 发布它，标记它在跑，并写一条 `release` 记录说明它现在上线了。治理模式下，内容先过每一道门。比对的对象是地址上正在跑的版本，因为这正是用户那边将要变的东西。批准之后，Host 标记它在跑，并在记录里写明成立的保证。带新修改的提交会在它之上记录一个新版本，发布时两者一起上线。平台接受发布之后如果哪一步失败，Host 把地址放回之前在跑的版本，能写的都写下来，并以 `reason: "record_failed"` 应答，从不抛出没有原因的错误。`create` 也一样：新应用会被撤下，名字保持可用。

有时 Host 无法担保地址上跑的是什么。这时不论 `status` 列出哪些版本，它都会说明这一点，并说明该怎么做。分两种情况：

- 一次失败的发布或撤销之后，把地址放回去没有成功，从那以后没人看到地址应答过。什么都不拒绝。下一次应答了的发布或撤销会结束这个状态，因为那之后地址上跑的就是那个版本。没有碰到地址的记录，比如一次拒绝、或者平台拒收的发布，不会结束它，它们的说明里也不会写地址上跑的是什么。
- 当前版本上线过，而地址上跑的是更早的版本：一次撤销发布出去了却没能记录下来，或者 Host 之外的什么东西动了地址；上线过的版本从来不属于「记录了但没有上线」。这时提交或批准会把当前版本的代码重新放上线，跑在旧版本此刻用的数据上，那可能正是撤销放回的数据。所以两者都会被拒绝（HTTP 409，`reason: "serving_uncertain"`），什么都不写，`status` 会让你运行 `undo`。一次应答了的撤销结束这个状态。

把旋钮从 `record` 调上去，不会继承 `record` 放过的东西。治理模式从 Host 自己的 overlay 读取可写目录、受保护路径和 verify 命令，而不是读应用里的那份副本，因为 `record` 不保护它。治理模式还拿变更和地址上正在跑的版本比，而不是和当前版本比。所以在 `record` 模式下记录了、却从未上线的版本，会在治理模式的变更把它带上线之前被比对、把关和分类，不论这次变更是加了修改，还是原样提交这个版本。只跑过治理模式时，这两者是同一个版本。

检查过的才是发布出去的。一次变更只能动 scaffold 声明的可写目录，超出范围的路径在任何检查运行之前就被拒绝。回路骨架在比对草稿时记下它的内容哈希，检查跑完再核对一次；Host 让等 owner 批准的变更带着这个哈希，发布前对即将发布的那份副本再核对一次。中间被改过的草稿会以 `draft_changed_after_check` 被拒绝。这一点之所以重要，是因为没有任何东西能保证 agent 的回合结束时它的进程已经停下。`npm ci && npm test` 在应用目录之外的副本里跑，因为测试是 agent 写的代码。agent 和编辑器自用的目录（`.claude/`、`.codex/`、`.vscode/`、`.idea/`）不属于版本。

预览是一个临时应用（PneumaSpace ADR 0038）：有自己的名字（`<app>-pv` 加变更编号的四个字符）、自己的空存储，访问级别固定为租户，不排定时任务，结束时刻由 PneumaSpace 在首次发布时定下，是 `PNEUMA_PREVIEW_TTL` 秒之后。默认 3600，即 PneumaSpace 默认的 `ephemeral_max_ttl_seconds`；更长的值 PneumaSpace 会拒绝，除非先放宽它的全局策略（`PUT /api/policy`）。每个等 owner 决定的变更都占用租户的一个临时应用名额，直到它被决定或者它的预览结束；PneumaSpace 每个租户允许 3 个，只有 `default` 不限，compose 栈用的就是它。PneumaSpace 因为这两种原因之一拒绝发布预览时，不算检查失败：变更以 `preview_refused` 被拒绝，说明里写明改动本身没有发现问题，以及该怎么做（决定一个等待中的变更或者等某个预览结束，或者调低 `PNEUMA_PREVIEW_TTL`）。常设策略批准的变更，预览保留到正式发布完成，之后一次调用丢弃。PneumaSpace 按内容存 bundle，所以正式发布直接复用预览已经上传的字节；先丢弃预览的话，要多付一次上传和一次 bundle 删除，实跑里各约 8 秒。等 owner 决定的变更会保留它的预览：`submit`、`status`、`approve` 和 Host 的页面都写明预览在哪里、什么时候结束，owner 可以先打开看再决定。批准或拒绝都会丢弃它。如果没人决定，或者 Host 停了，它会自行结束。

预览在 owner 决定之前结束时，不会有人批准谁都看不到的内容。`status` 和 Host 的页面写明当前没有预览以及原因，`approve` 以 `preview_gone`（409）被拒绝：什么都不变，变更继续等待。`node .pneuma/pneuma.mjs preview <id>`，或者页面上的“再给我看一次”，把检查过的草稿作为新的预览发布出来，带一个新的结束时刻；检查之后被改过的草稿会在这里被拒绝，就像批准它时一样。在预览名字下列出的应用，只有在由这个 Host 管理、状态是 `registered`、结束时刻还没到时，才算这个变更的预览。PneumaSpace 在清除一个应用之前一直列着它，所以被人 remove 的预览、结束失败（停在 `purging`）的预览、结束时刻已过而 PneumaSpace 的清扫还没跑到的预览，都算作没有了；名字释放之后被别的应用占用，也一样。Host 不记录预览的寿命：预览的名字由变更推出来，它还在不在、什么时候结束，每次 owner 查看或决定时都去问 PneumaSpace。它只记一件事：发布预览时 PneumaSpace 返回的应用 id（写在等待中变更的文件里，字段 `preview_app_id`），每次丢弃都带上它（`?app=<id>`，pandazki/pneuma-space#40），所以一次丢弃只会结束那个应用，或者什么都不结束，不会结束之后同名的另一个应用。没有 id 的预览（比如更早的 Host 留下的）不丢弃，让它自行结束。PneumaSpace 没有应答时，预览可能还在，所以说成"未知"而不是"没有了"：`status`、CLI 和页面都这样写，`approve` 以 `preview_unknown`（502）被拒绝并提示稍后再问，`preview <id>` 既不丢弃也不发布。`PNEUMA_PREVIEW=off` 时没有预览，批准也不需要它，决定时也不向 PneumaSpace 发丢弃请求。

`previewed` 在变更记录里的含义不变：这份内容在发布前作为运行中的应用应答过。它由关卡里的预览挣得；批准另外还要求那一刻有预览在。

需要 owner 决定时，agent 拿到 `needs_approval` 和一段人话披露，并被告知停下。对单向变更，披露还会写明批准的代价，以及这个 Host 能不能把存储的数据放回（见下）。批准和拒绝都要求 owner 角色，其他主体会得到 403。`approve` 在没有终端时拒绝执行。这只是减速带，不是安全边界：在一台可信机器上，有 shell 的 agent 能做 owner 能做的一切，而且 Host 是从请求体里读取批准主体的。真正的边界需要经过认证的 owner，PneumaSpace 的组织版有，这个栈没有。

## 单向变更与撤销

`undo` 只回代码不回数据，实跑显示了这在破坏性变更之后意味着什么。被要求删掉一列时，Claude Code 自己指出：删列之前的版本都要读这一列。删列被批准并发布之后，`undo` 回上一个版本报告成功：它的健康检查是以匿名访客身份打开根路径，根本碰不到那张表。之后每个登录用户的请求都返回 500，报 `no such column: todos.created_at`。

健康检查看不到这种失败，所以 Host 在这里不再依赖它。现在的做法是：

- **由预设说明哪些变更是单向的。** 规则可以带 `one_way: true`。`policy/personal.json` 里只有破坏性 SQL 那条规则带。它命中的变更在记录里带 `one_way: { reason }`，原因就是这条规则自己的披露文字。`record` 模式下没有风险分类，所以由 agent 自己说明：`submit --one-way "<丢掉了什么>"`。治理模式拒绝这个参数。
- **批准之前告诉 owner 代价。** 这次变更之后，回到更早的版本需要 owner 确认。披露里写明这个 Host 有没有声明数据快照能力，也就说明了那样的撤销会做什么。
- **撤销可以一直往回走。** 每次 `undo` 都回到当前版本所基于的那个版本：v5，然后 v4，然后 v3。`undo --to <版本>` 直接回到其中某一个。不在当前版本身后的版本不能作为撤销目标；要把它找回来，就把它的文件重新提交一次。每一步都先重新发布旧版本、确认它应答，然后才移动记录、放回文件。撤销之后的新变更拿到一个新编号，基于撤销落到的那个版本。
- **越过单向变更的撤销要等 owner，任何模式都一样，`record` 也不例外。** 两种结果都值得人停下来看一眼。把数据放回，会丢掉快照之后存下的东西。不放回，旧版本可能读不了今天的数据。所以在 owner 确认之前撤销会被拒绝，拒绝的消息说明属于哪种情况：
  - (a) 这个 Host 能把存储的数据放回。数据回到消息里点名的那份快照，它是在那个单向版本之前取的，消息里写明取快照的时间。那之后存下的一切都被放到一边，不会出现在应用里。如果能力说明了它把那些数据放在哪里，消息里也会写出来。
  - (b) 这个 Host 不能把存储的数据放回，或者在那个版本之前没有取快照。只回代码，旧版本可能在今天的数据上出错。

  消息还会列出每个单向版本及其原因。它经过 HTTP API（`reason: "crosses_one_way_change"`，以及表示情况的 `data_restore: "snapshot"` 或 `"none"`）和 CLI 到达 agent，CLI 再补一句下一步该做什么，以 2 退出。什么都不会被改动。
- **owner 确认。** `undo --accept-one-way` 需要终端和 owner 角色，和 `approve` 完全一样。CLI 先打印拒绝消息，再请 owner 对一个点明情况的问题输入 `accept`。确认请求带上那条拒绝消息里计划所依据的版本（拒绝消息里的 `from`），所以如果中间又有版本上线，Host 返回 409 `plan_changed`，什么都不变；再运行一次 `undo` 就能看到现在的计划。其他主体得到 403。记录写入 `one_way_crossed`（`by: "data_restored"` 加上所用的快照，或者 `by: "accepted"`）和 `confirmed_by`；情况 (a) 下如果能力说明了被替换的数据去了哪里，还写入 `set_aside`。这个参数沿用原名：两种情况下 owner 接受的都是越过单向变更的代价。
- **数据怎么回来。** 带有 `DataSnapshotCapability` 的 Host 在一次发布第一次把单向变更带上线之前，保存存储的数据。规则看的是什么会上线，而不是这次提交：发布本身，加上它顺带第一次带上线的每个已记录版本；在 `record` 模式下，这可能是一个自己发布失败过的版本。其中任何一个是单向的，Host 就先取快照，挂在其中最早那个单向版本的基础版本上，撤销正是在那里找它。保存失败时什么都不上线（`data_snapshot_failed`）。`record` 模式下，那个版本仍然记录着、没有上线，下一次发布不论带不带新修改都会再试一次快照，因为那个版本仍在要上线的范围里。一份快照一直是它那个基础版本的快照，直到基础版本重新上线：它自己的一次发布应答了，或者一次撤销落在了它上面。一次发布出去却没有应答的发布，可能已经在启动时执行了它的单向变更；之后把地址放回基础版本，并不会撤销这一点。所以下一次尝试不再保存数据：它保留之前那份快照，owner 确认撤销时看到的文字会点出这份快照和它被取下的时间。之后经确认、越过这个变更的撤销通过 `restoreWithData` 按这个顺序进行：先由 capability 检查交给它的快照；再发布旧代码，它要能应答；再放回数据；应用要再应答一次；最后才移动记录。代码先走，是因为删掉数据的那个构建还会再删一次：PneumaSpace 模板在应用启动时建表，所以 agent 写的删列通常也在启动时执行。如果数据放回时发布的还是那个构建，下一个请求就会在恢复后的数据上把它唤醒。某一步失败时：
  - capability 拒绝这个快照，例如历史里的名字不是它为这个应用做的：什么都不发布，不碰数据，记录不动，撤销以 `data_snapshot_refused`（HTTP 409）被拒绝。CLI 会说明什么都没变。
  - 旧代码发布不出去：不碰数据，地址继续跑原来的版本。
  - 旧代码发布之后数据放不回去（服务器不在了、拷贝失败）：地址回到原来的版本，记录不动。
  - 数据放回后应用不应答：不把新代码放回去，因为它不能跑在这份数据上。记录写的是旧版本，也就是实际就位的东西，撤销报告失败并说明原因。
  - 数据放回后记录写不进去：地址留在旧代码上，错误信息说明等记录能写了再撤销一次，在那之前不要提交。在那之前提交和批准都会被拒绝（上文第二种情况）。

  还剩一个窗口。从旧代码发布出去到数据替换完成之间，旧代码跑在新数据上，可能返回错误。它不会因此丢数据：替换会把那份数据连同快照之后存下的一切放到一边，除非旧版本自己的启动步骤删了什么。快照之后、新构建第一次启动之前应用写入的数据也不在快照里。

`PNEUMA_DATA_SNAPSHOT` 指定 Host 启动时带的能力。不设就没有。`postgres-template` 是这个示例自带的一个，作为实践提供（见下一节）。设成其他值会让 Host 在启动时以一句平实的错误退出。

## 实践：声明存储的数据可以放回

这是一个实践，不是 framework 或 PneumaSpace 的承诺。framework 只定义 `DataSnapshotCapability`，从不提供实现。PneumaSpace 把备份交给存储层，并说明每个绑定的数据放在哪里。这个示例展示一个 Host 在一台可信机器上补上这块的一种做法，参照的是 Neon 分支那样的数据库分叉流程。PostgreSQL 的 `CREATE DATABASE new TEMPLATE old` 是本地版的分支：在服务器内部做的一份完整拷贝。代码在 `src/data-snapshot-postgres.ts`。

在 compose 栈上的设置步骤：

1. 启动 PostgreSQL：`docker compose --profile postgres up -d`。这会在栈的网络上加入 `postgres` 服务（PostgreSQL 16），地址 `postgres:5432`，网关在那里找到它。
2. 在应用第一次声明数据库（`pneuma-space.json` 里的 `"db": {}`）之前，把新数据库放到 PostgreSQL 上：

   ```sh
   curl -X PUT http://127.0.0.1:8081/api/policy -H 'content-type: application/json' -d '{"db_backend":"postgres"}'
   ```

   从此以后，声明 `db` 的第一次发布会给应用分配它自己的 PostgreSQL 角色和数据库。已经有数据库的应用保留原来的。PneumaSpace 不会在引擎之间搬数据；用 `PUT /api/apps/<name>/policy` 切换单个应用，得到的是一个新的、空的 PostgreSQL 数据库。
3. 告诉 Host。在 `.env` 里写：

   ```sh
   PNEUMA_DATA_SNAPSHOT=postgres-template
   PNEUMA_DATA_SNAPSHOT_URL=postgresql://postgres:pneuma-local@postgres:5432/postgres
   ```

   然后再跑一次 `docker compose --profile postgres up -d`，让 Host 带着它们重启。只设了名字而没有 URL 时，Host 在启动时退出并说明缺了什么。`status` 现在会显示 `data snapshot: postgres-template`。

**快照。** 在一次发布第一次把单向变更带上线之前，Host 向 PneumaSpace 询问（`GET /api/apps/<name>/state`）这个应用用的是哪个 PostgreSQL 数据库。数据在 SQLite 里、或者没有数据库的应用会被拒绝，并说明该怎么办，变更不会发布。然后 Host 停掉应用的实例（`POST /api/apps/<name>/stop`；下一个请求会把它唤醒），结束数据库上残留的会话，用 `CREATE DATABASE ... TEMPLATE` 拷贝它。被唤醒的应用可能在这中间重新连上，所以这一步会重试几次。之后拷贝对所有非超级用户的角色关闭，应用自己的角色也包括在内。它的名字就是引用：`snap_<应用>_<版本>_<时间>`，比如 `snap_notes_v3_20261123t224812`。为了放进 PostgreSQL 的 63 字节，应用那一段从不截短，截短的是版本那一段。最后给拷贝做标记：Host 通过管理员连接把它的注释设成一小段 JSON，写明应用、版本、从哪个数据库拷贝来的、以及时间。标记失败时快照算失败，什么都不上线。

**恢复。** 引用来自应用的历史，coding agent 可以写那个文件。恢复以超级用户身份运行。所以 Host 先检查这个引用是不是它为这个应用做的快照。名字必须以 `snap_<应用>_` 开头。数据库必须在服务器上，属主必须是超级用户，并且带有标记，标记里写的必须是这个应用，以及 PneumaSpace 现在给它的那个数据库。那个数据库也必须在服务器上。（数据库的属主可以设置它的注释，所以属主也要检查；应用自己的角色不能创建也不能拥有快照。）这些检查由同一个函数完成，它跑两次。第一次是 capability 的 `check`，在经确认的撤销里、旧代码发布之前：不通过的引用会以 `data_snapshot_refused` 被用直白的话拒绝，此时什么都没变，没有发布代码，没有停掉应用，也没有改任何名字。第二次在恢复本身开始时，因为两次之间服务器可能变了；这时不通过的引用仍然在停掉应用之前被拒绝。owner 确认时看到的文字会点出快照的名字和时间，让他看得见要拷进来的是什么。然后 Host 停掉应用、结束它的会话。它把应用的数据库改名为 `<数据库名>_replaced_<时间>`，什么都不删。然后以快照为模板重新建出应用的数据库，属主是应用自己的角色，并像 PneumaSpace 那样对其他角色关闭。如果这次拷贝失败，Host 把旧数据库改回原名，报告什么都没变。如果连改回也失败，错误信息会写明数据在哪里，以及把它找回来的那一条命令。快照保留，所以同一次恢复可以再做一遍。

局限，直说：

- 每次快照和每次恢复都是完整拷贝。耗时和占用的磁盘随数据库变大而增加。
- 只在单向变更之前取快照。所以一次恢复会让应用丢掉那之后存下的一切。那些数据只留在被替换的数据库里。
- 一次单向发布出去却没有应答时，重试会保留那次尝试之前取的快照，如上所述。之后越过这个变更的撤销，会丢掉从那份快照到撤销之间写入的一切，包括失败的尝试之后旧版本继续服务期间写入的东西，这段时间可能很长。
- 只覆盖 PostgreSQL 数据库。文件（`files`）、键值数据（`kv`）和对象存储保持原样。
- 数据在 SQLite 里的应用不在覆盖范围内。在策略改成 `postgres` 之前就拿到数据库的应用也不在。
- `PNEUMA_DATA_SNAPSHOT_URL` 是对那台服务器上每个应用数据库的超级用户权限。只在一台可信机器上可以接受。
- 变更记录是给人和 agent 读的历史，不是权威。它放在 coding agent 工作的地方，没有任何东西防止它被篡改。capability 会检查从里面读到的每个引用，如上所述，正是这项检查让一个应用的快照进不了另一个应用。
- 拷贝或替换数据库期间应用被停掉。这时来的请求会唤醒它，恢复期间它可能短暂连不上自己的数据库。
- 快照和被替换的数据库一直留在服务器上，直到有人删掉。被替换的数据库仍归应用的 PostgreSQL 角色所有，所以只要还留着一个，PneumaSpace 清除这个应用时就会在删掉应用自己的数据库之后失败（`role "app_<id>" cannot be dropped because some objects depend on it`）；先删掉被替换的数据库。

## 这个示例依赖什么

| 来自 | 用来做什么 |
| --- | --- |
| `@pneuma-framework/host-kit/change-record` | 版本、带保证的历史、当前版本、多级恢复、单向变更的拒绝、`restoreWithData`。 |
| `@pneuma-framework/host-kit/governed-change` | 编排与关卡：空变更、按差异检查受保护路径、失败即关闭的 verify、前后证据。 |
| `@pneuma-framework/host-kit/workspace` | 目录树的复制、列举、比对。 |
| `@pneuma-framework/core/enterprise-governance` | 风险路由和批准决定。 |
| `@pneuma-framework/core/release-rollout`、`release-rollout-store` | 地址上跑的是什么：每次发布成功应答后 stage 加 promote，撤销也一样。 |
| `@pneuma-framework/core/build-thread` | 意图、提案、决定和回执各轮。 |
| `@pneuma-framework/backend-claude-code`、`backend-codex` | Host 驱动的 code agent 通道。 |
| PneumaSpace `appctl` | 模板、bundle 规则、发布：预览用 `--ephemeral --ttl`（appctl 会打印预览的应用 id），每次发布都带 `--manager --manager-url`。 |
| PneumaSpace 管理 API | 应用由谁管理、临时应用什么时候结束（`GET /api/apps`），按发布返回的 id 丢弃预览（`POST /api/apps/<name>/discard?app=<id>`），撤下创建失败时留下的应用（先 remove 再 purge）。每个写操作都点出管理方。实践里还用到：应用的数据放在哪里（`state`），停掉它的实例（`stop`）。 |
| Bun 内置的 PostgreSQL 客户端 | 实践里快照和恢复的语句。 |

## 这个示例发现的缺口

每一条都是示例不得不绕路的地方，是正式集成的输入。

pneuma-framework：

1. `publishVerifiedVersion` 和 `HostRuntimeAdapter` 只能从 `host-kit` 的根入口拿到，而根入口会连带引入 `core` 根入口和 MCP SDK。示例改为直接使用 rollout 原语。
2. `HostRuntimeAdapter` 假设 Host 自己管进程和 `data_dir`，托管运行时两者都自己管，形状对不上。
3. 没有"agent 调 Host"这个方向的控制面。`AgentBackend` 只有 Host 调 agent，这里的服务端是新写的。
4. 回滚只有一层（`active` 和 `previous`），连续两次 `undo` 等于重做。已在这次变更中关闭：撤销改为按变更记录沿 base 版本往回走，`undo --to` 直接回到更早的版本。发布状态现在只记录地址上跑的是什么，撤销把旧版本作为新的候选提升上去，因为发布状态自带的回滚只能交换 `active` 和 `previous`，会把多级撤销记错。
5. 风险分类完全留给 Host。这里把它做成了一份声明式规则的预设；framework 没有安放这种预设的位置。预设这一半仍未解决，它仍是 Host 启动时读取的一个文件（现在还说明了哪些规则让变更成为单向）。本地状态这一半有了归宿：版本、历史和当前版本是应用目录里 framework 的变更记录。改了应用代码、却没有任何应用自己的测试覆盖的变更要不要交给 owner，也是这样一个预设层面的决定；这个示例只记录并打印这个事实，这条规则不在本次范围内。
6. `buildGovernedProposal` 原先是先比对草稿，再在同一个草稿里跑 `verify`，然后由调用方发布它，所以执行 agent 代码的 verify 能加进从未被比对过的文件。已在这次变更中关闭：骨架现在返回草稿的签名，并在开启 `sealDraft` 时拒绝在 `verify` 期间被改动的草稿。它是可选的，因为有的 Host 的 `verify` 会有意往草稿里写；其他 Host 在开启之前并没有得到保护。
7. `buildGovernedProposal` 原先只检查受保护路径，不知道 scaffold 的可写目录，也不知道 Host 自己的忽略列表。已在这次变更中关闭，对应选项 `writableRoots` 和 `walkOptions`。

PneumaSpace：

1. 取不回某个版本的源码，`publish` 还会剔除测试文件，所以平台当不了"换地方继续改"的真相源，产物目录才是。这现在是有意的设计：应用目录里的变更记录是版本的真相源，平台只需要把它们跑起来。
2. 没有快照、分叉的原语。预览现在有了原语，即临时应用（ADR 0038），Host 已经在用。按 PneumaSpace 的设计，预览仍然给不了这些：它从空存储开始，所以只能说明这个构建能启动、能应答，说明不了它在应用自己的数据上表现如何（把数据拷进去留给调用方）；它的寿命受一个全局设置限制（`ephemeral_max_ttl_seconds`，默认 3600），之后的发布也不延长它，所以拖得更久的决定需要再跑一次 `preview`，再上传一次带 `node_modules` 的 bundle（模板自带 `pg` 和 `redis`，8.6 秒）；在 `default` 之外的租户里，`ephemeral` 配额是 3，一个租户同时最多有三个带预览的等待中变更。Host 仍然只是靠在预览还在时发布，才避免了上传两次。撤销只回代码，数据不动。按 PneumaSpace 自己的设计，数据快照是存储层的事：它的应用契约把备份交给存储层，并提供 `GET /api/apps/<name>/state` 说明每个绑定的数据放在哪里，这正是 `DataSnapshotCapability` 需要的。上面的实践正是建立在它之上。
3. 没有发布 SDK，Host 只能调 `appctl`。
4. 网关无条件构造 Docker 客户端。挂着 socket 时它在 colima 下能启动。只用 isolate 和 static 时不挂 socket 能否启动仍未验证，所以 compose 保留了挂载。
5. 单机上没有人经过认证，owner 角色只是一个名字，不是一个主体。
6. 应用模板的 `AGENTS.md` 有两处让 agent 用 `appctl` 发布，现在还写了怎样发布临时副本、受管应用要带 `--manager <name>`：Host 不得不包含的这份指南，教会了 agent 怎样绕过它。接管发布的 Host 只能用文字去否定它，并把自己的说明放在前面。模板里没有一个位置可以写"这里的变更是这样上线的"。
7. 仓库的 `.dockerignore` 只保留 `gateway/` 和 `shared/`，而 BuildKit 会把它应用到作为构建上下文的本地检出上。需要 `cli/` 和 `templates/` 的镜像没法把检出当成一个上下文来用，compose 文件把这两个目录分别作为独立的上下文传入。
8. 已由受管应用关闭（ADR 0039，pandazki/pneuma-space#36）：这个 Host 发布的应用被标记为受管，控制台、管理 API 和 `appctl` 会拒绝没有点出 Host 名字的写操作。剩下的：名字不是凭证；有人点出管理方的名字绕过它时，管理方不会收到通知（PneumaSpace 的审计记下 `namedManager`，这个 Host 不读它）。主人页面在“详细信息”里写出每个应用由谁管理。没有任何东西比对 PneumaSpace 上跑的和 Host 的发布状态，所以这样的写操作只有在有人去看时才会被发现。
