import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  createReleaseRolloutState,
  type ReleaseRolloutState,
} from "./release-rollout.js";
import { stateDir } from "./workspace.js";

const ROLLOUT_FILE = "release-rollout.json";

export interface ReleaseRolloutStore {
  load(): Promise<ReleaseRolloutState>;
  save(state: ReleaseRolloutState): Promise<void>;
}

export interface FileReleaseRolloutStoreOptions {
  readonly workspace: string;
}

export function releaseRolloutFilePath(workspace: string): string {
  return join(stateDir(resolve(workspace)), ROLLOUT_FILE);
}

export class FileReleaseRolloutStore implements ReleaseRolloutStore {
  readonly #workspace: string;
  readonly #path: string;

  constructor(options: FileReleaseRolloutStoreOptions) {
    this.#workspace = resolve(options.workspace);
    this.#path = releaseRolloutFilePath(this.#workspace);
  }

  async load(): Promise<ReleaseRolloutState> {
    if (!existsSync(this.#path)) return createReleaseRolloutState();
    const raw = JSON.parse(readFileSync(this.#path, "utf8")) as ReleaseRolloutState;
    return createReleaseRolloutState(raw);
  }

  async save(state: ReleaseRolloutState): Promise<void> {
    mkdirSync(stateDir(this.#workspace), { recursive: true });
    const tmpPath = `${this.#path}.${process.hrtime.bigint().toString(36)}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    renameSync(tmpPath, this.#path);
  }
}
