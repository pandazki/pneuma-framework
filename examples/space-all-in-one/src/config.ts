import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AppHost } from "./host";
import { loadRiskPolicy, type GovernanceMode } from "./policy";
import { spaceFromEnv } from "./space";

const here = dirname(fileURLToPath(import.meta.url));
export const EXAMPLE_ROOT = resolve(here, "..");

/** Both entry points (the served Host and the host-driven CLI) build the same Host from the same variables. */
export function hostFromEnv(env: Record<string, string | undefined> = process.env, log: (line: string) => void = console.error): AppHost {
  const governance = (env.PNEUMA_GOVERNANCE ?? "personal") as GovernanceMode;
  if (governance !== "personal" && governance !== "review-all") throw new Error("PNEUMA_GOVERNANCE must be personal or review-all");
  return new AppHost({
    appsDir: resolve(env.PNEUMA_APPS_DIR ?? join(EXAMPLE_ROOT, "apps")),
    space: spaceFromEnv(env),
    overlayDir: join(EXAMPLE_ROOT, "overlay"),
    cliSource: join(EXAMPLE_ROOT, "bin", "pneuma.mjs"),
    owner: env.PNEUMA_OWNER ?? "user:me",
    governance,
    // The rules are a preset, not code. An empty variable falls back to the example preset like an unset one.
    policy: loadRiskPolicy(resolve(env.PNEUMA_POLICY_FILE || join(EXAMPLE_ROOT, "policy", "personal.json"))),
    preview: env.PNEUMA_PREVIEW !== "off",
    log,
  });
}
