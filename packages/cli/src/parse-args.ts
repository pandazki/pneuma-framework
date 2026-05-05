const SUPPORTED_VERBS = [
  "dev",
  "build",
  "deploy",
  "stop",
  "setup",
  "migrate",
  "fork",
  "scaffold-host",
  "doctor-host",
] as const;
type SupportedVerb = typeof SUPPORTED_VERBS[number];

export interface ParsedArgs {
  verb: SupportedVerb;
  templateDir?: string;
  workspace?: string;
  port?: number;
  backend?: string;
  direction?: "up" | "down";
  source?: string;
  target?: string;
  unattended?: boolean;
  name?: string;
  profiles?: string;
  agentPackage?: string;
  providerCapabilities?: string;
  shareArtifact?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [verb, ...rest] = argv;
  if (!verb || !isSupportedVerb(verb)) {
    throw new Error(`unknown verb: ${String(verb)} (supported: ${SUPPORTED_VERBS.join(", ")})`);
  }
  const positional: string[] = [];
  let workspace: string | undefined;
  let port: number | undefined;
  let backend: string | undefined;
  let direction: "up" | "down" | undefined;
  let source: string | undefined;
  let target: string | undefined;
  let unattended: boolean | undefined;
  let name: string | undefined;
  let profiles: string | undefined;
  let agentPackage: string | undefined;
  let providerCapabilities: string | undefined;
  let shareArtifact: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--workspace") {
      workspace = rest[++i];
      if (!workspace) throw new Error("--workspace requires a path argument");
      continue;
    }
    if (a === "--port") {
      const raw = rest[++i];
      if (!raw) throw new Error("--port requires a number");
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 65535 || !Number.isInteger(n)) {
        throw new Error(`--port must be an integer in [1, 65535], got ${raw}`);
      }
      port = n;
      continue;
    }
    if (a === "--backend") {
      backend = rest[++i];
      if (!backend) throw new Error("--backend requires a name argument");
      continue;
    }
    if (a === "--direction") {
      const v = rest[++i];
      if (v !== "up" && v !== "down") throw new Error(`--direction must be "up" or "down", got ${v}`);
      direction = v;
      continue;
    }
    if (a === "--source") {
      source = rest[++i];
      if (!source) throw new Error("--source requires a path");
      continue;
    }
    if (a === "--target") {
      target = rest[++i];
      if (!target) throw new Error("--target requires a path");
      continue;
    }
    if (a === "--name") {
      name = rest[++i];
      if (!name) throw new Error("--name requires a value");
      continue;
    }
    if (a === "--profiles") {
      profiles = rest[++i];
      if (!profiles) throw new Error("--profiles requires a path");
      continue;
    }
    if (a === "--agent-package") {
      agentPackage = rest[++i];
      if (!agentPackage) throw new Error("--agent-package requires a path");
      continue;
    }
    if (a === "--provider-capabilities") {
      providerCapabilities = rest[++i];
      if (!providerCapabilities) throw new Error("--provider-capabilities requires a path");
      continue;
    }
    if (a === "--share-artifact") {
      shareArtifact = rest[++i];
      if (!shareArtifact) throw new Error("--share-artifact requires a path");
      continue;
    }
    if (a === "--unattended") {
      unattended = true;
      continue;
    }
    if (a && a.startsWith("--")) throw new Error(`unknown flag: ${a}`);
    if (a) positional.push(a);
  }
  if (verb === "scaffold-host") {
    target = positional[0] ?? target;
    if (!target) throw new Error("scaffold-host requires <targetDir>");
    return {
      verb,
      target,
      name,
      workspace,
      port,
      backend,
      direction,
      source,
      unattended,
      profiles,
      agentPackage,
      providerCapabilities,
      shareArtifact,
    };
  }
  if (verb === "doctor-host") {
    if (!workspace) throw new Error("doctor-host requires --workspace <path>");
    if (!profiles) throw new Error("doctor-host requires --profiles <path>");
    return {
      verb,
      workspace,
      profiles,
      port,
      backend,
      direction,
      source,
      target,
      unattended,
      name,
      agentPackage,
      providerCapabilities,
      shareArtifact,
    };
  }
  const templateDir = positional[0];
  if (!templateDir) throw new Error("templateDir is required");
  return {
    verb,
    templateDir,
    workspace,
    port,
    backend,
    direction,
    source,
    target,
    unattended,
    name,
    profiles,
    agentPackage,
    providerCapabilities,
    shareArtifact,
  };
}

function isSupportedVerb(v: string): v is SupportedVerb {
  return (SUPPORTED_VERBS as readonly string[]).includes(v);
}
