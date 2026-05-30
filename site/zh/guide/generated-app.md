# 2 · 设计 Generated App

*范围与栈已定——现在给它们划界。* [上一步](./scope-and-stack)定下了应用做什么、用什么栈
来建。这一步把它变成一个**有界的 `v0`**:一个完整、有用的应用,*外加*那份精确说明
agent 可改什么、不可改什么的契约。那份契约就是 profile,也是 agent 唯一不被允许编写的
产物。

![一个 scaffold project,分成 agent 可编辑的 writable roots 和不可碰的 protected paths,manifest 声明 verify 与 lifecycle 命令](/diagrams/profile-scaffold.png)

> 源码:`examples/clean-room-release-board`。这条边界的更深处理在
> [概念 · Profile 与 scaffold](/zh/concepts/profile-and-scaffold)。

## 完整的 v0,而非 mock

Generated App 是一个全栈 Release Operations Board:

| 层 | 选择 |
|---|---|
| 运行时 | Bun |
| API | Hono —— `/api/health`、`/api/summary`、`/api/items`、`/api/items/:id/transition`… |
| 契约 | Zod —— 唯一真源,推断进客户端 |
| 数据 | Drizzle schema,置于独立的 `release_board` Postgres 命名空间 |
| 云数据库 | Neon Postgres |
| 部署 | Vercel(Edge 函数 + 静态)与 Docker |
| UI | React —— 产品面,带本地基础组件 |

这套栈是**有意选择**,而非框架要求。要点在于它被*声明、测试、有界*——这样 agent 才能
在不破坏契约的前提下改它。

持久化由环境决定:设了 `DATABASE_URL` 就跑 Neon;否则跑内存仓储(预览 / 本地开发)。
两者行为一致,且都被测试覆盖。

## profile 契约

最重要的一个文件,是 Developer 编写、供 Host 消费的声明(`src/profile/stack-profile.ts`):

```ts
export const releaseBoardProfile = {
  generatedArtifact: {
    editableRoots: [
      "src/shared", "src/server/app.ts", "src/db/schema.ts",
      "src/db/neon-repository.ts", "src/client", "drizzle", "test",
    ],
    protectedRoots: [
      "api", "Dockerfile", "vercel.json", "package.json", "tsconfig.json",
      "src/db/client.ts", "src/db/migrate.ts", "src/profile", ".env",
    ],
    verifyCommand: ["bun", "run", "verify"],   // 提案前门禁
    migrateCommand: ["bun", "run", "db:migrate"],
    buildCommand: ["bun", "run", "build"],
    healthPath: "/api/health",
    itemsPath: "/api/items",
  },
  deployTargets: ["local", "docker", "vercel"],
};
```

两个想法做了全部的活:

- **editable roots** 是 agent 可改的(契约、schema、仓储、UI、迁移、测试)。
- **protected roots** 是它绝不可改的——部署、基础设施、契约文件。改了其一的 draft 在
  verify *之前*就被拒。

## `verify` 门禁

脚手架拥有它自己对"正确"的定义:

```json
{ "verify": "bun run typecheck && bun run test && bun run build" }
```

这一条命令就是 Host 用作**提案前门禁**的东西。框架从不判定你的应用是否有效——你的
脚手架来判。让 `verify` 诚实而快,因为每个 agent 回合都被它把关。

## schema 纪律

几条规则让演进既安全又可观察:

- **迁移是 additive & 幂等** —— `CREATE TABLE IF NOT EXISTS`、
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS`。没有 down-migration。
- **前向兼容的读** —— 仓储只 select 它认识的列,所以来自更新版本的多余列无害。
- **一个 schema 签名**(由契约派生、非手写)让 Host 能跨已应用版本观察数据模型的变化。

手里有了一个完整、有界的 `v0`,下一步是把它放到一个 Creation Host 背后。→
**[3 · 组装 Host](./creation-host)**
