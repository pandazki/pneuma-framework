import { describe, expect, test } from "bun:test";
import {
  validateHostExtensionBundle,
  validateHostExtensionManifest,
  validateHostExtensionSlotRegistry,
  type HostExtensionManifest,
  type HostExtensionSlotRegistry,
} from "../src/index.js";

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

describe("HostExtension slot contract", () => {
  test("accepts a valid Host slot registry and portable extension manifest", () => {
    expect(validateHostExtensionSlotRegistry(validSlots).issues).toEqual([]);
    expect(validateHostExtensionManifest(validExtension).issues).toEqual([]);

    const bundle = validateHostExtensionBundle({
      slots: validSlots,
      extension: validExtension,
    });

    expect(bundle.ok).toBe(true);
    expect(bundle.issues).toEqual([]);
  });

  test("rejects extension contributions targeting unknown slots", () => {
    const bundle = validateHostExtensionBundle({
      slots: validSlots,
      extension: {
        ...validExtension,
        slots: [
          {
            ...validExtension.slots[0],
            slot_id: "missing-slot",
          },
        ],
      },
    });

    expect(bundle.ok).toBe(false);
    expect(bundle.issues.map((issue) => issue.code)).toContain(
      "host_extension_bundle.slot.unknown",
    );
  });

  test("rejects slot kind, artifact kind, runtime mode, and capability mismatches", () => {
    const bundle = validateHostExtensionBundle({
      slots: validSlots,
      extension: {
        ...validExtension,
        slots: [
          {
            ...validExtension.slots[0],
            kind: "api",
            artifact_kind: "json",
            runtime_modes: ["published"],
            required_capabilities: ["semantic-index"],
          },
          {
            ...validExtension.slots[0],
            id: "start-hook",
            slot_id: "runtime-start-hook",
            kind: "runtime-hook",
            artifact_kind: "ts-module",
            artifact_path: "src/start-hook.ts",
            export_name: "onRuntimeStart",
            runtime_modes: ["preview", "published"],
            required_capabilities: [],
          },
        ],
      },
    });

    expect(bundle.ok).toBe(false);
    expect(bundle.issues.map((issue) => issue.code)).toEqual([
      "host_extension_bundle.slot.kind_mismatch",
      "host_extension_bundle.slot.artifact_kind_unsupported",
      "host_extension_bundle.slot.capability_missing",
      "host_extension_bundle.slot.runtime_mode_unsupported",
    ]);
  });

  test("rejects extension manifests that could package secrets, databases, or private cache", () => {
    const result = validateHostExtensionManifest({
      ...validExtension,
      bundle: {
        root: "extensions/priority-widget",
        include: ["src/widget.tsx", ".env", "data/app.db", ".pneuma/cache.json"],
        exclude: ["node_modules"],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "host_extension.bundle.exclude.secret_required",
      "host_extension.bundle.exclude.private_cache_required",
      "host_extension.bundle.include.secret_forbidden",
      "host_extension.bundle.include.source_database_forbidden",
      "host_extension.bundle.include.private_cache_forbidden",
    ]);
  });

  test("rejects extension manifests without fail-closed approval governance", () => {
    const result = validateHostExtensionManifest({
      ...validExtension,
      governance: {
        install_requires_approval: false,
        update_requires_approval: true,
        uninstall_requires_approval: true,
        conflict_behavior: "allow-overwrite",
      },
    } as unknown as HostExtensionManifest);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "host_extension.governance.install_requires_approval.required",
      "host_extension.governance.conflict_behavior.fail_closed_required",
    ]);
  });

  test("rejects malformed extension credential requirements", () => {
    const result = validateHostExtensionManifest({
      ...validExtension,
      credential_requirements: [
        {
          id: "Bad Credential",
          provider_id: "",
          scopes: ["repo", ""],
          binding_mode: "root-secret",
          placement: "raw-file",
          required: "yes",
        },
      ],
    } as unknown as HostExtensionManifest);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "host_extension.credential_requirement.id.invalid",
      "host_extension.credential_requirement.provider_id.invalid",
      "host_extension.credential_requirement.scopes.invalid",
      "host_extension.credential_requirement.binding_mode.invalid",
      "host_extension.credential_requirement.placement.invalid",
      "host_extension.credential_requirement.required.invalid",
    ]);
  });
});
