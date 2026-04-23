# ai-bookmarks-real

M4 ai-bookmarks 的 core-domain 重构版本，用 pneuma 的 8 primitives 声明式搭出同样的业务流程：

**URL → Jina Reader 抓正文 → N 个 lens × Sonnet 4.6 解读 → 存储 → 浏览**

演示了这些承诺端到端真实化：

- **ADR-0018 Operation pipeline**：所有 HTTP 端点都是 Operation，policy / impact / audit 自动
- **ADR-0003 Transform + prompt impl + cache**：
  - `fetch_readable` 是 code impl，purity=pure-with-ttl(3600s)，同 URL 1 小时内不重复 fetch
  - `interpret_with_lens` 是 prompt impl，purity=pure，同 `(body, lens_prompt)` 输入不重调 LLM
- **ADR-0002 ref-row cascade**：删 bookmark 级联删 interpretations；删 lens 级联删该 lens 产生的 interpretation（通过 `cascade_on_target_delete: true` flag）
- **ADR-0018 destructive gate**：删 bookmark / lens 先返回 428 + impact disclosure（"will delete N interpretations"），confirmed=true 才执行
- **ADR-0019 input ValueRef**（本次新加）：`list_bookmark_interpretations` query filter 用 `row.bookmark_id.id == input.bookmark_id`

## 准备

```sh
export OPENROUTER_API_KEY=sk-or-v1-xxx      # openrouter.ai → Keys
```

URL 抓取用 Jina Reader (`https://r.jina.ai/<url>`)，**不需要 key**。

## 跑起来

```sh
bun run examples/ai-bookmarks-real/run.ts
```

默认端口 8765、临时 workspace。想持久化数据：

```sh
bun run examples/ai-bookmarks-real/run.ts --workspace ~/.pneuma-bookmarks --port 9000
```

浏览器打开 `http://127.0.0.1:8765/`：

- 第一次启动：服务端从 `scaffold/lenses.json` seed 3 条默认 lens（technical-depth / personal-relevance / skimmable-summary）
- 输一个 URL → Add → 等 20-50s（Jina 抓 + 3 次 Sonnet 4.6）→ 3 条 interpretation 出现在该 bookmark 下
- 可以加 / 删 lens；下次新 bookmark 会用新 lens 集合
- 删 lens 会弹 impact disclosure（"will delete N related interpretations"）

## 跟 M4 ai-bookmarks 的差别

| 维度 | M4 ai-bookmarks | ai-bookmarks-core-domain |
|---|---|---|
| 路由 | 手写 `app.fetch(req)` 里 if-else | 所有端点自动从 Operation 派生 |
| 权限 / 审计 | 没做 | 每个 Operation 自动 policy check + emit audit event |
| Destructive confirm | 没做 | 框架级 428 + impact disclosure |
| LLM cache | 没做（每次全新调） | Transform purity 保证同输入不重调 |
| Lens 存储 | JSON 文件 runtime-watch | DB row，Operation 增删改 |
| Embedding / graph | 有 | **推后**（值得独立做） |

这次重构主要是**证明 ad-hoc 业务代码可以无损迁移到 core-domain 声明式**——换来的是统一的 policy、audit、cache、destructive、持久化。

## 玩玩建议

- 塞几个自己最近读的 URL，看 3 个 lens 各自怎么读同一篇文章
- 加一个自己的 lens 试试（比如 "Anti-hype · 唱反调"：挑文章里没说的 trade-off / 被夸大的 claim）
- 删一个 lens 观察 impact disclosure
- 停 server 再起，看数据还在（SQLite 在 `workspace/data/rows.db`）
- curl `/api/events` 看审计流，每次 add_bookmark 都能看到 agent.started + agent.completed

## 后续可能扩的

- **embedding + graph** 回来：给 interpretation 或 bookmark 本体加 `{ kind: "vector", dim: 1536 }` cell，用 `embed_text` Transform 生成，相似度连边。这需要 vector CellType + 索引，是独立工作量
- **ai-bookmarks 原版删掉 / 归档**：等这个版本足够稳定之后，M4 的那版就是历史包袱。保留做对比参考
