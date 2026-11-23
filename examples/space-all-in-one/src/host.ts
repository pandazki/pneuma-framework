import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createFileBuildThreadStore, type BuildThreadStore } from "@pneuma-framework/core/build-thread";
import type { BuildChangeRisk } from "@pneuma-framework/core/build-assurance";
import {
  createReleaseInstance,
  promoteReleaseCandidate,
  rollbackActiveRelease,
  stageReleaseCandidate,
} from "@pneuma-framework/core/release-rollout";
import { FileReleaseRolloutStore } from "@pneuma-framework/core/release-rollout-store";
import {
  buildGovernedProposal,
  GovernedProposalRejected,
  type ObservationEvidence,
  type VerifyResult,
} from "@pneuma-framework/host-kit/governed-change";
import { diffTrees, listFiles, sha1File } from "@pneuma-framework/host-kit/workspace";
import {
  APP_NAME,
  appendHistory,
  appPaths,
  installCli,
  installOverlay,
  readAppInfo,
  readHistory,
  readScaffold,
  readSpaceManifest,
  restoreWorkingTree,
  snapshot,
  TREE,
  writeAppInfo,
  type AppInfo,
  type AppPaths,
  type ControlPlane,
  type HistoryEntry,
} from "./artifact";
import { classifyRisks, decide, governancePolicy, type GovernanceMode } from "./policy";
import { runCommand, type SpaceRuntime } from "./space";

// ---------------------------------------------------------------------------
// A headless Creation Host on PneumaSpace.
//
// One loop, two control planes:
//   agent-driven  the coding agent edits the working tree and calls submit()
//   host-driven   the Host starts a code agent on a draft, then runs the same loop
//
// Sequencing and gating come from the framework (governed-change backbone,
// governance evaluator, rollout state, BuildThread). Every effect is supplied
// here: the verify gate, the preview on PneumaSpace, publish and undo.
// ---------------------------------------------------------------------------

type Check = NonNullable<HistoryEntry["checks"]>[number];

export interface AppHostOptions {
  readonly appsDir: string;
  readonly space: SpaceRuntime;
  /** Directory holding AGENTS.pneuma.md, CLAUDE.md and pneuma.scaffold.json. */
  readonly overlayDir: string;
  /** Path of the artifact CLI (bin/pneuma.mjs), copied into every app. */
  readonly cliSource: string;
  /** Owner subject, e.g. user:me. Only this subject satisfies the owner role. */
  readonly owner: string;
  readonly governance?: GovernanceMode;
  /** Boot every draft on PneumaSpace under a throwaway name before release. Default true. */
  readonly preview?: boolean;
  /** Runs the scaffold's verify command in a draft. Default: `sh -c <command>`. */
  readonly runVerify?: (draftRoot: string, command: string) => Promise<VerifyResult>;
  readonly log?: (line: string) => void;
}

export interface SubmitInput {
  readonly name: string;
  /** What the person asked for. */
  readonly intent: string;
  /** Who made the change, e.g. claude-code, codex. */
  readonly agent: string;
  /**
   * Host-driven only: run one code-agent turn against the draft. When absent the
   * working tree is taken as the draft (agent-driven).
   */
  readonly runAgent?: (draftRoot: string, context: { readonly system_prompt: string }) => Promise<{ note: string }>;
  readonly isAgentTimeout?: (err: unknown) => boolean;
}

export type ChangeResult =
  | {
      readonly status: "published";
      readonly change_id: string;
      readonly version: string;
      readonly address: string;
      readonly changed_paths: readonly string[];
      readonly risks: readonly string[];
      readonly approved_by: readonly string[];
    }
  | { readonly status: "rejected"; readonly change_id: string; readonly reason: string; readonly detail: string }
  | {
      readonly status: "needs_approval";
      readonly change_id: string;
      readonly risks: readonly string[];
      readonly disclosure: readonly string[];
      readonly changed_paths: readonly string[];
    };

interface PendingChange {
  readonly change_id: string;
  readonly intent: string;
  readonly agent: string;
  readonly control: ControlPlane;
  readonly base_version: string;
  readonly changed_paths: readonly string[];
  readonly risks: readonly BuildChangeRisk[];
  readonly risk_reasons: readonly string[];
  readonly disclosure: readonly string[];
  readonly checks: readonly Check[];
  readonly agent_note: string;
  readonly created_at: string;
}

export interface AppStatus {
  readonly app_id: string;
  readonly owner: string;
  readonly scaffold_id: string;
  readonly address: string;
  readonly active_version: string | null;
  readonly previous_version: string | null;
  readonly governance: GovernanceMode;
  /** Files in the working tree that differ from the active version. */
  readonly uncommitted: readonly string[];
  readonly pending: readonly PendingChange[];
}

export class HostError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export class AppHost {
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly governance: GovernanceMode;
  private readonly log: (line: string) => void;

  constructor(private readonly opts: AppHostOptions) {
    this.governance = opts.governance ?? "personal";
    this.log = opts.log ?? (() => {});
    mkdirSync(opts.appsDir, { recursive: true });
  }

  // --- plumbing --------------------------------------------------------------

  /** One operation per app at a time: versions and rollout state are files. */
  private serial<T>(name: string, work: () => Promise<T>): Promise<T> {
    const run = (this.locks.get(name) ?? Promise.resolve()).then(work, work);
    this.locks.set(name, run.catch(() => {}));
    return run;
  }

  private open(name: string): { paths: AppPaths; info: AppInfo } {
    if (!APP_NAME.test(name)) throw new HostError(400, `app name must match ${APP_NAME}`);
    const paths = appPaths(this.opts.appsDir, name);
    if (!existsSync(paths.info)) throw new HostError(404, `no app named ${name}`);
    return { paths, info: readAppInfo(paths) };
  }

  private threads(paths: AppPaths): BuildThreadStore {
    return createFileBuildThreadStore({ workspace: paths.root });
  }

  private rollout(paths: AppPaths): FileReleaseRolloutStore {
    return new FileReleaseRolloutStore({ workspace: paths.root });
  }

  private changeId(): string {
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  }

  private async verifyCommand(draftRoot: string, command: string): Promise<VerifyResult> {
    if (this.opts.runVerify) return this.opts.runVerify(draftRoot, command);
    const result = await runCommand(["sh", "-c", command], { cwd: draftRoot, timeoutMs: 600_000 });
    return { ok: result.code === 0, output: result.output };
  }

  /**
   * The verify gate: the scaffold's command, then a real boot on PneumaSpace.
   *
   * A preview that booted is left standing and its name is pushed to `previews`; the caller
   * discards it once the change is settled. PneumaSpace stores bundles by content, so a
   * release that follows while the preview is still up reuses the bytes the preview
   * uploaded, and removing the preview afterwards deletes nothing. Discarding first
   * costs one more upload and one bundle deletion per change (measured: about 8 s each).
   */
  private async gate(name: string, changeId: string, draftRoot: string, command: string, checks: Check[], previews: string[]): Promise<VerifyResult> {
    const tests = await this.verifyCommand(draftRoot, command);
    checks.push({ id: "npm-test", status: tests.ok ? "passed" : "failed", detail: tests.ok ? undefined : tests.output.slice(-600) });
    if (!tests.ok) return tests;
    if (this.opts.preview === false) return tests;

    const previewName = `${name}-pv${changeId.slice(-4)}`;
    const published = await this.opts.space.publish(previewName, draftRoot);
    let output = `${tests.output}\n[preview ${previewName}] ${published.output}`;
    let ok = published.code === 0;
    if (ok) {
      const probe = await this.opts.space.probe(previewName);
      ok = probe.ok;
      output += `\n[preview ${previewName}] GET / -> ${probe.status} ${probe.detail}`;
    }
    if (ok) previews.push(previewName);
    else await this.opts.space.discard(previewName);
    checks.push({ id: "space-preview", status: ok ? "passed" : "failed", detail: ok ? undefined : output.slice(-600) });
    return { ok, output };
  }

  /** Take down the previews of a settled change. Never throws: `Space.discard` swallows its own errors. */
  private async dropPreviews(previews: readonly string[]): Promise<void> {
    for (const preview of previews) await this.opts.space.discard(preview);
  }

  private observe(root: string): Promise<ObservationEvidence> {
    const manifest = readSpaceManifest(root);
    const files = listFiles(root, TREE);
    const hash = createHash("sha1");
    let bytes = 0;
    for (const rel of files) {
      hash.update(`${rel}\0${sha1File(join(root, rel))}\n`);
      bytes += statSync(join(root, rel)).size;
    }
    return Promise.resolve({
      appSchemaSignature: `${manifest.runtime ?? "isolate"}(${Object.keys(manifest.capabilities ?? {}).sort().join(",")})`,
      bundleSignature: hash.digest("hex"),
      bundleBytes: bytes,
      extra: { files: files.length },
    });
  }

  /** Snapshot a checked draft as the next version, publish it, and move the rollout pointer. */
  private async release(
    name: string,
    paths: AppPaths,
    info: AppInfo,
    draftRoot: string,
    baseVersion: string | null,
  ): Promise<{ ok: true; version: string; address: string } | { ok: false; reason: string; detail: string }> {
    const store = this.rollout(paths);
    const state = await store.load();
    if ((state.active?.candidate_id ?? null) !== baseVersion) {
      return { ok: false, reason: "base_changed", detail: `active version is ${state.active?.candidate_id}, the draft was checked against ${baseVersion}` };
    }

    const version = `v${info.version_counter + 1}`;
    const versionRoot = join(paths.versions, version);
    snapshot(draftRoot, versionRoot);

    const published = await this.opts.space.publish(name, versionRoot);
    const probe = published.code === 0 ? await this.opts.space.probe(name) : { ok: false, status: 0, detail: "" };
    if (published.code !== 0 || !probe.ok) {
      rmSync(versionRoot, { recursive: true, force: true });
      // Put the address back on the version that was serving before this attempt.
      if (published.code === 0 && baseVersion) await this.opts.space.publish(name, join(paths.versions, baseVersion));
      return {
        ok: false,
        reason: published.code !== 0 ? "publish_failed" : "published_unhealthy",
        detail: published.code !== 0 ? published.output.slice(-1200) : `GET / -> ${probe.status} ${probe.detail}`,
      };
    }

    const address = this.opts.space.address(name);
    const staged = stageReleaseCandidate(
      state,
      createReleaseInstance({
        candidate_id: version,
        image_tag: `${name}:${version}`,
        url: address,
        status: "healthy",
        checks: [{ name: "space-probe", status: "passed", message: `GET / -> ${probe.status}`, at_ms: Date.now() }],
      }),
      { reason: "space-all-in-one release" },
    );
    const promoted = promoteReleaseCandidate(staged, { reason: "space-all-in-one release" });
    if (!promoted.ok) {
      rmSync(versionRoot, { recursive: true, force: true });
      return { ok: false, reason: "rollout_rejected", detail: promoted.error };
    }
    await store.save(promoted.state);
    info.version_counter += 1;
    writeAppInfo(paths, info);
    return { ok: true, version, address };
  }

  // --- lifecycle -------------------------------------------------------------

  async create(name: string, intent = "Create the app from the PneumaSpace template"): Promise<ChangeResult> {
    if (!APP_NAME.test(name)) throw new HostError(400, `app name must match ${APP_NAME}`);
    return this.serial(name, async () => {
      const paths = appPaths(this.opts.appsDir, name);
      if (existsSync(paths.root) && readdirSync(paths.root).length) throw new HostError(409, `${paths.root} is not empty`);
      const init = await this.opts.space.init(paths.root);
      if (init.code !== 0) throw new HostError(502, `template init failed: ${init.output.slice(-400)}`);
      installOverlay(paths.root, this.opts.overlayDir, this.opts.cliSource);

      const scaffold = readScaffold(paths.root);
      const thread = await this.threads(paths).startThread({ profile_id: scaffold.scaffold_id, app_id: name, builder_user_id: this.opts.owner });
      const info: AppInfo = {
        schema_version: 1,
        app_id: name,
        scaffold_id: scaffold.scaffold_id,
        owner: this.opts.owner,
        thread_id: thread.thread_id,
        created_at: new Date().toISOString(),
        version_counter: 0,
      };
      writeAppInfo(paths, info);

      const changeId = this.changeId();
      const draftRoot = join(paths.drafts, changeId);
      snapshot(paths.root, draftRoot);
      const checks: Check[] = [];
      const previews: string[] = [];
      const base = { change_id: changeId, at: new Date().toISOString(), kind: "create" as const, intent, agent: "host", control: "owner" as const };
      try {
        const gate = await this.gate(name, changeId, draftRoot, scaffold.verify_command, checks, previews);
        if (!gate.ok) {
          appendHistory(paths, { ...base, outcome: "rejected", reason: "verify_failed", checks });
          return { status: "rejected", change_id: changeId, reason: "verify_failed", detail: gate.output.slice(-2000) };
        }
        // Creating the app is the owner's own act; it is recorded as their approval.
        const decision = decide({
          policy: governancePolicy(name, info.owner, this.governance),
          change_id: changeId,
          builder_subject: "agent:host",
          risks: ["release_change"],
          owner_decision: { subject: info.owner, decision: "approved", reason: "requested creation", decided_at_ms: Date.now() },
        });
        const released = await this.release(name, paths, info, draftRoot, null);
        if (!released.ok) {
          appendHistory(paths, { ...base, outcome: "rejected", reason: released.reason, checks });
          return { status: "rejected", change_id: changeId, reason: released.reason, detail: released.detail };
        }
        appendHistory(paths, {
          ...base,
          outcome: "published",
          version: released.version,
          risks: ["release_change"],
          approval: { route: decision.route_id, by: decision.satisfied_by_subjects, reason_code: decision.reason_code },
          checks,
          address: released.address,
        });
        this.log(`created ${name} ${released.version} at ${released.address}`);
        return {
          status: "published",
          change_id: changeId,
          version: released.version,
          address: released.address,
          changed_paths: [],
          risks: ["release_change"],
          approved_by: decision.satisfied_by_subjects,
        };
      } finally {
        await this.dropPreviews(previews);
        rmSync(draftRoot, { recursive: true, force: true });
      }
    });
  }

  submit(input: SubmitInput): Promise<ChangeResult> {
    return this.serial(input.name, async () => {
      const { paths, info } = this.open(input.name);
      const state = await this.rollout(paths).load();
      const baseVersion = state.active?.candidate_id;
      if (!baseVersion) throw new HostError(409, `${input.name} has no active version`);
      const activeRoot = join(paths.versions, baseVersion);
      const scaffold = readScaffold(activeRoot);
      const control: ControlPlane = input.runAgent ? "host-driven" : "agent-driven";
      const changeId = this.changeId();
      const draftRoot = join(paths.drafts, changeId);
      const threads = this.threads(paths);
      const checks: Check[] = [];
      const previews: string[] = [];
      const base = {
        change_id: changeId,
        at: new Date().toISOString(),
        kind: "change" as const,
        intent: input.intent,
        agent: input.agent,
        control,
        base_version: baseVersion,
      };
      await threads.appendTurn(info.thread_id, { kind: "user", text: input.intent });

      // Agent-driven: the working tree the agent just edited is the draft.
      // Host-driven: the draft starts as the active version and the agent edits it.
      snapshot(input.runAgent ? activeRoot : paths.root, draftRoot);

      let keepDraft = false;
      try {
        let proposal;
        try {
          proposal = await buildGovernedProposal({
            draftId: changeId,
            activeRoot,
            draftRoot,
            protectedRoots: scaffold.protected_paths,
            runAgent: input.runAgent
              ? (root) => input.runAgent!(root, { system_prompt: scaffold.system_prompt_fragments.join("\n") })
              : async () => ({ note: "edited in the working tree by the agent" }),
            isAgentTimeout: input.isAgentTimeout ?? (() => false),
            verify: (root) => this.gate(input.name, changeId, root, scaffold.verify_command, checks, previews),
            observe: (root) => this.observe(root),
          });
        } catch (err) {
          const rejected = err instanceof GovernedProposalRejected;
          const reason = rejected ? err.reason : "agent_failed";
          const detail = rejected ? (err.detail ?? err.message) : err instanceof Error ? err.message : String(err);
          appendHistory(paths, { ...base, outcome: "rejected", reason, checks });
          await threads.appendTurn(info.thread_id, { kind: "host_event", label: "change_rejected", payload: { change_id: changeId, reason, detail: detail.slice(-600) } });
          this.log(`${input.name} ${changeId} rejected: ${reason}`);
          return { status: "rejected", change_id: changeId, reason, detail };
        }

        const assessment = classifyRisks({
          diff: proposal.diff,
          activeRoot,
          draftRoot,
          before: readSpaceManifest(activeRoot),
          after: readSpaceManifest(draftRoot),
        });
        await threads.appendTurn(info.thread_id, {
          kind: "agent_proposal",
          proposal_id: changeId,
          summary: input.intent,
          rationale: assessment.reasons.join("; "),
          tool_calls: [],
        });
        const decision = decide({
          policy: governancePolicy(input.name, info.owner, this.governance),
          change_id: changeId,
          builder_subject: `agent:${input.agent}`,
          risks: assessment.risks,
        });

        if (!decision.allowed) {
          const pending: PendingChange = {
            ...base,
            changed_paths: proposal.changedPaths,
            risks: assessment.risks,
            risk_reasons: assessment.reasons,
            disclosure: assessment.disclosure.length ? assessment.disclosure : ["This Host is set to have the owner review every change."],
            checks,
            agent_note: proposal.agentNote,
            created_at: base.at,
          };
          mkdirSync(paths.pending, { recursive: true });
          writeFileSync(join(paths.pending, `${changeId}.json`), `${JSON.stringify(pending, null, 2)}\n`);
          keepDraft = true;
          appendHistory(paths, {
            ...base,
            outcome: "needs_approval",
            changed_paths: proposal.changedPaths,
            risks: assessment.risks,
            risk_reasons: assessment.reasons,
            approval: { route: decision.route_id, by: decision.satisfied_by_subjects, reason_code: decision.reason_code },
            checks,
          });
          this.log(`${input.name} ${changeId} waits for ${info.owner}: ${assessment.risks.join(", ")}`);
          return { status: "needs_approval", change_id: changeId, risks: assessment.risks, disclosure: pending.disclosure, changed_paths: proposal.changedPaths };
        }

        await threads.appendTurn(info.thread_id, { kind: "host_event", label: "policy_approval", payload: decision });
        return await this.finish(input.name, paths, info, draftRoot, {
          ...base,
          changed_paths: proposal.changedPaths,
          risks: assessment.risks,
          risk_reasons: assessment.reasons,
          approval: { route: decision.route_id, by: decision.satisfied_by_subjects, reason_code: decision.reason_code },
          checks,
          agent_note: proposal.agentNote,
        });
      } finally {
        // Also when the change waits for the owner: a preview must not outlive the request that made it.
        await this.dropPreviews(previews);
        if (!keepDraft) rmSync(draftRoot, { recursive: true, force: true });
      }
    });
  }

  /** Release an approved draft and write the outcome into the artifact. */
  private async finish(
    name: string,
    paths: AppPaths,
    info: AppInfo,
    draftRoot: string,
    record: Omit<HistoryEntry, "outcome" | "version" | "address"> & { base_version: string },
  ): Promise<ChangeResult> {
    const threads = this.threads(paths);
    const released = await this.release(name, paths, info, draftRoot, record.base_version);
    if (!released.ok) {
      appendHistory(paths, { ...record, outcome: "rejected", reason: released.reason });
      await threads.appendTurn(info.thread_id, {
        kind: "host_execution_receipt",
        proposal_id: record.change_id,
        status: "failed_host_rolled_back",
        evidence: { reason: released.reason, detail: released.detail.slice(-600) },
      });
      return { status: "rejected", change_id: record.change_id, reason: released.reason, detail: released.detail };
    }
    appendHistory(paths, { ...record, outcome: "published", version: released.version, address: released.address });
    await threads.appendTurn(info.thread_id, {
      kind: "host_execution_receipt",
      proposal_id: record.change_id,
      status: "completed",
      evidence: { version: released.version, address: released.address, checks: record.checks },
    });
    // A host-driven or owner-approved change was made outside the working tree; bring the tree up to date.
    if (record.control !== "agent-driven" || record.kind === "decision") restoreWorkingTree(join(paths.versions, released.version), paths.root);
    this.log(`${name} ${record.change_id} published as ${released.version}`);
    return {
      status: "published",
      change_id: record.change_id,
      version: released.version,
      address: released.address,
      changed_paths: record.changed_paths ?? [],
      risks: record.risks ?? [],
      approved_by: record.approval?.by ?? [],
    };
  }

  /** The owner's answer to a change that is waiting. `subject` must hold the owner role. */
  resolve(name: string, changeId: string, answer: "approved" | "denied", subject: string, reason?: string): Promise<ChangeResult> {
    return this.serial(name, async () => {
      const { paths, info } = this.open(name);
      const file = join(paths.pending, `${changeId}.json`);
      if (!existsSync(file)) throw new HostError(404, `no change ${changeId} is waiting`);
      const pending = JSON.parse(readFileSync(file, "utf8")) as PendingChange;
      const draftRoot = join(paths.drafts, changeId);
      const threads = this.threads(paths);
      const decision = decide({
        policy: governancePolicy(name, info.owner, this.governance),
        change_id: changeId,
        builder_subject: `agent:${pending.agent}`,
        risks: pending.risks,
        owner_decision: { subject, decision: answer, reason, decided_at_ms: Date.now() },
      });
      if (answer === "approved" && !decision.allowed) {
        throw new HostError(403, `${subject} cannot approve this change (${decision.reason_code}; missing ${decision.missing_roles.join(", ")})`);
      }
      const record = {
        change_id: changeId,
        at: new Date().toISOString(),
        kind: "decision" as const,
        intent: pending.intent,
        agent: pending.agent,
        control: pending.control,
        base_version: pending.base_version,
        changed_paths: pending.changed_paths,
        risks: pending.risks,
        risk_reasons: pending.risk_reasons,
        approval: { route: decision.route_id, by: answer === "approved" ? decision.satisfied_by_subjects : [subject], reason_code: decision.reason_code },
        checks: pending.checks,
        agent_note: pending.agent_note,
      };
      await threads.appendTurn(info.thread_id, { kind: "user_decision", proposal_id: changeId, decision: answer === "approved" ? "approved" : "rejected", reason });
      try {
        if (answer === "denied") {
          appendHistory(paths, { ...record, outcome: "denied", reason: reason ?? "denied by the owner" });
          return { status: "rejected", change_id: changeId, reason: "denied", detail: reason ?? "denied by the owner" };
        }
        return await this.finish(name, paths, info, draftRoot, record);
      } finally {
        rmSync(file, { force: true });
        rmSync(draftRoot, { recursive: true, force: true });
      }
    });
  }

  /** Go back one version: move the rollout pointer, republish that source, restore the working tree. */
  undo(name: string, reason: string, actor = "owner"): Promise<{ active_version: string; undone_version: string; address: string }> {
    return this.serial(name, async () => {
      const { paths, info } = this.open(name);
      const store = this.rollout(paths);
      const state = await store.load();
      const undone = state.active?.candidate_id;
      const result = rollbackActiveRelease(state, { reason });
      if (!result.ok || !undone) throw new HostError(409, result.ok ? "nothing is published" : result.error);
      const target = result.state.active!.candidate_id;
      const targetRoot = join(paths.versions, target);

      const published = await this.opts.space.publish(name, targetRoot);
      const probe = published.code === 0 ? await this.opts.space.probe(name) : { ok: false, status: 0, detail: "" };
      if (published.code !== 0 || !probe.ok) {
        if (published.code === 0) await this.opts.space.publish(name, join(paths.versions, undone));
        throw new HostError(502, `could not republish ${target}: ${published.output.slice(-400)} ${probe.detail}`);
      }
      await store.save(result.state);
      restoreWorkingTree(targetRoot, paths.root);
      const changeId = this.changeId();
      const address = this.opts.space.address(name);
      appendHistory(paths, {
        change_id: changeId,
        at: new Date().toISOString(),
        kind: "undo",
        outcome: "rolled_back",
        intent: reason,
        agent: actor,
        control: "owner",
        version: target,
        base_version: undone,
        reason: "code and manifest only; stored data is left as it is",
        address,
      });
      await this.threads(paths).appendTurn(info.thread_id, { kind: "host_event", label: "undo", payload: { change_id: changeId, from: undone, to: target, reason } });
      this.log(`${name} rolled back ${undone} -> ${target}`);
      return { active_version: target, undone_version: undone, address };
    });
  }

  /** Throw away uncommitted edits: put the working tree back to the active version. */
  discard(name: string): Promise<{ active_version: string; restored: readonly string[] }> {
    return this.serial(name, async () => {
      const { paths } = this.open(name);
      const active = (await this.rollout(paths).load()).active?.candidate_id;
      if (!active) throw new HostError(409, `${name} has no active version`);
      const activeRoot = join(paths.versions, active);
      const restored = this.uncommitted(paths, activeRoot);
      restoreWorkingTree(activeRoot, paths.root);
      return { active_version: active, restored };
    });
  }

  private uncommitted(paths: AppPaths, activeRoot: string): string[] {
    return diffTrees(activeRoot, paths.root, TREE).changedPaths.filter((path) => path !== "data" && !path.startsWith("data/"));
  }

  async status(name: string): Promise<AppStatus> {
    const { paths, info } = this.open(name);
    const state = await this.rollout(paths).load();
    const active = state.active?.candidate_id ?? null;
    const pending = existsSync(paths.pending)
      ? readdirSync(paths.pending)
          .filter((file) => file.endsWith(".json"))
          .map((file) => JSON.parse(readFileSync(join(paths.pending, file), "utf8")) as PendingChange)
      : [];
    return {
      app_id: info.app_id,
      owner: info.owner,
      scaffold_id: info.scaffold_id,
      address: this.opts.space.address(name),
      active_version: active,
      previous_version: state.previous?.candidate_id ?? null,
      governance: this.governance,
      uncommitted: active ? this.uncommitted(paths, join(paths.versions, active)) : [],
      pending,
    };
  }

  history(name: string): HistoryEntry[] {
    return readHistory(this.open(name).paths);
  }

  list(): string[] {
    if (!existsSync(this.opts.appsDir)) return [];
    return readdirSync(this.opts.appsDir).filter((name) => existsSync(appPaths(this.opts.appsDir, name).info)).sort();
  }

  /** Refresh the CLI copy inside an artifact, e.g. after the Host was upgraded or the directory was moved here. */
  adopt(name: string): void {
    installCli(this.open(name).paths.root, this.opts.cliSource);
  }
}
