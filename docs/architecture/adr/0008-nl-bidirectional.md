# ADR-0008: 权限 DSL 的双向 NL 能力 — evaluatePolicy 与 who_can

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: permission, agent, ai-native

---

## Context

[ADR-0007](./0007-permission-dsl.md) 提供了 NL → DSL 的生成路径（Builder 说中文、agent 生成 YAML triple）。但 Pandazki 在对话中补充了一个对称的需求：

> 权限表达式要有一种反向给用户解释的解码能力。例如：用户问谁才能看 xxx 数据啊，agent 应该有能力查询到对应目标的 predicate 表达式后，用自然语言解释给用户。

这把设计从"**NL → DSL**"升级到"**NL ↔ DSL**"——policy 系统从 "generate + enforce" 升级到 "generate + enforce + **explain**"。

这不是辅助功能，是权限系统的**一级能力**。它让：

- Builder 在 dialogue 里随时能问"谁能看 X？"而不用读 YAML
- Debug 能回答"为什么 Alice 看不到 Y？"
- 审计能回答"这个 app 里 admin 能做什么事？"

这三个查询本质上都是对 policies 的**反向查询**。API 要从 day 1 设计好。

---

## Options considered

### Option A: 只有单向 NL → DSL，反向解释让 agent 自己读 YAML
Agent 每次要回答"谁能看 X" 都得重新读完整个 policies.yaml，自己推理。

- **Pro**: Framework 不额外实现 API
- **Con**: Agent 推理 yaml 规则匹配容易出错（尤其规则多时）；无法保证答案跟 enforcement 一致；同一问题多次问答案可能不同

### Option B（最终选择）: Framework 原生提供反向查询 API — evaluatePolicy / who_can / explain
Agent 调 framework 的函数，函数保证 enforcement 与解释同源。

- **Pro**: 解释与执行完全一致；agent 只做 "调函数 + 翻译结果" 不做规则推理；可测可审
- **Con**: 需要设计查询 API；需要实现策略反向遍历（不是简单的 allow/deny 而是"哪些规则命中了"）

---

## Decision

### checkPolicy 升级为 evaluatePolicy

```typescript
// 简单版本（M0），仅返回决策
function checkPolicy(
  ctx: PermissionContext,
  action: Action,
  resource: Resource
): "allow" | "deny";

// 详细版本（day 1 就存在），返回决策 + 原因
function evaluatePolicy(
  ctx: PermissionContext,
  action: Action,
  resource: Resource
): PolicyDecision;

interface PolicyDecision {
  decision: "allow" | "deny";
  matched_rules: PolicyRule[];     // 命中的规则，按优先级降序
  reason:
    | "default-public"              // resource.default_access = "public" 且无 deny rule
    | "default-restricted-no-match" // resource.default_access = "restricted" 且无 allow rule 命中
    | "explicit-allow"              // 某 allow rule 命中
    | "explicit-deny";              // 某 deny rule 命中（MVP 暂不支持 deny override，但 shape 预留）
  evaluated_at: number;             // 时间戳，用于 audit
}
```

### 反向查询 who_can

```typescript
function who_can(
  action: Action,
  resource: Resource,
  options?: { tenantId?: string }
): WhoDecision;

interface WhoDecision {
  allowed: AllowedSubject[];        // 有能力执行此操作的 subjects 集合
  rules_used: PolicyRule[];         // 贡献到 allowed 的规则列表
}

interface AllowedSubject {
  subject_kind: "user" | "role" | "owner" | "self" | "anyone" | "anonymous";
  subject_value?: string;           // user:<id> 或 role:<name>
  conditional?: string;             // 如有 when 子句，人类可读的条件描述
}
```

**示例返回**：

查询 `who_can(read, table:bookmarks.row)`：

```typescript
{
  allowed: [
    { subject_kind: "self", conditional: "当 row.owner_id == user.id" },
    { subject_kind: "role", subject_value: "team", conditional: "当 row.visibility == 'shared'" },
  ],
  rules_used: [ /* 对应 YAML 里的两条规则 */ ],
}
```

### Agent-facing skill: `explain(ctx, action, resource)`

Build-phase agent 的 skill（[ADR-TBD Agent skills](./) 详述）里内置一条 `explain`：

```typescript
async function explain(
  ctx: PermissionContext,
  action: Action,
  resource: Resource,
  lang: "zh" | "en" = "zh"
): Promise<string>;
```

内部调 `evaluatePolicy` + 把 `matched_rules` 翻译为自然语言。典型 Builder 对话：

```
Builder: 为什么 alice 看不到 bookmark 3？
Agent:   （调 evaluatePolicy(alice_ctx, read, table:bookmarks.row{id=3}))
          决策结果：deny，原因 default-restricted-no-match
          表 bookmarks.row 的 default_access 是 restricted，
          目前只有一条 allow 规则：self 可读 when row.owner_id == user.id
          但 row 3 的 owner_id 是 bob_id（不等于 alice_id），所以 alice 被拒。

Builder: 那我怎么让 alice 也能看？
Agent:   你可以选择：
          (a) 让 alice 成为该 row 的 collaborator：加一条规则 `allow: role:collaborator do: read when: user.id in row.collaborators`，然后把 alice 加到 row 3 的 collaborators 字段
          (b) 让 alice 成为整个 table 的 viewer：加 `allow: user:alice_id do: read on: table:bookmarks`
          (c) 把整个表设 default_access: public（最宽松，不推荐）
          你想哪种？
```

这种对话是 pneuma 的核心差异化——**权限管理不是改 YAML，是对话**。

### NL → DSL 的生成端约束

Agent 在生成规则时，应强制使用 framework 提供的 JSON schema 作为 structured output 约束（不是让 LLM 自由写 YAML）。Schema 由 policy DSL 的封闭词汇表直接生成（subject / action / resource / predicate 都是 enum 或 pattern）。

- NL → DSL：LLM with schema → 结构化输出 → 验证 → 写入 policies.yaml
- DSL → NL：framework 提供 `ruleToNaturalLanguage(rule, lang)` 把一条规则翻译成可读中文/英文。LLM 帮助组合多条翻译为连贯段落

---

## Consequences

### Positive
- **权限管理真正变成对话**——Builder 不读 YAML，agent 调函数回答问题
- **答案与 enforcement 同源**——解释出的答案就是真实被执行的规则，不存在解释漂移
- **测试友好**——who_can / evaluatePolicy 是纯函数，可单元测
- **Debug 能力强**——每个 PolicyDecision 带 matched_rules，"为什么"永远能回溯

### Negative / Risks
- **evaluatePolicy 性能成本**——每次都要遍历匹配规则，相比 checkPolicy 的短路 allow 贵。需要策略：热路径用 checkPolicy（只要决策），需要解释时才走 evaluatePolicy
- **`ruleToNaturalLanguage` 的多语言**——MVP 先中英两种；实现上是模板字符串 + 规则字段填空
- **复杂 when 谓词的 NL 翻译**——简单 predicate 容易翻（"当 row.owner_id 等于 user.id"），复合 and/or 嵌套翻成可读中文需要小心

### Follow-ups
- **ADR-TBD: Agent skills 定义**（explain / who_can / build-phase 其他 skill）
- **ADR-TBD: PolicyDecision 的缓存策略**——相同 ctx/action/resource 在短时间内多次调用是否缓存
- 进 `open-questions.md`：是否允许 End User 查询权限解释（"为什么我看不到 X？"）；涉及 transparency vs security 权衡
