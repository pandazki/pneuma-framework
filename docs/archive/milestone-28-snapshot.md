# Milestone 28 Snapshot — Host Extension Slot Contract

**Date:** 2026-05-08  
**Status:** Closed as a post-RC stabilization milestone. This is not a `pneuma-rc-0.1.4` release tag.  
**Input:** DevBoard Studio downstream pressure: approved code changes can be applied, but generated widgets/hooks/tools still need a portable slot/manifest contract before future share/fork/install flows can carry them safely.

## What M28 Proved

M28 added a narrow distribution contract for Host-owned open-ended artifacts:

```text
Scaffold Project
  -> Code Change Lane
  -> HostExtension Manifest
  -> HostExtension Slot Registry
  -> Host/Builder approval before install/update/uninstall
```

The framework now validates whether a portable contribution bundle can mount into Developer-declared Host slots. It still does not execute extension code, publish a marketplace, or turn open-ended artifacts into framework definition rows.

## Closed Findings

| Finding | M28 result |
|---|---|
| Code Change Lane could apply source changes but not describe portable extension contributions | Added `HostExtensionManifest`. |
| Hosts had no common way to declare allowed widget/API/hook/tool mount points | Added `HostExtensionSlotRegistry`. |
| Extension bundles could silently include secrets, SQLite files, or private cache | Manifest validation rejects secret, source database, and private cache includes and requires secret/cache exclusions. |
| A contribution could target a mismatched Host surface | Bundle validation rejects unknown slots, kind mismatches, artifact-kind mismatches, runtime-mode mismatches, and missing slot capabilities. |
| Extension install/update/uninstall approval was easy to forget | Manifest governance requires approval for install, update, and uninstall, and requires conflict behavior to be `fail-closed`. |
| `doctor-host` could not see extension slots/manifests | `diagnoseCreationHostAuthoring` now checks `host_extension_slots`, `host_extension`, and `host_extension_bundle`. |

## Boundary Decisions

M28 preserves [ADR-0031](../architecture/adr/0031-open-ended-definition-artifact-boundary.md):

```text
HostExtension manifests are portable evidence for Host-owned artifacts.
They are not framework definition rows.
They are not governed by definition.apply_change_set.
They do not execute code inside the framework.
```

M28 is therefore the distribution companion to [ADR-0034](../architecture/adr/0034-code-change-lane-executor.md), not a replacement for schema-driven definition governance.

## Developer-Facing Changes

New guide:

- [Host Extension Slots](../developer/host-extension-slots.md) / [中文版](../developer/host-extension-slots.zh-CN.md)

New ADR:

- [ADR-0035: Host Extension Slot Contract](../architecture/adr/0035-host-extension-slot-contract.md)

New core exports:

- `HostExtensionSlotRegistry`
- `HostExtensionManifest`
- `HostExtensionBundle`
- `validateHostExtensionSlotRegistry`
- `validateHostExtensionManifest`
- `validateHostExtensionBundle`

## Verification

Commands run from the M28 worktree:

```bash
bun test packages/core/test/host-extension.test.ts
bun test packages/core/test/developer-experience.test.ts packages/core/test/host-extension.test.ts
bun run typecheck
tmp_config=$(mktemp -d) && printf '{"auths":{}}\n' > "$tmp_config/config.json" && DOCKER_CONFIG="$tmp_config" bun test
```

Final results:

- HostExtension targeted tests: `6 pass`, `0 fail`, `14 expect() calls`.
- HostExtension + developer-experience targeted tests: `20 pass`, `0 fail`, `64 expect() calls`.
- Typecheck: passed.
- Full suite with a temporary Docker config: `1238 pass`, `0 fail`, `4597 expect() calls` across `186 files`.

## Next

Recommended next milestone:

1. M29 — `AgentBackend.runTurn` and BuildThread receipt automation.

M28 deliberately leaves backend-agent runtime semantics alone. It only gives the next agent milestone a cleaner distribution boundary for Host-owned tools/widgets/hooks.
