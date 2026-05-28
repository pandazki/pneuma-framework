# Production Profile Host Example

**状态：** M53 产品型 Creation Host example。
**英文版：** [production-profile-host.md](./production-profile-host.md)

这份文档解释下面这一组成对 example：

```text
examples/production-generated-app-profile/
examples/production-profile-host/
```

它们刻意分成两层：

- `production-generated-app-profile` 是 Alice 作为 Developer 预先准备的 Generated Application scaffold。
- `production-profile-host` 是 Creation Host harness，让 Bob 可以 create、preview、evolve、approve、publish、rollback 这个 scaffold 产出的 Generated Application。

目标不是把 Bun、Hono、React、Drizzle、Neon、Vercel 或 Codex 变成 framework 强制选型。目标是证明：Developer 可以准备一个真实产品技术栈，把它交给 Creation Host，让真实 code agent 在 guardrails 后面演进它，并发布一个由真实数据库支撑的真实 app。

## 为什么这个 example 重要

早期 example 分别证明了更窄的能力：governed definition rows、Builder approval、code-change lanes、release rollout state、Host Kit、agent debug loops。

这个 example 把这些能力组合成更接近真实产品的路径：

```text
Developer 准备 production stack profile
  -> Builder 从这个 profile 创建完整 v0 app
  -> Builder 可以立刻 preview 或 publish v0
  -> Builder 请求真实 code agent 做产品演进
  -> Host 在展示 proposal 前验证 generated app
  -> Builder 批准一个已检查 proposal
  -> Host apply vNext、preview、publish 到 Vercel，并且可以 rollback
```

它比小 mock 更有代表性：

- Generated App 有真实 full-stack shape；
- Creation Host 和 Published App 是两个不同产品表面；
- preview 是 disposable，不写生产数据；
- publish 会执行 migration 和 cloud deployment；
- Neon 是 Published App 的真实数据源；
- Vercel deployment 返回结构化 evidence；
- Codex app-server 可以真实改源码，但只能在 scaffold boundary 内改；
- Host 显式保留 proposal、approval、verification、publish、rollback。

## 产品故事

Alice 是 Developer。她希望自己的 Creation Host 提供一个 “Production Generated App” profile。

Bob 是 Builder。他打开 Host，创建一个 **Release Operations Board**。v0 app 已经完整可用。Bob 可以本地 preview，也可以 publish，或者请求 Build-phase Agent 演进它。

End User 打开 Published Application。他不需要理解 build loop，只会看到一个正常的 release-operations 产品：queue、evidence、data entry、transitions，以及 production database。

## 技术栈

### Generated Application

Generated product profile 使用：

| 层 | 选型 | 目的 |
|---|---|---|
| Runtime | Bun | local、Docker、Vercel-oriented flows 共用一个 TypeScript runtime。 |
| API | Hono | 提供 health、summary、items、events、transitions 的小型 typed HTTP surface。 |
| UI | React | 产品型 UI，使用本地 shadcn-style primitives 和 lucide icons。 |
| Contracts | Zod | 共享 API validation 和 TypeScript inference。 |
| Data | Drizzle + Postgres schema | 显式 relational schema 和 migration artifact。 |
| Cloud DB | Neon Postgres | Published Application 的真实远程持久化。 |
| Deploy | Vercel + Docker target | 两个具体部署形态，但都不是 framework primitive。 |
| Design | `DESIGN_CONTRACT.md` + OKLCH CSS | Developer 为 generated apps 设定的视觉质量基线。 |

重点不是这套栈本身。重点是这套栈被声明、测试，并被限制在 **profile contract** 内。

### Creation Host

Host 使用：

| 层 | 选型 | 目的 |
|---|---|---|
| Host runtime | Bun TypeScript server | 小型本地 Creation Host control plane。 |
| Host UI | React | Builder-facing studio，用于 lifecycle、request、proposal、trace 和 evidence。 |
| Code agent | Codex app-server，deterministic fallback | 真实 generated-source edits，以及不依赖 live AI 的稳定测试。 |
| Preview | 本地 disposable runtime copy | Builder inspection 的安全 sandbox。 |
| Publish | Vercel REST API adapter | Host-owned cloud deployment lane，返回 deployment receipt。 |
| Published data | Neon Postgres | Published App 使用的远程 production database。 |
| Tests | Bun tests + browser E2E | 覆盖 copy、draft、verify、proposal、apply、preview、publish、rollback。 |

## 它是如何一点点做出来的

这个 example 分两阶段完成。

### 阶段 1：先做好 Generated App Profile

scaffold 位于：

```text
examples/production-generated-app-profile/
```

在接入 Host 之前，它先作为一个完整 app 被验证：

1. 定义 release-operations 领域：item、event、priority、status、risk、SLA、summary。
2. 实现 Hono API routes 和 Zod validation。
3. 增加 memory repository，服务 local/preview mode。
4. 增加 Drizzle schema 和 Neon/Postgres migration。
5. 使用本地 primitives 做 React 产品 UI，而不是原生粗糙控件。
6. 增加 Docker 和 Vercel entrypoints。
7. 增加 verification tests 和 `bun run verify`。
8. 在 stack profile 中记录 protected files 和 editable product roots。

这是 Developer 的工作。Alice 先证明 scaffold 有价值，然后才让 agent 接触它。

### 阶段 2：把 Profile 放进 Creation Host

Host 位于：

```text
examples/production-profile-host/
```

Host 把 scaffold 包进受治理的 lifecycle：

```text
Create from profile
  -> 把 scaffold 复制进 Host workspace，成为 source v0
  -> 把 source 复制进 versions/v0
  -> 从 disposable runtime copy preview v0
  -> 本地 publish v0，或通过 Vercel publish v0
  -> 准备 draft workspace
  -> 运行 deterministic 或 Codex code-agent lane
  -> 运行 generated app verify
  -> checks 通过后才 build proposal
  -> Builder approval
  -> apply draft as vNext
  -> publish active version
  -> rollback 到 previous version
```

Host 并不要求 agent “从零做一个 app”。从 profile 创建后，Bob 已经得到完整 v0 app。Agent 工作是可选演进。

## 它验证了哪些 framework 想法

这个 example 没有用到所有 framework primitive，但验证了 post-RC 的关键形态。

| Framework 想法 | example 如何使用 |
|---|---|
| 四层模型 | Framework -> Creation Host -> Generated Application -> Published Application 始终可见。 |
| Scaffold Project boundary | agent 修改的是从 Developer-authored scaffold 复制出来的 draft workspace。 |
| Code Change Lane | Host 把 source edits 当成 governed draft changes，而不是直接改 production。 |
| Agent Debug Loop | proposal 前执行 draft verification；timeout 或 failed checks 不会被当成成功。 |
| Build Change Assurance | 只有 generated-app verification、changed paths、runtime evidence 都成立，proposal 才出现。 |
| Preview / publish separation | preview 使用 disposable local data；publish 使用 active version 和真实 persistence target。 |
| Release / rollback | versions 以 `v0`、`v1`、`v2` 物化；rollback 把 previous version 复制回 source。 |
| Host-owned provider adapter | Vercel deployment 是 Host example 里的 adapter，不是 framework requirement。 |
| Runtime / data governance pressure | Published App 使用 Neon 作为数据源；demo rows 是真实 rows，不是 request-time fallback。 |

## 数据模型和 Seed 纪律

Generated App 拥有两张业务表：

```text
release_items
release_events
```

本地 preview 可以使用 memory repository 和 demo data，因为 preview 是 disposable。

对于 Neon/Vercel 录屏和更真实的运行方式，数据库应该是 source of truth：

1. 对 Neon 执行 migrations。
2. 把初始业务行插入 `release_items` 和 `release_events`。
3. Published Application 不应该依赖 request-time auto seed 或 fallback data。
4. 用户操作应该创建和流转 Neon 里的真实 rows。

这个区别很重要。“把 demo data 作为真实初始数据写入数据库”是可以接受的；“runtime 在 production table 为空时静默造数据”会隐藏 provider boundary，让 example 变弱。

## 云端发布流程

Host 以 Vercel API mode 运行时：

```text
Publish runtime
  -> 对 Neon 执行 generated-app db:migrate
  -> 收集 active version files
  -> 上传 Vercel missing file blobs
  -> 通过 Vercel REST API 创建 production deployment
  -> 等待 READY
  -> smoke /api/health
  -> smoke /api/items
  -> 返回 deployment id、URL、file count、READY state 作为 evidence
```

这个 adapter 由 Host 负责。Framework 应该学习 “structured publish receipt” 的形状，但不应该把 Vercel 写死成唯一部署目标。

## UI 分层

两个浏览器表面故意使用不同视觉语言。

| 表面 | 设计意图 |
|---|---|
| Builder / Host UI | Studio / control-plane：lifecycle controls、proposal、trace、profile facts、publish evidence。 |
| Published App UI | End-user product：release queue、metrics、selected work、timeline、create form。 |

这不是装饰问题。它帮助观看者理解自己正在看哪一层：

- Builder 在创造和治理 app。
- End User 在使用 app。

## 如何运行

安装依赖：

```bash
bun install
```

验证 generated app profile：

```bash
bun run --cwd examples/production-generated-app-profile verify
```

用 deterministic agent 和本地 publish 运行 Host：

```bash
bun run --cwd examples/production-profile-host build
PORT=8900 bun run --cwd examples/production-profile-host serve
```

用真实 Codex app-server 运行 Host：

```bash
PORT=8900 \
PNEUMA_PRODUCTION_PROFILE_AGENT=codex-app-server \
  bun run --cwd examples/production-profile-host serve
```

用 Neon + Vercel publish 运行 Host：

```bash
PNEUMA_PRODUCTION_PROFILE_DATABASE_URL="$DATABASE_URL" \
PNEUMA_VERCEL_TOKEN="$VERCEL_TOKEN" \
PNEUMA_VERCEL_PROJECT=production-generated-app-profile \
PNEUMA_PRODUCTION_PROFILE_DEPLOY=vercel-api \
PNEUMA_PRODUCTION_PROFILE_AGENT=codex-app-server \
PORT=8900 \
  bun run --cwd examples/production-profile-host serve
```

打开：

```text
http://127.0.0.1:8900/
```

不要提交 credentials。使用本地 env injection、secret manager 或平台环境变量。

## 推荐录屏流程

用于团队 demo 或录屏时：

1. 用 `PNEUMA_PRODUCTION_PROFILE_DEPLOY=vercel-api`、Neon URL、Vercel token 启动 Host。
2. 确保 Neon 的 `release_items` 和 `release_events` 中有真实 seed rows。
3. 打开 Builder UI。
4. 点击 `Create from profile`。
5. 点击 `Start preview`，打开 preview 展示完整 v0。
6. 请求 code agent 做一次 evolution。
7. 观察 trace 和 proposal。
8. 批准并 apply。
9. 点击 publish runtime。
10. 打开 Vercel URL，展示 Published App 正在使用 Neon 数据。
11. 回到 Host，展示 rollback 可用。

讲述主线可以是：

```text
Alice 提供了 profile。
Bob 从 profile 创建了完整 app。
agent 只在 Bob 提出需求后演进 app。
Host 在请求批准前检查 draft。
publish 产出真实 Vercel app，并由 Neon 支撑数据。
rollback 仍然是 Host 控制的 lifecycle action。
```

## 它应该教给 framework 什么

这个 example 支持几个 framework 判断：

- 真实 Creation Host 需要完整 profile，而不是让 agent 先从空白开始；
- code-agent 工作应该发生在 draft workspace，而不是直接改 active app；
- proposal 的语义是“已检查、可供人类决策”，不是“agent 猜了一个东西”；
- cloud publish 应该返回结构化 receipts；
- preview data 和 production data 必须分离；
- Builder surface 和 Published App surface 的视觉差异会显著帮助理解；
- provider choices 应保持 Host/profile concern，直到重复模式足够强，才考虑提升。

它也暴露了剩余生产问题：

- Vercel 和 Neon 仍然是 reference choices，不是通用 provider abstraction；
- credential handling 在 example 中仍是 process-level，不是 hosted secret product；
- publish 可以接受 stop-and-deploy，不追求 zero-downtime；
- multi-user auth 在这个 slice 中刻意不做；
- example 证明的是一个 product profile，不是任意 app generation。

## 边界

Framework 应该吸收：

- lifecycle vocabulary；
- scaffold boundary validation；
- code-agent attempt / debug-loop shape；
- proposal 和 approval semantics；
- publish evidence 和 rollback evidence contracts。

Framework 不应该吸收：

- Release Operations 业务领域；
- Bun/Hono/React/Drizzle/Zod 作为强制技术栈；
- Neon 或 Vercel credentials；
- 这个 Host UI 的具体样子；
- 这个 Generated App UI 的具体样子。

这个 example 的核心结论是：framework 应该让这类 Creation Host 可以被构建、被检查、被治理，同时保留 Alice 对技术栈和产品形态的选择权。
