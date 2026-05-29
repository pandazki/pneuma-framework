# Release 1.0 就绪度评审

**日期:** 2026-05-29
**评审范围:** M53 闭环后的全项目评审,面向 1.0 发布决策。
**英文版本:** [release-1.0-readiness-review.md](./release-1.0-readiness-review.md)

## 本评审采用的 1.0 定义

本评审按 **定义 A**(已选定的目标)衡量就绪度:

> **pneuma-framework 1.0 是一个稳定的、运行于 Bun 之上的实现框架与契约集,面向构建单 Builder 或团队型 Creation Host 的 Developer。** 多租户身份、生产凭证保险库、分布式/并发治理、部署抽象、合规审计后端 **显式归 Host 所有,不在 1.0 范围内。**

定义 A 是可达的。剩余工作主要是 **发布工程与边界声明**,而非新的框架原语。另一个范围大得多的"任何人对话即可上线生产应用"的承诺(定义 B)*不是* 1.0 所宣称的,留给 1.0 之后的里程碑。

## 已验证的健康度(本轮实测)

以下是实际运行得到的,非假设:

| 检查 | 结果 |
|---|---|
| `bun run typecheck`(13 个 tsconfig) | ✅ 通过 |
| `bun test packages/`(~142 测试文件) | ✅ 通过 |
| `examples/production-profile-host` 测试 | ✅ 4 通过 / 0 失败(需先 `bun install`) |
| `examples/production-generated-app-profile` verify | ✅ 14 通过 + build |
| 分支状态 | ✅ `HEAD == main`,工作区干净 |
| 测试纪律 | ✅ 无遗留 `.only` / `.skip` / `.todo`(仅 1 个有意的 `skipIf(!HAS_PYTHON)`) |
| **CI** | ❌ **无** —— 无 `.github/`、无 workflow;600 commits 全靠手动验证 |

**结论:代码健康,但没有任何自动化门禁。** 对一条 1.0 发布线,这是首先要补的——因为之后每一步都需要有东西来强制执行。

> 已写入 CLAUDE.md 的操作提示:examples 用本地依赖链接(不提交 `node_modules`)。测试任何 example 前需在仓库根执行 `bun install`,否则 harness 会 fail-closed 报 "dependencies are missing"。

## 完成度:框架 8 项 in-scope 责任

| # | 责任 | 成熟度 | 证据 |
|---|---|---|---|
| 1 | 生命周期 verb + 脚本协议 | **FULL** | `packages/core/src/lifecycle.ts`、`env.ts`、`markers.ts`、`artifact.ts` —— 7 verbs、stdout marker、退出/产物约定 |
| 2 | 程序级进程管理 | **FULL** | `packages/core/src/process-manager.ts` —— 进程组、日志流、崩溃观察、按需重启 |
| 3 | Build-phase Agent 语义工具 API | **FULL** | `packages/core/src/tools/*` + `mcp-server.ts` —— 20+ 受治理工具(definition / observation / checkpoint / release) |
| 4 | 框架状态观察 | **FULL** | `tools/observation.ts` —— `lifecycle.state`、`lifecycle.logs`、`workspace.tree` |
| 5 | Build-preview 回环 + SDK | **PARTIAL** | `packages/core/src/wire-protocol/*` + `packages/viewer-react/*`。wire protocol 与 **React SDK 完整;承诺的 Vanilla JS SDK 从未实现**(manifest 枚举 `sdk: "react" \| "vanilla" \| "custom"` 允许声明,但没有实现交付)。 |
| 6 | AgentBackend 抽象 | **FULL** | `packages/core/src/agent-backend/*` + `backend-opencode` —— claude-code / codex / opencode / fake,`runTurn` 契约 |
| 7 | shadow-git / checkpoint / replay | **FULL** | `packages/core/src/shadow-git.ts` + `tools/checkpoint.ts` —— JSONL 索引、rewind 防护 |
| 8 | Creation Host / profile 契约 | **FULL** | `core/src/types.ts` 中的 `TemplateManifest`(`schemaVersion: 1`)+ `host-kit/*` helpers |

**结论:核心原语成熟、自洽,经 M1–M53 反复压测。唯一的*实现*缺口是 Vanilla SDK(第 5 项)—— 框架章程承诺过,但从未构建。**

## 分发模型(重要 —— 纠正一个常见误读)

框架**有意以 Bun 通过 `file:`/git 直接消费 TypeScript 源码**,而非把构建后的 `dist` 发布到 npm registry。`scripts/check-local-package-consumption.ts` 用 `file:` 消费各包,并直接从 `.../cli/src/index.ts` import,且 filter 排除了 `dist`。所以 `main`/`types` 指向 `src/*.ts` 是 **有意设计**,不是缺陷。

1.0 时需显式声明的后果:

- **Bun-only。** 非 Bun / Node 消费者不受支持。这必须写进 README,因为它界定了"任何人都能构建"的边界。
- 1.0 不包含 npm-registry 发布流程;消费方式是 `file:`/git 源码。

## 影响 1.0 的缺口分组

### A. 必补的发布工程(与产品范围无关)

1. **无 CI 门禁。** 加自动化:`typecheck` + `bun test` + `test:package-consumption` + 至少一个 example 的 `bun install` + 测试。最先落地。
2. **Public API 面未冻结。** `core` 在 19 个 subpath 上暴露约 85 个根导出;`core-domain` 用 41 个 `export *` 星号导出把一切都 re-export。这使内部模块成为公共契约,1.0 后无法重构而不破坏消费者。1.0 应**收敛并冻结**公共面(显式 allow-list,隐藏内部)。
3. **无 CHANGELOG / semver 策略 / deprecated 移除时间表。** `packages/core/src/build-thread.ts` 仍导出 5 个 `@deprecated` helper。1.0 时要么删除,要么承诺有文档的支持窗口。
4. **Vanilla SDK 决策。** 要么实现它以兑现"两个内置 SDK"的章程,要么**显式把承诺降级**为"React SDK + 开放 wire protocol;vanilla 自行实现"。

### B. 需声明的范围边界(由定义 A 解决)

在定义 A 下这些不是阻塞项,而是 README/spec 必须显式写出的 **边界声明**,以使 1.0 宣称诚实:

5. 多用户 / 并发 definition 写入、生产 IAM、凭证保险库、合规审计留存 → **Host-owned,不在 1.0。**(框架仅提供词汇 + reference helper;见 `OPEN-QUESTIONS.md`。)
6. 部署抽象 → **Host-owned。** 框架"应当学习结构化 publish/deploy 回执的形状"(M53 snapshot)但尚未做;Vercel/Neon 仅存在于 M53 example。要么提升一个最小的回执*契约*(不锁定 provider),要么声明部署归 Host。
7. Bun-only 运行约束 → 写明。

### C. 外部验证(最大的认知缺口)

8. **核心承诺目前只被内部 curated example 证明 —— 没有任何外部 Developer 仅凭文档从零构建过 Host。** `docs/developer/downstream-validation-brief.md` 存在但从未被执行。`scaffold-host` 产出约 8 行的 stub,且**没有文档化的"scaffold → 可运行 Host"小步序列** —— 新人只能逆向阅读 2K–4K 行的 example。这是宣称 1.0 可信度前最该补的一项。

## 建议的 1.0 门禁(定义 A)

一个聚焦的收口里程碑,按依赖顺序:

1. **CI** —— 把上面已验证的检查自动化,使之后每一步都有强制门禁。
2. **冻结 public API** —— 把 `core` / `core-domain` 导出收敛成显式公共面;处理 `@deprecated` BuildThread helper;加 CHANGELOG + 一页 semver/稳定性策略。
3. **Vanilla SDK 决策** + README 边界章节(Bun-only;生产关切归 Host;部署归属)。
4. **"Scaffold → 可运行 Host" 走查** —— 从 `scaffold-host` 到一个能创建、预览、演进、批准、发布、回滚的 Host 的文档化小步路径,链接(而非要求阅读)大型 example。
5. **一次真实外部验证** downstream brief;收集 gap;修 top 几个。
6. **打 `pneuma-1.0.0`**,并显式写明边界。

## 结论

- **框架原语:** 1.0 级(8 项 in-scope 中 7 项 FULL;仅 Vanilla SDK 是未兑现的实现承诺)。
- **发布工程:** 尚未 1.0 级(无 CI、API 面未冻结、无 changelog/semver 纪律)。
- **外部开发者 onboarding:** 未证明(无零上下文外部构建;scaffold-到-Host 路径无文档)。

定义 A 的 1.0 可通过单个聚焦收口里程碑达成,其工作主要是工程卫生、边界声明与一次外部验证 —— 而非新原语。
