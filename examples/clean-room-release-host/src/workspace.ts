import { existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";

// Stack-agnostic workspace mechanics are consumed from the framework's Host Kit
// (copy / list / hash / diff / protected-root checks) instead of being
// re-implemented here. Only `linkDependencies` stays local: symlinking the
// scaffold's node_modules is a Bun/stack-specific Host concern, not framework
// plumbing.
export {
  copyTree,
  diffTrees,
  fileMode,
  isProtected,
  listFiles,
  sha1File,
  type TreeDiff,
} from "@pneuma-framework/host-kit/workspace";

/** Ensure a copied tree can resolve deps by symlinking the scaffold's node_modules. */
export function linkDependencies(root: string, scaffoldNodeModules: string): void {
  const target = join(root, "node_modules");
  if (existsSync(target)) return;
  if (!existsSync(scaffoldNodeModules)) {
    throw new Error(
      `scaffold dependencies missing at ${scaffoldNodeModules}; run \`bun install\` at the repo root first`,
    );
  }
  symlinkSync(scaffoldNodeModules, target, "dir");
}
