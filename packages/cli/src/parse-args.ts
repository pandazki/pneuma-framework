const SUPPORTED_VERBS = ["dev", "build", "deploy", "stop", "setup", "migrate", "fork"] as const;
type SupportedVerb = typeof SUPPORTED_VERBS[number];

export interface ParsedArgs {
  verb: SupportedVerb;
  templateDir: string;
  workspace?: string;
  port?: number;
  backend?: string;
  direction?: "up" | "down";
  source?: string;
  target?: string;
  unattended?: boolean;
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
    if (a === "--unattended") {
      unattended = true;
      continue;
    }
    if (a && a.startsWith("--")) throw new Error(`unknown flag: ${a}`);
    if (a) positional.push(a);
  }
  const templateDir = positional[0];
  if (!templateDir) throw new Error("templateDir is required");
  return { verb, templateDir, workspace, port, backend, direction, source, target, unattended };
}

function isSupportedVerb(v: string): v is SupportedVerb {
  return (SUPPORTED_VERBS as readonly string[]).includes(v);
}
