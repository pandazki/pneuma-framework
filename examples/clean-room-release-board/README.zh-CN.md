# Release Operations Board —— Generated App 脚手架

一个完整的全栈 Generated Application profile:基于 **Bun + Hono + React +
Drizzle + Zod** 的发布运维看板,数据持久化到 **Neon Postgres**,可部署到
**Vercel** 或 **Docker**。

**英文版本:** [README.md](./README.md)

这是 M53「production profile」练习的净室重建中的 *Generated Application* 层。它
被设计为在 Creation Host(见 `../clean-room-release-host`)背后由代码代理演进,但
其本身也是一个完整、可运行的产品。

> 净室构建:目标(一个 Developer 编写的生产技术栈 profile,可被 Host 实例化、被
> 代理演进、并发布到真实数据库)是独立重新推导与实现的。技术栈是有意选择,而非
> 框架要求。

## 它是什么

发布经理的「甲板」:release item 在 `queued → in_progress → blocked → shipped`
之间流转,每条携带 优先级 / 风险 / 负责人 / SLA,每次状态变化都作为事件记录在
时间线上。

| 层 | 选择 |
|---|---|
| 运行时 | Bun |
| API | Hono(`/api/health`、`/api/summary`、`/api/items`、`/api/items/:id`、`/api/items/:id/transition`、`/api/events`) |
| 契约 | Zod(唯一真源,推断进客户端) |
| UI | React + Vite —— 深色编辑感「flight deck」 |
| 数据 | Drizzle schema,置于独立的 `release_board` Postgres 命名空间 |
| 云数据库 | Neon Postgres(发布数据) |
| 部署 | Vercel(Edge 函数 + 静态)与 Docker |

持久化由环境决定:设了 `DATABASE_URL` 就跑 Neon;否则跑内存仓储(预览 / 本地
开发)。两种实现行为一致,且都被测试覆盖。

## 运行

```bash
bun install                 # 在仓库根(依赖按 workspace 链接)
bun run --cwd examples/clean-room-release-board verify   # typecheck + 测试 + 构建
```

本地内存模式:

```bash
bun run --cwd examples/clean-room-release-board build
PORT=8801 bun run --cwd examples/clean-room-release-board start
# → http://127.0.0.1:8801
```

由 Neon 支撑的本地模式:

```bash
cp examples/clean-room-release-board/.env.example examples/clean-room-release-board/.env
# 在该 .env(已 gitignore)里设置 DATABASE_URL=...
bun run --cwd examples/clean-room-release-board db:migrate   # 幂等:建表 + seed
PORT=8801 bun run --cwd examples/clean-room-release-board start
```

`/api/health` 报告 `persistence: "neon" | "memory"` 和一个由契约派生的
`schemaSignature` —— Creation Host 会跨已应用版本观察该签名的变化。

## profile 契约

`src/profile/stack-profile.ts` 是 Developer 编写、供 Host 消费的声明:

- 代理可改的 **editable roots**(契约、schema、仓储、客户端、迁移、测试);
- draft 中绝不可改的 **protected roots**(`api/`、`Dockerfile`、`vercel.json`、
  `package.json`、`src/db/client.ts`、`src/db/migrate.ts`、`src/profile`、
  `.env*`);
- `verify` / `db:migrate` / `build` 命令与 health/items 路径。

## 边界

该脚手架只证明一种产品形态。Bun / Hono / React / Drizzle / Zod / Neon / Vercel
是 Developer 为 *此* profile 做的选择 —— 框架应让这样的 profile 成为可能、可
检视、可治理,而非规定技术栈。
