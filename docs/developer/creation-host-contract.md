# Creation Host Contract

This guide explains what a Developer must provide when building on pneuma-framework.

For the first-read mental model, start with [Start Here: Build A Creation Host](./start-here.md).

## The Four Artifacts

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

The framework provides primitives and shared contracts. A Creation Host is the Builder-facing product that uses those primitives. A Generated Application is what the Builder creates through the Host. A Published Application is a selected generated-app version exposed to End Users.

Do not collapse these into one thing. Most design mistakes in this repo came from treating "pneuma app" as if it meant all four layers at once.

## Minimum Host Responsibilities

A useful Creation Host owns:

| Responsibility | Why |
|---|---|
| Profile selection | The Developer chooses which stacks and app shapes Builders may create. |
| Project/version workspace | Generated apps need stable version directories and state. |
| Preview | Builders need to see the app before publish. |
| Inspection | Builders and Developers need schema/data/operation/log visibility. |
| Agent loop | Builder intent must become proposal, evidence, and governed change. |
| Approval | One Builder intent should map to one coherent approval when possible. |
| Publish | A generated version must become an active Published Application. |
| Restart / rollback | Published apps need basic operational controls. |
| Diagnostics | Developers need to know why setup or runtime wiring failed. |

## Framework-Owned Contract

The framework can own shared contracts when many Hosts need them:

- `CreationHostProfile`;
- `CreationHostProject`;
- `CreationHostVersion`;
- `CreationHostStore`;
- release candidate and rollout state;
- permission ledger;
- lifecycle semantic tools;
- BuildThread semantic transcript;
- AgentBackend `runTurn` contract;
- Code Change Lane proposal/apply/receipt helpers;
- runtime diagnostic helpers;
- HostExtension slot validation;
- Host credential/session/OAuth utility contracts;
- profile contract validation;
- workspace diagnostics;
- portable artifact safety scanning;
- sharing governance bundle decisions;
- Creation Host readiness summaries.

These contracts must stay generic. They cannot leak one reference Host's SQLite path, Bun process layout, or app-specific read operation id into core semantics.

## Host-Owned Contract

The Host owns product and profile choices:

- stack profile selection;
- UI/UX of the Builder workbench;
- generated-app templates;
- app-specific inspection views;
- open-ended UI/module artifacts;
- whether published apps include a Runtime Agent;
- deployment adapter choice;
- semantic infrastructure choice such as SQLite vectors or Qdrant.

## Authoring Kit Contract

M22 adds the first machine-readable Creation Host Authoring Kit boundary, and M23 adds the first sharing governance boundary. A scaffolded Host now includes:

```text
agent-package.json
pneuma.scaffold.json
provider-capabilities.json
share-artifact.example.json
sharing-governance.example.json
credential-rebinding.example.json
agent-policy.md
```

These files are still **Host-owned**. The framework only validates the generic safety shape:

| File | Purpose | Core validator |
|---|---|---|
| `agent-package.json` | Declares the Developer-authored Build Agent Package: instructions path, semantic tool allowlist, provider-specialization policy, credential boundary, review checklist, verification hooks. | `validateBuildAgentPackageManifest` |
| `pneuma.scaffold.json` | Declares the Developer-authored Generated Application scaffold boundary: source roots, writable roots, protected paths, agent prompt fragments, pre-proposal/pre-apply/post-apply guardrails, lifecycle commands, and proposal evidence requirements. | `validateScaffoldProjectManifest` |
| `provider-capabilities.json` | Declares profile/provider capabilities, unsupported capabilities, fail-closed behavior, and cross-profile parity contracts. | `validateProviderCapabilityMatrix` |
| `share-artifact.example.json` | Documents the portable no-secret share artifact shape: app definition, init recipe, provider requirements, exclusions. | `validateShareArtifactManifest`, `validatePortableArtifactSafety` |
| `sharing-governance.example.json` | Declares Host-level share/fork/install/publish/rollback/revoke rights, owner/maintainer/operator subjects, artifact/fork/published-app scopes, fork lineage, revocation status, and required credential rebinding policy. | `validateSharingGovernanceManifest`, `evaluateSharingGovernanceBundle` |
| `credential-rebinding.example.json` | Records no-secret rebinding evidence for the receiving Builder, with artifact/app/version refs, requirement refs, status, subject, and provider account references. | `validateCredentialRebindingEvidence` |
| `agent-policy.md` | Human-readable Builder-agent rules authored by the Host Developer. | Host-owned text; referenced by package manifest |

This is the important boundary:

```text
Build Agent Package = Developer-authored guardrail package.
Build Agent Session = Builder-specific runtime instance created from that package.
```

The framework validates that the package does not contain raw secrets, that provider limitations fail closed, and that share artifacts are portable manifests rather than databases.

When a Host writes a portable bundle to disk, use `validatePortableArtifactSafety` as the final no-secret/no-source-data scanner. It catches provider-shaped leaks such as `github_secret` or `oauth_secret` in addition to generic keys like `api_key`, `access_token`, and `password`.

The BuildThread contract is the conversation boundary:

```text
BuildThread = framework-owned semantic transcript.
Backend-native session = cache / optimization.
runTurn = backend adapter consumes prior BuildThread turns and appends semantic turn outcomes.
```

This keeps Builder intent, Agent proposal, Builder decision, and execution receipt inspectable even when a Host swaps backend adapters. See [BuildThread](./build-thread.md) and [M29 Snapshot](../architecture/milestone-29-snapshot.md).

The Scaffold Project contract is the code-change boundary:

```text
Scaffold Project = Developer-authored generated-app source boundary.
Build-phase Agent edits drafts only inside writable_roots.
pre_proposal guardrails must pass before Builder approval is requested.
```

This is how a Host can let an agent modify source artifacts without turning the whole workspace into an ungoverned editing surface. See [Scaffold Project Contract](./scaffold-project-contract.md). When the Host already has a draft workspace and wants framework-owned proposal/apply evidence, use [Code Change Lane](./code-change-lane.md).

The HostExtension Slot contract is the distribution boundary for approved open-ended artifacts:

```text
HostExtension Slot Registry = Developer-declared mount points.
HostExtension Manifest = portable contribution bundle.
Bundle validation = slot compatibility + no-secret portability + approval governance.
```

This lets a Host package an approved widget/API/hook/tool contribution without claiming it is a framework definition row. See [Host Extension Slots](./host-extension-slots.md).

The Host Credential Broker utility contract is the local credential boundary:

```text
CredentialRequirement
  -> OAuth state / manual binding
  -> HostCredentialBinding with credential_ref
  -> no-secret CredentialRebindingEvidence
  -> broker-only secret resolution
```

This helps Hosts implement Charlie install / Dave fork credential rebinding without leaking Bob's tokens into share artifacts, governance files, logs, or framework-visible evidence. It includes session cookie hashing, server-side revoke, OAuth state, OAuth callback binding, and a test OAuth fixture. It is not hosted identity or production secret persistence. See [Host Credential Broker Utilities](./credential-broker.md) and [M30 Snapshot](../architecture/milestone-30-snapshot.md).

M22.3 adds the first provider portability rule:

```text
Build Agent sees capability contracts, not provider implementation branches.
Provider profiles that share a capability must name a parity contract and verification hook.
```

This is the Dave fork boundary. A Host may support SQLite and Postgres, but the Builder-facing Build Agent should implement against the `relational-store` capability contract. The Developer proves provider equivalence with Host-owned parity tests.

M22.4 adds the first share/fork portability rule:

```text
Share artifact excludes source database, secrets, and private derived cache.
Install/fork replays idempotent semantic init recipe steps.
Target profiles must satisfy the share artifact's required capabilities.
Installer credentials are always re-bound by the receiving Builder.
```

This keeps Bob sharing `dev-board` from accidentally exporting Bob's SQLite volume, GitHub token, or private cache. Charlie and Dave receive a portable recipe: app definition, capability requirements, credential requirements, and semantic initialization steps.

### Authoring Shape Notes

The validators are intentionally strict. These are the fields external Host authors most often miss:

- `CredentialRequirement` is always the full object:
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
- `ShareArtifactManifest.app_id` and `SharingGovernanceManifest.app_id` are literal generated-app ids. Template expansion belongs to the Host before it writes the manifest.
- `SharingGovernanceManifest.credential_rebinding_policy.requirements` is an array of full `CredentialRequirement` objects, not requirement id strings.
- `init_recipe.steps[].kind` is currently only `"semantic-operation"`.
- `init_recipe.steps[].operation_id` must be a semantic operation id matching `/^[a-z][a-z0-9_-]{1,62}$/`.
- Sharing subjects must match `user:...`, `role:...`, `org:...`, or `team:...`. There is no RC 0.1.1 wildcard subject such as `"*"` or `"anyone"`.

If a Host wants an artifact to be world-readable or publicly installable, it should model that as a Host-owned distribution policy and mint concrete install/fork governance for the receiving subject at install time. A framework-level public install primitive remains post-RC work.

## Sharing Governance Contract

M23 adds the first governance layer around the portable share/fork unit:

```text
share artifact
  -> sharing governance manifest
  -> credential rebinding evidence
  -> install/fork/publish/rollback decision
```

The framework validates only the generic lifecycle governance shape:

- who owns the shared artifact and generated app;
- which subjects may share, fork, install, approve, publish, rollback, or revoke;
- whether a fork preserves source artifact/app/version lineage;
- whether the artifact has been revoked;
- whether required credentials have been re-bound by the receiving Builder without exposing secret material.

This is **not** runtime app authorization. App data policy still belongs to `pneuma_policy_rules` and the runtime Authorization Kernel. Sharing Governance answers a Host-level question: "Can this subject install, fork, operate, or revoke this portable Generated Application artifact?"

Credential rebinding evidence must never contain OAuth tokens, API keys, private keys, refresh tokens, or passwords. It may contain status, provider ids, account refs, requirement ids, timestamps, and non-secret labels.

The useful test shape is:

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

Use `evaluateSharingGovernanceBundle` at the execution boundary before install/fork/publish. It validates the share artifact, governance manifest, credential evidence, and request together, then evaluates the scoped grant. A Host should not execute a portable artifact action when this helper returns `allowed: false`.

## Schema-Driven Apps

Schema-driven apps use framework definition rows:

```text
pneuma_tables
pneuma_table_columns
pneuma_operations
pneuma_views
pneuma_policy_rules
```

Their governed changes can flow through `definition.apply` or `definition.apply_change_set`, with impact disclosure, approval token, framework execution, history, and rollback/recovery evidence.

Knowledge Inbox and Team Decision Log prove this path.

When you author a generated schema, use framework `CellType` objects rather than shorthand strings:

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

`"text"` / `"url"` are Host shorthand, not framework cell types. Translate them before validating with `isCellType`.

## Open-Ended Apps

Open-ended apps may have routes, page sections, style tokens, source modules, or other artifacts that do not fit the current definition-row model.

M20 accepted this boundary:

```text
open-ended UI/module artifacts
  -> Host-owned artifact
  -> Host approval
  -> Host inspection/transcript/release/rollback evidence
  -> not framework definition rows in v0
```

That is not a weakness. It keeps the framework honest until an extension-lane ADR proves a stable abstraction.

Personal Focus Site proves this path.

## Profile Contract Test

Use the core helper:

```ts
import { assertCreationHostProfileContract } from "@pneuma-framework/core/developer-experience";

for (const profile of profiles) {
  assertCreationHostProfileContract(profile);
}
```

The helper checks only framework-level shape:

- stable profile id;
- display name;
- description;
- template/profile directory;
- optional stack id shape;
- capability string shape;
- JSON metadata.

It does not validate app-specific semantics.

## Authoring Contract Test

Use the M22/M23 helpers for the new authoring files:

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

These validators do not prove your Host product is complete. They prove the first Authoring Kit and Sharing Governance safety boundaries: no raw secrets in package/share/governance files, explicit provider fail-closed behavior, provider parity contracts for shared capabilities, source database exclusion, idempotent semantic init recipes, a share artifact that can be re-bound instead of copied as a raw database, and a governance manifest that can evaluate share/fork/install decisions.

Provider parity is intentionally strict. A one-profile Host can omit `parity_contracts`; once two profiles share a capability, that capability needs a parity contract:

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

## Doctor Contract

Use:

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

Doctor checks:

- profile contract validity;
- Host state file presence;
- generated-app project/version counts;
- missing version directories;
- Scaffold Project source roots, writable/protected artifact boundary, guardrails, lifecycle commands, evidence requirements, and no-secret manifest safety;
- Build Agent Package manifest safety;
- Build Agent Package capability-contract-only policy;
- Provider Capability Matrix fail-closed behavior and cross-profile parity contracts;
- Share Artifact manifest portability, no-secret boundary, source database exclusion, and idempotent init recipe;
- Sharing Governance manifest ownership, rights, lineage, revocation, and credential rebinding requirements;
- Credential Rebinding Evidence no-secret boundary and requirement references;
- HostExtension Slot Registry declarations and HostExtension manifest portability;
- HostExtension bundle compatibility against declared slots;
- cross-file package/matrix/share references;
- share target profile compatibility against required capabilities;
- next steps.

The same diagnostic object is available through `diagnoseCreationHostWorkspace` for Host UIs or CI.

Authoring diagnostics are available through `diagnoseCreationHostAuthoring`. This keeps the Developer workflow simple:

```text
scaffold-host
  -> emits profile + authoring files
doctor-host
  -> validates profile + workspace + authoring files
```

For a compact endpoint-friendly status, combine workspace and authoring diagnostics with `createCreationHostReadinessSummary`. The summary keeps `failed_check_kinds`, `error_count`, `warning_count`, and `next_steps` visible so Host UIs do not accidentally hide why the Creation Host is not ready.
