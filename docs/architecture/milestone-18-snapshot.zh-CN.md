# Milestone 18 Snapshot：Open-Ended App Pressure

**日期：** 2026-05-04
**状态：** 已闭合：完成 M18 实现、live browser E2E、聚焦回归测试和文档 review
**读者：** 对 Pneuma 没有预备知识的团队成员
**范围：** Creation Host 模型与 Operation-centered governance，在一个更不像 schema/list/workflow 的 generated app 里是否仍然成立。
**English version:** [Milestone 18 Snapshot](./milestone-18-snapshot.md)

## 摘要

M17 关闭了安全与架构接受门，同时明确了一件事：

> 如果 Pneuma 只在 schema-driven queue/list apps 里成立，现在做 release-candidate review 还太早。

M18 用一个新 example 回答这个压力：

```text
Creation Host
  -> Generated Application：Personal Focus Site
  -> Published Application：一个小型 maintainer home page
  -> dynamic module：基于 pandazki 公开 GitHub 信息的 attention module
```

这不是另一个 inbox、decision log 或 table workflow。End User 看到的是一个更自由的个人网站：freeform sections、style tokens、routes，以及动态 GitHub attention module。Builder 看到的仍然是同一套 Host workflow：create、preview、inspect、evolve、approve、publish、restart、rollback。

M18 的结论：

> 现在的四制品模型依然健康。M19 release-candidate review 前，不需要立刻发明新的 core primitive；但 open-ended UI definition 应该保留为后续 watch item。如果更多 example 重复出现同样模式，再考虑 `Surface / Route / ComponentTree` 这类 Stage 7 抽象。

## 浏览器证据

![M18 Personal Focus Site browser evidence](./assets/m18-open-ended-pressure-browser-evidence.png)

这张截图展示了 M18 最重要的团队同步形态：

- 左侧：真实的 Generated Application preview，是 personal site，不是表格/列表工具；
- 右侧：Creation Host controls 和 inspector；
- summary evidence：`app_shape: "open-ended-site"`、active release `pandazki-focus-site-v0`，以及来自 pandazki fixture 的 top GitHub attention items。

## M18 做了什么

新的 canonical example：

```text
examples/m18-open-ended-personal-focus-site/
```

它生成的 app 是 **Personal Focus Site / Maintainer Home**：

| Surface | End User 看到什么 |
|---|---|
| Hero | Pandazki 当前的工作身份和 focus |
| Project gallery | 公开 anchor：`pneuma-skills`、`nemori`、`leaf-playground`、`deepict` |
| Focus note | 一段叙事化 current-focus section |
| GitHub attention | 按个人相关性和维护压力排序的 top 3 issues/PRs |
| Contact | 简单的 follow-the-work section |

这个 app definition 不是 table-first。它包含：

```text
routes
sections
style tokens
dynamic modules
GitHub attention ranking config
```

GitHub module 刻意留在 example/profile 内。GitHub 没有被提升成 framework core semantics。

## 证明链路

```text
create personal-focus-site-bun-sqlite
  -> preview v0 open-ended Personal Focus Site
  -> inspect UI definition and GitHub attention evidence
  -> evolve one Builder intent into one approval proposal
  -> approve v1 changes across section copy, style tokens, and ranking config
  -> publish v0
  -> publish v1
  -> restart active runtime and verify health/site API
  -> rollback to v0
```

这件事重要，是因为同一个 Host control loop 现在覆盖了两类不同 app shape：

```text
schema-driven business apps   -> Knowledge Inbox, Team Decision Log
open-ended site app           -> Personal Focus Site
```

## GitHub Attention Fixture

M18 使用 `pandazki` 的 deterministic public-profile evidence，所以 demo 不依赖 private auth，也可以重复测试。

Profile fixture：

```text
login: pandazki
display name: Pandazki
profile: https://github.com/pandazki
public repos: >= 80
pinned repositories: pneuma-skills, nemori, leaf-playground, deepict
```

Top ranked attention items：

| Rank | Item | 为什么重要 |
|---|---|---|
| 1 | `pneuma-skills #184` — Clarify Webcraft plugin packaging boundary | assigned / high personal relevance |
| 2 | `nemori #57` — Review capture pipeline changes before next release | review pressure |
| 3 | `leaf-playground #32` — Investigate stale playground examples after dependency bump | maintenance pressure |

Live GitHub auth 不是 M18 的 claim。M18 证明的是 framework shape，不是 GitHub OAuth。

## v0 到 v1 改了什么

一个 Builder request：

```text
"Make GitHub attention more useful and highlight the top 3 things I should handle."
```

一个 proposal-level approval：

```text
rewrite hero and GitHub attention section copy
switch visual tone to editorial focus
rank GitHub attention by assignment, review request, mentions, priority labels, and recent activity
```

approval 后的 evolution 改了这些东西：

| Definition area | v0 | v1 |
|---|---|---|
| Sections | general GitHub signals | "What needs attention now" |
| Style tokens | calm personal site | editorial focus tone |
| GitHub ranking module | top 3 attention list | explicit signals：assigned, review requested, mentioned, priority label, recent activity |

这是 M18 的核心压力点：governed change 不只是加 column、View 或 query。它改变了 app 的 UI definition 和 dynamic module behavior。

## Live Browser 发现的问题

Live browser pass 发现了两个单元测试不容易暴露的 integration defects：

| 问题 | 修复 |
|---|---|
| 重复点击 **Create** 时，项目已存在会报错。 | Create 现在是 idempotent：profile 匹配时复用已有 generated app。 |
| Rollback 后 server rollout state 回到 v0，但 workbench iframe 仍停在 stale v1 preview URL。 | Rollback 后会同步 preview iframe 和 summary 到 active published URL。 |

这对 M19 很重要：Reference Creation Host 已经足够可测试，browser E2E 能发现真实 workflow defect。

## 验证报告

M18 聚焦测试：

```text
bun test examples/m18-open-ended-personal-focus-site

6 pass
0 fail
54 expect() calls
```

M16 回归：

```text
bun test examples/m16-reference-creation-host/run.test.ts

1 pass
0 fail
26 expect() calls
```

M18 smoke runner：

```text
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 0 --smoke-exit

created generated app: pandazki-focus-site
preview + GitHub attention: passed
inspect UI definition: passed
evolution proposal: awaiting approval
evolution approval: completed
publish v0: active pandazki-focus-site-v0
publish v1: active pandazki-focus-site-v1 previous pandazki-focus-site-v0
restart: healthy
rollback: active pandazki-focus-site-v0
smoke verification: passed
```

静态检查：

```text
bun run typecheck
exit 0

git diff --check
exit 0
```

Full-suite caveat 仍然保留：M18 使用的是聚焦的 M18/M16 coverage 加 typecheck。它不声称整个历史 Docker-heavy suite 在一次完整运行里全绿。

## 已经证明的事情

| 结论 | 证据 |
|---|---|
| 四制品模型能承载 non-table-first app | Personal Focus Site 走通 Creation Host -> Generated Application -> Published Application。 |
| Host workflow 不只是 Knowledge Inbox 专属 | M18 的 app surface 和 definition shape 都不同于 Knowledge Inbox / Team Decision Log。 |
| Open-ended UI definition 可以 inspect | Host 暴露 UI definition summary、routes、sections、style tokens、modules 和 GitHub attention evidence。 |
| 一个 Builder intent 可以治理 UI/module evolution | v1 在一个 approval 背后修改 section copy、style tokens、GitHub ranking config。 |
| External data 可以留在 profile-owned 层 | GitHub ranking 位于 M18 example/profile 内，没有进入 framework core。 |
| Publish/restart/rollback 仍然成立 | v0/v1 release state、active runtime restart、rollback 都被 tests 和 browser E2E 验证。 |

## 没有证明的事情

M18 不声称：

- 完整 Webflow/Webcraft editor；
- 任意 code generation；
- drag-and-drop editing；
- GitHub OAuth 或 private issue access；
- 通用 external-source adapter protocol；
- production notification ingestion；
- hosted secret management；
- production traffic switching；
- Published site 内的 Runtime Agent；
- hot reload 或 custom component distribution。

## 战略判断

M18 不是产品里程碑，而是 framework generalization gate。

M18 前，项目很容易被质疑过拟合到一种形态：

```text
table
  -> list view
  -> governed operation
  -> publish
```

M18 后，更强的结论是：

```text
app definition 可以包含 open-ended UI/module state，
并且同一套 Creation Host / approval / release workflow 仍然成立。
```

这不等于 open-ended creation 已经永远解决。它只说明：下一层缺失抽象还没有明显到足以阻塞 release-candidate review。如果 M19 或 post-RC dogfood 反复需要 route tree、component tree、custom code handler、custom view component，那应该成为 Stage 7 工作，而不是 pre-RC 的紧急重写。

## 下一个 milestone

M19 现在应该进入 **Release Candidate Review**。

M19 的问题是：

> 基于 M1-M18 的证据，pneuma-framework 是否已经可以 tag 一个给 Developer 构建 Creation Host 使用的 candidate release？

M19 默认不应该加大功能。它应该 review：

- project-goal alignment；
- API 和 package boundaries；
- docs navigation；
- getting-started / fresh-clone experience；
- M1-M18 example health；
- release tags 和 milestone provenance；
- open-ended pressure 有没有暴露缺失的 top-level primitive。

如果 M19 只发现 polish gaps，就 tag candidate，把 hot reload、Runtime Agent、custom code 和更广的 Pneuma 2.x dogfood 放到 post-RC milestones。如果它发现缺失 top-level abstraction，那才是真正的 RC blocker。
