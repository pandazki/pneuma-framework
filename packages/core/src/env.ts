import type { LifecycleVerb } from "./types.js";

export interface BuildLifecycleEnvOptions {
  workspace: string;
  verb: LifecycleVerb;
  mode: "dev" | "release";
  buildDir?: string;
  artifactManifestPath?: string;
  envFile?: string;
  portHint?: number;
  forkSource?: string;
  forkTarget?: string;
  migrateDirection?: "up" | "down";
  logDir?: string;
  sessionId?: string;
  wsUrl?: string;
  parentEnv?: Record<string, string | undefined>;
}

export function buildLifecycleEnv(opts: BuildLifecycleEnvOptions): Record<string, string> {
  const out: Record<string, string> = {};

  if (opts.parentEnv) {
    for (const [k, v] of Object.entries(opts.parentEnv)) {
      if (typeof v === "string" && !k.startsWith("PNEUMA_")) out[k] = v;
    }
  }

  out.PNEUMA_WORKSPACE = opts.workspace;
  out.PNEUMA_VERB = opts.verb;
  out.PNEUMA_MODE = opts.mode;

  if (opts.buildDir) out.PNEUMA_BUILD_DIR = opts.buildDir;
  if (opts.artifactManifestPath) out.PNEUMA_ARTIFACT_MANIFEST = opts.artifactManifestPath;
  if (opts.envFile) out.PNEUMA_ENV_FILE = opts.envFile;
  if (opts.portHint !== undefined) out.PNEUMA_PORT_HINT = String(opts.portHint);
  if (opts.forkSource) out.PNEUMA_FORK_SOURCE = opts.forkSource;
  if (opts.forkTarget) out.PNEUMA_FORK_TARGET = opts.forkTarget;
  if (opts.migrateDirection) out.PNEUMA_MIGRATE_DIRECTION = opts.migrateDirection;
  if (opts.logDir) out.PNEUMA_LOG_DIR = opts.logDir;
  if (opts.sessionId) out.PNEUMA_SESSION_ID = opts.sessionId;
  if (opts.wsUrl) out.PNEUMA_WS_URL = opts.wsUrl;

  return out;
}
