# Milestone 25 快照：Alice Creation Host Prototype

**状态：** 已闭合。已完成 Developer-first 可运行 prototype、M25 model/server 测试、浏览器验证、截图 evidence、roadmap/docs 更新。

**日期：** 2026-05-06

**英文版：** [milestone-25-snapshot.md](./milestone-25-snapshot.md)

## 为什么需要 M25

M24 已经证明 post-M23 contract set 可以把 mawidget / dev-board 故事变成可执行 contract pressure：

```text
Alice author 一个 Creation Host contract set。
Bob 创建 dev-board。
Charlie 用自己的 credentials 安装 Bob 的 artifact。
Dave fork 到不同 provider profile。
```

剩下的缺口不是另一个 primitive，而是 Developer 的认知路径。

对一个新 Developer 来说，最难的不是一上来理解 Charlie 为什么可以 install，或者 Dave fork 为什么必须移除 Apple Notes。更早的问题是：

```text
我是在写 app 吗？
我是在写 app builder 吗？
framework 到底负责什么？
我的 Creation Host 负责什么？
Builder 生成出来的 app 负责什么？
Build Agent 应该知道什么，又必须不能做什么 provider 特化？
```

M25 把这条路径做成可运行 prototype，让 RC 分享示例从 Alice 的 mental model 开始，而不是从 Bob 已经完成的 app 开始。

## 改了什么

### 1. Developer-First Prototype Example

M25 增加：

```text
examples/m25-alice-creation-host-prototype/
```

启动方式：

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run examples/m25-alice-creation-host-prototype/run.ts --port 8886
```

打开：

```text
http://127.0.0.1:8886/
```

它是 Alice 的 workbench，不是 generated app UI。主轴是一条 10 步 Developer cognition path：

```text
1. 命名四层产品边界
2. 选择 Host 暴露给 Builder 的 profile
3. 准备 Bob 的 Build Agent Package
4. 声明 provider capability contracts
5. 创建 Bob 的 dev-board Generated Application
6. 跑一次 Builder agent session
7. 准备 portable share artifact
8. 验证 Charlie install
9. 验证 Dave fork 到 remote profile
10. 形成 RC 判断
```

![M25 Alice Creation Host Prototype](./assets/m25-alice-creation-host-prototype.png)

### 2. Alice 的认知路径现在可执行

model 为每个 stage 暴露：

- `developer_question`;
- `mental_shift`;
- `alice_action`;
- `framework_contracts`;
- `evidence_ids`;
- `inspector_focus`.

核心结构是有意设计的：

```text
Developer cognition path
  -> Host contract decisions
  -> Builder session constraints
  -> share/fork evidence
  -> RC judgment
```

这样 example 不会退化成一个只有内部人看得懂的 story page，也不会只展示“故事为什么这么发展”，而忘记解释“为什么需要这个故事”。

### 3. M24 Pressure Evidence 被复用，但不进入 Core

M25 model 从下面位置 import M24 pressure story：

```text
examples/m24-creation-host-rc-pressure-walkthrough/pressure-story.ts
```

然后在 prototype 内重新评估同一组 contract health：

```text
Build Agent Package validator
Provider Capability Matrix validator
Host Authoring Kit cross-contract validator
Share Artifact validator
Sharing Governance Bundle validator
M24 RC pressure evaluator
```

这保持了我们已经修正过的边界：pressure-story 概念留在 examples/tests。core 导出 framework contracts 和 validators，不导出 demo scenario builders。

### 4. Generated App 出现了，但不是主角

UI 会展示 Bob 的 `dev-board@v3`，包含：

- GitHub issues / PRs；
- Linear project work；
- GitHub CI attention；
- Apple Notes context。

但这个 preview 不是第一个 mental model。它是 Alice 已经理解下面边界之后，第 5 步的 evidence：

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

这是 M25 最关键的调整：先解释 Creation Host 为什么存在，再解释 generated app 如何演进。

## M25 证明了什么

M25 证明 pre-RC 材料可以从 Developer 的 outside-in path 来讲清楚：

```text
Alice 从产品层困惑开始
  -> 理解四层边界
  -> 把 Host 选择变成 Build Agent 和 provider contracts
  -> 给 Bob 一个受约束的 Builder agent session
  -> 产出 portable no-secret share artifact
  -> 用 governance evidence 验证 Charlie install 和 Dave fork
  -> 看清楚还有哪些 productization gaps
```

这很重要，因为项目的顶层承诺不是“用 framework 做一个 app”。顶层承诺是：

```text
Developer 构建 Creation Host
  -> Builder 通过 agent 创建 Generated Applications
  -> End Users 使用 Published Applications
```

M25 让这条认知路线可以被演示。

## M25 没有证明什么

M25 不是 production readiness。它没有实现：

- 真实 macOS app；
- 真实 OAuth 或 account binding；
- 真实 credential broker；
- 真实 Postgres adapter；
- signed share artifacts；
- marketplace/share transport；
- production install/fork governance UI；
- team/org admin workflows。

这些仍然是 productization lanes。M25 关闭的是 Developer-cognition prototype lane。

## Verification

M25 使用以下命令验证：

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test examples/m25-alice-creation-host-prototype/prototype-model.test.ts examples/m25-alice-creation-host-prototype/run.test.ts
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run examples/m25-alice-creation-host-prototype/run.ts --smoke-exit
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test packages/core-domain packages/core packages/cli tests/pressure/creation-host-rc-pressure.test.ts examples/m24-creation-host-rc-pressure-walkthrough/run.test.ts examples/m25-alice-creation-host-prototype/prototype-model.test.ts examples/m25-alice-creation-host-prototype/run.test.ts
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run typecheck
git diff --check
```

浏览器验证：

```text
http://127.0.0.1:8886/
Run full path -> RC path ready
Console warnings/errors -> none
Screenshot -> docs/architecture/assets/m25-alice-creation-host-prototype.png
```

也尝试了完整 `bun test`。结果为 `1188 pass / 6 fail`；6 个失败都是已有 Docker release smoke tests 被本机 Docker daemon 不可用阻断：

```text
ERROR: Cannot connect to the Docker daemon at unix:///Users/pandazki/.docker/run/docker.sock
```

M25 专属测试、M24 pressure tests、core/core-domain/CLI sweep、typecheck、浏览器 console 检查和 diff whitespace 检查均通过。

## 推荐下一步

回到 candidate-release review，并把 M25 作为 RC 分享/demo prototype：

```text
M24 contract pressure
  + M25 Developer cognitive walkthrough
  + docs/index health
  + full test/typecheck/diff verification
  -> tag RC or identify one final blocker
```
