import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "../src/parse-args.js";
import {
  validateBuildAgentPackageManifest,
  validateCredentialRebindingEvidence,
  validateProviderCapabilityMatrix,
  validateShareArtifactManifest,
  validateSharingGovernanceManifest,
  type BuildAgentPackageManifest,
  type CredentialRebindingEvidence,
  type ProviderCapabilityMatrix,
  type ShareArtifactManifest,
  type SharingGovernanceManifest,
} from "@pneuma-framework/core";

const CLI = resolve(import.meta.dir, "../src/index.ts");

async function runCli(args: string[]): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const proc = Bun.spawn(["bun", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return {
    code: proc.exitCode,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
  };
}

test("parseArgs supports scaffold-host without templateDir", () => {
  const parsed = parseArgs([
    "scaffold-host",
    "/tmp/my-host",
    "--name",
    "My Host",
  ]);

  expect(parsed).toMatchObject({
    verb: "scaffold-host",
    target: "/tmp/my-host",
    name: "My Host",
  });
  expect(parsed.templateDir).toBeUndefined();
});

test("parseArgs supports doctor-host with workspace and profiles file", () => {
  const parsed = parseArgs([
    "doctor-host",
    "--workspace",
    "/tmp/my-host-workspace",
    "--profiles",
    "/tmp/profiles.json",
    "--agent-package",
    "/tmp/agent-package.json",
    "--provider-capabilities",
    "/tmp/provider-capabilities.json",
    "--share-artifact",
    "/tmp/share-artifact.example.json",
    "--sharing-governance",
    "/tmp/sharing-governance.example.json",
    "--credential-rebinding",
    "/tmp/credential-rebinding.example.json",
  ]);

  expect(parsed).toMatchObject({
    verb: "doctor-host",
    workspace: "/tmp/my-host-workspace",
    profiles: "/tmp/profiles.json",
    agentPackage: "/tmp/agent-package.json",
    providerCapabilities: "/tmp/provider-capabilities.json",
    shareArtifact: "/tmp/share-artifact.example.json",
    sharingGovernance: "/tmp/sharing-governance.example.json",
    credentialRebinding: "/tmp/credential-rebinding.example.json",
  });
  expect(parsed.templateDir).toBeUndefined();
});

test("scaffold-host writes a starter Creation Host project", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-cli-scaffold-"));
  const target = join(root, "my-host");
  try {
    const result = await runCli([
      "scaffold-host",
      target,
      "--name",
      "My Host",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("scaffolded Creation Host");
    expect(existsSync(join(target, "package.json"))).toBe(true);
    expect(existsSync(join(target, "profiles.json"))).toBe(true);
    expect(existsSync(join(target, "src/run.ts"))).toBe(true);
    expect(existsSync(join(target, "agent-package.json"))).toBe(true);
    expect(existsSync(join(target, "provider-capabilities.json"))).toBe(true);
    expect(existsSync(join(target, "share-artifact.example.json"))).toBe(true);
    expect(existsSync(join(target, "sharing-governance.example.json"))).toBe(true);
    expect(existsSync(join(target, "credential-rebinding.example.json"))).toBe(true);
    expect(existsSync(join(target, "agent-policy.md"))).toBe(true);
    const packageJson = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies["@pneuma-framework/core"]).toStartWith("file:");
    expect(packageJson.dependencies["@pneuma-framework/cli"]).toStartWith("file:");
    expect(readFileSync(join(target, "README.md"), "utf8")).toContain(
      "My Host",
    );

    const agentPackage = JSON.parse(
      readFileSync(join(target, "agent-package.json"), "utf8"),
    ) as BuildAgentPackageManifest;
    const providerMatrix = JSON.parse(
      readFileSync(join(target, "provider-capabilities.json"), "utf8"),
    ) as ProviderCapabilityMatrix;
    const shareArtifact = JSON.parse(
      readFileSync(join(target, "share-artifact.example.json"), "utf8"),
    ) as ShareArtifactManifest;
    const sharingGovernance = JSON.parse(
      readFileSync(join(target, "sharing-governance.example.json"), "utf8"),
    ) as SharingGovernanceManifest;
    const credentialRebinding = JSON.parse(
      readFileSync(join(target, "credential-rebinding.example.json"), "utf8"),
    ) as CredentialRebindingEvidence;
    expect(validateBuildAgentPackageManifest(agentPackage).ok).toBe(true);
    expect(validateProviderCapabilityMatrix(providerMatrix).ok).toBe(true);
    expect(validateShareArtifactManifest(shareArtifact).ok).toBe(true);
    expect(validateSharingGovernanceManifest(sharingGovernance).ok).toBe(true);
    expect(validateCredentialRebindingEvidence(credentialRebinding, sharingGovernance).ok).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("doctor-host reports invalid profile files with non-zero exit", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-cli-doctor-invalid-"));
  const workspace = join(root, "workspace");
  const profilesPath = join(root, "profiles.json");
  try {
    writeFileSync(
      profilesPath,
      JSON.stringify([
        {
          id: "Bad Profile",
          display_name: "",
          description: "",
          template_dir: "",
        },
      ]),
    );

    const result = await runCli([
      "doctor-host",
      "--workspace",
      workspace,
      "--profiles",
      profilesPath,
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Creation Host diagnostics: failed");
    expect(result.stdout).toContain("profile.id.invalid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("doctor-host validates authoring files when provided", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-cli-doctor-authoring-"));
  const target = join(root, "my-host");
  try {
    const scaffold = await runCli(["scaffold-host", target, "--name", "My Host"]);
    expect(scaffold.code).toBe(0);

    const result = await runCli([
      "doctor-host",
      "--workspace",
      join(target, ".pneuma-workspace"),
      "--profiles",
      join(target, "profiles.json"),
      "--agent-package",
      join(target, "agent-package.json"),
      "--provider-capabilities",
      join(target, "provider-capabilities.json"),
      "--share-artifact",
      join(target, "share-artifact.example.json"),
      "--sharing-governance",
      join(target, "sharing-governance.example.json"),
      "--credential-rebinding",
      join(target, "credential-rebinding.example.json"),
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Creation Host diagnostics: passed");
    expect(result.stdout).toContain("Creation Host authoring diagnostics: passed");
    expect(result.stdout).toContain("authoring agent_package: ok");
    expect(result.stdout).toContain("authoring provider_capabilities: ok");
    expect(result.stdout).toContain("authoring share_artifact: ok");
    expect(result.stdout).toContain("authoring sharing_governance: ok");
    expect(result.stdout).toContain("authoring credential_rebinding: ok");
    expect(result.stdout).toContain("authoring kit_cross_contract: ok");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("doctor-host returns non-zero when sharing governance files are unsafe", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-cli-doctor-sharing-invalid-"));
  const target = join(root, "my-host");
  try {
    const scaffold = await runCli(["scaffold-host", target, "--name", "My Host"]);
    expect(scaffold.code).toBe(0);
    const evidencePath = join(target, "credential-rebinding.example.json");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as CredentialRebindingEvidence;
    writeFileSync(evidencePath, JSON.stringify({
      ...evidence,
      bindings: [
        {
          requirement_id: "missing-token",
          provider_id: "github",
          status: "bound",
          credential_ref: "credref:missing",
          access_token: "ghp_should-not-live-here",
        },
      ],
    }));

    const result = await runCli([
      "doctor-host",
      "--workspace",
      join(target, ".pneuma-workspace"),
      "--profiles",
      join(target, "profiles.json"),
      "--sharing-governance",
      join(target, "sharing-governance.example.json"),
      "--credential-rebinding",
      evidencePath,
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Creation Host authoring diagnostics: failed");
    expect(result.stdout).toContain("credential_rebinding.secret_material.forbidden");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("doctor-host returns non-zero when authoring files are unsafe", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-cli-doctor-authoring-invalid-"));
  const target = join(root, "my-host");
  try {
    const scaffold = await runCli(["scaffold-host", target, "--name", "My Host"]);
    expect(scaffold.code).toBe(0);
    const agentPackagePath = join(target, "agent-package.json");
    const agentPackage = JSON.parse(readFileSync(agentPackagePath, "utf8")) as BuildAgentPackageManifest;
    writeFileSync(agentPackagePath, JSON.stringify({
      ...agentPackage,
      tool_allowlist: [],
      token: "should-not-live-here",
    }));

    const result = await runCli([
      "doctor-host",
      "--workspace",
      join(target, ".pneuma-workspace"),
      "--profiles",
      join(target, "profiles.json"),
      "--agent-package",
      agentPackagePath,
      "--provider-capabilities",
      join(target, "provider-capabilities.json"),
      "--share-artifact",
      join(target, "share-artifact.example.json"),
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Creation Host authoring diagnostics: failed");
    expect(result.stdout).toContain("build_agent_package.tool_allowlist.required");
    expect(result.stdout).toContain("build_agent_package.secret_material.forbidden");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
