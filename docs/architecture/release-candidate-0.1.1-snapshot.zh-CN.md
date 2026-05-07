# Release Candidate Patch 快照：pneuma-rc-0.1.1

**状态：** accepted patch release  
**英文版：** [release-candidate-0.1.1-snapshot.md](./release-candidate-0.1.1-snapshot.md)  
**上一个 RC：** [pneuma-rc-0.1.0 snapshot](./release-candidate-snapshot.zh-CN.md)

`pneuma-rc-0.1.1` 是 `pneuma-rc-0.1.0` 之上的小型 developer-contract patch。

它不改变已经接受的四层产品模型、Operation-first primitive model、open-ended artifact boundary、Authoring Kit contract 或 Sharing Governance contract。它吸收的是外部 DevBoard Studio 实现反馈中那些“framework 设计方向是对的，但 Developer 需要读源码才能知道正确写法”的明确缺口。

## 决策

把 RC 0.1.1 作为 **contract-surfacing patch** 发布，而不是新的 milestone：

- 暴露稳定的 runtime env/header 常量；
- 暴露稳定的 lifecycle marker 格式化和打印 helper；
- 记录 AppConfig authoring 中之前散落在源码里的 invariant；
- 记录 `asBunFetch`、internal call、published data mode 和 Host-owned route 的 runtime composition 边界；
- 记录 release rollout helper 的准确 shape；
- 在 canonical Creation Host contract guide 里列出 Authoring Kit JSON shape 要求；
- 明确哪些 DevBoard gap 被接受为后续 lane，而不是塞进 patch 版。

## 本 patch 采纳

| Feedback | RC 0.1.1 处理 |
|---|---|
| #10 Authoring Kit JSON shape 只在 scaffold/source 中可见 | `creation-host-contract.md` 现在列出 `CredentialRequirement`、`app_id`、`init_recipe`、`subject` 的必填 shape。 |
| #18 `PNEUMA_SQLITE_PATH` env contract 隐藏 | `@pneuma-framework/runtime` 导出 `PNEUMA_SQLITE_PATH_ENV`；AppConfig guide 记录 import-order discipline。 |
| #19 service-ready marker 每个模板手写 | `@pneuma-framework/core` 导出 `format*Marker` 和 `print*Marker` helper。 |
| #20 `asBunFetch` path ownership 隐式 | Runtime composition guide 明确 runtime 拥有哪些 path，Host route 应该在哪里拦截。 |
| #24 AppConfig authoring invariant 散落源码 | AppConfig authoring guide 记录 cell type 拼写、保留行列名、`_cell` 约定、operation surface 推导和 destructive impact invariant。 |
| #29 release rollout helper shape 不显然 | Release rollout authoring guide 记录 state/instance 构造、check 字段、transition envelope 和 summary shape。 |
| #3 / #21 Host credential broker internal-token pattern | Runtime composition guide 记录 M17 internal-token 形状，以及 Host 如何镜像它用于 Host-owned credential brokering。 |
| #4 published data inheritance semantics 未定义 | Runtime composition guide 记录当前推荐模式：isolated version data 与 carry-forward with migration receipt。 |

## 有意延期

这些 pressure finding 是有效的，但它们会引入新 primitive、新 package 或新兼容面，不适合混进 patch release：

| Feedback | 延期原因 |
|---|---|
| #1 RuntimeMode enum / `createRuntimeContext` | 需要围绕 Host-owned dev/prod semantics 和 dev-additive-only enforcement 做 API 设计。 |
| #2 preview lifecycle semantic tools | 有价值，但要和 lifecycle subsystem、process manager ownership 对齐。 |
| #5 cross-lane atomic approval | 需要正式定义 framework definition lane + Host artifact lane 的 composition contract。 |
| #6 tool lane mapping | 应进入 Build Agent Package extension，前提是 lane model 已设计清楚。 |
| #7 `exportDefinitionRows()` | 好 helper，但要和 share artifact versioning / privacy boundary 一起设计。 |
| #8 `runInitRecipe()` | 需要 Host operation registry contract 和 idempotency semantics。 |
| #9 domain tool surface policy | 对生产 Host 很重要；应作为 Authoring Kit extension。 |
| #11 / #12 test fixtures 与 test DB helper | 高杠杆 DX utility，但应该形成一致的 testing package。 |
| #13-#17 cookies、session、OAuth provider helpers | 这是 Host-app security utility，不是 RC patch 内容；需要一个 focused Host security kit milestone。 |
| #22 / #23 subprocess stream 和 ready helper | 有用的 host-utils lane，不应和 marker patch 混在一起。 |
| #26-#28 opencode host-owned tools、auth、tool-call events | 属于真实 backend-agent polish lane，需要 adapter contract work。 |
| #30-#32 rollout convenience helpers | #32 当前已有 `active_url`；#30/#31 需要 type/API 决策。 |
| #33 published SQLite read-only semantics | 需要 runtime/storage 层设计选择，不只是写文档。当前文档会澄清 RC 行为。 |
| #34 eager table materialization | 需要 storage lifecycle 修改和更宽的回归测试。 |

## 新增 Developer Guidance

- [AppConfig Authoring Guide 中文版](../developer/app-config-authoring.zh-CN.md)
- [Runtime Composition Guide 中文版](../developer/runtime-composition.zh-CN.md)
- [Release Rollout Authoring Guide 中文版](../developer/release-rollout-authoring.zh-CN.md)
- [Downstream Upgrade Guide 中文版](../developer/upgrading-to-rc-0.1.1.zh-CN.md)
- [Creation Host Contract 中文版](../developer/creation-host-contract.zh-CN.md) authoring shape notes

## 验证

2026-05-07 已验证：

```bash
bun test packages/core/test/markers.test.ts packages/runtime/test/constants.test.ts
bun run typecheck
bun test $(rg --files -g '*.test.ts' | rg -v 'docker-smoke|release-smoke|release-packaging-smoke')
git diff --check
```

结果：

- 定向 helper tests：11 pass。
- Typecheck：pass。
- 非 Docker test suite：170 个文件、1165 pass。
- Markdown 本地链接检查：排除含故意占位链接的 `.claude` skill templates 后，202 个 markdown 文件通过。
- Diff whitespace check：pass。

也尝试过完整 `bun test`。它进入旧的 Docker smoke tests 后，在 `examples/m4-knowledge-inbox/docker-smoke.sh` 中因为 `docker build` 卡在 `docker-credential-desktop get` 而 180s timeout。后续过滤命令误包含 `examples/m8-release-packaging-hardening/release-packaging-smoke.test.ts` 时，也出现同样的 Docker credential-helper 阻塞。RC 0.1.1 patch 不依赖 Docker 路径；本 patch 以定向测试、typecheck、链接检查和非 Docker suite 作为接受证据。
