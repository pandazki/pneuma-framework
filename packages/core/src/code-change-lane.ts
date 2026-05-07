import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { BuildThreadStore } from "./build-thread.js";
import {
  validateScaffoldProjectManifest,
  type ScaffoldFrameworkGuardrailCheck,
  type ScaffoldGuardrailCheck,
  type ScaffoldGuardrailPhase,
  type ScaffoldProjectManifest,
} from "./host-authoring.js";

export type CodeChangeCheckStatus = "passed" | "failed";
export type CodeChangeDecision = "approved" | "rejected";
export type CodeChangeReceiptStatus =
  | "completed"
  | "failed_framework"
  | "failed_host_rolled_back"
  | "failed_validate_rolled_back";

export interface CodeChangeCheckEvidence {
  readonly id: string;
  readonly phase: ScaffoldGuardrailPhase;
  readonly kind: ScaffoldGuardrailCheck["kind"];
  readonly status: CodeChangeCheckStatus;
  readonly message: string;
  readonly output?: string;
}

export interface CodeChangeFileSnapshot {
  readonly path: string;
  readonly hash: string;
  readonly exists: boolean;
}

export interface CodeChangeProposalEvidence {
  readonly changed_files: readonly string[];
  readonly diff: string;
  readonly checks: readonly CodeChangeCheckEvidence[];
  readonly base_snapshot: readonly CodeChangeFileSnapshot[];
  readonly draft_snapshot: readonly CodeChangeFileSnapshot[];
}

export interface PreparedCodeChangeProposal {
  readonly proposal_id: string;
  readonly summary: string;
  readonly rationale: string;
  readonly evidence: CodeChangeProposalEvidence;
}

export interface CodeChangeExecutionReceipt {
  readonly proposal_id: string;
  readonly status: CodeChangeReceiptStatus;
  readonly evidence: {
    readonly changed_files: readonly string[];
    readonly checks: readonly CodeChangeCheckEvidence[];
    readonly rolled_back?: true;
    readonly message?: string;
  };
}

export type PrepareCodeChangeProposalResult =
  | {
      readonly ok: true;
      readonly proposal: PreparedCodeChangeProposal;
    }
  | {
      readonly ok: false;
      readonly phase: "pre_proposal";
      readonly checks: readonly CodeChangeCheckEvidence[];
      readonly changed_files: readonly string[];
      readonly diff: string;
    };

export type ApplyCodeChangeProposalResult =
  | {
      readonly ok: true;
      readonly receipt: CodeChangeExecutionReceipt;
    }
  | {
      readonly ok: false;
      readonly phase: "decision" | "pre_apply" | "post_apply";
      readonly receipt: CodeChangeExecutionReceipt;
    };

export interface CodeChangeLaneCommandRunnerInput {
  readonly command: string;
  readonly cwd: string;
}

export interface CodeChangeLaneCommandRunnerResult {
  readonly ok: boolean;
  readonly output: string;
}

export type CodeChangeLaneCommandRunner = (
  input: CodeChangeLaneCommandRunnerInput,
) => Promise<CodeChangeLaneCommandRunnerResult>;

export type CodeChangeLaneFrameworkCheckRunner = (input: {
  readonly check: ScaffoldFrameworkGuardrailCheck;
  readonly phase: ScaffoldGuardrailPhase;
  readonly source_root: string;
  readonly draft_root: string;
  readonly proposal?: PreparedCodeChangeProposal;
}) => Promise<CodeChangeLaneCommandRunnerResult | undefined>;

export interface PrepareCodeChangeProposalOptions {
  readonly manifest: ScaffoldProjectManifest;
  readonly source_root: string;
  readonly draft_root: string;
  readonly proposal_id: string;
  readonly summary: string;
  readonly rationale: string;
  readonly thread_store?: BuildThreadStore;
  readonly thread_id?: string;
  readonly command_runner?: CodeChangeLaneCommandRunner;
  readonly framework_check_runner?: CodeChangeLaneFrameworkCheckRunner;
}

export interface ApplyCodeChangeProposalOptions {
  readonly manifest: ScaffoldProjectManifest;
  readonly source_root: string;
  readonly draft_root: string;
  readonly proposal: PreparedCodeChangeProposal;
  readonly decision: CodeChangeDecision;
  readonly decision_reason?: string;
  readonly thread_store?: BuildThreadStore;
  readonly thread_id?: string;
  readonly command_runner?: CodeChangeLaneCommandRunner;
  readonly framework_check_runner?: CodeChangeLaneFrameworkCheckRunner;
}

interface DiffState {
  readonly changedFiles: readonly string[];
  readonly diff: string;
  readonly sourceFiles: ReadonlyMap<string, string | undefined>;
  readonly draftFiles: ReadonlyMap<string, string | undefined>;
}

interface FileBackupEntry {
  readonly path: string;
  readonly existed: boolean;
  readonly content?: Buffer;
}

export async function prepareCodeChangeProposal(
  options: PrepareCodeChangeProposalOptions,
): Promise<PrepareCodeChangeProposalResult> {
  assertValidManifest(options.manifest);
  const sourceRoot = resolve(options.source_root);
  const draftRoot = resolve(options.draft_root);
  const diffState = computeDiffState(options.manifest, sourceRoot, draftRoot);
  const baseSnapshot = snapshotFiles(sourceRoot, diffState.changedFiles);
  const draftSnapshot = snapshotFiles(draftRoot, diffState.changedFiles);
  const checks = await runGuardrails({
    manifest: options.manifest,
    phase: "pre_proposal",
    sourceRoot,
    draftRoot,
    diffState,
    baseSnapshot,
    commandRunner: options.command_runner ?? runShellCommand,
    frameworkCheckRunner: options.framework_check_runner,
  });

  if (checks.some((check) => check.status === "failed")) {
    return {
      ok: false,
      phase: "pre_proposal",
      checks,
      changed_files: diffState.changedFiles,
      diff: diffState.diff,
    };
  }

  const proposal: PreparedCodeChangeProposal = {
    proposal_id: options.proposal_id,
    summary: options.summary,
    rationale: options.rationale,
    evidence: {
      changed_files: diffState.changedFiles,
      diff: diffState.diff,
      checks,
      base_snapshot: baseSnapshot,
      draft_snapshot: draftSnapshot,
    },
  };

  if (options.thread_store && options.thread_id) {
    await options.thread_store.appendTurn(options.thread_id, {
      kind: "agent_proposal",
      proposal_id: proposal.proposal_id,
      summary: proposal.summary,
      rationale: proposal.rationale,
      tool_calls: [
        {
          name: "code_change.apply",
          arguments: {
            changed_files: proposal.evidence.changed_files,
          },
        },
      ],
    });
  }

  return { ok: true, proposal };
}

export async function applyCodeChangeProposal(
  options: ApplyCodeChangeProposalOptions,
): Promise<ApplyCodeChangeProposalResult> {
  assertValidManifest(options.manifest);
  const sourceRoot = resolve(options.source_root);
  const draftRoot = resolve(options.draft_root);

  if (options.thread_store && options.thread_id) {
    await options.thread_store.appendTurn(options.thread_id, {
      kind: "user_decision",
      proposal_id: options.proposal.proposal_id,
      decision: options.decision,
      reason: options.decision_reason,
    });
  }

  if (options.decision === "rejected") {
    const receipt = receiptFor(options.proposal, "failed_framework", [], "Builder rejected the proposal.");
    await appendReceipt(options, receipt);
    return { ok: false, phase: "decision", receipt };
  }

  const currentDiff = computeDiffState(options.manifest, sourceRoot, draftRoot);
  const preApplyChecks = await runGuardrails({
    manifest: options.manifest,
    phase: "pre_apply",
    sourceRoot,
    draftRoot,
    diffState: currentDiff,
    baseSnapshot: options.proposal.evidence.base_snapshot,
    proposal: options.proposal,
    commandRunner: options.command_runner ?? runShellCommand,
    frameworkCheckRunner: options.framework_check_runner,
  });
  const writableCheck = checkWritableFiles(options.manifest, options.proposal.evidence.changed_files);
  const draftSnapshotCheck = checkDraftSnapshotUnchanged(
    draftRoot,
    options.proposal.evidence.draft_snapshot,
  );
  const extraChecks = [writableCheck, draftSnapshotCheck].filter(
    (check): check is CodeChangeCheckEvidence => check !== undefined,
  );
  const allPreApplyChecks = [...preApplyChecks, ...extraChecks];

  if (allPreApplyChecks.some((check) => check.status === "failed")) {
    const receipt = receiptFor(
      options.proposal,
      "failed_framework",
      allPreApplyChecks,
      "Pre-apply guardrails failed before mutating source.",
    );
    await appendReceipt(options, receipt);
    return { ok: false, phase: "pre_apply", receipt };
  }

  const backup = backupFiles(sourceRoot, options.proposal.evidence.changed_files);
  applyChangedFiles(sourceRoot, draftRoot, options.proposal.evidence.changed_files);

  const postApplyDiff = computeDiffState(options.manifest, sourceRoot, draftRoot);
  const postApplyChecks = await runGuardrails({
    manifest: options.manifest,
    phase: "post_apply",
    sourceRoot,
    draftRoot,
    diffState: postApplyDiff,
    baseSnapshot: snapshotFiles(sourceRoot, options.proposal.evidence.changed_files),
    proposal: options.proposal,
    commandRunner: options.command_runner ?? runShellCommand,
    frameworkCheckRunner: options.framework_check_runner,
  });

  if (postApplyChecks.some((check) => check.status === "failed")) {
    restoreBackup(sourceRoot, backup);
    const receipt: CodeChangeExecutionReceipt = {
      proposal_id: options.proposal.proposal_id,
      status: "failed_validate_rolled_back",
      evidence: {
        changed_files: options.proposal.evidence.changed_files,
        checks: [...allPreApplyChecks, ...postApplyChecks],
        rolled_back: true,
        message: "Post-apply guardrails failed; source was restored from backup.",
      },
    };
    await appendReceipt(options, receipt);
    return { ok: false, phase: "post_apply", receipt };
  }

  const receipt: CodeChangeExecutionReceipt = {
    proposal_id: options.proposal.proposal_id,
    status: "completed",
    evidence: {
      changed_files: options.proposal.evidence.changed_files,
      checks: [...allPreApplyChecks, ...postApplyChecks],
    },
  };
  await appendReceipt(options, receipt);
  return { ok: true, receipt };
}

async function appendReceipt(
  options: Pick<ApplyCodeChangeProposalOptions, "thread_store" | "thread_id">,
  receipt: CodeChangeExecutionReceipt,
): Promise<void> {
  if (!options.thread_store || !options.thread_id) return;
  await options.thread_store.appendTurn(options.thread_id, {
    kind: "host_execution_receipt",
    proposal_id: receipt.proposal_id,
    status: receipt.status,
    evidence: receipt.evidence,
  });
}

async function runGuardrails(opts: {
  readonly manifest: ScaffoldProjectManifest;
  readonly phase: ScaffoldGuardrailPhase;
  readonly sourceRoot: string;
  readonly draftRoot: string;
  readonly diffState: DiffState;
  readonly baseSnapshot: readonly CodeChangeFileSnapshot[];
  readonly proposal?: PreparedCodeChangeProposal;
  readonly commandRunner: CodeChangeLaneCommandRunner;
  readonly frameworkCheckRunner?: CodeChangeLaneFrameworkCheckRunner;
}): Promise<readonly CodeChangeCheckEvidence[]> {
  const checks = opts.manifest.guardrails[opts.phase] ?? [];
  const evidence: CodeChangeCheckEvidence[] = [];
  for (const check of checks) {
    if (check.kind === "command") {
      const cwd = opts.phase === "pre_proposal" ? opts.draftRoot : opts.sourceRoot;
      const result = await opts.commandRunner({ command: check.command, cwd });
      evidence.push({
        id: check.id,
        phase: opts.phase,
        kind: check.kind,
        status: result.ok ? "passed" : "failed",
        message: result.ok ? check.description : `${check.description} failed.`,
        output: result.output,
      });
      continue;
    }
    const delegated = await opts.frameworkCheckRunner?.({
      check: check.framework_check,
      phase: opts.phase,
      source_root: opts.sourceRoot,
      draft_root: opts.draftRoot,
      proposal: opts.proposal,
    });
    if (delegated) {
      evidence.push({
        id: check.id,
        phase: opts.phase,
        kind: check.kind,
        status: delegated.ok ? "passed" : "failed",
        message: delegated.ok ? check.description : delegated.output,
        output: delegated.output,
      });
      continue;
    }
    evidence.push(runBuiltInFrameworkCheck(check, opts));
  }
  return evidence;
}

function runBuiltInFrameworkCheck(
  check: Extract<ScaffoldGuardrailCheck, { kind: "framework" }>,
  opts: {
    readonly phase: ScaffoldGuardrailPhase;
    readonly manifest: ScaffoldProjectManifest;
    readonly diffState: DiffState;
    readonly baseSnapshot: readonly CodeChangeFileSnapshot[];
    readonly sourceRoot: string;
  },
): CodeChangeCheckEvidence {
  switch (check.framework_check) {
    case "diff-computable":
      return {
        id: check.id,
        phase: opts.phase,
        kind: check.kind,
        status: opts.diffState.changedFiles.length > 0 ? "passed" : "failed",
        message: opts.diffState.changedFiles.length > 0
          ? check.description
          : "No changed files were found in the draft workspace.",
      };
    case "protected-paths-unchanged": {
      const blocked = opts.diffState.changedFiles.filter((path) =>
        pathOverlapsAny(path, opts.manifest.artifact_boundary.protected_paths),
      );
      return {
        id: check.id,
        phase: opts.phase,
        kind: check.kind,
        status: blocked.length === 0 ? "passed" : "failed",
        message: blocked.length === 0
          ? check.description
          : `Protected paths changed: ${blocked.join(", ")}`,
      };
    }
    case "base-snapshot-unchanged": {
      const current = snapshotFiles(opts.sourceRoot, opts.baseSnapshot.map((entry) => entry.path));
      const stale = current.filter((entry, index) =>
        entry.exists !== opts.baseSnapshot[index]?.exists ||
        entry.hash !== opts.baseSnapshot[index]?.hash
      );
      return {
        id: check.id,
        phase: opts.phase,
        kind: check.kind,
        status: stale.length === 0 ? "passed" : "failed",
        message: stale.length === 0
          ? check.description
          : `Source changed after proposal evidence was produced: ${stale.map((entry) => entry.path).join(", ")}`,
      };
    }
    case "preview-health":
      return {
        id: check.id,
        phase: opts.phase,
        kind: check.kind,
        status: "failed",
        message: "preview-health requires a Host-provided framework_check_runner.",
      };
  }
}

function checkWritableFiles(
  manifest: ScaffoldProjectManifest,
  changedFiles: readonly string[],
): CodeChangeCheckEvidence | undefined {
  const blocked = changedFiles.filter((path) =>
    !pathOverlapsAny(path, manifest.artifact_boundary.writable_roots),
  );
  if (blocked.length === 0) return undefined;
  return {
    id: "writable-roots",
    phase: "pre_apply",
    kind: "framework",
    status: "failed",
    message: `Changed files are outside writable_roots: ${blocked.join(", ")}`,
  };
}

function checkDraftSnapshotUnchanged(
  draftRoot: string,
  draftSnapshot: readonly CodeChangeFileSnapshot[] | undefined,
): CodeChangeCheckEvidence | undefined {
  if (!draftSnapshot || draftSnapshot.length === 0) return undefined;
  const current = snapshotFiles(draftRoot, draftSnapshot.map((entry) => entry.path));
  const stale = current.filter((entry, index) =>
    entry.exists !== draftSnapshot[index]?.exists ||
    entry.hash !== draftSnapshot[index]?.hash
  );
  if (stale.length === 0) return undefined;
  return {
    id: "draft-snapshot",
    phase: "pre_apply",
    kind: "framework",
    status: "failed",
    message: `Draft changed after proposal evidence was produced: ${stale.map((entry) => entry.path).join(", ")}`,
  };
}

function computeDiffState(
  manifest: ScaffoldProjectManifest,
  sourceRoot: string,
  draftRoot: string,
): DiffState {
  const sourceFiles = readFileMap(sourceRoot, manifest.materialization.exclude);
  const draftFiles = readFileMap(draftRoot, manifest.materialization.exclude);
  const allPaths = [...new Set([...sourceFiles.keys(), ...draftFiles.keys()])].sort();
  const changedFiles = allPaths.filter((path) => sourceFiles.get(path) !== draftFiles.get(path));
  return {
    changedFiles,
    diff: renderDiff(changedFiles, sourceFiles, draftFiles),
    sourceFiles,
    draftFiles,
  };
}

function readFileMap(root: string, exclude: readonly string[]): ReadonlyMap<string, string | undefined> {
  const result = new Map<string, string>();
  if (!existsSync(root)) return result;
  for (const path of listFiles(root, exclude)) {
    result.set(path, readFileSync(join(root, path), "utf8"));
  }
  return result;
}

function listFiles(root: string, exclude: readonly string[]): readonly string[] {
  const files: string[] = [];
  const absoluteRoot = resolve(root);
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const absolute = join(dir, entry);
      const rel = normalizePath(relative(absoluteRoot, absolute));
      if (isExcluded(rel, exclude)) continue;
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        visit(absolute);
      } else if (stat.isFile()) {
        files.push(rel);
      }
    }
  };
  visit(absoluteRoot);
  return files.sort();
}

function renderDiff(
  changedFiles: readonly string[],
  sourceFiles: ReadonlyMap<string, string | undefined>,
  draftFiles: ReadonlyMap<string, string | undefined>,
): string {
  return changedFiles.map((path) => {
    const before = sourceFiles.get(path);
    const after = draftFiles.get(path);
    return [
      `--- a/${path}`,
      `+++ b/${path}`,
      ...renderContentLines("-", before),
      ...renderContentLines("+", after),
    ].join("\n");
  }).join("\n");
}

function renderContentLines(prefix: "-" | "+", content: string | undefined): readonly string[] {
  if (content === undefined) return [`${prefix}<missing>`];
  const lines = content.endsWith("\n") ? content.slice(0, -1).split("\n") : content.split("\n");
  return lines.map((line) => `${prefix}${line}`);
}

function snapshotFiles(root: string, files: readonly string[]): readonly CodeChangeFileSnapshot[] {
  return [...files].sort().map((path) => {
    const absolute = join(root, path);
    if (!existsSync(absolute)) {
      return { path, hash: "", exists: false };
    }
    return {
      path,
      hash: createHash("sha256").update(readFileSync(absolute)).digest("hex"),
      exists: true,
    };
  });
}

function backupFiles(root: string, files: readonly string[]): readonly FileBackupEntry[] {
  return files.map((path) => {
    const absolute = join(root, path);
    if (!existsSync(absolute)) return { path, existed: false };
    return { path, existed: true, content: readFileSync(absolute) };
  });
}

function applyChangedFiles(sourceRoot: string, draftRoot: string, files: readonly string[]): void {
  for (const path of files) {
    const sourcePath = join(sourceRoot, path);
    const draftPath = join(draftRoot, path);
    if (!existsSync(draftPath)) {
      rmSync(sourcePath, { force: true });
      continue;
    }
    mkdirSync(dirname(sourcePath), { recursive: true });
    copyFileSync(draftPath, sourcePath);
  }
}

function restoreBackup(root: string, backup: readonly FileBackupEntry[]): void {
  for (const entry of backup) {
    const absolute = join(root, entry.path);
    if (!entry.existed) {
      rmSync(absolute, { force: true });
      continue;
    }
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, entry.content!);
  }
}

function receiptFor(
  proposal: PreparedCodeChangeProposal,
  status: CodeChangeReceiptStatus,
  checks: readonly CodeChangeCheckEvidence[],
  message: string,
): CodeChangeExecutionReceipt {
  return {
    proposal_id: proposal.proposal_id,
    status,
    evidence: {
      changed_files: proposal.evidence.changed_files,
      checks,
      message,
    },
  };
}

async function runShellCommand(input: CodeChangeLaneCommandRunnerInput): Promise<CodeChangeLaneCommandRunnerResult> {
  const proc = Bun.spawn(["/bin/sh", "-lc", input.command], {
    cwd: input.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  return { ok: exitCode === 0, output };
}

function assertValidManifest(manifest: ScaffoldProjectManifest): void {
  const check = validateScaffoldProjectManifest(manifest);
  if (!check.ok) {
    throw new Error(`Invalid ScaffoldProjectManifest: ${check.issues.map((issue) => issue.code).join(", ")}`);
  }
}

function isExcluded(path: string, exclude: readonly string[]): boolean {
  return pathOverlapsAny(path, exclude);
}

function pathOverlapsAny(path: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => {
    const normalized = normalizePath(candidate);
    return path === normalized || path.startsWith(`${normalized}/`);
  });
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/g, "");
}
