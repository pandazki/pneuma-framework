# Creation Host Contract

这份文档说明 Developer 基于 pneuma-framework 构建产品时，最低要提供什么。

如果你需要第一阅读入口，请先读 [从这里开始：构建 Creation Host](./start-here.zh-CN.md)。

## 四个制品

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

framework 提供 primitives 和 shared contracts。Creation Host 是 Builder-facing 产品面。Generated Application 是 Builder 通过 Host 创建出来的应用。Published Application 是对 End User 暴露的某个 generated-app version。

不要把这四层混成一个东西。这个项目里很多设计风险都来自把 “pneuma app” 同时当成四层。

## Host 的最低职责

一个有用的 Creation Host 负责：

| 职责 | 原因 |
|---|---|
| Profile selection | Developer 决定 Builder 可以创建哪些 stack 和 app shape。 |
| Project/version workspace | Generated app 需要稳定 version directory 和 state。 |
| Preview | Builder 在发布前需要看到应用。 |
| Inspection | Builder 和 Developer 需要看到 schema / data / operation / logs。 |
| Agent loop | Builder intent 必须变成 proposal、evidence 和 governed change。 |
| Approval | 能合并的一个 Builder intent 应该对应一次 coherent approval。 |
| Publish | 某个 generated version 必须能变成 active Published Application。 |
| Restart / rollback | Published app 需要基本运维控制。 |
| Diagnostics | Developer 需要知道 setup 或 runtime wiring 为什么失败。 |

## Framework 拥有的 contract

多种 Host 都需要的共享 contract 可以放在 framework：

- `CreationHostProfile`；
- `CreationHostProject`；
- `CreationHostVersion`；
- `CreationHostStore`；
- release candidate and rollout state；
- permission ledger；
- lifecycle semantic tools；
- BuildThread semantic transcript；
- AgentBackend `runTurn` contract；
- Code Change Lane proposal/apply/receipt helpers；
- runtime diagnostic helpers；
- HostExtension slot validation；
- Host credential/session/OAuth utility contracts；
- profile contract validation；
- workspace diagnostics；
- portable artifact safety scanning；
- sharing governance bundle decisions；
- Creation Host readiness summaries。

这些 contract 必须保持 generic，不能把某个 reference Host 的 SQLite path、Bun process layout、app-specific read operation id 变成 core semantics。

## Host 拥有的 contract

Host 拥有产品和 profile 选择：

- stack profile selection；
- Builder workbench UI/UX；
- generated-app templates；
- app-specific inspection views；
- open-ended UI/module artifacts；
- published app 是否包含 Runtime Agent；
- deployment adapter choice；
- semantic infrastructure choice，比如 SQLite vectors 或 Qdrant。

## Authoring Kit contract

M22 加入第一版机器可读的 Creation Host Authoring Kit 边界，M23 加入第一版 sharing governance 边界。新的 scaffold Host 会包含：

```text
agent-package.json
pneuma.scaffold.json
provider-capabilities.json
share-artifact.example.json
sharing-governance.example.json
credential-rebinding.example.json
agent-policy.md
```

这些文件仍然是 **Host-owned**。framework 只验证通用安全形状：

| 文件 | 作用 | Core validator |
|---|---|---|
| `agent-package.json` | 声明 Developer 编写的 Build Agent Package：instructions path、semantic tool allowlist、provider-specialization policy、credential boundary、review checklist、verification hooks。 | `validateBuildAgentPackageManifest` |
| `pneuma.scaffold.json` | 声明 Developer 编写的 Generated Application scaffold boundary：source roots、writable roots、protected paths、agent prompt fragments、pre-proposal/pre-apply/post-apply guardrails、lifecycle commands 和 proposal evidence requirements。 | `validateScaffoldProjectManifest` |
| `provider-capabilities.json` | 声明 profile/provider capabilities、unsupported capabilities、fail-closed behavior 和 cross-profile parity contracts。 | `validateProviderCapabilityMatrix` |
| `share-artifact.example.json` | 记录 portable no-secret share artifact 形状：app definition、init recipe、provider requirements、exclusions。 | `validateShareArtifactManifest`, `validatePortableArtifactSafety` |
| `sharing-governance.example.json` | 声明 Host-level share/fork/install/publish/rollback/revoke 权限、owner/maintainer/operator subjects、artifact/fork/published-app scopes、fork lineage、revocation status 和 required credential rebinding policy。 | `validateSharingGovernanceManifest`, `evaluateSharingGovernanceBundle` |
| `credential-rebinding.example.json` | 记录接收方 Builder 的 no-secret rebinding evidence：artifact/app/version refs、requirement refs、status、subject 和 provider account references。 | `validateCredentialRebindingEvidence` |
| `agent-policy.md` | Host Developer 编写的人类可读 Builder-agent rules。 | Host-owned text；由 package manifest 引用 |

核心边界是：

```text
Build Agent Package = Developer 编写的 guardrail package。
Build Agent Session = 从 package 创建出来的 Builder-specific runtime instance。
```

framework 验证 package 不包含 raw secrets、provider limitations 必须 fail closed、share artifact 是 portable manifest 而不是 database。

Host 在把 portable bundle 写入磁盘前，应把 `validatePortableArtifactSafety` 当作最后一道 no-secret/no-source-data scanner。它不仅能抓 `api_key`、`access_token`、`password`，也能抓 `github_secret`、`oauth_secret` 这类 provider-shaped 泄漏。

BuildThread contract 是 conversation boundary：

```text
BuildThread = framework-owned semantic transcript。
Backend-native session = cache / optimization。
runTurn = backend adapter 消费历史 BuildThread turns，并追加 semantic turn outcomes。
```

这让 Builder intent、Agent proposal、Builder decision 和 execution receipt 在 Host 切换 backend adapters 时仍然可 inspect。见 [BuildThread 中文版](./build-thread.zh-CN.md) 和 [M29 Snapshot 中文版](../architecture/milestone-29-snapshot.zh-CN.md)。

Scaffold Project contract 是 code-change boundary：

```text
Scaffold Project = Developer 编写的 generated-app source boundary。
Build-phase Agent 只能在 writable_roots 内编辑 draft。
pre_proposal guardrails 通过前，不应该请求 Builder approval。
```

这让 Host 可以让 agent 修改 source artifacts，同时不把整个 workspace 变成无治理的编辑面。见 [Scaffold Project Contract 中文版](./scaffold-project-contract.zh-CN.md)。当 Host 已经有 draft workspace，并希望 framework 承担 proposal/apply evidence 时，使用 [Code Change Lane 中文版](./code-change-lane.zh-CN.md)。

HostExtension Slot contract 是 approved open-ended artifacts 的 distribution boundary：

```text
HostExtension Slot Registry = Developer 声明的 mount points。
HostExtension Manifest = portable contribution bundle。
Bundle validation = slot compatibility + no-secret portability + approval governance。
```

这让 Host 可以打包一个 approved widget/API/hook/tool contribution，同时不声称它是 framework definition row。见 [Host Extension Slots 中文版](./host-extension-slots.zh-CN.md)。

Host Credential Broker utility contract 是本地 credential boundary：

```text
CredentialRequirement
  -> OAuth state / manual binding
  -> 带 credential_ref 的 HostCredentialBinding
  -> no-secret CredentialRebindingEvidence
  -> 只能通过 broker resolve secret
```

这帮助 Host 实现 Charlie install / Dave fork 的 credential rebinding，同时不把 Bob 的 tokens 泄漏进 share artifacts、governance files、logs 或 framework-visible evidence。它包含 session cookie hashing、server-side revoke、OAuth state、OAuth callback binding 和测试 OAuth fixture。它不是 hosted identity 或 production secret persistence。见 [Host Credential Broker Utilities 中文版](./credential-broker.zh-CN.md) 和 [M30 Snapshot 中文版](../architecture/milestone-30-snapshot.zh-CN.md)。

Runtime / Data Governance contract 是 post-approval outcome boundary：

```text
approved Build Change
  -> Runtime Intent
  -> Runtime Generation
  -> Reconcile Attempt
  -> Runtime Observation / Data Evolution Receipt
  -> Runtime Control Receipt
```

这让 Host 可以解释期望什么 runtime/data state、实际观察到什么、哪个 generation 是 current，以及 required migration/carry-forward/snapshot/restore evidence 是否存在。它不是 provider adapter，也不是 deployment platform。见 [Runtime / Data Governance 中文版](./runtime-data-governance.zh-CN.md)。

M22.3 加入第一条 provider portability 规则：

```text
Build Agent 看到的是 capability contracts，而不是 provider implementation branches。
多个 provider profiles 共享同一 capability 时，必须声明 parity contract 和 verification hook。
```

这就是 Dave fork 场景的边界。Host 可以同时支持 SQLite 和 Postgres，但面向 Builder 的 Build Agent 应该只基于 `relational-store` capability contract 工作。具体 provider 是否等价，由 Developer 提供 Host-owned parity tests 来证明。

Provider Capability Matrix 现在也可以声明 provider-neutral persistence/data-evolution behavior，例如 supported data policies、schema migration posture、backup/restore support、branch support、stale attachment behavior 和 fail-closed behavior。Build Agent 看到这些 capabilities；provider-specific implementation 仍然 Host-owned。

M22.4 加入第一条 share/fork portability 规则：

```text
Share artifact 排除 source database、secrets 和 private derived cache。
install/fork 通过 idempotent semantic init recipe steps 重放初始化。
目标 profile 必须满足 share artifact 声明的 required capabilities。
接收方 Builder 必须重新绑定自己的 credentials。
```

这避免 Bob 分享 `dev-board` 时意外导出 Bob 的 SQLite volume、GitHub token 或 private cache。Charlie 和 Dave 收到的是 portable recipe：app definition、capability requirements、credential requirements 和 semantic initialization steps。

### Authoring Shape Notes

validator 会严格检查这些 shape。外部 Host 作者最容易漏掉的是：

- `CredentialRequirement` 永远是完整对象：
  ```ts
  {
    id: "github-oauth",
    provider_id: "github",
    scopes: ["repo:read"],
    binding_mode: "per-user", // "per-user" | "shared" | "admin-delegated"
    placement: "host-broker", // "host-broker" | "keychain" | "secret-manager" | "kms" | "env"
    required: true,
  }
  ```
- `ShareArtifactManifest.app_id` 和 `SharingGovernanceManifest.app_id` 是字面量 generated-app id。模板展开属于 Host 写 manifest 前的工作。
- `SharingGovernanceManifest.credential_rebinding_policy.requirements` 是完整 `CredentialRequirement` 对象数组，不是 requirement id 字符串数组。
- `init_recipe.steps[].kind` 当前只能是 `"semantic-operation"`。
- `init_recipe.steps[].operation_id` 必须是 semantic operation id，匹配 `/^[a-z][a-z0-9_-]{1,62}$/`。
- Sharing subject 必须匹配 `user:...`、`role:...`、`org:...` 或 `team:...`。RC 0.1.1 没有 `"*"` 或 `"anyone"` 这样的 wildcard subject。

如果 Host 想让 artifact world-readable 或 publicly installable，应把它建模为 Host-owned distribution policy，并在 install 时为接收方 subject 生成具体 install/fork governance。framework-level public install primitive 属于 post-RC 工作。

## Sharing Governance contract

M23 在 portable share/fork unit 外补上第一层治理：

```text
share artifact
  -> sharing governance manifest
  -> credential rebinding evidence
  -> install/fork/publish/rollback decision
```

framework 只验证通用 lifecycle governance shape：

- 谁拥有 shared artifact 和 generated app；
- 哪些 subjects 可以 share、fork、install、approve、publish、rollback 或 revoke；
- fork 是否保留 source artifact/app/version lineage；
- artifact 是否已被 revoke；
- required credentials 是否已经由接收方 Builder 重新绑定，并且没有暴露 secret material。

这不是 runtime app authorization。应用数据权限仍然属于 `pneuma_policy_rules` 和 runtime Authorization Kernel。Sharing Governance 回答的是 Host-level 问题：“这个 subject 能不能 install、fork、operate 或 revoke 这个 portable Generated Application artifact？”

Credential rebinding evidence 绝不能包含 OAuth token、API key、private key、refresh token 或 password。它可以包含 status、provider id、account ref、requirement id、timestamp 和非 secret label。

推荐的测试形状是：

```ts
import { expect, test } from "bun:test";
import {
  evaluateSharingGovernanceBundle,
  validateCredentialRebindingEvidence,
  validateSharingGovernanceBundle,
  validateSharingGovernanceManifest,
} from "@pneuma-framework/core/sharing-governance";
import shareArtifact from "../share-artifact.example.json";
import credentialRebinding from "../credential-rebinding.example.json";
import sharingGovernance from "../sharing-governance.example.json";

test("share/fork governance is valid and installable by the builder", () => {
  expect(validateSharingGovernanceManifest(sharingGovernance).issues).toEqual([]);
  expect(validateCredentialRebindingEvidence(
    credentialRebinding,
    sharingGovernance,
  ).issues).toEqual([]);
  expect(validateSharingGovernanceBundle({
    share_artifact: shareArtifact,
    sharing_governance: sharingGovernance,
    credential_rebinding_evidence: credentialRebinding,
  }).issues).toEqual([]);

  const decision = evaluateSharingGovernanceBundle({
    share_artifact: shareArtifact,
    sharing_governance: sharingGovernance,
    credential_rebinding_evidence: credentialRebinding,
  }, {
    action: "install",
    scope: "artifact",
    subject: "user:builder",
  });

  expect(decision.allowed).toBe(true);
  expect(decision.bundle_ok).toBe(true);
});
```

Host 在执行 install/fork/publish 前，应使用 `evaluateSharingGovernanceBundle` 作为 execution boundary。它会把 share artifact、governance manifest、credential evidence 和 request 放在一起验证，再评估 scoped grant。这个 helper 返回 `allowed: false` 时，Host 不应该继续执行 portable artifact action。

## Schema-driven apps

schema-driven apps 使用 framework definition rows：

```text
pneuma_tables
pneuma_table_columns
pneuma_operations
pneuma_views
pneuma_policy_rules
```

它们的 governed changes 可以走 `definition.apply` 或 `definition.apply_change_set`，并获得 impact disclosure、approval token、framework execution、history、rollback/recovery evidence。

Knowledge Inbox 和 Team Decision Log 证明了这条路径。

在编写 generated schema 时，请使用 framework `CellType` object，而不是 shorthand string：

```json
{
  "tables": [
    {
      "id": "signals",
      "columns": [
        { "id": "title", "type": { "kind": "primitive", "of": "Text" } },
        { "id": "priority", "type": { "kind": "primitive", "of": "Text" } },
        { "id": "source_url", "type": { "kind": "primitive", "of": "URL" } },
        { "id": "metadata", "type": { "kind": "json" } }
      ]
    }
  ]
}
```

`"text"` / `"url"` 是 Host shorthand，不是 framework cell type。请先转换，再用 `isCellType` 校验。

## Open-ended apps

open-ended apps 可能包含 routes、page sections、style tokens、source modules 或其他当前 definition-row 模型表达不了的 artifacts。

M20 接受的边界是：

```text
open-ended UI/module artifacts
  -> Host-owned artifact
  -> Host approval
  -> Host inspection/transcript/release/rollback evidence
  -> v0 不是 framework definition rows
```

这不是缺陷，而是避免 framework 在没有稳定抽象前，把某个 site-builder 形态过早提升为 primitive。

Personal Focus Site 证明了这条路径。

## Profile contract test

使用 core helper：

```ts
import { assertCreationHostProfileContract } from "@pneuma-framework/core/developer-experience";

for (const profile of profiles) {
  assertCreationHostProfileContract(profile);
}
```

helper 只检查 framework-level shape：

- stable profile id；
- display name；
- description；
- template/profile directory；
- optional stack id shape；
- capability string shape；
- JSON metadata。

它不会验证 app-specific semantics。

## Authoring contract test

对新的 authoring files 使用 M22/M23 helper：

```ts
import { expect, test } from "bun:test";
import {
  validateBuildAgentPackageManifest,
  validateHostAuthoringKitContracts,
  validateProviderCapabilityMatrix,
  validateShareArtifactManifest,
} from "@pneuma-framework/core/host-authoring";
import {
  validateCredentialRebindingEvidence,
  validateSharingGovernanceBundle,
  validateSharingGovernanceManifest,
} from "@pneuma-framework/core/sharing-governance";
import agentPackage from "../agent-package.json";
import credentialRebinding from "../credential-rebinding.example.json";
import providerCapabilities from "../provider-capabilities.json";
import shareArtifact from "../share-artifact.example.json";
import sharingGovernance from "../sharing-governance.example.json";

test("Creation Host authoring contracts are valid", () => {
  expect(validateBuildAgentPackageManifest(agentPackage).issues).toEqual([]);
  expect(validateProviderCapabilityMatrix(providerCapabilities).issues).toEqual([]);
  expect(validateShareArtifactManifest(shareArtifact).issues).toEqual([]);
  expect(validateSharingGovernanceManifest(sharingGovernance).issues).toEqual([]);
  expect(validateCredentialRebindingEvidence(
    credentialRebinding,
    sharingGovernance,
  ).issues).toEqual([]);
  expect(validateSharingGovernanceBundle({
    share_artifact: shareArtifact,
    sharing_governance: sharingGovernance,
    credential_rebinding_evidence: credentialRebinding,
    provider_capabilities: providerCapabilities,
  }).issues).toEqual([]);
  expect(validateHostAuthoringKitContracts({
    agent_package: agentPackage,
    provider_capabilities: providerCapabilities,
    share_artifact: shareArtifact,
  }).issues).toEqual([]);
});
```

这些 validator 不证明你的 Host product 已经完整。它们证明第一层 Authoring Kit 和 Sharing Governance safety boundary：package/share/governance files 没有 raw secrets、provider fail-closed behavior 显式、共享 capability 有 provider parity contracts、source database 被排除、init recipe 是 idempotent semantic steps、share artifact 可以 re-bind 而不是复制 raw database，并且 governance manifest 可以评估 share/fork/install decisions。

Provider parity 是有意严格的。只有一个 profile 的 Host 可以省略 `parity_contracts`；一旦两个 profiles 共享同一个 capability，这个 capability 就需要 parity contract：

```json
{
  "capabilities": [
    {
      "id": "attention-feed",
      "kind": "external-provider",
      "description": "Read GitHub or Linear attention items.",
      "default_fail_closed_behavior": "Hide attention-backed views until credentials and provider health are available."
    }
  ],
  "profiles": [
    {
      "profile_id": "local-sqlite",
      "supported_capabilities": ["attention-feed"],
      "unsupported_capabilities": [],
      "credential_requirements": []
    },
    {
      "profile_id": "remote-postgres",
      "supported_capabilities": ["attention-feed"],
      "unsupported_capabilities": [],
      "credential_requirements": []
    }
  ],
  "parity_contracts": [
    {
      "id": "attention-feed-local-remote-parity",
      "capability_id": "attention-feed",
      "profile_ids": ["local-sqlite", "remote-postgres"],
      "semantic_contract": "Attention items expose the same id, title, source, priority, and status fields in both profiles.",
      "verification_hook_id": "attention-feed-parity"
    }
  ]
}
```

## Doctor contract

使用：

```bash
pneuma-framework doctor-host \
  --workspace ./workspace \
  --profiles ./profiles.json \
  --scaffold-project ./pneuma.scaffold.json \
  --agent-package ./agent-package.json \
  --provider-capabilities ./provider-capabilities.json \
  --share-artifact ./share-artifact.example.json \
  --sharing-governance ./sharing-governance.example.json \
  --credential-rebinding ./credential-rebinding.example.json
```

Doctor 检查：

- profile contract validity；
- Host state file presence；
- generated-app project/version counts；
- missing version directories；
- Scaffold Project source roots、writable/protected artifact boundary、guardrails、lifecycle commands、evidence requirements 和 no-secret manifest safety；
- Build Agent Package manifest safety；
- Build Agent Package capability-contract-only policy；
- Provider Capability Matrix fail-closed behavior and cross-profile parity contracts；
- Share Artifact manifest portability、no-secret boundary、source database exclusion 和 idempotent init recipe；
- Sharing Governance manifest ownership、rights、lineage、revocation 和 credential rebinding requirements；
- Credential Rebinding Evidence no-secret boundary 和 requirement references；
- HostExtension Slot Registry declarations 和 HostExtension manifest portability；
- HostExtension bundle compatibility against declared slots；
- cross-file package/matrix/share references；
- share target profile compatibility against required capabilities；
- next steps。

同一个 diagnostics object 也可以通过 `diagnoseCreationHostWorkspace` 放进 Host UI 或 CI。

Authoring diagnostics 可以通过 `diagnoseCreationHostAuthoring` 获取。Developer workflow 变成：

```text
scaffold-host
  -> 生成 profile + authoring files
doctor-host
  -> 验证 profile + workspace + authoring files
```

如果 Host 需要一个适合 endpoint/UI 的紧凑状态，可以用 `createCreationHostReadinessSummary` 汇总 workspace 与 authoring diagnostics。summary 会保留 `failed_check_kinds`、`error_count`、`warning_count` 和 `next_steps`，避免 Host UI 把“为什么还没 ready”隐藏掉。
