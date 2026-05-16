# Product Creation Host

**状态：** M46 产品型 Creation Host 压力示例
**English version:** [README.md](./README.md)

这个 example 不是靠 scenario button 串起来的 milestone demo。它是一个 Developer 真的可能交付给 Builder 使用的小产品：**Dev Board Builder**。

这个产品让 Builder 创建一个本地开发看板，请 Build-phase Agent 演进它，把 proposal 交给 reviewer approval，预览生成应用，发布应用，导出 share artifact，并让另一个 Builder fork 后继续演进自己的版本。

## 它证明什么

M45 证明了 Host Kit loop 可以在 canonical Reference Host 里跑通。M46 证明下一层产品形态：

```text
Developer builds a Creation Host product
  -> Builder creates and evolves a Generated Application
  -> Builder publishes a usable Published Application
  -> Builder shares a portable artifact
  -> another Builder forks, evolves, and publishes their own version
```

Generated app 是 Dev Board，包含 watchlist、review queue、release checklist、GitHub attention、priority lane、daily plan、notes 等模块。

## 启动

```bash
PORT=8896 bun run --cwd examples/product-creation-host serve
```

打开：

```text
http://127.0.0.1:8896/
```

UI 用 role selector 代替登录：

- `user:bob` 创建并发布第一个 board。
- `role:reviewer` 审批 source/data-risk changes。
- `user:charlie` 从 share artifact fork 并发布修改后的 board。
- `user:end-user` 代表 Published Application 的使用者。

## 产品流程

1. 创建 **Engineering Dev Board**。
2. 请求 agent 添加 review queue。
3. Builder self-approval 会被记录，但被治理规则拦住。
4. Reviewer approval 触发 Code Change Lane proposal apply 和 data rehearsal。
5. 预览 generated app。
6. 发布为 active version。
7. 导出无 secret 的 share artifact。
8. 将 artifact fork 成 **Charlie's Dev Board**。
9. 请求 agent 添加 GitHub attention 和 priority lane。
10. 走同一条 reviewer approval。
11. 预览并发布 Charlie 的 fork。
12. 打开 `/app/charlie-s-dev-board`，以 End User 视角新增一条可见 follow-up item。

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

real-agent smoke 会构建两个不同的 board：

- 带 `review_queue` 的 Engineering Dev Board。
- 带 `priority_lane` 和 `github_attention` 的 Personal Focus Dev Board。

code agent 只写 draft `src/board.json`。Host 仍然拥有 verification、review packet、approval、guarded apply、data rehearsal、preview、publish 和 evidence。

## 测试

```bash
bun test examples/product-creation-host/product-host.test.ts examples/product-creation-host/ui-state.test.ts
```

## 架构形状

```text
Bun server
  -> ProductHostStore (SQLite)
  -> Scaffold Project source: projects/:appId/source/src/board.json
  -> Draft workspace: projects/:appId/draft
  -> Host Kit code-change / approval / rehearsal / publish loop
  -> Preview route: /preview/:appId
  -> Published route: /app/:appId
  -> Share artifact: no secrets, source snapshot + definition + provider requirements
```

## 它不声称什么

M46 不声称生产登录、生产隔离、云部署、真实 provider OAuth、marketplace transport 或任意 app generation。

它声称的是：Host Kit 已经足够支撑一个产品型 Creation Host。Builder 可以创建、治理、发布、使用、分享、fork Generated Application，而不是依赖 demo-only 控制按钮。
