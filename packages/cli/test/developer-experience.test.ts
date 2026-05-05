import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "../src/parse-args.js";
import {
  validateBuildAgentPackageManifest,
  validateProviderCapabilityMatrix,
  validateShareArtifactManifest,
  type BuildAgentPackageManifest,
  type ProviderCapabilityMatrix,
  type ShareArtifactManifest,
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
  ]);

  expect(parsed).toMatchObject({
    verb: "doctor-host",
    workspace: "/tmp/my-host-workspace",
    profiles: "/tmp/profiles.json",
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
    expect(validateBuildAgentPackageManifest(agentPackage).ok).toBe(true);
    expect(validateProviderCapabilityMatrix(providerMatrix).ok).toBe(true);
    expect(validateShareArtifactManifest(shareArtifact).ok).toBe(true);
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
