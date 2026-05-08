# M28 Host Extension Slot Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small HostExtension / extension-slot distribution contract so Host-owned open-ended artifacts can be packaged, validated, and installed against Developer-declared Host slots without becoming framework definition rows.

**Architecture:** Keep extension content Host-owned. The framework validates only portable manifest shape, no-secret bundle boundaries, slot compatibility, provider capability compatibility, and approval semantics. This is the distribution counterpart to Code Change Lane: Code Change Lane governs draft/source apply; HostExtension Slots govern whether the resulting portable bundle can be mounted into a Creation Host / Generated Application surface.

**Tech Stack:** Bun test runner, TypeScript, `@pneuma-framework/core` validators, markdown docs.

---

## File Structure

- Create `packages/core/src/host-extension.ts`: Host extension slot, manifest, and bundle validators.
- Modify `packages/core/src/developer-experience.ts`: include HostExtension checks in `diagnoseCreationHostAuthoring`.
- Modify `packages/core/src/index.ts`: export HostExtension public API.
- Create `packages/core/test/host-extension.test.ts`: focused M28 contract tests.
- Modify `packages/core/test/developer-experience.test.ts`: doctor-host integration tests for extension slots/manifests.
- Create `docs/developer/host-extension-slots.md` and `.zh-CN.md`: Developer guide.
- Create `docs/architecture/adr/0035-host-extension-slot-contract.md`: accepted boundary ADR.
- Create `docs/architecture/milestone-28-snapshot.md` and `.zh-CN.md`: evidence and next-step snapshot.
- Modify `docs/developer/creation-host-contract.md` and `.zh-CN.md`: place HostExtension beside Scaffold Project / Code Change Lane / Share Artifact.
- Modify `docs/architecture/README.md`, `docs/architecture/roadmap.md`, `AGENTS.md`, `CLAUDE.md`: navigation/status updates.

## Task 1: Host Extension Manifest Validator

**Files:**
- Create: `packages/core/test/host-extension.test.ts`
- Create: `packages/core/src/host-extension.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write failing tests**

Add tests proving a valid Host slot registry and Host extension manifest pass:

```ts
const validSlots: HostExtensionSlotRegistry = {
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
    {
      slot_id: "runtime-start-hook",
      kind: "runtime-hook",
      display_name: "Runtime Start Hook",
      description: "Runs Host-approved code during runtime start.",
      runtime_modes: ["preview"],
      accepted_artifact_kinds: ["ts-module"],
      required_capabilities: [],
    },
  ],
};

const validExtension: HostExtensionManifest = {
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

expect(validateHostExtensionSlotRegistry(validSlots).issues).toEqual([]);
expect(validateHostExtensionManifest(validExtension).issues).toEqual([]);
expect(validateHostExtensionBundle({
  slots: validSlots,
  extension: validExtension,
}).ok).toBe(true);
```

Also add negative tests for:

- unknown slot id;
- slot kind mismatch;
- artifact kind mismatch;
- published-mode contribution into a preview-only slot;
- missing secret exclusions;
- raw database/cache bundle inclusions.

- [x] **Step 2: Verify red**

Run:

```bash
bun test packages/core/test/host-extension.test.ts
```

Expected: FAIL because `host-extension.ts` and exports do not exist.

- [x] **Step 3: Implement minimal validator**

Implement:

- `HostExtensionSlotKind = "ui" | "api" | "runtime-hook" | "agent-tool" | "data-import"`
- `HostExtensionArtifactKind = "ts-module" | "tsx-module" | "json" | "static-asset" | "command"`
- `HostExtensionRuntimeMode = "preview" | "published"`
- `HostExtensionSlotRegistry`
- `HostExtensionManifest`
- `validateHostExtensionSlotRegistry`
- `validateHostExtensionManifest`
- `validateHostExtensionBundle`

Use issue shape from Host Authoring Kit:

```ts
export interface HostExtensionContractIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}
```

Keep the validator additive. Do not import runtime or core-domain.

- [x] **Step 4: Verify green**

Run:

```bash
bun test packages/core/test/host-extension.test.ts
```

Expected: PASS.

## Task 2: Doctor-Host Authoring Integration

**Files:**
- Modify: `packages/core/test/developer-experience.test.ts`
- Modify: `packages/core/src/developer-experience.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write failing tests**

Add a valid extension diagnosis:

```ts
const report = diagnoseCreationHostAuthoring({
  host_extension_slots: validExtensionSlots,
  host_extension: validHostExtension,
});

expect(report.ok).toBe(true);
expect(report.summary).toMatchObject({
  host_extension_slots_checked: true,
  host_extension_checked: true,
});
expect(report.authoring_checks.map((check) => [check.kind, check.ok])).toEqual([
  ["host_extension_slots", true],
  ["host_extension", true],
  ["host_extension_bundle", true],
]);
```

Add an invalid bundle diagnosis where the extension references a missing slot:

```ts
const report = diagnoseCreationHostAuthoring({
  host_extension_slots: validExtensionSlots,
  host_extension: {
    ...validHostExtension,
    slots: [{ ...validHostExtension.slots[0], slot_id: "missing-slot" }],
  },
});

expect(report.ok).toBe(false);
expect(report.authoring_checks.flatMap((check) =>
  check.issues.map((issue) => issue.code)
)).toContain("host_extension_bundle.slot.unknown");
```

- [x] **Step 2: Verify red**

Run:

```bash
bun test packages/core/test/developer-experience.test.ts
```

Expected: FAIL because `diagnoseCreationHostAuthoring` has no HostExtension inputs or summary fields.

- [x] **Step 3: Implement diagnosis integration**

Add `host_extension_slots?: HostExtensionSlotRegistry` and `host_extension?: HostExtensionManifest` to `DiagnoseCreationHostAuthoringOptions`. Add check kinds:

- `host_extension_slots`
- `host_extension`
- `host_extension_bundle`

Add summary booleans:

- `host_extension_slots_checked`
- `host_extension_checked`

When both slots and extension are present, run `validateHostExtensionBundle`.

- [x] **Step 4: Verify green**

Run:

```bash
bun test packages/core/test/developer-experience.test.ts packages/core/test/host-extension.test.ts
```

Expected: PASS.

## Task 3: Docs And ADR

**Files:**
- Create: `docs/developer/host-extension-slots.md`
- Create: `docs/developer/host-extension-slots.zh-CN.md`
- Create: `docs/architecture/adr/0035-host-extension-slot-contract.md`
- Modify: `docs/developer/creation-host-contract.md`
- Modify: `docs/developer/creation-host-contract.zh-CN.md`

- [x] **Step 1: Document the boundary**

Document the accepted M28 shape:

```text
Code Change Lane
  -> produces approved source artifact changes
HostExtension Manifest
  -> packages portable extension contribution
HostExtension Slot Registry
  -> declares where a Host may mount extension contributions
Share/Fork later
  -> may carry HostExtension manifests, but not source databases/secrets/cache
```

State explicitly:

- HostExtension is still Host-owned.
- It is not a framework definition row.
- It does not execute code.
- It validates installability and portability evidence.
- Conflicts fail closed.

- [x] **Step 2: Verify docs links**

Run the local markdown link checker over touched docs.

Expected: no broken relative links.

## Task 4: Snapshot And Navigation

**Files:**
- Create: `docs/architecture/milestone-28-snapshot.md`
- Create: `docs/architecture/milestone-28-snapshot.zh-CN.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [x] **Step 1: Write snapshot**

Record:

- what M28 proved;
- why it does not overturn ADR-0031;
- which DevBoard feedback it addresses;
- verification commands;
- next recommended M29: `AgentBackend.runTurn` + receipt automation.

- [x] **Step 2: Update navigation**

Add M28 to the docs entry points and agent boot order after M27.

## Task 5: Final Verification And Commit

- [x] **Step 1: Run targeted tests**

```bash
bun test packages/core/test/host-extension.test.ts packages/core/test/developer-experience.test.ts
```

- [x] **Step 2: Run typecheck**

```bash
bun run typecheck
```

- [x] **Step 3: Run full suite**

```bash
tmp_config=$(mktemp -d) && printf '{"auths":{}}\n' > "$tmp_config/config.json" && DOCKER_CONFIG="$tmp_config" bun test
```

- [x] **Step 4: Commit**

```bash
git add .
git commit -m "feat(core): add host extension slot contract"
```

---

## Self-Review

- Spec coverage: covers slot declarations, extension manifests, bundle compatibility, no-secret portable boundaries, doctor-host diagnostics, docs, ADR, and snapshot.
- Scope exclusions: no runtime execution, no plugin marketplace, no framework definition rows, no direct share/fork transport, no conflict resolver beyond fail-closed validation.
- Type consistency: uses `host_extension_slots` / `host_extension` / `host_extension_bundle` consistently across diagnosis, tests, and docs.
