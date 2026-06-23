import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dir, "..");
const tempRoot = mkdtempSync(join(tmpdir(), "pneuma-local-consumer-"));
const isolatedFrameworkRoot = join(tempRoot, "isolated-framework");
const keepTemp = process.env.PNEUMA_KEEP_CONSUMER_SMOKE === "1";

const publishedPackageDirs = [
  "packages/core-domain",
  "packages/core",
  "packages/runtime",
  "packages/host-kit",
  "packages/cli",
  "packages/backend-opencode",
  "packages/viewer-react",
  "packages/adapter-linear",
  "packages/provider-openrouter",
];

try {
  assertPublishedPackageManifests();
  copyPublishedPackageSources();
  writeConsumerProject();
  run("bun", ["install"], tempRoot);
  assertInstalledPackageManifests();
  run("bun", ["run", "smoke"], tempRoot);
  run("bunx", ["tsc", "--noEmit", "-p", "tsconfig.json"], tempRoot);
  runScaffoldAndDoctorSmoke();
  console.log(`local package consumption smoke passed: ${tempRoot}`);
} finally {
  if (keepTemp) {
    console.log(`kept local package consumption temp project: ${tempRoot}`);
  } else {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function copyPublishedPackageSources(): void {
  for (const packageDir of publishedPackageDirs) {
    cpSync(join(repoRoot, packageDir), join(isolatedFrameworkRoot, packageDir), {
      recursive: true,
      filter: (source) => {
        const rel = source.slice(repoRoot.length + 1);
        return !rel.includes("node_modules") &&
          !rel.includes(`${packageDir}/dist`) &&
          !rel.endsWith(".tsbuildinfo");
      },
    });
  }
}

function assertPublishedPackageManifests(): void {
  const offenders: string[] = [];
  for (const packageDir of publishedPackageDirs) {
    const packageJsonPath = join(repoRoot, packageDir, "package.json");
    const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    for (const [section, dependencies] of Object.entries({
      dependencies: manifest.dependencies,
      peerDependencies: manifest.peerDependencies,
      optionalDependencies: manifest.optionalDependencies,
    })) {
      for (const [name, range] of Object.entries(dependencies ?? {})) {
        if (range.startsWith("workspace:")) {
          offenders.push(`${packageDir}/package.json ${section}.${name}=${range}`);
        }
      }
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      [
        "published package manifests must not contain workspace protocol dependencies:",
        ...offenders.map((offender) => `  - ${offender}`),
      ].join("\n"),
    );
  }
}

function assertInstalledPackageManifests(): void {
  const packageNames = [
    "@pneuma-framework/core-domain",
    "@pneuma-framework/core",
    "@pneuma-framework/runtime",
    "@pneuma-framework/host-kit",
  ];
  for (const packageName of packageNames) {
    const manifestPath = join(tempRoot, "node_modules", packageName, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const workspaceDependency = Object.entries(manifest.dependencies ?? {}).find(([, range]) =>
      range.startsWith("workspace:"),
    );
    if (workspaceDependency) {
      const [name, range] = workspaceDependency;
      throw new Error(`${packageName} installed with workspace dependency ${name}=${range}`);
    }
  }
}

function writeConsumerProject(): void {
  writeJson("package.json", {
    name: "pneuma-local-consumer-smoke",
    private: true,
    type: "module",
    scripts: {
      smoke: "bun run smoke.ts",
    },
    dependencies: {
      "@pneuma-framework/core-domain": `file:${join(isolatedFrameworkRoot, "packages/core-domain")}`,
      "@pneuma-framework/core": `file:${join(isolatedFrameworkRoot, "packages/core")}`,
      "@pneuma-framework/runtime": `file:${join(isolatedFrameworkRoot, "packages/runtime")}`,
      "@pneuma-framework/host-kit": `file:${join(isolatedFrameworkRoot, "packages/host-kit")}`,
      "@pneuma-framework/cli": `file:${join(isolatedFrameworkRoot, "packages/cli")}`,
    },
    devDependencies: {
      "@types/bun": "latest",
      typescript: "^5.6.0",
    },
  });

  writeJson("tsconfig.json", {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ["smoke.ts"],
  });

  writeFileSync(
    join(tempRoot, "smoke.ts"),
    `import { Table, Operation, isCellType } from "@pneuma-framework/core-domain";
import { summarizeBuildThreadTurns, type BuildTurn } from "@pneuma-framework/core/build-thread";
import { validatePortableArtifactSafety } from "@pneuma-framework/core/portable-artifact-safety";
import { validateBuildAgentPackageManifest } from "@pneuma-framework/core/host-authoring";
import { createBuildChangeReviewPacket } from "@pneuma-framework/core/build-assurance";
import { prepareCodeChangeProposal } from "@pneuma-framework/core/code-change-lane";
import { evaluateBuildChangeGovernance } from "@pneuma-framework/core/enterprise-governance";
import { createReleaseRolloutState } from "@pneuma-framework/core/release-rollout";
import { createFileBuildThreadStore } from "@pneuma-framework/core/build-thread";
import { PNEUMA_SQLITE_PATH_ENV } from "@pneuma-framework/runtime/constants";
import { waitForRuntimeReady } from "@pneuma-framework/runtime/runtime-ready";
import { prepareHostKitCodeChangeReview, buildGovernedProposal } from "@pneuma-framework/host-kit";

if (typeof Table !== "function") throw new Error("Table export is unavailable");
if (typeof Operation !== "function") throw new Error("Operation export is unavailable");
if (!isCellType({ kind: "primitive", of: "Text" })) throw new Error("CellType helper failed");
if (typeof validateBuildAgentPackageManifest !== "function") throw new Error("host-authoring subpath failed");
if (typeof createBuildChangeReviewPacket !== "function") throw new Error("build-assurance subpath failed");
if (typeof prepareCodeChangeProposal !== "function") throw new Error("code-change-lane subpath failed");
if (typeof evaluateBuildChangeGovernance !== "function") throw new Error("enterprise-governance subpath failed");
if (typeof createReleaseRolloutState !== "function") throw new Error("release-rollout subpath failed");
if (typeof createFileBuildThreadStore !== "function") throw new Error("build-thread store subpath failed");
if (typeof waitForRuntimeReady !== "function") throw new Error("runtime-ready subpath failed");
if (typeof prepareHostKitCodeChangeReview !== "function") throw new Error("host-kit export failed");
if (typeof buildGovernedProposal !== "function") throw new Error("host-kit governed-change export failed");

const safeArtifact = validatePortableArtifactSafety({
  app_definition: { tables: [] },
  init_recipe: { steps: [] },
  provider_requirements: [],
});
if (!safeArtifact.ok) throw new Error("safe portable artifact should validate");

const unsafeArtifact = validatePortableArtifactSafety({
  token: "ghp_raw_secret",
});
if (unsafeArtifact.ok) throw new Error("unsafe portable artifact should be rejected");

const turns: BuildTurn[] = [
  {
    kind: "user",
    turn_id: "bturn_user",
    thread_id: "thread_1",
    turn_index: 0,
    ts_ms: 1,
    text: "Add a priority queue.",
  },
  {
    kind: "agent_proposal",
    turn_id: "bturn_proposal",
    thread_id: "thread_1",
    turn_index: 1,
    ts_ms: 2,
    proposal_id: "proposal_1",
    summary: "Add priority field and view.",
    rationale: "Builder needs triage.",
    tool_calls: [],
  },
];
const summary = summarizeBuildThreadTurns(turns);
if (summary.latest_proposal_id !== "proposal_1") throw new Error("BuildThread summary failed");
if (PNEUMA_SQLITE_PATH_ENV !== "PNEUMA_SQLITE_PATH") throw new Error("runtime env constant changed");

console.log(JSON.stringify({ ok: true, latest_proposal_id: summary.latest_proposal_id }));
`,
    "utf8",
  );
}

function runScaffoldAndDoctorSmoke(): void {
  const cli = join(tempRoot, "node_modules", "@pneuma-framework", "cli", "src", "index.ts");
  const hostDir = join(tempRoot, "scaffolded-host");
  run("bun", [cli, "scaffold-host", hostDir, "--name", "Package Smoke Host"], tempRoot);
  run("bun", ["install"], hostDir);
  run("bun", [cli, "doctor-host",
    "--workspace", join(hostDir, ".pneuma-workspace"),
    "--profiles", join(hostDir, "profiles.json"),
    "--scaffold-project", join(hostDir, "pneuma.scaffold.json"),
    "--agent-package", join(hostDir, "agent-package.json"),
    "--provider-capabilities", join(hostDir, "provider-capabilities.json"),
    "--share-artifact", join(hostDir, "share-artifact.example.json"),
    "--sharing-governance", join(hostDir, "sharing-governance.example.json"),
    "--credential-rebinding", join(hostDir, "credential-rebinding.example.json"),
  ], tempRoot);
}

function writeJson(path: string, value: unknown): void {
  const target = join(tempRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}
