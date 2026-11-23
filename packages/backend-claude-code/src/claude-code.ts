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
const DEFAULT_KILL_GRACE_MS = 2_000;
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
  /** After a timeout, how long the process group gets to stop on SIGINT before SIGKILL. Default 2_000ms. */
  killGraceMs?: number;
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
 * Run one Claude Code coding turn against the draft workspace. Throws on failure or timeout.
 * Settles only once the CLI and every process it started have exited, so the caller may
 * inspect the draft as soon as it does.
 */
export function runClaudeCodeAgent(opts: RunClaudeCodeOptions): Promise<ClaudeCodeTurnResult> {
  const log = opts.log ?? (() => {});
  const timeoutMs = opts.timeoutMs ?? 900_000;
  const killGraceMs = opts.killGraceMs ?? DEFAULT_KILL_GRACE_MS;

  return new Promise<ClaudeCodeTurnResult>((resolve, reject) => {
    const child = spawn(opts.claudeBin ?? "claude", claudeCodeArgs(opts), {
      cwd: opts.draftRoot,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group, so tool subprocesses the CLI starts are signalled along with it.
      detached: true,
    });
    // A multi-byte character can be split across two pipe reads.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    const signalGroup = (signal: NodeJS.Signals): void => {
      try {
        if (child.pid === undefined) throw new Error("no pid");
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    };
    const groupAlive = (): boolean => {
      if (child.pid === undefined) return false;
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch {
        return false;
      }
    };

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const after = (ms: number, fn: () => void): void => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };

    let buffer = "";
    let stderr = "";
    let final: Json | undefined;
    let sessionId = "";
    let timedOut = false;
    let closed = false;
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      fn();
    };
    // The CLI can exit while a backgrounded tool or a grandchild that ignored SIGINT
    // is still in its group; that process must not keep writing after we settle.
    const reapGroupThenSettle = (fn: () => void): void => {
      const deadline = Date.now() + SETTLE_CAP_AFTER_KILL_MS;
      const poll = (): void => {
        if (settled) return;
        if (!groupAlive() || Date.now() >= deadline) {
          settle(fn);
          return;
        }
        signalGroup("SIGKILL");
        after(GROUP_POLL_MS, poll);
      };
      poll();
    };
    const timeoutError = (): Error => new Error(`${TURN_TIMEOUT_MESSAGE} after ${timeoutMs}ms`);

    after(timeoutMs, () => {
      if (closed) return;
      timedOut = true;
      log(`[claude:timeout after ${timeoutMs}ms, stopping process group]`);
      signalGroup("SIGINT");
      after(killGraceMs, () => signalGroup("SIGKILL"));
      after(killGraceMs + SETTLE_CAP_AFTER_KILL_MS, () => {
        log("[claude:no close after SIGKILL, abandoning process]");
        settle(() => {
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
          reject(timeoutError());
        });
      });
    });

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
    child.on("close", (code) => {
      closed = true;
      if (buffer.trim()) onLine(buffer.trim());
      if (timedOut) {
        reapGroupThenSettle(() => reject(timeoutError()));
        return;
      }
      reapGroupThenSettle(() => {
        if (!final) {
          reject(new Error(`claude exited with code ${code} and no result event: ${stderr.trim().slice(-400)}`));
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
      });
    });
  });
}
