import { spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// Reference adapter: a Claude Code code-agent lane.
//
// Drives the local `claude` CLI in non-interactive mode (`claude -p`) with
// stream-json output. One Builder request = one coding turn against a draft
// workspace. The CLI is the Agent SDK's command-line surface, so this lane
// needs no SDK package and uses whatever login the person already has
// (subscription or API key).
//
// This is a REFERENCE adapter, not framework core. A Host opts into it; the
// framework never depends on it. Three details are deliberate:
//
//   - `--bare` is NOT passed. Bare mode skips CLAUDE.md and ignores the
//     subscription login; a governed draft wants both.
//   - The baseline is `--permission-mode acceptEdits` plus an explicit
//     `--allowedTools` list. Anything else that would prompt is denied by the
//     CLI, because nobody is there to answer.
//   - Success is the final `result` event with `is_error: false`, never the
//     exit code alone and never a timeout. The caller's verify gate stays
//     fail-closed either way.
// ---------------------------------------------------------------------------

const TURN_TIMEOUT_MESSAGE = "Timed out waiting for Claude Code turn completion";
const TURN_ABORTED_MESSAGE = "Claude Code turn aborted";
const DEFAULT_KILL_GRACE_MS = 5_000;
// Upper bound, after SIGKILL, on waiting for `close` and for the process group to empty.
const SETTLE_CAP_AFTER_KILL_MS = 3_000;
const GROUP_POLL_MS = 25;

/** True when an error is a recoverable Claude Code turn-completion timeout. */
export function isClaudeCodeTurnCompletionTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.includes(TURN_TIMEOUT_MESSAGE);
}

/** Tools a draft-only coding turn needs: read, edit, and run the project's own tests. */
export const DEFAULT_ALLOWED_TOOLS: readonly string[] = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash(npm test)",
  "Bash(npm test *)",
  "Bash(npm run *)",
  "Bash(npm ci *)",
  "Bash(node --test *)",
];

export interface RunClaudeCodeOptions {
  /** Draft workspace the agent edits (the claude process cwd). */
  draftRoot: string;
  /** The Builder request for this turn. */
  prompt: string;
  /** Appended to Claude Code's own system prompt (e.g. editable/protected roots). */
  appendSystemPrompt?: string;
  model?: string;
  /** Default acceptEdits. */
  permissionMode?: "acceptEdits" | "dontAsk" | "auto" | "plan";
  /** Permission-rule syntax entries; default DEFAULT_ALLOWED_TOOLS. */
  allowedTools?: readonly string[];
  /** Continue an earlier session instead of starting a new one. */
  resumeSessionId?: string;
  /** Default 900_000ms. */
  timeoutMs?: number;
  /**
   * After a timeout or an abort, how long the CLI gets to exit on SIGINT, and to stop the tool
   * commands it started, before SIGKILL. Default 5_000ms.
   */
  killGraceMs?: number;
  /**
   * Stops the turn the way a timeout does, then rejects with an "aborted" error that
   * `isClaudeCodeTurnCompletionTimeout` does not match: an aborted turn is not recoverable.
   */
  signal?: AbortSignal;
  /** Default "claude". */
  claudeBin?: string;
  /** Extra CLI flags, passed through verbatim after the adapter's own. */
  extraArgs?: readonly string[];
  env?: Record<string, string | undefined>;
  log?: (line: string) => void;
}

export interface ClaudeCodeTurnResult {
  sessionId: string;
  /** The final assistant text of the turn. */
  result: string;
  numTurns?: number;
  totalCostUsd?: number;
  /** Tool calls the CLI denied because nothing approved them. */
  permissionDenials: readonly unknown[];
}

type Json = Record<string, unknown>;

export function claudeCodeArgs(opts: RunClaudeCodeOptions): string[] {
  const args = [
    "-p",
    opts.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    opts.permissionMode ?? "acceptEdits",
    "--allowedTools",
    (opts.allowedTools ?? DEFAULT_ALLOWED_TOOLS).join(","),
  ];
  if (opts.appendSystemPrompt) args.push("--append-system-prompt", opts.appendSystemPrompt);
  if (opts.model) args.push("--model", opts.model);
  if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
  if (opts.extraArgs) args.push(...opts.extraArgs);
  return args;
}

/**
 * Run one Claude Code coding turn against the draft workspace. Throws on failure, timeout or abort.
 *
 * The adapter signals only what it started: the CLI and the process group it created for it. A
 * timeout or an abort sends the group SIGINT, then SIGKILL after `killGraceMs`; once the CLI has
 * exited, whatever is left in its group gets SIGKILL at once. The adapter settles when the CLI has
 * exited and its group is empty, or at a hard cap after SIGKILL.
 *
 * Stopped: the CLI and every process still in its process group.
 *
 * Not stopped by the adapter:
 *   - a tool command the CLI started in a process group of its own, which is how Claude Code starts
 *     every tool command, unless the CLI stops it before it exits or within the grace period after
 *     SIGINT. That cleanup is the CLI's, which is why it gets a grace period;
 *   - a command a tool shell left in the background (`cmd &`), which is how an agent usually leaves a
 *     dev server running.
 *
 * So when a turn ends, something may still be writing to the draft. A Host that releases what it
 * checked must bind the release to content (host-kit's `sealDraft` and `draftSignature`), not to
 * this function's return.
 */
export function runClaudeCodeAgent(opts: RunClaudeCodeOptions): Promise<ClaudeCodeTurnResult> {
  const log = opts.log ?? (() => {});
  const timeoutMs = opts.timeoutMs ?? 900_000;
  const killGraceMs = opts.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
  const abortSignal = opts.signal;

  return new Promise<ClaudeCodeTurnResult>((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new Error(TURN_ABORTED_MESSAGE));
      return;
    }
    const child = spawn(opts.claudeBin ?? "claude", claudeCodeArgs(opts), {
      cwd: opts.draftRoot,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
      // A new session, so the CLI leads a new process group and, as a session leader, cannot leave it.
      detached: true,
    });
    // A multi-byte character can be split across two pipe reads.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    // Only this group is ever signalled, as `-pid`, never a bare pid. A group id cannot be taken by
    // another group while the group still has members, and the CLI is one until it is reaped. So
    // `-pid` is this turn's group until it is first found empty, and it is not signalled after that.
    // From the CLI's exit on, `watch` looks every GROUP_POLL_MS, so that is noticed at once.
    let groupEmpty = child.pid === undefined;
    const signalGroup = (signal: NodeJS.Signals | 0): void => {
      if (groupEmpty) return;
      try {
        process.kill(-(child.pid as number), signal);
      } catch {
        groupEmpty = true;
      }
    };

    let buffer = "";
    let stderr = "";
    let final: Json | undefined;
    let sessionId = "";
    let exitCode: number | null = null;
    let timedOut = false;
    let aborted = false;
    let stopping = false;
    let exited = false;
    let closed = false;
    let settled = false;
    // From then on the group gets SIGKILL: the end of the grace period, or the CLI's exit.
    let forceAt = Infinity;
    let forcing = false;
    let poll: ReturnType<typeof setTimeout> | undefined;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(turnTimer);
      clearTimeout(poll);
      abortSignal?.removeEventListener("abort", onAbort);
      fn();
    };
    const finish = (): void => {
      // An abort wins over a timeout: the caller must not treat an aborted turn as recoverable.
      if (aborted || timedOut) {
        reject(new Error(aborted ? TURN_ABORTED_MESSAGE : `${TURN_TIMEOUT_MESSAGE} after ${timeoutMs}ms`));
        return;
      }
      if (!final) {
        reject(new Error(`claude exited with code ${exitCode} and no result event: ${stderr.trim().slice(-400)}`));
        return;
      }
      if (final.is_error === true || (typeof final.subtype === "string" && final.subtype !== "success")) {
        reject(new Error(`claude turn failed (${String(final.subtype ?? "error")}): ${String(final.result ?? stderr).slice(0, 400)}`));
        return;
      }
      resolve({
        sessionId,
        result: typeof final.result === "string" ? final.result : "",
        numTurns: typeof final.num_turns === "number" ? final.num_turns : undefined,
        totalCostUsd: typeof final.total_cost_usd === "number" ? final.total_cost_usd : undefined,
        permissionDenials: Array.isArray(final.permission_denials) ? final.permission_denials : [],
      });
    };

    // Runs from a stop or the CLI's exit until the CLI has closed and its group is empty, or the cap.
    const watch = (): void => {
      clearTimeout(poll);
      if (settled) return;
      signalGroup(0);
      if (groupEmpty && closed) return settle(finish);
      const now = Date.now();
      if (now >= forceAt + SETTLE_CAP_AFTER_KILL_MS) {
        log(closed ? "[claude:process group still alive after SIGKILL, settling anyway]" : "[claude:no close from the CLI, abandoning it]");
        return settle(() => {
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
          finish();
        });
      }
      if (now >= forceAt && !groupEmpty) {
        if (!forcing) log(exited ? "[claude:CLI exited, sending SIGKILL to what is left in its process group]" : `[claude:still running ${killGraceMs}ms after SIGINT, sending SIGKILL]`);
        forcing = true;
        signalGroup("SIGKILL");
      }
      poll = setTimeout(watch, GROUP_POLL_MS);
    };

    const stop = (): void => {
      if (closed || stopping) return;
      stopping = true;
      if (!exited) signalGroup("SIGINT");
      forceAt = Math.min(forceAt, Date.now() + killGraceMs);
      watch();
    };
    const turnTimer = setTimeout(() => {
      if (closed) return;
      timedOut = true;
      log(`[claude:timeout after ${timeoutMs}ms, stopping process group]`);
      stop();
    }, timeoutMs);
    const onAbort = (): void => {
      if (settled) return;
      aborted = true;
      log("[claude:aborted, stopping process group]");
      stop();
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });

    const onLine = (line: string): void => {
      let msg: Json;
      try {
        msg = JSON.parse(line) as Json;
      } catch {
        log(`[claude:nonjson] ${line.slice(0, 200)}`);
        return;
      }
      if (typeof msg.session_id === "string") sessionId = msg.session_id;
      const type = String(msg.type ?? "?");
      if (type === "result") {
        final = msg;
        log(`[claude:result subtype=${String(msg.subtype ?? "?")} is_error=${String(msg.is_error)}]`);
      } else if (type === "system") {
        log(`[claude:system/${String(msg.subtype ?? "?")}]`);
      } else if (type === "assistant") {
        const content = ((msg.message as Json | undefined)?.content as Json[] | undefined) ?? [];
        for (const block of content) {
          if (block.type === "tool_use") log(`[claude:tool ${String(block.name)}]`);
        }
      }
    };

    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) onLine(line);
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      if (child.pid === undefined) {
        settle(() => reject(new Error(`could not start claude: ${err.message}`)));
        return;
      }
      // The process is running; `close` or the timeout settles the turn.
      log(`[claude:error] ${err.message}`);
    });
    child.on("exit", (code) => {
      exited = true;
      exitCode = code;
      // Nothing is left to clean up after the CLI; a grandchild still in its group could keep writing.
      forceAt = Math.min(forceAt, Date.now());
      watch();
    });
    child.on("close", () => {
      closed = true;
      if (buffer.trim()) onLine(buffer.trim());
      watch();
    });
  });
}
