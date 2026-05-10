# 快速开始：构建第一个 Creation Host

这份文档面向第一次从外部接触 pneuma-framework 的 Developer。

如果你还没有建立四层产品模型，请先读 [从这里开始：构建 Creation Host](./start-here.zh-CN.md)。

如果你在启动一个新的下游验证项目，请在这份 guide 之后阅读
[Downstream Validation Brief 中文版](./downstream-validation-brief.zh-CN.md)。
它定义了交付物、非目标、验证命令，以及上游期望的 gap-log 格式。

如果你准备写真实 Host runtime，而不是只跑 examples，请把 [AppConfig Authoring 中文版](./app-config-authoring.zh-CN.md)、[Runtime Composition 中文版](./runtime-composition.zh-CN.md) 和 [Release Rollout Authoring 中文版](./release-rollout-authoring.zh-CN.md) 放在这份 guide 旁边一起读。

目标不是一条命令做出生产 SaaS，而是跑通最小完整路径：

```text
scaffold host
  -> validate profiles
  -> 在 reference examples 里 create / preview / inspect
  -> evolve / approve
  -> publish / restart / rollback
```

## 1. 安装

在 framework repo 里：

```bash
bun install
```

先跑基础检查：

```bash
bun test packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
bun run typecheck
```

## 2. 创建 starter Host

```bash
bun packages/cli/src/index.ts scaffold-host /tmp/my-pneuma-host --name "My Pneuma Host"
```

这个命令会创建：

```text
/tmp/my-pneuma-host
  package.json
  profiles.json
  pneuma.scaffold.json
  agent-package.json
  provider-capabilities.json
  share-artifact.example.json
  sharing-governance.example.json
  credential-rebinding.example.json
  agent-policy.md
  README.md
  src/run.ts
```

这个 scaffold 故意很小。它是你的 Host 起点，不是 framework 偷偷塞给你的完整 app builder。

这些 authoring and sharing files 是 M22/M23 Creation Host developer contract 的第一刀：

- `agent-package.json` 描述 Developer 编写的 Build Agent Package，用于创建 Builder-specific Build Agent Sessions。它也禁止 normal Builder mode 中的 provider-specific implementation branches。
- `pneuma.scaffold.json` 描述 Generated Application source boundary：source roots、writable roots、protected paths、guardrails、lifecycle commands，以及 governed code-change lane 需要的 proposal evidence requirements。
- `provider-capabilities.json` 描述 profile 支持/不支持的能力、fail-closed behavior，以及多个 profile 共享同一 capability 时的 parity contracts。
- `share-artifact.example.json` 记录 no-secret portable share artifact 边界。它会排除 source database，并用 idempotent semantic init recipe steps 支持 share/fork install。
- `sharing-governance.example.json` 记录 share/fork artifact 外围的 Host-level ownership、rights、lineage、revocation 和 credential rebinding policy。
- `credential-rebinding.example.json` 记录接收方 Builder 的 no-secret rebinding evidence。
- `agent-policy.md` 是 package 消费的人类可读规则文档。

## 3. 跑 doctor

```bash
bun packages/cli/src/index.ts doctor-host \
  --workspace /tmp/my-pneuma-host/.pneuma-workspace \
  --profiles /tmp/my-pneuma-host/profiles.json \
  --scaffold-project /tmp/my-pneuma-host/pneuma.scaffold.json \
  --agent-package /tmp/my-pneuma-host/agent-package.json \
  --provider-capabilities /tmp/my-pneuma-host/provider-capabilities.json \
  --share-artifact /tmp/my-pneuma-host/share-artifact.example.json \
  --sharing-governance /tmp/my-pneuma-host/sharing-governance.example.json \
  --credential-rebinding /tmp/my-pneuma-host/credential-rebinding.example.json
```

新 scaffold 的预期输出：

```text
Creation Host diagnostics: passed
profiles: 1
projects: 0
versions: 0
workspace [warning] workspace.state.missing: No Creation Host state file exists yet.
next steps:
  - Create a generated app project, then run doctor-host again to verify version directories.
Creation Host authoring diagnostics: passed
scaffold project checked: yes
agent package checked: yes
provider capabilities checked: yes
share artifact checked: yes
sharing governance checked: yes
credential rebinding checked: yes
authoring scaffold_project: ok
authoring agent_package: ok
authoring provider_capabilities: ok
authoring share_artifact: ok
authoring sharing_governance: ok
authoring credential_rebinding: ok
authoring kit_cross_contract: ok
authoring next steps:
  - Keep authoring files in CI with the same validators before exposing the Host to Builders.
```

这表示这是一个健康的空 Host workspace：profile contract 和 authoring files 都有效，下一步应该创建 generated app。

## 4. 学习 schema-driven Reference Host

启动集成 Reference Host：

```bash
bun run examples/m16-reference-creation-host/run.ts --port 8879
```

打开：

```text
http://127.0.0.1:8879/
```

按顺序体验：

1. 创建 `team-knowledge-inbox`。
2. 预览 generated app。
3. 检查 schema / data / operations / logs。
4. 开始 evolution。
5. 批准 proposed capability。
6. 发布 v0 / v1。
7. restart active。
8. rollback。

自动 smoke：

```bash
bun run examples/m16-reference-creation-host/run.ts --port 0 --smoke-exit
```

## 5. 学习 open-ended app

启动 Personal Focus Site：

```bash
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 8879
```

这个 example 证明它不是 schema/list app 的过拟合：

- routes；
- page sections；
- style tokens；
- dynamic GitHub attention module；
- Host-governed UI/module evolution。

自动 smoke：

```bash
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 0 --smoke-exit
```

## 6. 给你的 Host 加 contract test

在你的 Host repo 里给你暴露的 framework contracts 加测试。把这些测试放在 authoring files 旁边，让 CI 在 Builder session 启动前就抓住漂移。

```ts
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createBuildChangeAssuranceCase,
  createBuildChangeReviewPacket,
  validateBuildAgentPackageManifest,
  validateBuildChangeAssuranceCase,
  validateBuildChangeReviewPacket,
  validateCreationHostProfileContract,
  validateCredentialRebindingEvidence,
  validateHostExtensionBundle,
  validateHostExtensionManifest,
  validateHostExtensionSlotRegistry,
  validateProviderCapabilityMatrix,
  validateScaffoldProjectManifest,
  validateShareArtifactManifest,
  validateSharingGovernanceBundle,
  validateSharingGovernanceManifest,
  type BuildAgentPackageManifest,
  type CredentialRebindingEvidence,
  type CreationHostProfile,
  type HostExtensionManifest,
  type HostExtensionSlotRegistry,
  type ProviderCapabilityMatrix,
  type ScaffoldProjectManifest,
  type ShareArtifactManifest,
  type SharingGovernanceManifest,
} from "@pneuma-framework/core";

const root = join(import.meta.dir, "..");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as T;
}

function readOptionalJson<T>(path: string): T | undefined {
  const fullPath = join(root, path);
  return existsSync(fullPath)
    ? JSON.parse(readFileSync(fullPath, "utf8")) as T
    : undefined;
}

test("profiles satisfy the framework Creation Host contract", () => {
  for (const profile of readJson<CreationHostProfile[]>("profiles.json")) {
    const result = validateCreationHostProfileContract(profile);
    expect(result.issues).toEqual([]);
  }
});

test("authoring, sharing, and extension contracts are safe", () => {
  const agentPackage = readJson<BuildAgentPackageManifest>("agent-package.json");
  const scaffoldProject = readJson<ScaffoldProjectManifest>("pneuma.scaffold.json");
  const providerCapabilities = readJson<ProviderCapabilityMatrix>("provider-capabilities.json");
  const shareArtifact = readOptionalJson<ShareArtifactManifest>("share-artifact.example.json");
  const sharingGovernance = readOptionalJson<SharingGovernanceManifest>("sharing-governance.example.json");
  const credentialRebinding = readOptionalJson<CredentialRebindingEvidence>("credential-rebinding.example.json");
  const extensionSlots = readOptionalJson<HostExtensionSlotRegistry>("host-extension-slots.json");
  const extensionManifest = readOptionalJson<HostExtensionManifest>("host-extension.example.json");

  expect(validateBuildAgentPackageManifest(agentPackage).issues).toEqual([]);
  expect(validateScaffoldProjectManifest(scaffoldProject).issues).toEqual([]);
  expect(validateProviderCapabilityMatrix(providerCapabilities).issues).toEqual([]);

  if (shareArtifact) {
    expect(validateShareArtifactManifest(shareArtifact).issues).toEqual([]);
  }
  if (sharingGovernance) {
    expect(validateSharingGovernanceManifest(sharingGovernance).issues).toEqual([]);
  }
  if (credentialRebinding && sharingGovernance) {
    expect(validateCredentialRebindingEvidence(
      credentialRebinding,
      sharingGovernance,
    ).issues).toEqual([]);
  }
  if (shareArtifact && sharingGovernance && credentialRebinding) {
    expect(validateSharingGovernanceBundle({
      share_artifact: shareArtifact,
      sharing_governance: sharingGovernance,
      credential_rebinding_evidence: credentialRebinding,
    }).issues).toEqual([]);
  }
  if (extensionSlots) {
    expect(validateHostExtensionSlotRegistry(extensionSlots).issues).toEqual([]);
  }
  if (extensionManifest) {
    expect(validateHostExtensionManifest(extensionManifest).issues).toEqual([]);
  }
  if (extensionSlots && extensionManifest) {
    expect(validateHostExtensionBundle({
      slots: extensionSlots,
      extension: extensionManifest,
    }).issues).toEqual([]);
  }
});

test("build assurance packets and cases validate before product UI consumes them", () => {
  const packet = createBuildChangeReviewPacket({
    build_change_id: "bc-smoke",
    app_id: "app-smoke",
    thread_id: "thread-smoke",
    builder_subject: "user:builder",
    intent_summary: "Add one small generated-app capability.",
    scope_boundary: "No credential, release, or destructive data migration changes.",
    proposed_changes: [{
      kind: "source",
      title: "Add capability",
      summary: "Update generated-app source through the governed Code Change Lane.",
    }],
    risk_classification: ["source_code_change"],
    pre_proposal_checks: [{
      id: "contract-tests",
      phase: "pre_proposal",
      status: "passed",
      message: "Host contract tests passed.",
    }],
    evidence_refs: [{ kind: "host_check", check_id: "contract-tests", status: "passed" }],
    recovery_plan: {
      strategy: "discard_unapplied_draft",
      summary: "Discard the draft workspace if the Builder rejects the change.",
    },
    migration_mode: "none",
  });
  expect(validateBuildChangeReviewPacket(packet)).toEqual({ ok: true });

  const assuranceCase = createBuildChangeAssuranceCase({
    build_change_id: packet.build_change_id,
    app_id: packet.app_id,
    thread_id: packet.thread_id,
    builder_subject: packet.builder_subject,
    intent_summary: packet.intent_summary,
    scope_summary: packet.scope_boundary,
    risks: packet.risk_classification,
    evidence_refs: packet.evidence_refs,
    assessment: {
      intent_status: "clear",
      proposal_status: "proposed",
      approval_status: "awaiting",
      execution_status: "not_started",
      risks: packet.risk_classification,
      checks: packet.pre_proposal_checks,
      evidence_refs: packet.evidence_refs,
      migration_mode: "none",
    },
    migration_mode: "none",
  });
  expect(validateBuildChangeAssuranceCase(assuranceCase)).toEqual({ ok: true });
});
```

## 7. 接下来要做什么

一个有价值的第一版 Host 应该提供：

- profile selection；
- create generated app；
- preview；
- inspect schema / data / operations / logs；
- 一条 governed evolution path；
- approval；
- publish；
- restart；
- rollback；
- diagnostics。

下一篇：[Creation Host Contract](./creation-host-contract.zh-CN.md)。
