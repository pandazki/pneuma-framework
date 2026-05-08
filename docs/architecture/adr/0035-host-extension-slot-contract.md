# ADR-0035: Host Extension Slot Contract

**Status:** Accepted  
**Date:** 2026-05-08  
**Related:** [ADR-0031](./0031-open-ended-definition-artifact-boundary.md), [ADR-0033](./0033-scaffold-project-contract.md), [ADR-0034](./0034-code-change-lane-executor.md)

## Context

ADR-0031 kept open-ended UI/module artifacts Host-owned in v0. ADR-0033 defined the Scaffold Project boundary. ADR-0034 made the Code Change Lane executable: a Host can compare a draft workspace to source, request one Builder approval, apply source changes, and record BuildThread receipt evidence.

One gap remained after downstream DevBoard pressure:

```text
Approved source changes can be applied,
but the framework has no portable way to say:
"this approved artifact contributes a widget / API / runtime hook / agent tool,
and it may only mount into these Host-declared slots."
```

Without a shared contract, every Host invents a slightly different extension manifest, secret-exclusion rule, slot compatibility rule, and conflict behavior. That weakens sharing/forking because portable code contributions are not inspectable in a common shape.

## Decision

Accept **HostExtension Slot Contract** as an additive post-RC framework contract.

The framework now validates two Host-owned manifest shapes:

```text
HostExtensionSlotRegistry
  -> Developer-declared slots a Creation Host supports

HostExtensionManifest
  -> portable extension contribution bundle produced from a generated-app version
```

And one cross-contract check:

```text
validateHostExtensionBundle({ slots, extension })
  -> contribution slot ids exist
  -> kind / artifact kind / runtime modes are compatible
  -> required capabilities are declared by the slot
  -> governance requires approval
  -> bundle excludes secrets, source databases, and private cache
```

This is a **validation and distribution contract**, not runtime execution.

The accepted boundary remains:

```text
Open-ended UI/module artifacts stay Host-owned.
HostExtension manifests are portable evidence for those artifacts.
HostExtension manifests are not framework definition rows.
HostExtension installation is Host/Builder approved and conflict-fail-closed.
```

## Consequences

### Positive

- Code Change Lane now has a natural downstream artifact: approved source changes can be packaged as a HostExtension manifest.
- Host slot compatibility becomes inspectable before install/fork/share workflows.
- The framework can help downstream Hosts avoid exporting secrets, source databases, private cache, or framework-private state.
- `doctor-host` can validate HostExtension slots/manifests alongside Build Agent Package, Scaffold Project, provider matrix, share artifact, and sharing governance.

### Negative / Limits

- The framework still does not execute extension code.
- The framework still does not provide a marketplace or transport layer.
- The framework still does not solve arbitrary extension conflict resolution; M28 requires `conflict_behavior: "fail-closed"`.
- The framework still does not promote open-ended UI/module artifacts into `pneuma_*` definition rows.

These limits preserve ADR-0031. M28 closes a concrete distribution-shape gap without changing the core definition model.

## Verification

M28 adds tests for:

- valid slot registry + valid extension manifest;
- unknown slot rejection;
- slot kind, artifact kind, runtime mode, and capability mismatch rejection;
- no-secret/no-database/no-private-cache bundle validation;
- fail-closed approval governance validation;
- `diagnoseCreationHostAuthoring` integration for HostExtension slots/manifests/bundles.
