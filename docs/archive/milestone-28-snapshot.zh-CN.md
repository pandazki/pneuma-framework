# Milestone 28 Snapshot 中文版 — Host Extension Slot Contract

**日期：** 2026-05-08  
**状态：** 作为 post-RC stabilization milestone 关闭。它不是 `pneuma-rc-0.1.4` release tag。  
**输入：** DevBoard Studio 下游压力：approved code changes 已经可以 apply，但生成的 widgets/hooks/tools 在未来进入 share/fork/install flows 前，还需要一个 portable slot/manifest contract。

## M28 证明了什么

M28 为 Host-owned open-ended artifacts 增加了一个很窄的 distribution contract：

```text
Scaffold Project
  -> Code Change Lane
  -> HostExtension Manifest
  -> HostExtension Slot Registry
  -> Host/Builder approval before install/update/uninstall
```

framework 现在可以验证一个 portable contribution bundle 是否能挂载进 Developer 声明的 Host slots。它仍然不执行 extension code，不发布 marketplace，也不把 open-ended artifacts 变成 framework definition rows。

## 关闭的反馈

| 反馈 | M28 结果 |
|---|---|
| Code Change Lane 能 apply source changes，但不能描述 portable extension contributions | 新增 `HostExtensionManifest`。 |
| Host 没有共同方式声明允许挂载 widget/API/hook/tool 的 mount points | 新增 `HostExtensionSlotRegistry`。 |
| Extension bundle 可能静默包含 secrets、SQLite files 或 private cache | Manifest validation 拒绝 secret、source database、private cache includes，并要求 secret/cache exclusions。 |
| Contribution 可能挂载到不匹配的 Host surface | Bundle validation 拒绝 unknown slots、kind mismatches、artifact-kind mismatches、runtime-mode mismatches 和 missing slot capabilities。 |
| Extension install/update/uninstall approval 容易被忘记 | Manifest governance 要求 install、update、uninstall 都需要 approval，且 conflict behavior 必须是 `fail-closed`。 |
| `doctor-host` 看不到 extension slots/manifests | `diagnoseCreationHostAuthoring` 现在检查 `host_extension_slots`、`host_extension` 和 `host_extension_bundle`。 |

## 边界决定

M28 保持 [ADR-0031](../architecture/adr/0031-open-ended-definition-artifact-boundary.md)：

```text
HostExtension manifests 是 Host-owned artifacts 的 portable evidence。
它们不是 framework definition rows。
它们不由 definition.apply_change_set 治理。
它们不在 framework 内执行 code。
```

因此 M28 是 [ADR-0034](../architecture/adr/0034-code-change-lane-executor.md) 的 distribution companion，不是 schema-driven definition governance 的替代品。

## Developer-facing 变化

新的 guide：

- [Host Extension Slots](../developer/host-extension-slots.md) / [中文版](../developer/host-extension-slots.zh-CN.md)

新的 ADR：

- [ADR-0035: Host Extension Slot Contract](../architecture/adr/0035-host-extension-slot-contract.md)

新的 core exports：

- `HostExtensionSlotRegistry`
- `HostExtensionManifest`
- `HostExtensionBundle`
- `validateHostExtensionSlotRegistry`
- `validateHostExtensionManifest`
- `validateHostExtensionBundle`

## 验证

在 M28 worktree 中运行：

```bash
bun test packages/core/test/host-extension.test.ts
bun test packages/core/test/developer-experience.test.ts packages/core/test/host-extension.test.ts
bun run typecheck
tmp_config=$(mktemp -d) && printf '{"auths":{}}\n' > "$tmp_config/config.json" && DOCKER_CONFIG="$tmp_config" bun test
```

最终结果：

- HostExtension targeted tests：`6 pass`，`0 fail`，`14 expect() calls`。
- HostExtension + developer-experience targeted tests：`20 pass`，`0 fail`，`64 expect() calls`。
- Typecheck：通过。
- 使用临时 Docker config 的 full suite：`1238 pass`，`0 fail`，`4597 expect() calls`，覆盖 `186 files`。

## 下一步

建议的下一个 milestone：

1. M29 — `AgentBackend.runTurn` 和 BuildThread receipt automation。

M28 刻意不处理 backend-agent runtime semantics。它只为下一个 agent milestone 提供更清晰的 Host-owned tools/widgets/hooks distribution boundary。
