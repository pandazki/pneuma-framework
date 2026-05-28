# Production Generated App Profile

**状态：** M52 scaffold-first 压力样本。
**英文版：** [production-generated-app-profile.md](./production-generated-app-profile.md)

这份文档描述一个 Developer 可以在 Creation Host 中提供的具体 Generated Application 技术栈 profile：

```text
Bun + Hono + React + Drizzle + Zod
持久化：Neon Postgres
部署目标：Docker 和 Vercel
UI 基线：React 产品型 UI，使用 shadcn 风格本地 primitives 和 lucide icons
```

这是 **Developer 自己定义的 profile**，不是 framework 强制规定的选型。Pneuma 应该让这类 profile 可治理、可验证，但不应该把 Hono、React、Neon、Drizzle、Vercel 或 Docker 吸收到 core semantics 里。

## 为什么需要它

M45-M51 已经证明 Creation Host 可以协调 code-agent edits、checks、proposal、approval、preview、publish 和 rollback。下一层风险不同：

> Developer 能不能先从一个真实产品技术栈 scaffold 出发，证明它能跑、能部署、视觉质量过关，然后再让 Build-phase Agent 演进它？

M52 用 scaffold-first slice 回答这个问题。profile 位于：

```text
examples/production-generated-app-profile/
```

## Artifact 契约

Generated artifact 包含：

| 区域 | 文件 |
|---|---|
| API | `src/server/app.ts`, `api/index.ts`, `src/server/local.ts` |
| UI | `src/client/App.tsx`, `src/client/styles.css`, 本地 `components/ui/*` |
| Data | `src/db/schema.ts`, `src/db/client.ts`, `drizzle/0000_initial_release_operations.sql` |
| Contracts | `src/shared/contracts.ts`, `src/profile/stack-profile.ts` |
| Deployment | `Dockerfile`, `.dockerignore`, `vercel.json`, `.env.example` |
| Tests | `test/api.test.ts`, `test/scaffold-demos.test.ts`, `test/deployment-shape.test.ts`, `test/design-contract.test.ts`, `test/profile.test.ts` |

profile 在 `src/profile/stack-profile.ts` 中声明这些边界：

- editable roots：产品源码、schema、shared contracts、migrations；
- protected roots：部署入口和 profile 配置；
- required files：最小 generated-app artifact surface；
- required checks：typecheck、API/UI tests、build，以及可选 Neon smoke。

## Demo Slices

这个 scaffold 在进入更大的 Creation Host 流程之前，先用几个小 demo slice 稳定自己：

1. **Minimum CRUD：** Hono API + Zod validation + React form。
2. **Workflow depth：** status transitions、risk/SLA vocabulary、summary metrics、event timeline。
3. **Deployment shape：** Docker runtime、Vercel API entry、Drizzle migration、Neon env boundary。
4. **Visual baseline：** 克制的浅色产品 UI、本地 shadcn-style primitives、lucide icons、没有原生粗糙下拉框。
5. **Developer-authored product stories：** `src/profile/scaffold-demos.ts` 定义 critical security release、staging rehearsal、release-notes closeout 三个场景，在任何 agent 接触 scaffold 前，先跑过 API 和 repository。

这些 demo 是为了稳定 scaffold，不是为了单独证明完整 Creation Host workflow。

## 验证

```bash
bun install
bun run --cwd examples/production-generated-app-profile verify
docker build -t pneuma-production-generated-app-profile:local examples/production-generated-app-profile
docker run --rm -p 8912:8911 pneuma-production-generated-app-profile:local
```

可选 Neon smoke：

```bash
DATABASE_URL="postgresql://..." bun run --cwd examples/production-generated-app-profile neon:smoke
```

不要提交真实 Neon credential。使用 runtime env injection、Vercel environment variables，或本地且被 ignore 的 `.env` 文件。

## 视觉质量基线

scaffold 包含 `DESIGN_CONTRACT.md`，因为 UI 质量也是 Developer contract 的一部分。如果 Builder 因为产品看起来像粗糙 demo 而无法理解价值，那么 framework evidence 也会变弱。

基线要求：

- 面向操作员阅读的浅色产品 UI；
- 克制的 teal / sky / slate 调色，并使用 OKLCH tokens；
- 清楚的信息密度和稳定控件；
- shadcn-style primitives 和 lucide icons；
- 不使用未样式化的原生 select 控件；
- 不使用 raw `#000` 或 `#fff` tokens；
- 不做装饰性 card nesting。

## Framework 边界

Framework 应该从这个 profile 学到：

- stack profiles 需要可执行 artifact contracts；
- generated apps 需要 deployment-shape evidence；
- design expectations 可以成为 scaffold 的一部分；
- Build-phase Agent 应该只修改声明过的 roots，并产出通过检查的 proposal。

Framework 不应该吸收：

- Hono、React、Drizzle、Neon、Vercel 或 Docker 作为强制选择；
- 产品 UI 决策；
- provider credentials；
- 业务领域里的 release workflow vocabulary。

## 下一步集成

scaffold 稳定之后，Creation Host 可以把它作为一个 profile 使用：

```text
Builder 选择 profile
  -> Host 把 scaffold 复制到 draft workspace
  -> code agent 修改声明过的 roots
  -> checks 执行
  -> 通过检查的 draft 进入 proposal
  -> Builder 批准
  -> Host apply、preview、publish，并且可以 rollback
```

下一步已经整理在 [Production Profile Host Example 中文版](./production-profile-host.zh-CN.md)。M52 只负责确认这个 profile 值得作为地基；M53 证明这个 profile 可以进入 Creation Host loop，执行真实 / deterministic code-agent draft work，通过 proposal 前检查，并通过 Neon + Vercel 发布。
