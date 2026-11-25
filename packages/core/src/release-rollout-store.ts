import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  createReleaseRolloutState,
  type ReleaseRolloutState,
} from "./release-rollout.js";
import { checkStateDirName } from "./state-dir-name.js";

const ROLLOUT_FILE = "release-rollout.json";

export interface ReleaseRolloutStore {
  load(): Promise<ReleaseRolloutState>;
  save(state: ReleaseRolloutState): Promise<void>;
}

export interface FileReleaseRolloutStoreOptions {
  readonly workspace: string;
  /**
   * The directory directly under `workspace` that holds `release-rollout.json`. One path
   * segment, not a path. Default: `.pneuma`.
   */
  readonly stateDir?: string;
}

/** `stateDir` defaults to `.pneuma`; anything else must be one path segment. */
export function releaseRolloutFilePath(workspace: string, stateDir?: string): string {
  return join(resolve(workspace), checkStateDirName(stateDir), ROLLOUT_FILE);
}

export class FileReleaseRolloutStore implements ReleaseRolloutStore {
  readonly #path: string;

  constructor(options: FileReleaseRolloutStoreOptions) {
    this.#path = releaseRolloutFilePath(options.workspace, options.stateDir);
  }

  async load(): Promise<ReleaseRolloutState> {
    if (!existsSync(this.#path)) return createReleaseRolloutState();
    const raw = JSON.parse(readFileSync(this.#path, "utf8")) as ReleaseRolloutState;
    return createReleaseRolloutState(raw);
  }

  async save(state: ReleaseRolloutState): Promise<void> {
    mkdirSync(dirname(this.#path), { recursive: true });
    const tmpPath = `${this.#path}.${process.hrtime.bigint().toString(36)}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    renameSync(tmpPath, this.#path);
  }
}
