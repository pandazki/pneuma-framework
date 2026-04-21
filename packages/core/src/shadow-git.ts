import { existsSync, appendFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { stateDir } from "./workspace.js";

const IGNORE_BASE = [".pneuma/", ".pneuma-build/", "node_modules/", ".git/"];

export interface Checkpoint {
  turn: number;
  label: string;
  ts: number;
  hash: string;
}

export async function initShadowGit(workspaceRoot: string): Promise<void> {
  const gitDir = shadowGitDir(workspaceRoot);
  if (existsSync(join(gitDir, "HEAD"))) return;
  mkdirSync(gitDir, { recursive: true });
  // Run git init --bare without GIT_DIR/GIT_WORK_TREE env vars (they conflict with --bare init)
  await runGitRaw(["init", "--bare", gitDir]);
  // Set core.worktree so the bare repo knows its working tree
  await runGit(workspaceRoot, ["config", "core.worktree", workspaceRoot]);
}

export async function createCheckpoint(workspaceRoot: string, label: string): Promise<string> {
  await runGit(workspaceRoot, ["add", "-A", "--", ":!.pneuma", ":!.pneuma-build", ":!node_modules"]);
  const commitOut = await runGit(
    workspaceRoot,
    ["commit", "--allow-empty", "-m", label],
    { captureStdout: true },
  );
  const hashOut = await runGit(workspaceRoot, ["rev-parse", "HEAD"], { captureStdout: true });
  const hash = hashOut.trim();

  const indexPath = checkpointsIndex(workspaceRoot);
  const prior = readCheckpointsIndex(workspaceRoot);
  const entry: Checkpoint = {
    turn: prior.length + 1,
    label,
    ts: Date.now(),
    hash,
  };
  appendFileSync(indexPath, JSON.stringify(entry) + "\n", "utf8");
  return hash;
  void commitOut; // silence unused
}

export async function listCheckpoints(workspaceRoot: string): Promise<Checkpoint[]> {
  return readCheckpointsIndex(workspaceRoot);
}

// --- internals ---

function shadowGitDir(workspaceRoot: string): string {
  return join(stateDir(workspaceRoot), "shadow.git");
}

function checkpointsIndex(workspaceRoot: string): string {
  return join(stateDir(workspaceRoot), "checkpoints.jsonl");
}

function readCheckpointsIndex(workspaceRoot: string): Checkpoint[] {
  const path = checkpointsIndex(workspaceRoot);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Checkpoint);
}

interface RunGitOptions {
  captureStdout?: boolean;
}

async function runGitRaw(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += String(d); });
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`git ${args.join(" ")} failed (${code}): ${stderr}`));
      }
    });
  });
}

async function runGit(
  workspaceRoot: string,
  args: string[],
  opts: RunGitOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const gitDir = shadowGitDir(workspaceRoot);
    const env = {
      ...process.env,
      GIT_DIR: gitDir,
      GIT_WORK_TREE: workspaceRoot,
      GIT_AUTHOR_NAME: "pneuma",
      GIT_AUTHOR_EMAIL: "pneuma@local",
      GIT_COMMITTER_NAME: "pneuma",
      GIT_COMMITTER_EMAIL: "pneuma@local",
    };
    const child = spawn("git", args, { cwd: workspaceRoot, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += String(d); });
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(opts.captureStdout ? stdout : "");
      } else {
        reject(new Error(`git ${args.join(" ")} failed (${code}): ${stderr}`));
      }
    });
  });
}

void IGNORE_BASE;
