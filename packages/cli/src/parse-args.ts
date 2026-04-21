const SUPPORTED_VERBS = ["dev", "build", "deploy", "stop"] as const;
type SupportedVerb = typeof SUPPORTED_VERBS[number];

export interface ParsedArgs {
  verb: SupportedVerb;
  templateDir: string;
  workspace?: string;
  port?: number;
  backend?: string;
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
    if (a && a.startsWith("--")) throw new Error(`unknown flag: ${a}`);
    if (a) positional.push(a);
  }
  const templateDir = positional[0];
  if (!templateDir) throw new Error("templateDir is required");
  return { verb, templateDir, workspace, port, backend };
}

function isSupportedVerb(v: string): v is SupportedVerb {
  return (SUPPORTED_VERBS as readonly string[]).includes(v);
}
