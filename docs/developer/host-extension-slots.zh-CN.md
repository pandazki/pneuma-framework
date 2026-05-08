# Host Extension Slots 中文版

**读者：** 允许 Build-phase Agent 为 Host-owned open-ended artifacts 创建可移植 UI/API/hook/tool contribution 的 Developer。

HostExtension Slots 是 governed code-change lane 之后的 distribution contract：

```text
Scaffold Project
  -> Build Agent drafts source changes
  -> Code Change Lane prepares/applies approved changes
  -> HostExtension Manifest packages portable contributions
  -> HostExtension Slot Registry declares where those contributions may mount
```

这仍然是 Host-owned lane。HostExtension **不是** framework definition row，不是 `definition.apply_change_set`，不是 marketplace primitive，也不是 framework 执行 runtime code。framework 只验证 shape 和 portability，避免每个 Host 重新实现同一组安全检查。

## Slot Registry

Creation Host 声明它支持哪些 slots：

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

Slot registry 表达 Host 愿意挂载什么。它本身不安装任何东西。

## Extension Manifest

Extension manifest 打包一个 portable contribution bundle：

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

manifest 必须排除 secret material、source database、private derived cache 和 framework-private state。`include` 只应该是可移植 artifacts。

## Validation

使用 core validators：

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

`validateHostExtensionBundle` 在这些情况下 fail closed：

- contribution 指向 unknown slot；
- contribution kind 和 Host slot 不匹配；
- artifact kind 不被 slot 接受；
- runtime mode 不被 slot 接受；
- required capability 没有被 slot 声明；
- 缺少 approval governance；
- bundle paths 包含 secrets、databases 或 private cache。

`diagnoseCreationHostAuthoring` 也接受 `host_extension_slots` 和 `host_extension`，所以 Host CI 可以把 extension lane 与 Build Agent Package、Scaffold Project、provider matrix、share artifact、sharing governance 一起验证。

## 与其他 contracts 的关系

| Contract | 作用 |
|---|---|
| Scaffold Project | 声明 source roots、writable/protected paths、guardrails 和 lifecycle commands。 |
| Code Change Lane | 将 approved draft workspace 变成带 evidence 的 applied source changes。 |
| HostExtension Slots | 声明 portable extension contributions 可以挂载在哪里。 |
| Share Artifact | 携带 portable app definition/init/provider requirements；未来 Host 可以把 HostExtension manifests 作为 portable artifact metadata 携带。 |
| Sharing Governance | 决定谁可以 install/fork/publish/revoke portable artifact。 |

## 边界

M28 刻意不提供：

- runtime execution of extension code；
- plugin marketplace transport；
- 超过 fail-closed validation 的 cross-Host conflict resolution；
- automatic share/fork packaging；
- open-ended UI/module artifacts 的 framework definition rows。

这些属于未来 lanes。M28 的价值更窄：Developer 可以告诉 framework 有哪些 extension slots，framework 可以验证一个 portable HostExtension contribution 是否足够安全、兼容，能不能进入 Host/Builder approval。
