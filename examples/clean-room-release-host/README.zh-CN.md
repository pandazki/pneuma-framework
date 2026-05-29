# Release Host —— Creation Studio

一个净室 Creation Host,把 `../clean-room-release-board` 生产 profile 接入完整的
受治理生命周期:

```text
从 profile 创建 → 预览/发布 v0
  → 代码代理 draft(deterministic | Codex app-server)
  → scaffold `verify` 作为提案前门禁
  → 提案 → 批准/应用 vNext
  → 发布(本地 Bun | Vercel REST)并先迁移 Neon
  → 回滚
```

**英文版本:** [README.md](./README.md)

它的存在是为了端到端证明框架理念:Developer 准备真实技术栈 profile,Builder 从中
创建完整应用,**真实代码代理** 在护栏内演进它,结果发布到 **真实数据库** 与
**真实云部署** —— 并在每次应用后让数据库 schema 与打包产物的变化可见。

> 从 M53 目标净室构建。Codex app-server 传输与 Vercel REST 适配器在此依据公开的
> 集成形态重新实现,而非复制现有 example 的产品代码。

## 两个界面

主题极性告诉你正在看哪一框架层:

- **Creation Host(本应用)** —— *浅色* 运维控制台。主视觉是 7 段生命周期管线;
  证据(版本 id、schema 签名、部署回执)以等宽数据呈现。
- **Generated Application**(`../clean-room-release-board`)—— 给 End User 的
  *深色* 编辑感 flight deck。

## 运行

```bash
bun install   # 仓库根

# 构建 studio UI,再启动控制台
bun run --cwd examples/clean-room-release-host build
PORT=8870 bun run --cwd examples/clean-room-release-host serve
# → http://127.0.0.1:8870
```

代理 lane(默认是 测试/CI 用的确定性无 AI lane):

```bash
PORT=8870 PNEUMA_AGENT=codex-app-server \
  bun run --cwd examples/clean-room-release-host serve
```

Codex lane 通过 JSON-RPC 驱动本机 `codex app-server` 对 draft 工作区编辑。完成检测
接受 `turn/completed` **或** `thread/status/changed` → `idle`(codex 0.128 对较长
回合发后者)。若两者在 host 超时前都没到,host **不信任** 该 transcript:它会 kill
进程、对 draft 跑 verify,只有当 scaffold 自带的 `verify` 仍通过时才进入提案
(fail-closed)。

发布到 Neon + Vercel(凭证通过 env / 已 gitignore 的 `.env`):

```bash
DATABASE_URL=postgresql://… \
VERCEL_TOKEN=… VERCEL_PROJECT=clean-room-release-board \
PORT=8870 PNEUMA_AGENT=codex-app-server \
  bun run --cwd examples/clean-room-release-host serve
```

离线 harness 测试(确定性 lane,无网络):

```bash
bun test --cwd examples/clean-room-release-host
```

## Host 观察什么

每次应用版本后,studio 记录三类增量,让演进的效果具体可见而非口头断言:

1. **应用契约 schema 签名** —— `release_items(… )` 前 → 后。
2. **打包的客户端 bundle** —— 总大小 + 内容签名 前 → 后。
3. **Neon schema** —— 发布迁移后 `release_board` 命名空间下 `information_schema`
   的列(新增列会被高亮)。

## 生命周期机制

- **预览** 跑在 active 版本的一次性内存副本上 —— 绝不写生产数据库。
- **发布** 先对 Neon 跑 scaffold 的 `db:migrate`,再 either 启动由 Neon 支撑的
  本地 Bun 运行时,or 通过 Vercel REST API 部署该版本(内容寻址两阶段上传 → 轮询
  READY → smoke `/api/health` + `/api/items`),并返回结构化回执。
- **应用** 把 draft 物化为 `versions/vN`;**回滚** 恢复上一个版本。
- 代理只能改 profile 声明的 **editable roots**;触碰 **protected** 路径(部署/
  基础设施/契约文件)的 draft 在 verify 之前就被拒绝。

## 交互构建循环

studio 支持"迭代到满意"的循环,而非一次性改动:

- **迭代 proposal** —— proposal 未 apply 时,再次让 agent 干活会**在同一草稿上叠加**
  修复/新增(不从 active 重来)。按钮显示 "Refine proposal";每轮都重过 scaffold 的
  `verify`。
- **预览草稿** —— 批准前用一次性内存副本预览待定 proposal("Preview draft")。
- **Neon 分支上的 Preview Data Rehearsal** —— "Rehearse on Neon branch" 从生产库
  copy-on-write 出一个 Neon 分支(真实数据),对**分支**跑草稿的迁移并据此预览。预演
  期间的写入只进分支,生产库不受影响;预览停止时分支被删除。数据从不回灌——只有验证
  过的 forward 迁移在 publish 时进入生产。需要 `NEON_API_KEY`(org 级 key 还需
  `NEON_PROJECT_ID`);Postgres 连接串本身驱动不了 Neon 控制平面。
- **apply / rollback** 后会停掉运行中的 preview,避免 UI 显示过期版本。

## 边界

框架应学习这里演练的 *形态* —— 生命周期词汇、scaffold verify 作为提案前门禁、
fail-closed 代理超时、结构化 publish/deploy 回执、schema/bundle 观察。它不应吸收
release-operations 业务域、Bun/Hono/React/Drizzle/Zod 技术栈,或把 Neon/Vercel
作为必选项。这些归 Host 与 profile 所有。
