import {
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
const keepTemp = process.env.PNEUMA_KEEP_CONSUMER_SMOKE === "1";

const publishedPackageDirs = [
  "packages/core-domain",
  "packages/core",
  "packages/runtime",
  "packages/cli",
  "packages/backend-opencode",
  "packages/viewer-react",
  "packages/adapter-linear",
  "packages/provider-openrouter",
];

try {
  assertPublishedPackageManifests();
  writeConsumerProject();
  run("bun", ["install"], tempRoot);
  assertInstalledPackageManifests();
  run("bun", ["run", "smoke"], tempRoot);
  run("bunx", ["tsc", "--noEmit", "-p", "tsconfig.json"], tempRoot);
  console.log(`local package consumption smoke passed: ${tempRoot}`);
} finally {
  if (keepTemp) {
    console.log(`kept local package consumption temp project: ${tempRoot}`);
  } else {
    rmSync(tempRoot, { recursive: true, force: true });
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
      "@pneuma-framework/core-domain": `file:${join(repoRoot, "packages/core-domain")}`,
      "@pneuma-framework/core": `file:${join(repoRoot, "packages/core")}`,
      "@pneuma-framework/runtime": `file:${join(repoRoot, "packages/runtime")}`,
    },
    devDependencies: {
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
import { summarizeBuildThreadTurns, validatePortableArtifactSafety, type BuildTurn } from "@pneuma-framework/core";
import { PNEUMA_SQLITE_PATH_ENV } from "@pneuma-framework/runtime";

if (typeof Table !== "function") throw new Error("Table export is unavailable");
if (typeof Operation !== "function") throw new Error("Operation export is unavailable");
if (!isCellType({ kind: "primitive", of: "Text" })) throw new Error("CellType helper failed");

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
