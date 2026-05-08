# Host Extension Slots

**Audience:** Developers who let a Build-phase Agent create portable UI/API/hook/tool contributions for Host-owned open-ended artifacts.

HostExtension Slots are the distribution contract after a governed code-change lane:

```text
Scaffold Project
  -> Build Agent drafts source changes
  -> Code Change Lane prepares/applies approved changes
  -> HostExtension Manifest packages portable contributions
  -> HostExtension Slot Registry declares where those contributions may mount
```

This is still a Host-owned lane. A HostExtension is **not** a framework definition row, not `definition.apply_change_set`, not a marketplace primitive, and not runtime code execution by the framework. The framework validates shape and portability so Hosts do not each reinvent the same safety checks.

## Slot Registry

A Creation Host declares the slots it supports:

```ts
import type { HostExtensionSlotRegistry } from "@pneuma-framework/core";

export const slots: HostExtensionSlotRegistry = {
  schema_version: 1,
  host_id: "dev-board-host",
  slots: [
    {
      slot_id: "dashboard-widget",
      kind: "ui",
      display_name: "Dashboard Widget",
      description: "Mounts a Builder-created widget on the dashboard.",
      runtime_modes: ["preview", "published"],
      accepted_artifact_kinds: ["tsx-module"],
      required_capabilities: ["relational-store"],
    },
  ],
};
```

The slot registry says what the Host is willing to mount. It does not install anything by itself.

## Extension Manifest

An extension manifest packages one portable contribution bundle:

```ts
import type { HostExtensionManifest } from "@pneuma-framework/core";

export const extension: HostExtensionManifest = {
  schema_version: 1,
  extension_id: "priority-widget",
  version: "0.1.0",
  display_name: "Priority Widget",
  description: "Adds a priority dashboard widget.",
  created_from: {
    app_id: "dev-board",
    version_id: "v3",
    scaffold_id: "dev-board-scaffold",
    scaffold_version: "0.1.0",
    package_id: "dev-board-builder",
    package_version: "0.1.0",
  },
  bundle: {
    root: "extensions/priority-widget",
    include: ["src/widget.tsx", "manifest.json"],
    exclude: [".env", "data", "node_modules", ".pneuma"],
  },
  slots: [
    {
      id: "main-widget",
      slot_id: "dashboard-widget",
      kind: "ui",
      artifact_kind: "tsx-module",
      artifact_path: "src/widget.tsx",
      export_name: "PriorityWidget",
      runtime_modes: ["preview", "published"],
      required_capabilities: ["relational-store"],
    },
  ],
  credential_requirements: [],
  target_profile_policy: {
    compatible_profile_ids: ["starter-bun-sqlite"],
    required_capabilities: ["relational-store"],
  },
  governance: {
    install_requires_approval: true,
    update_requires_approval: true,
    uninstall_requires_approval: true,
    conflict_behavior: "fail-closed",
  },
};
```

The manifest must exclude secret material, source databases, private derived cache, and framework-private state. Bundle `include` paths are portable artifacts only.

## Validation

Use the core validators:

```ts
import {
  validateHostExtensionBundle,
  validateHostExtensionManifest,
  validateHostExtensionSlotRegistry,
} from "@pneuma-framework/core";

const slotCheck = validateHostExtensionSlotRegistry(slots);
const extensionCheck = validateHostExtensionManifest(extension);
const bundleCheck = validateHostExtensionBundle({ slots, extension });
```

`validateHostExtensionBundle` fails closed when:

- a contribution targets an unknown slot;
- contribution kind does not match the Host slot;
- artifact kind is not accepted by the slot;
- runtime mode is not accepted by the slot;
- required capability is not declared by the slot;
- approval governance is missing;
- bundle paths include secrets, databases, or private cache.

`diagnoseCreationHostAuthoring` also accepts `host_extension_slots` and `host_extension`, so Host CI can validate the extension lane alongside Build Agent Package, Scaffold Project, provider matrix, share artifact, and sharing governance.

## Relationship To Other Contracts

| Contract | Role |
|---|---|
| Scaffold Project | Declares source roots, writable/protected paths, guardrails, and lifecycle commands. |
| Code Change Lane | Turns an approved draft workspace into applied source changes with evidence. |
| HostExtension Slots | Declares where portable extension contributions may mount. |
| Share Artifact | Carries portable app definition/init/provider requirements; future Hosts may include HostExtension manifests as portable artifact metadata. |
| Sharing Governance | Decides who may install/fork/publish/revoke the portable artifact. |

## Limits

M28 intentionally does not provide:

- runtime execution of extension code;
- plugin marketplace transport;
- cross-Host conflict resolution beyond fail-closed validation;
- automatic share/fork packaging;
- framework definition rows for open-ended UI/module artifacts.

Those remain future lanes. The value of M28 is narrower: a Developer can tell the framework what extension slots exist, and the framework can validate whether a portable HostExtension contribution is safe and compatible enough to present for Host/Builder approval.
