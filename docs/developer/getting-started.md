# Getting Started: Build Your First Creation Host

This guide is for a Developer approaching pneuma-framework from the outside.

If you have not formed the four-layer mental model yet, read [Start Here: Build A Creation Host](./start-here.md) first.

If you are running a fresh downstream validation project, read the
[Downstream Validation Brief](./downstream-validation-brief.md) after this
guide. It defines deliverables, non-goals, validation commands, and the gap-log
format upstream expects.

If you are writing a real Host runtime rather than only running examples, keep [AppConfig Authoring](./app-config-authoring.md), [Runtime Composition](./runtime-composition.md), and [Release Rollout Authoring](./release-rollout-authoring.md) open beside this guide.

The goal is not to build a production SaaS in one command. The goal is to run the smallest coherent Creation Host path:

```text
scaffold host
  -> validate profiles
  -> create / preview / inspect in the reference examples
  -> evolve / approve
  -> publish / restart / rollback
```

## 1. Install

From the framework repo:

```bash
bun install
```

Run the baseline checks:

```bash
bun test packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
bun run typecheck
```

## 2. Scaffold A Starter Host

```bash
bun packages/cli/src/index.ts scaffold-host /tmp/my-pneuma-host --name "My Pneuma Host"
```

The command creates:

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

This scaffold is intentionally small. It is a starting point for your Host, not a hidden framework-owned app builder.

The authoring and sharing files are the first M22/M23 Creation Host developer contract slice:

- `agent-package.json` describes the Developer-authored Build Agent Package used to create Builder-specific Build Agent Sessions. It also forbids provider-specific implementation branches in normal Builder mode.
- `pneuma.scaffold.json` describes the Generated Application source boundary: source roots, writable roots, protected paths, guardrails, lifecycle commands, and proposal evidence requirements for governed code-change lanes.
- `provider-capabilities.json` describes supported/unsupported profile capabilities, fail-closed behavior, and parity contracts for capabilities shared by multiple profiles.
- `share-artifact.example.json` documents the no-secret portable share artifact boundary. It excludes source databases and uses idempotent semantic init recipe steps for share/fork installs.
- `sharing-governance.example.json` documents the Host-level ownership, rights, lineage, revocation, and credential rebinding policy around the share/fork artifact.
- `credential-rebinding.example.json` documents no-secret rebinding evidence for the receiving Builder.
- `agent-policy.md` is the human-readable rule sheet consumed by the package.

## 3. Run Doctor

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

Expected result on a fresh scaffold:

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

This is a healthy empty Host workspace. It means your profile contract and authoring files are valid, and the next step is to create a generated app.

## 4. Study The Reference Host Loop

Run the integrated schema-driven reference Host:

```bash
bun run examples/m16-reference-creation-host/run.ts --port 8879
```

Open:

```text
http://127.0.0.1:8879/
```

Walk through:

1. Create `team-knowledge-inbox`.
2. Preview the generated app.
3. Inspect schema/data/operations/logs.
4. Start evolution.
5. Approve the proposed capability.
6. Publish v0/v1.
7. Restart active.
8. Roll back.

For automated verification:

```bash
bun run examples/m16-reference-creation-host/run.ts --port 0 --smoke-exit
```

## 5. Study The Open-Ended App Loop

Run the open-ended Personal Focus Site:

```bash
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 8879
```

This example proves a different shape from schema/list apps:

- routes;
- page sections;
- style tokens;
- dynamic GitHub attention module;
- Host-governed UI/module evolution.

For automated verification:

```bash
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 0 --smoke-exit
```

## 6. Add Contract Tests To Your Host

In your Host repo, add tests around the framework contracts you expose. Keep
these tests close to your authoring files so CI catches drift before a Builder
session starts.

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

## 7. What To Build Next

A useful first Host should expose:

- profile selection;
- create generated app;
- preview;
- inspect schema/data/operations/logs;
- one governed evolution path;
- approval;
- publish;
- restart;
- rollback;
- diagnostics.

Read next: [Creation Host Contract](./creation-host-contract.md).
