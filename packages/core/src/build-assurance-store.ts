import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  type BuildChangeAssuranceCase,
  type BuildChangeReadiness,
  validateBuildChangeAssuranceCase,
} from "./build-assurance.js";

const PNEUMA_DIR = ".pneuma";
const BUILD_ASSURANCE_CASES_FILE = "build-assurance-cases.json";
const BUILD_ASSURANCE_CASES_SCHEMA_VERSION = 1;

export interface BuildChangeAssuranceCaseQuery {
  readonly app_id?: string;
  readonly thread_id?: string;
  readonly readiness?: BuildChangeReadiness;
}

export interface BuildChangeAssuranceCaseStore {
  saveCase(assuranceCase: BuildChangeAssuranceCase): Promise<BuildChangeAssuranceCase>;
  getCase(buildChangeId: string): Promise<BuildChangeAssuranceCase | undefined>;
  listCases(query?: BuildChangeAssuranceCaseQuery): Promise<readonly BuildChangeAssuranceCase[]>;
}

export interface FileBuildChangeAssuranceCaseStoreOptions {
  readonly workspace: string;
}

interface BuildChangeAssuranceCaseFileState {
  readonly schema_version: 1;
  readonly cases: readonly BuildChangeAssuranceCase[];
}

export class BuildChangeAssuranceCaseStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildChangeAssuranceCaseStoreError";
  }
}

export class FileBuildChangeAssuranceCaseStore implements BuildChangeAssuranceCaseStore {
  constructor(private readonly workspace: string) {}

  async saveCase(assuranceCase: BuildChangeAssuranceCase): Promise<BuildChangeAssuranceCase> {
    const validation = validateBuildChangeAssuranceCase(assuranceCase);
    if (!validation.ok) {
      const issueSummary = validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ");
      throw new BuildChangeAssuranceCaseStoreError(`invalid build assurance case: ${issueSummary}`);
    }

    const state = loadState(this.workspace);
    const nextCase = cloneCase(assuranceCase);
    const withoutExisting = state.cases.filter(
      (candidate) => candidate.build_change_id !== nextCase.build_change_id,
    );
    saveState(this.workspace, {
      schema_version: BUILD_ASSURANCE_CASES_SCHEMA_VERSION,
      cases: [nextCase, ...withoutExisting],
    });
    return cloneCase(nextCase);
  }

  async getCase(buildChangeId: string): Promise<BuildChangeAssuranceCase | undefined> {
    const state = loadState(this.workspace);
    const found = state.cases.find((candidate) => candidate.build_change_id === buildChangeId);
    return found ? cloneCase(found) : undefined;
  }

  async listCases(query?: BuildChangeAssuranceCaseQuery): Promise<readonly BuildChangeAssuranceCase[]> {
    const state = loadState(this.workspace);
    let cases = state.cases;
    if (query?.app_id) {
      cases = cases.filter((candidate) => candidate.app_id === query.app_id);
    }
    if (query?.thread_id) {
      cases = cases.filter((candidate) => candidate.thread_id === query.thread_id);
    }
    if (query?.readiness) {
      cases = cases.filter((candidate) => candidate.readiness === query.readiness);
    }
    return cases.map(cloneCase);
  }
}

export function createFileBuildChangeAssuranceCaseStore(
  options: FileBuildChangeAssuranceCaseStoreOptions,
): BuildChangeAssuranceCaseStore {
  return new FileBuildChangeAssuranceCaseStore(options.workspace);
}

export function buildAssuranceCasesFilePath(workspace: string): string {
  return join(workspace, PNEUMA_DIR, BUILD_ASSURANCE_CASES_FILE);
}

function loadState(workspace: string): BuildChangeAssuranceCaseFileState {
  const filePath = buildAssuranceCasesFilePath(workspace);
  if (!existsSync(filePath)) {
    return emptyState();
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    if (!isStateLike(parsed)) {
      process.stderr.write(`[build-assurance] warning: ${filePath} has invalid shape - resetting to empty state\n`);
      return emptyState();
    }
    const cases = parsed.cases.filter((candidate) => {
      const validation = validateBuildChangeAssuranceCase(candidate);
      if (!validation.ok) {
        process.stderr.write(
          `[build-assurance] warning: ${filePath} contains invalid case ${String((candidate as { build_change_id?: unknown }).build_change_id)} - skipping\n`,
        );
        return false;
      }
      return true;
    });
    return {
      schema_version: BUILD_ASSURANCE_CASES_SCHEMA_VERSION,
      cases,
    };
  } catch (err) {
    process.stderr.write(`[build-assurance] warning: failed to load ${filePath}: ${err} - returning empty state\n`);
    return emptyState();
  }
}

function saveState(workspace: string, state: BuildChangeAssuranceCaseFileState): void {
  const dir = join(workspace, PNEUMA_DIR);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, BUILD_ASSURANCE_CASES_FILE);
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
}

function emptyState(): BuildChangeAssuranceCaseFileState {
  return {
    schema_version: BUILD_ASSURANCE_CASES_SCHEMA_VERSION,
    cases: [],
  };
}

function isStateLike(value: unknown): value is BuildChangeAssuranceCaseFileState {
  return typeof value === "object"
    && value !== null
    && (value as { schema_version?: unknown }).schema_version === BUILD_ASSURANCE_CASES_SCHEMA_VERSION
    && Array.isArray((value as { cases?: unknown }).cases);
}

function cloneCase(assuranceCase: BuildChangeAssuranceCase): BuildChangeAssuranceCase {
  return JSON.parse(JSON.stringify(assuranceCase)) as BuildChangeAssuranceCase;
}
