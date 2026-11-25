// The name of the directory, directly under a workspace, where the file-backed
// BuildThread store and release rollout store keep their files. A Host may pass
// another name through their `stateDir` option. Internal to core: not exported.

export const DEFAULT_STATE_DIR = ".pneuma";

/**
 * `undefined` means the default. Anything else must be a single path segment: not empty,
 * not `.` or `..`, and without `/`, `\` or NUL. It names a directory, it is not a path.
 */
export function checkStateDirName(value: unknown): string {
  if (value === undefined) return DEFAULT_STATE_DIR;
  if (
    typeof value !== "string"
    || value === ""
    || value === "."
    || value === ".."
    || /[/\\\0]/.test(value)
  ) {
    throw new TypeError(
      `stateDir must be the name of one directory directly under the workspace, such as "${DEFAULT_STATE_DIR}", not ${describe(value)}. `
        + `It cannot be empty, "." or "..", or contain "/", "\\" or a NUL character.`,
    );
  }
  return value;
}

function describe(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}
