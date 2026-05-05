# Creation Host Contract

This guide explains what a Developer must provide when building on pneuma-framework.

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
- profile contract validation;
- workspace diagnostics.

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

M22 adds the first machine-readable Creation Host Authoring Kit boundary. A scaffolded Host now includes:

```text
agent-package.json
provider-capabilities.json
share-artifact.example.json
agent-policy.md
```

These files are still **Host-owned**. The framework only validates the generic safety shape:

| File | Purpose | Core validator |
|---|---|---|
| `agent-package.json` | Declares the Developer-authored Build Agent Package: instructions path, semantic tool allowlist, credential boundary, review checklist, verification hooks. | `validateBuildAgentPackageManifest` |
| `provider-capabilities.json` | Declares profile/provider capabilities, unsupported capabilities, and fail-closed behavior. | `validateProviderCapabilityMatrix` |
| `share-artifact.example.json` | Documents the portable no-secret share artifact shape: app definition, init recipe, provider requirements, exclusions. | `validateShareArtifactManifest` |
| `agent-policy.md` | Human-readable Builder-agent rules authored by the Host Developer. | Host-owned text; referenced by package manifest |

This is the important boundary:

```text
Build Agent Package = Developer-authored guardrail package.
Build Agent Session = Builder-specific runtime instance created from that package.
```

The framework validates that the package does not contain raw secrets, that provider limitations fail closed, and that share artifacts are portable manifests rather than databases.

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
import { assertCreationHostProfileContract } from "@pneuma-framework/core";

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

Use the M22 helpers for the new authoring files:

```ts
import { expect, test } from "bun:test";
import {
  validateBuildAgentPackageManifest,
  validateProviderCapabilityMatrix,
  validateShareArtifactManifest,
} from "@pneuma-framework/core";
import agentPackage from "../agent-package.json";
import providerCapabilities from "../provider-capabilities.json";
import shareArtifact from "../share-artifact.example.json";

test("Creation Host authoring contracts are valid", () => {
  expect(validateBuildAgentPackageManifest(agentPackage).issues).toEqual([]);
  expect(validateProviderCapabilityMatrix(providerCapabilities).issues).toEqual([]);
  expect(validateShareArtifactManifest(shareArtifact).issues).toEqual([]);
});
```

These validators do not prove your Host product is complete. They prove the first Authoring Kit safety boundary: no raw secrets in package/share files, explicit provider fail-closed behavior, and a share artifact that can be re-bound instead of copied as a raw database.

## Doctor Contract

Use:

```bash
pneuma-framework doctor-host \
  --workspace ./workspace \
  --profiles ./profiles.json \
  --agent-package ./agent-package.json \
  --provider-capabilities ./provider-capabilities.json \
  --share-artifact ./share-artifact.example.json
```

Doctor checks:

- profile contract validity;
- Host state file presence;
- generated-app project/version counts;
- missing version directories;
- Build Agent Package manifest safety;
- Provider Capability Matrix fail-closed behavior;
- Share Artifact manifest portability and no-secret boundary;
- next steps.

The same diagnostic object is available through `diagnoseCreationHostWorkspace` for Host UIs or CI.

Authoring diagnostics are available through `diagnoseCreationHostAuthoring`. This keeps the Developer workflow simple:

```text
scaffold-host
  -> emits profile + authoring files
doctor-host
  -> validates profile + workspace + authoring files
```
