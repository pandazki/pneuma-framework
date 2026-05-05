# Getting Started: Build Your First Creation Host

This guide is for a Developer approaching pneuma-framework from the outside.

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
  agent-package.json
  provider-capabilities.json
  share-artifact.example.json
  agent-policy.md
  README.md
  src/run.ts
```

This scaffold is intentionally small. It is a starting point for your Host, not a hidden framework-owned app builder.

The authoring files are the first M22 Creation Host Authoring Kit slice:

- `agent-package.json` describes the Developer-authored Build Agent Package used to create Builder-specific Build Agent Sessions.
- `provider-capabilities.json` describes supported/unsupported profile capabilities and fail-closed behavior.
- `share-artifact.example.json` documents the no-secret portable share artifact boundary.
- `agent-policy.md` is the human-readable rule sheet consumed by the package.

## 3. Run Doctor

```bash
bun packages/cli/src/index.ts doctor-host \
  --workspace /tmp/my-pneuma-host/.pneuma-workspace \
  --profiles /tmp/my-pneuma-host/profiles.json
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
```

This is a healthy empty Host workspace. It means your profile contract is valid and the next step is to create a generated app.

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

In your Host repo, add a small test around your profiles:

```ts
import { expect, test } from "bun:test";
import {
  validateBuildAgentPackageManifest,
  validateCreationHostProfileContract,
  validateProviderCapabilityMatrix,
  validateShareArtifactManifest,
  type CreationHostProfile,
} from "@pneuma-framework/core";
import agentPackage from "../agent-package.json";
import profilesJson from "../profiles.json";
import providerCapabilities from "../provider-capabilities.json";
import shareArtifact from "../share-artifact.example.json";

test("profiles satisfy the framework Creation Host contract", () => {
  for (const profile of profilesJson as CreationHostProfile[]) {
    const result = validateCreationHostProfileContract(profile);
    expect(result.issues).toEqual([]);
  }
});

test("authoring kit contracts are safe", () => {
  expect(validateBuildAgentPackageManifest(agentPackage).issues).toEqual([]);
  expect(validateProviderCapabilityMatrix(providerCapabilities).issues).toEqual([]);
  expect(validateShareArtifactManifest(shareArtifact).issues).toEqual([]);
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
