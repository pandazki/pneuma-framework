# ADR-0009: 权限默认姿态 — Public 基线，按需收紧到 Restricted

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: permission, progressive-disclosure

---

## Context

权限系统的**默认姿态**（default posture）决定 app 在"无任何规则"状态下的行为。两种极端：

- **Secure by default**：无规则 = 拒绝一切。最安全但 Builder 初次搭建时什么都不能用
- **Open by default**：无规则 = 允许一切。Builder 顺利上手，但一旦上线就有泄露风险

Pandazki 在早期讨论里明确表态：

> 可以用一种开放权限作为基础实现

即 MVP 接受 "open by default" 的姿态，但权限系统的**类型结构必须从 day 1 就位**——后期切换到 "secure by default" 不能需要大改。

实现上还有另一个维度：**姿态是 per-resource 的还是 global 的？**

- Global：整个 app 要么全 public 要么全 restricted
- Per-resource：每个 resource（table / column / view / adapter...）独立决定默认姿态

Per-resource 让 Builder 能**渐进式收紧**：一开始全部 public，某天说"private_notes 列只能我自己看"——只把那一列设 restricted，其他保持 public。整个 app 不会因为上了权限系统而突然全线失能。

---

## Options considered

### Option A: Global posture，单一 flag
`app.posture: "public" | "restricted"`，影响所有 resource。

- **Pro**: 概念简单
- **Con**: 从 public 切到 restricted 时全部资源同时需要配规则，Builder 负担极大；"渐进式收紧"做不到

### Option B（最终选择）: Per-resource default_access，渐进式收紧
每个 resource 独立带 `default_access: "public" | "restricted"`。

- **Pro**: Builder 可按需逐个资源收紧；从来不用一刀切；新 resource 默认 public，不影响 app 现有流转
- **Con**: 配置面变大（每个 resource 一个字段）

### Option C: Secure by default（所有资源默认 restricted）
标准安全最佳实践。

- **Pro**: 不会因为漏写规则而泄露
- **Con**: MVP 搭建阻碍大；每个 table / view / column 都要显式写规则才能用；与 Pandazki 的"开放基线"意图冲突

---

## Decision

采用 **Option B**：每个 resource 独立 `default_access`。MVP 全部默认 `"public"`。

### default_access 的字段位置

```yaml
# App 级
app:
  default_access: public        # MVP 默认

# Table 级（继承 app）
tables:
  - id: bookmarks
    default_access: public      # 可省略，继承 app
    columns:
      - name: url
        type: { kind: primitive, of: URL }
        default_access: public  # 可省略，继承 table

      - name: private_notes
        type: { kind: primitive, of: RichText }
        default_access: restricted  # 显式收紧！

# View 级
views:
  - id: admin-dashboard
    default_access: restricted  # 需规则放行
```

### 决策规则

对于任意 `(ctx, action, resource)`：

```
1. 查所有 rules 命中 (action, resource)
2. 若存在 deny rule 命中 → deny  (MVP 暂不实现 deny，但 shape 预留)
3. 若存在 allow rule 命中 → allow
4. 若都没有命中 →
   - resource.default_access == "public"     → allow   (reason: default-public)
   - resource.default_access == "restricted" → deny    (reason: default-restricted-no-match)
```

### 典型渐进收紧路径

**阶段 1 — 初次搭建**：什么都不管，app 全 public，Builder 和 agent 自由堆功能。

**阶段 2 — 开始分享**：邀请同事。"我的笔记列别让他们看见"→ agent 把 `bookmarks.column:private_notes` 标 `restricted` + 加一条 self allow rule。

**阶段 3 — 进入生产**：上线给团队用。"除了 admin，别人不能改 lens 配置"→ agent 把 `lenses` table 标 `restricted` + 加 `role:admin can: write` rule，同时保留 `allow: anyone do: read`（继续可读）。

**阶段 4 — 严肃合规**：对外用户。"默认所有新建资源都 restricted，必须显式开放"→ 改 `app.default_access: restricted`（这是一个明确的、Builder 认知上的"门槛事件"）。

### Agent 的行为约定

Agent 在 policy 修改对话里，每次从 public 切到 restricted 要**主动提示后果**：

```
Builder: private_notes 列别让别人看见。
Agent:   好的，我把 bookmarks.private_notes 的默认访问改为 restricted，
         同时加一条规则允许该 row 的 owner 自己读。
         ⚠️  切换后，除了 owner 之外的任何用户读这一列都会被拒。
         确认？
```

这是权限管理的"安全气囊"——防止 agent 错误地把一个关键资源锁死而 Builder 没反应过来。

---

## Consequences

### Positive
- **MVP 上手零阻碍**——整个 app 全 public，Builder 不碰权限也能跑
- **渐进式收紧**是真实的——逐个资源收紧，不存在"上权限系统一刀切挂全线"的情况
- **Agent 的"切换提示"**让重要权限变更有显式 consent，防止误操作
- **向 restricted 迁移路径清晰**——全局或逐个资源收紧都支持

### Negative / Risks
- **忘记收紧的风险**——生产 app 一直跑 public，Builder 忘了某列敏感。缓解：framework 可提供"安全体检"——列出所有 public 资源 + 分析哪些可能有 PII（靠 agent 检查列名/内容）
- **不是 "secure by default"**——主流安全最佳实践是相反。但考虑到 pneuma 的用户画像（Builder 不是安全工程师、MVP 多为个人/小团队应用），这是有意识的权衡
- **default_access 的继承链**需要文档清楚——app → table → column 的三级继承

### Follow-ups
- **ADR-TBD: 安全体检能力**——scan app 全部 resource、列出高风险 public 配置、agent 给出收紧建议
- **ADR-TBD: Deny rules 支持**（MVP 不做，为未来留 shape）
- 进 `open-questions.md`：是否在 build → deploy 过渡时加 "安全体检" 作为强制门禁
