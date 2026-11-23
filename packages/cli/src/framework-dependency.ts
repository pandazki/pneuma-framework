import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";

// ---------------------------------------------------------------------------
// Which dependency specifier a scaffolded Host should use for a framework
// package.
//
// The scaffold writes the Host's `package.json`, and the Host is installed with
// `bun install` right after. The specifier therefore has to be installable from
// the Host's directory, including the package's own `file:../<sibling>`
// dependencies.
//
// Two layouts exist:
//
//   - The CLI runs from real package source (this monorepo, or an install that
//     links back to source). The source directory is installable as it is, so
//     the specifier is `file:<that directory>`.
//
//   - The CLI runs from a copy inside some project's `node_modules`. Bun copies
//     `file:` dependencies there and nests each package's own framework
//     dependencies under it (`cli/node_modules/@pneuma-framework/core`), so a
//     copy has no siblings and `file:<copy>` cannot be installed. The project
//     that installed the CLI is the one place that still says where the
//     packages came from, so the Host gets the same specifiers that project
//     uses.
// ---------------------------------------------------------------------------

const NODE_MODULES = `${sep}node_modules${sep}`;
const CLI_PACKAGE = "@pneuma-framework/cli";

type Manifest = {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
};

function readManifest(dir: string): Manifest | null {
  const file = join(dir, "package.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Manifest;
  } catch {
    return null;
  }
}

function declaredSpec(manifest: Manifest | null, packageName: string): string | undefined {
  return manifest?.dependencies?.[packageName] ?? manifest?.devDependencies?.[packageName] ?? manifest?.optionalDependencies?.[packageName];
}

/** Rewrite a path-based specifier so it means the same thing from any directory; leave every other kind alone. */
function absolutize(spec: string, baseDir: string): string {
  for (const protocol of ["file:", "link:"]) {
    if (spec.startsWith(protocol)) return `${protocol}${resolve(baseDir, spec.slice(protocol.length))}`;
  }
  return spec;
}

function sourceDirOf(spec: string | undefined): string | null {
  return spec?.startsWith("file:") || spec?.startsWith("link:") ? spec.slice(spec.indexOf(":") + 1) : null;
}

/**
 * The specifier for `packageName` as the project that owns `installedDir` declares it.
 * `installedDir` is a directory inside that project's `node_modules`. Returns null when
 * the project does not say, directly or through the CLI it installed.
 */
export function specFromInstallingProject(packageName: string, installedDir: string): string | null {
  const cut = installedDir.indexOf(NODE_MODULES);
  if (cut === -1) return null;
  const projectRoot = installedDir.slice(0, cut);
  const project = readManifest(projectRoot);

  const direct = declaredSpec(project, packageName);
  if (direct) return absolutize(direct, projectRoot);

  // Not a direct dependency of the project: it came in through the CLI. The CLI's
  // own source manifest says where its siblings are.
  const cliSpec = declaredSpec(project, CLI_PACKAGE);
  const cliSource = sourceDirOf(cliSpec ? absolutize(cliSpec, projectRoot) : undefined);
  if (!cliSource) return null;
  const viaCli = declaredSpec(readManifest(cliSource), packageName);
  return viaCli ? absolutize(viaCli, cliSource) : null;
}

/** The dependency specifier a scaffolded Host should use for a framework package resolved at `resolvedDir`. */
export function frameworkDependencySpec(packageName: string, resolvedDir: string): string {
  let dir = resolvedDir;
  try {
    dir = realpathSync(resolvedDir);
  } catch {
    // Not on disk (yet); use the path as given.
  }
  if (!dir.includes(NODE_MODULES)) return `file:${dir}`;
  return specFromInstallingProject(packageName, dir) ?? `file:${dir}`;
}
