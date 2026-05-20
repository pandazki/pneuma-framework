# Product Creation Host

**状态：** M47 已关闭的产品型 Creation Host 压力示例
**English version:** [README.md](./README.md)

这个 example 不是下一版真实 Creation Host 产品。它是一个刻意收窄边界的压力样本，用 **Dev Board Builder** 验证 Host Kit 是否能支撑一个产品型 Builder 工作流，而不是依赖 scenario-only demo buttons 串流程。

现在它应该被视为已关闭的证据。下一步真实 Creation Host example 应该从干净的产品问题重新开始，而不是继续扩展这个 Dev Board 实验。

## 它证明了什么

M45 证明 Host Kit loop 可以在 canonical Reference Host 中跑通。M46 做出第一版产品表面。M47 把这个表面扩展到足够从外部视角 review 四层模型：

```text
Developer builds a Creation Host product
  -> Builder creates and evolves a Generated Application
  -> Builder previews and publishes a usable Published Application
  -> Builder shares a portable artifact
  -> another Builder forks, evolves, and publishes their own version
```

这个 example 证明了这些具体结论：

- Bob 可以创建、演进、预览、发布、分享、回滚和使用一个 Dev Board generated app。
- Charlie 可以 fork Bob 的 share artifact，演进一条独立 lineage，预览、发布并使用自己的版本。
- Preview 像 checkout：每次启动预览都会创建新的 sandbox data copy，结束预览后销毁。
- Runtime app interactions 足够真实，可以在 preview 和 published 模式中修改数据。
- 真实 opencode backend 可以针对受控 Generated App source 生成 governed proposal。
- Host 可以展示清楚的 proposal packet：原始需求、agent 理解、准确 proposal、重点改动、diff、确认、回执、preview、publish 和 rollback evidence。

## 受控源码边界

这个 example 刻意把 code-change surface 收窄到两个 generated source artifacts：

```text
projects/:appId/source/src/board.json
projects/:appId/source/src/runtime.json
projects/:appId/draft/src/board.json
projects/:appId/draft/src/runtime.json
```

`src/board.json` 描述 Dev Board definition：modules、fields、theme 和 sample data。

`src/runtime.json` 描述受控 runtime item actions。owner-edit 任务是关键验证：opencode 修改 `src/runtime.json` 加入 `edit_owner` action，Host 验证它，Builder approval 应用它，preview 展示它，publish carry forward 它，published app 最终接受 owner change。

这不是任意 React 或 TypeScript runtime editing。它是一条 Host-owned runtime extension lane，并且带有显式验证。这个边界才是这轮实验真正有价值的结论。

## 产品流程

1. 创建 **Engineering Dev Board**。
2. 先发布 v0，让 Builder 在演进前拥有真实 active release。
3. 用模糊自然语言请求 agent，例如添加 review queue，或允许 owner editing。
4. Agent 把请求转成理解说明、准确 proposal、重点改动和 diff。
5. Builder 确认后应用 guarded Code Change Lane proposal 和 data rehearsal。
6. 启动 preview。应用完全可交互，但只写入 preview data copy。
7. 将检查后的版本发布成 active Published Application。
8. 导出无 secret 的 share artifact。
9. 回滚 active release，证明 release rollback 和 artifact lineage 是两件事。
10. 将 artifact fork 成第二个 board，并重复同一条受治理的闭环。

产品刻意区分 Builder workbench 和 app runtime。Preview 和 published app route 都作为 app surface 打开；Builder workbench 负责 conversation、approval、evidence、publish、share 和 rollback。

## 启动

```bash
PORT=8896 bun run --cwd examples/product-creation-host serve
```

打开：

```text
http://127.0.0.1:8896/
```

UI 使用简单 Builder identity selector 代替生产登录。Authentication、provider OAuth 和 hosted authorization 都不在这个 example 范围内。

## 真实 opencode smoke

运行 live code-agent path：

```bash
PNEUMA_PRODUCT_HOST_WORKSPACE=/tmp/pneuma-product-host-real-agent \
PNEUMA_KEEP_PRODUCT_HOST_WORKSPACE=1 \
bun run --cwd examples/product-creation-host real-agent
```

默认 live model：

```text
openrouter/anthropic/claude-opus-4.7
```

real-agent path 验证的是受控 source changes，而不是 demo-only state mutation。当前覆盖的行为包括：

- 通过 `src/board.json` 添加 generated app modules；
- 通过 `src/runtime.json` 添加 owner-edit runtime action；
- 拒绝不受支持的 draft file changes；
- 将已接受的 runtime extension 带入 preview 和 published app behavior。

## 测试

```bash
bun test ./examples/product-creation-host/product-host.test.ts ./examples/product-creation-host/ui-state.test.ts ./examples/product-creation-host/dev-board-domain.test.ts ./examples/product-creation-host/server-preview.test.ts
```

最后一次 close-out 运行通过了完整 example package suite：

```text
14 pass / 0 fail
```

## 架构形状

```text
Bun server
  -> ProductHostStore (SQLite)
  -> Generated source: source/src/board.json + source/src/runtime.json
  -> Draft workspace: draft/src/board.json + draft/src/runtime.json
  -> Host Kit code-change / approval / rehearsal / publish loop
  -> Runtime extension validation for app-specific item actions
  -> Preview route: /preview/:appId?preview_id=:sandboxId
  -> Preview sandbox data copy: per Start preview, end/publish/rollback/TTL 后销毁
  -> Published route: /app/:appId
  -> Share artifact: no secrets, source snapshot + runtime extension + provider requirements
```

## 边界 Review

更像 framework 或 Host Kit 应拥有的部分：

- controlled generated artifacts 的 source-boundary validation；
- 绑定 request、diff、highlights、approval、receipt 的 proposal packets；
- 发布前的 preview data copy semantics；
- release rollout、restart、rollback 和 lineage projections；
- Host-owned generated source 的可复用 guardrail hooks。

应继续由 Host 拥有的部分：

- Dev Board domain model 和 runtime UI；
- `src/board.json` 和 `src/runtime.json` schemas；
- owner editing 这类 app-specific item actions；
- share/fork 产品文案和视觉设计；
- local SQLite workspace layout 和 Bun process choices。

## 它不声称什么

M47 不声称 production login、cloud deployment、真实 provider OAuth、marketplace transport、广义 app generation，或任意 generated-app code editing。

它声称的是：Host Kit 足够支撑一个产品型 Creation Host 压力样本。Builder 可以通过受控 Build-phase Agent loop 创建、治理、预览、发布、回滚、使用、分享和 fork Generated Application。

下一步：从干净产品 brief 开始一个新的真实 Creation Host example，把这个实验作为证据，而不是作为产品地基继续扩展。
