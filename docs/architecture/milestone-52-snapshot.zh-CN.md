# Milestone 52 快照

**Milestone:** M52, Production Generated App Profile Scaffold
**状态：** 进行中，scaffold baseline 已验证
**日期：** 2026-05-28
**英文版：** [milestone-52-snapshot.md](./milestone-52-snapshot.md)

## 决策

在继续串下一个端到端 Creation Host workflow 之前，我们需要先扮演 Alice 这个 Developer，把真实 generated-product 技术栈 profile 准备好。

M52 新增 `examples/production-generated-app-profile/`，作为 scaffold-first artifact：

```text
Bun + Hono + React + Drizzle + Zod
Neon Postgres provider boundary
Docker + Vercel deployment targets
React product UI with shadcn-style local primitives and lucide icons
```

这不改变 framework semantics。它证明 Developer 可以先定义一个具体 profile，并验证 checks、deployment shape、persistence boundary 和视觉质量，再允许 Build-phase Agent 在其上演进。

## 为什么重要

之前 Workflow App Studio 已经证明了受治理的 Builder/Agent loop。用户指出的是另一个风险：如果起始 scaffold 本身很弱，完整 workflow 就会退化成 demo path，而不是 product path。

所以 M52 往前走一步：

```text
Developer 选择技术栈
  -> Developer 准备 scaffold
  -> scaffold 证明 API / UI / data / deployment / visual baseline
  -> Host 才让 code agent 演进它
```

## 新增内容

新增 example：

```text
examples/production-generated-app-profile/
```

核心文件：

- `src/server/app.ts`：Hono API，包含 health、summary、item creation、transitions、event timeline。
- `src/client/App.tsx`：release-operations board 的 React 产品 UI。
- `src/client/components/ui/*`：本地 shadcn-style Button、Badge、Field/Input/Textarea primitives。
- `src/shared/contracts.ts`：client/server 共用 Zod schemas。
- `src/db/schema.ts`：Neon/Postgres 的 Drizzle schema。
- `drizzle/0000_initial_release_operations.sql`：显式 Postgres migration。
- `api/index.ts`：Vercel Hono entry。
- `Dockerfile`：Bun local server container target。
- `DESIGN_CONTRACT.md`：由 `impeccable` product register 指导的视觉基线。
- `src/profile/stack-profile.ts`：generated artifact contract、editable/protected roots、checks 和 design bans。
- `src/profile/scaffold-demos.ts`：Alice 编写的 product demo slices，用来在 agent pressure 前验证 scaffold。

Developer guide：

- [Production Generated App Profile](../developer/production-generated-app-profile.md)
- [中文版](../developer/production-generated-app-profile.zh-CN.md)

## Demo Slices

scaffold 现在有小而可独立验证的 slices：

1. **Minimum CRUD：** API validation、create form、local repository。
2. **Workflow depth：** risk/SLA/status vocabulary、transition actions、summary metrics、event timeline。
3. **Deployment shape：** Vercel entry、Docker target、Drizzle migration、Neon env boundary。
4. **Visual baseline：** 克制浅色产品 UI、本地 primitives、lucide icons、没有原生粗糙 select。
5. **Alice 的 demo stories：** critical security release、staging rehearsal、release-notes closeout 作为产品场景跑过 Hono + Zod + repository tests。

## 验证

Local verify：

```bash
bun run --cwd examples/production-generated-app-profile verify
```

结果：

```text
typecheck passed
14 tests passed
vite build passed
```

Docker build and runtime smoke：

```bash
docker build -t pneuma-production-generated-app-profile:local examples/production-generated-app-profile
docker run --rm -d --name pneuma-production-scaffold-smoke -p 8912:8911 pneuma-production-generated-app-profile:local
curl http://127.0.0.1:8912/api/health
```

观察结果：

```json
{"ok":true,"runtime":"bun","persistence":"memory-demo"}
```

Neon provider smoke：

```bash
DATABASE_URL="postgresql://..." bun run --cwd examples/production-generated-app-profile neon:smoke
```

观察结果：

```text
已通过 demo Neon database
```

credential 没有提交。

浏览器视觉检查：

```text
http://127.0.0.1:8911/
```

证据截图：

```text
/tmp/pneuma-m52-production-scaffold.png
```

## 边界 Review

Framework 应该吸收的经验：

- stack profiles 需要可执行 artifact contracts；
- scaffold quality 应该包含 deployment 和 visual evidence；
- Build-phase Agent 需要高质量起点，而不是在弱 demo 上直接产出 proposal；
- design contracts 可以是 Developer-authored guardrails。

Framework 不应该吸收：

- Hono、React、Neon、Drizzle、Docker 或 Vercel 作为 framework 强制选择；
- 产品 UI layout 或配色选择；
- provider credentials；
- 业务特定的 release-operations vocabulary。

## 剩余工作

M52 还不是完整端到端 Creation Host flow。下一步是把这个 profile 接回 Creation Host loop：

```text
Builder 选择 production profile
  -> Host 从 scaffold 创建 draft workspace
  -> code agent 修改真实 generated source
  -> checks and debug loop run
  -> passing draft becomes proposal
  -> Builder approves
  -> preview / publish / rollback prove the generated product
```

在这完成之前，更大的 goal 仍然是 active。
