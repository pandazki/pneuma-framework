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

## Doctor Contract

Use:

```bash
pneuma-framework doctor-host --workspace ./workspace --profiles ./profiles.json
```

Doctor checks:

- profile contract validity;
- Host state file presence;
- generated-app project/version counts;
- missing version directories;
- next steps.

The same diagnostic object is available through `diagnoseCreationHostWorkspace` for Host UIs or CI.

