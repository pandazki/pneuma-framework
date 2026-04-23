# weekly-linear-digest-real

把你这一周在 Linear 上作为 creator 动过的 issue，扔给 Claude Sonnet 4.6 总结成 markdown 周报。**真 API 调用，真花钱**（~$0.01/digest）。

演示 pneuma 的几条核心承诺端到端实化：

- **ADR-0021 `admin_delegated`**：app 装 Linear admin API key 一份；每个用户（pneuma 内）通过 `bind_linear_identity` 绑自己的 Linear user_id；后续 query 强制带 `creator_id == user.attrs.linear_user_id` 过滤，Builder 哪怕写错代码也泄露不了别人的 issue（fail-closed）
- **ADR-0018 Operation pipeline**：一个 `generate_weekly_digest` code handler 编排 Query + Transform + StorageService 原子完成
- **ADR-0003 Transform + prompt impl**：`linear_issues_to_digest` 的 impl 是 prompt，LLMProvider 被注入（OpenRouter），purity=pure 保证同输入不重复调 LLM
- **ADR-0019 WhereClause ref path**：`row.user_id.id == user.id` 这条行级 policy 让你只看到自己的 digest

## 准备

两个 key：

```sh
export LINEAR_API_KEY=lin_api_xxx           # Linear → Settings → API → Personal API keys
export OPENROUTER_API_KEY=sk-or-v1-xxx      # openrouter.ai → Keys
```

## 跑起来

```sh
bun run examples/weekly-linear-digest-real/run.ts
```

默认端口 8765、临时 workspace。要永久 workspace：

```sh
bun run examples/weekly-linear-digest-real/run.ts --workspace ~/.pneuma-digest --port 9000
```

浏览器打开 `http://127.0.0.1:8765/`：

1. 输 email → "Bind" → 服务端调 Linear API 查你这个 email 对应的 Linear user → 绑定
2. 点 "Generate this week's digest" → 服务端：
   - 跑 `list_my_recent_issues` query（AdapterInvoker 下推 `creator.id.eq` + `updatedAt.gte` 到 Linear GraphQL）
   - `LinearAdapterImpl.list()` 真调 `https://api.linear.app/graphql`
   - 把 issues 塞给 Sonnet 4.6（OpenRouter）
   - 把 markdown digest 存到 SQLite
   - Transform cache: 第二次同样的 issue 集不会再调 LLM
3. 下方列表显示所有历史 digest（`my_digests` query, row-level self filter）
4. 每条旁边的 Delete：destructive flow，弹框显示 impact disclosure（`"Will permanently delete digest generated at ..."`）→ 确认后带 `confirmed=true` 真删

## 模拟多人协作（你的第二个 Linear 账号）

因为 `admin_delegated` 设计目标是"一个 admin token 服务整个团队"，多账号场景很自然：

1. 用账号 A 绑定 → localStorage 里存 `pneuma:weekly-linear-digest:pneuma_user_id = email_A`
2. 另一个浏览器（或 incognito window）用账号 B 绑定 → 不同 localStorage
3. A 和 B 都能 `generate_weekly_digest`，但 **LLM 看到的 issue 不同**（pushdown 过滤按各自 `creator_id`）
4. A 的 `my_digests` 里看不到 B 的——行级 policy `row.user_id.id == user.id` 把 B 的 row 过滤掉了

看 `data/audit.ndjson` 可以一眼看到所有 Operation 调用的 trace，按 `user_id` 分开。

## 后端每一环验证

```sh
# Health
curl http://127.0.0.1:8765/api/health

# Bind (创建 / 更新 pneuma 的 users row + 存 linear_user_id 到 attrs)
curl -X POST http://127.0.0.1:8765/api/operations/bind_linear_identity \
  -H 'content-type: application/json' \
  -d '{"input":{"email":"you@company.com"}}'

# List my recent issues (admin_delegated adapter; 必须带 user header)
curl http://127.0.0.1:8765/api/operations/list_my_recent_issues \
  -H 'x-pneuma-user-id: you@company.com'

# Generate digest (真 LLM 调用, ~$0.01)
curl -X POST http://127.0.0.1:8765/api/operations/generate_weekly_digest \
  -H 'content-type: application/json' \
  -H 'x-pneuma-user-id: you@company.com' \
  -d '{"input":{}}'

# My digests (row-level filter)
curl http://127.0.0.1:8765/api/operations/my_digests \
  -H 'x-pneuma-user-id: you@company.com'

# Audit trail
curl 'http://127.0.0.1:8765/api/events?limit=20' \
  -H 'x-pneuma-user-id: you@company.com'

# Try to query linear_issues without bind → admin_delegated safety contract violated
# (uncomment 拷到一个没 bind 的 user id)
# curl http://127.0.0.1:8765/api/operations/list_my_recent_issues \
#   -H 'x-pneuma-user-id: nobody@nowhere'
# → 502 adapter_invocation_error "admin_delegated safety contract violated"
```

## 安全 / 成本备注

- `.env` / env 变量里的 key **不会进 git commit**（检查 `.gitignore` + 本 README 里的 key 都是 placeholder）
- Sonnet 4.6 via OpenRouter: ~$3/M input tokens + $15/M output。你 40 条 issue 1 次 digest ~10K input + 2K output ≈ $0.06/次。单人日常用便宜
- Transform `purity=pure` 会 cache：同一批 issue 生成同一个 digest 不会重复烧钱
- 生产场景真要 hosted: ADR-0025 "AI Usage Metering" 该做 → 现在只是 MVP，credit 管理没做
