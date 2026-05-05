#!/usr/bin/env bun
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  createPneumaFramework,
  diagnoseCreationHostWorkspace,
  formatCreationHostDiagnosticsReport,
  getAgentBackendFactory,
  type AgentBackend,
  type BuildAgentPackageManifest,
  type CreationHostProfile,
  type ProviderCapabilityMatrix,
  type ShareArtifactManifest,
} from "@pneuma-framework/core";
import { parseArgs } from "./parse-args.js";

async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    console.error(`pneuma-framework: ${(err as Error).message}`);
    printUsage();
    return 2;
  }

  if (parsed.verb === "scaffold-host") {
    return scaffoldHost(resolve(parsed.target!), parsed.name);
  }

  if (parsed.verb === "doctor-host") {
    return doctorHost(resolve(parsed.workspace!), resolve(parsed.profiles!));
  }

  const templateDir = resolve(parsed.templateDir!);
  const workspace = resolve(parsed.workspace ?? process.cwd());

  // Construct backend (factory call) BEFORE createPneumaFramework so the
  // framework's wire bridge attaches to it at construct time. We then launch
  // the backend and annotate the session id — the bridge drops events until
  // that annotation, so there's no event-leakage window.
  let backend: AgentBackend | undefined;
  if (parsed.backend) {
    if (parsed.backend === "opencode") {
      const mod = await import("@pneuma-framework/backend-opencode");
      mod.registerOpencodeBackend();
    }
    const factory = getAgentBackendFactory(parsed.backend);
    if (!factory) {
      console.error(`pneuma-framework: backend "${parsed.backend}" is not registered`);
      return 2;
    }
    // Forward opencode-relevant env → factory config. OPENCODE_MODEL is the
    // same knob examples/opencode-chat honors; default keeps v0 predictable.
    const cfg: Record<string, unknown> = {};
    if (parsed.backend === "opencode") {
      cfg.defaultModel = process.env.OPENCODE_MODEL ?? "openrouter/anthropic/claude-opus-4.7";
    }
    backend = factory(cfg);
  }

  const fw = createPneumaFramework({
    templateDir,
    workspace,
    portHint: parsed.port,
    backend,
    wire: parsed.verb === "dev"
      ? { enabled: true, autoAcceptPermissions: true }
      : undefined,
  });

  if (backend) {
    try {
      const sess = await backend.launch({ cwd: workspace });
      fw.annotateBackendSession(sess.sessionId);
    } catch (err) {
      try { await backend.close(); } catch { /* best-effort */ }
      try { await fw.close(); } catch { /* best-effort */ }
      console.error(`pneuma-framework: backend "${parsed.backend}" failed to launch: ${(err as Error).message}`);
      return 1;
    }
  }

  const log = (ev: string) => console.log(`[pneuma:${ev}]`);

  try {
    switch (parsed.verb) {
      case "dev": {
        log("starting dev");
        const running = fw.orchestrator.runDev();

        // Race dev-ready against dev-exit: if dev.sh dies before ready, don't hang.
        const READY = Symbol("ready");
        const EXITED = Symbol("exited");
        const first = await Promise.race([
          fw.orchestrator.awaitDevReady().then(() => READY),
          running.then(() => EXITED),
        ]);

        if (first === EXITED) {
          // dev.sh exited before declaring ready — surface failure even if the
          // script exited 0, since "ready" was never reached.
          log("dev exited before ready");
          const code = fw.orchestrator.state.dev?.exitCode ?? 1;
          return code === 0 ? 1 : code;
        }

        log("ready");
        for (const svc of fw.orchestrator.state.dev?.services ?? []) {
          console.log(`  service ${svc.name}: ${svc.url}`);
        }
        if (fw.wireServer && fw.sessionId) {
          const viewerService = fw.orchestrator.state.dev?.services.find((s) => s.name === "viewer");
          if (viewerService) {
            const viewerUrl = appendSidAndWs(viewerService.url, fw.sessionId, fw.wireServer.url);
            console.log(`\n  Builder URL: ${viewerUrl}\n  (copy to browser · 复制到浏览器打开)\n`);
          }
        }

        // Race SIGINT against dev-exit: if dev process dies on its own, don't wait for Ctrl-C.
        const sigintP = waitForSigint();
        const second = await Promise.race([
          sigintP.then(() => "signal" as const),
          running.then(() => "exited" as const),
        ]);

        if (second === "signal") {
          log("stopping");
          await fw.orchestrator.runStop();
          await running;
        } else {
          log("dev exited on its own");
        }

        return fw.orchestrator.state.dev?.exitCode ?? 0;
      }
      case "build": {
        log("building");
        const res = await fw.orchestrator.runBuild();
        if (res.manifestPath) log(`manifest at ${res.manifestPath}`);
        return res.exitCode;
      }
      case "deploy": {
        if (parsed.unattended) fw.orchestrator.allowUnattendedDeploy = true;
        log("deploying");
        const res = await fw.orchestrator.runDeploy();
        return res.exitCode;
      }
      case "stop": {
        log("stopping");
        await fw.orchestrator.runStop();
        return 0;
      }
      case "setup": {
        log("setting up");
        const res = await fw.orchestrator.runSetup();
        return res.exitCode;
      }
      case "migrate": {
        log(`migrating (${parsed.direction ?? "up"})`);
        const res = await fw.orchestrator.runMigrate({ direction: parsed.direction ?? "up" });
        return res.exitCode;
      }
      case "fork": {
        const source = parsed.source ?? workspace;
        const target = parsed.target;
        if (!target) {
          console.error("pneuma-framework: fork requires --target <path>");
          return 2;
        }
        log(`forking ${source} → ${target}`);
        const res = await fw.orchestrator.runFork({ sourceWorkspace: source, targetWorkspace: target });
        return res.exitCode;
      }
    }
  } finally {
    await fw.close();
    // The CLI owns this backend instance (we built it via factory), so it
    // closes here. createPneumaFramework.close() deliberately leaves
    // caller-supplied backends alone.
    if (backend) {
      try { await backend.close(); } catch { /* best-effort */ }
    }
  }
  return 0;
}

function waitForSigint(): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => {
      process.off("SIGINT", handler);
      process.off("SIGTERM", handler);
      resolve();
    };
    process.on("SIGINT", handler);
    process.on("SIGTERM", handler);
  });
}

function appendSidAndWs(url: string, sid: string, wsUrl: string): string {
  const u = new URL(url);
  u.searchParams.set("sid", sid);
  u.searchParams.set("ws", wsUrl);
  return u.toString();
}

function printUsage(): void {
  console.error(`
Usage: pneuma-framework <verb> <templateDir> [options]
Verbs:
  dev      [--workspace <path>] [--port <n>] [--backend <name>]
  build    [--workspace <path>]
  deploy   [--workspace <path>] [--unattended]
  stop     [--workspace <path>]
  setup    [--workspace <path>]
  migrate  [--workspace <path>] [--direction up|down]
  fork     [--source <path>] --target <path>
  scaffold-host <targetDir> [--name <displayName>]
  doctor-host --workspace <path> --profiles <profiles.json>

Backends: opencode
`);
}

function scaffoldHost(targetDir: string, rawName?: string): number {
  const displayName = rawName?.trim() || titleize(basename(targetDir));
  const repoRoot = resolve(import.meta.dir, "..", "..", "..");
  if (existsSync(join(targetDir, "package.json"))) {
    console.error(`pneuma-framework: target already looks like a project: ${targetDir}`);
    return 1;
  }

  mkdirSync(join(targetDir, "src"), { recursive: true });
  writeFileSync(join(targetDir, "package.json"), `${JSON.stringify({
    name: slugify(displayName),
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: {
      dev: "bun run src/run.ts",
      doctor: "pneuma-framework doctor-host --workspace ./.pneuma-workspace --profiles ./profiles.json",
    },
    dependencies: {
      "@pneuma-framework/core": `file:${join(repoRoot, "packages", "core")}`,
      "@pneuma-framework/cli": `file:${join(repoRoot, "packages", "cli")}`,
    },
    devDependencies: {
      "@types/bun": "latest",
      typescript: "^5.6.0",
    },
  }, null, 2)}\n`);
  writeFileSync(join(targetDir, "profiles.json"), `${JSON.stringify([
    {
      id: "starter-bun-sqlite",
      display_name: "Starter Bun SQLite",
      description: "A minimal Creation Host profile for the first generated app.",
      template_dir: "./profiles/starter",
      stack_id: "bun-sqlite",
      capabilities: ["preview", "inspect", "evolve", "publish", "restart", "rollback"],
      metadata: {
        definition_style: "schema-driven",
        persistence: "sqlite",
        build_agent_package: "./agent-package.json",
        provider_capability_matrix: "./provider-capabilities.json",
      },
    },
  ], null, 2)}\n`);
  writeFileSync(join(targetDir, "agent-package.json"), `${JSON.stringify(starterAgentPackage(), null, 2)}\n`);
  writeFileSync(
    join(targetDir, "provider-capabilities.json"),
    `${JSON.stringify(starterProviderCapabilities(), null, 2)}\n`,
  );
  writeFileSync(
    join(targetDir, "share-artifact.example.json"),
    `${JSON.stringify(starterShareArtifact(), null, 2)}\n`,
  );
  writeFileSync(join(targetDir, "agent-policy.md"), starterAgentPolicy());
  writeFileSync(join(targetDir, "src/run.ts"), starterRunTs());
  writeFileSync(join(targetDir, "README.md"), starterReadme(displayName));
  console.log(`scaffolded Creation Host: ${targetDir}`);
  console.log("next: cd into the directory, install dependencies, and run the doctor script.");
  return 0;
}

function doctorHost(workspace: string, profilesPath: string): number {
  const profiles = readProfiles(profilesPath);
  const report = diagnoseCreationHostWorkspace({ workspace, profiles });
  process.stdout.write(formatCreationHostDiagnosticsReport(report));
  return report.ok ? 0 : 1;
}

function readProfiles(profilesPath: string): CreationHostProfile[] {
  const parsed = JSON.parse(readFileSync(profilesPath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`profiles file must contain an array: ${profilesPath}`);
  }
  return parsed as CreationHostProfile[];
}

function titleize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ") || "Pneuma Creation Host";
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "pneuma-creation-host";
}

function starterRunTs(): string {
  return `#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createCreationHostStore,
  diagnoseCreationHostWorkspace,
  formatCreationHostDiagnosticsReport,
  type CreationHostProfile,
} from "@pneuma-framework/core";

const workspace = resolve(".pneuma-workspace");
const profiles = JSON.parse(readFileSync("profiles.json", "utf8")) as CreationHostProfile[];
const store = createCreationHostStore({ workspace, profiles });

console.log("Creation Host starter is ready.");
console.log(\`workspace: \${store.workspace}\`);
console.log(\`profiles: \${store.listProfiles().map((profile) => profile.id).join(", ")}\`);
console.log("");
console.log(formatCreationHostDiagnosticsReport(
  diagnoseCreationHostWorkspace({ workspace, profiles }),
));
`;
}

function starterAgentPackage(): BuildAgentPackageManifest {
  return {
    schema_version: 1,
    package_id: "starter-builder",
    version: "0.1.0",
    display_name: "Starter Builder Agent",
    instructions_path: "./agent-policy.md",
    tool_allowlist: [
      "definition.apply_change_set",
      "definition.rollback.prepare",
      "release.status",
    ],
    provider_capability_matrix_id: "starter-providers",
    credential_boundary: {
      allow_secret_storage: false,
      allowed_placements: ["host-broker", "keychain"],
    },
    review_checklist: [
      "Use semantic framework or Host tools instead of editing lifecycle scripts directly.",
      "Do not write provider-specific implementation during normal Builder sessions.",
      "Declare credential requirements and refs; never store raw secrets in app data or share artifacts.",
    ],
    verification_hooks: [
      {
        id: "host-contract-tests",
        command: "bun test",
        description: "Run Host contract and generated-app smoke tests before publish.",
      },
    ],
  };
}

function starterProviderCapabilities(): ProviderCapabilityMatrix {
  return {
    schema_version: 1,
    matrix_id: "starter-providers",
    capabilities: [
      {
        id: "relational-store",
        kind: "storage",
        description: "Relational app data, app history, policy, and release evidence.",
        default_fail_closed_behavior: "Reject app creation or mutation if relational storage is unavailable.",
      },
      {
        id: "local-docker-release",
        kind: "deployment",
        description: "Local Docker build and restartable release artifact.",
        default_fail_closed_behavior: "Block publish when Docker packaging evidence is missing.",
      },
      {
        id: "github-issues",
        kind: "external-provider",
        description: "GitHub issue and pull request reads through a user-bound credential.",
        default_fail_closed_behavior: "Disable GitHub-backed views until the Builder binds a credential.",
      },
    ],
    profiles: [
      {
        profile_id: "starter-bun-sqlite",
        storage_profile: "sqlite",
        deployment_profile: "local-docker",
        supported_capabilities: [
          "relational-store",
          "local-docker-release",
          "github-issues",
        ],
        unsupported_capabilities: [],
        credential_requirements: [
          starterGithubCredentialRequirement(),
        ],
      },
      {
        profile_id: "remote-postgres-docker",
        storage_profile: "postgres",
        deployment_profile: "remote-docker",
        supported_capabilities: [
          "relational-store",
          "github-issues",
        ],
        unsupported_capabilities: [
          {
            capability_id: "local-docker-release",
            fail_closed_behavior: "Require the Host to publish through the remote deployment profile instead.",
          },
        ],
        credential_requirements: [
          starterGithubCredentialRequirement(),
        ],
      },
    ],
  };
}

function starterShareArtifact(): ShareArtifactManifest {
  return {
    schema_version: 1,
    artifact_id: "starter-share",
    app_id: "starter-app",
    version_id: "v0",
    source_profile_id: "starter-bun-sqlite",
    created_from_package_id: "starter-builder",
    created_from_package_version: "0.1.0",
    includes: {
      app_definition: true,
      init_recipe: true,
      provider_requirements: true,
    },
    excludes: {
      secrets: true,
      private_derived_cache: true,
    },
    credential_requirements: [
      starterGithubCredentialRequirement(),
    ],
    init_recipe: {
      recipe_id: "starter-init",
      version: "0.1.0",
      steps: [
        {
          id: "seed-default-data",
          operation_id: "seed_defaults",
          description: "Seed portable default rows through a semantic generated-app operation.",
        },
      ],
    },
  };
}

function starterGithubCredentialRequirement() {
  return {
    id: "github-user-token",
    provider_id: "github",
    scopes: ["repo", "workflow"],
    binding_mode: "per-user" as const,
    placement: "host-broker" as const,
    required: false,
  };
}

function starterAgentPolicy(): string {
  return `# Starter Builder Agent Policy

This file is authored by the Creation Host Developer. A Build Agent Session consumes it when a Builder creates or evolves a Generated Application.

## Rules

- Use framework and Host semantic tools for app changes.
- Do not edit lifecycle scripts directly during normal Builder sessions.
- Do not write provider-specific implementation branches in normal Builder mode.
- Do not store raw credentials, tokens, passwords, or private keys in app data, share artifacts, transcripts, or package files.
- Explain unsupported capabilities using the provider capability matrix.
- Ask for Builder approval before governed definition, policy, release, or share/fork changes.

## Verification

Run the Host contract tests and generated-app smoke tests before publishing a Builder-created version.
`;
}

function starterReadme(displayName: string): string {
  return `# ${displayName}

This is a starter Creation Host scaffold for pneuma-framework.

## Run

\`\`\`bash
bun install
bun run dev
bun run doctor
\`\`\`

## What To Build Next

1. Replace \`profiles.json\` with the stack profiles your Host exposes.
2. Review \`agent-package.json\`, \`provider-capabilities.json\`, \`share-artifact.example.json\`, and \`agent-policy.md\`.
3. Add a Builder-facing workbench for create, preview, inspect, evolve, approve, publish, restart, and rollback.
4. Use \`validateCreationHostProfileContract\`, \`validateBuildAgentPackageManifest\`, \`validateProviderCapabilityMatrix\`, and \`validateShareArtifactManifest\` in your tests.
5. Use \`doctor-host\` in local development and CI to catch broken profile/state/version wiring.

Read the repo guides:

- \`docs/developer/getting-started.md\`
- \`docs/developer/creation-host-contract.md\`
`;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
