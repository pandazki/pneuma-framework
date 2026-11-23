import { spawn, spawnSync } from "node:child_process";

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
// Upper bound, after SIGKILL, on waiting for `close` and for what the CLI started to be gone.
const SETTLE_CAP_AFTER_KILL_MS = 3_000;
const GROUP_POLL_MS = 25;

interface ProcessEntry {
  pid: number;
  ppid: number;
  pgid: number;
}

/** The process table, or why it could not be read. */
function readProcessTable(): ProcessEntry[] | string {
  // Separate -o flags: some ps builds read everything after "=" as the column header.
  const out = spawnSync("ps", ["-A", "-o", "pid=", "-o", "ppid=", "-o", "pgid="], { encoding: "utf8", timeout: 2_000 });
  if (out.error) return out.error.message;
  if (out.status !== 0) return `ps exited with ${out.status ?? out.signal}`;
  const table: ProcessEntry[] = [];
  for (const line of out.stdout.split("\n")) {
    const [pid = 0, ppid = -1, pgid = -1] = line.trim().split(/\s+/).map(Number);
    if (pid > 0 && ppid >= 0 && pgid >= 0) table.push({ pid, ppid, pgid });
  }
  return table.some((p) => p.pid === process.pid) ? table : "ps did not list this process";
}

function descendantsOf(table: readonly ProcessEntry[], roots: Iterable<number>): ProcessEntry[] {
  const children = new Map<number, ProcessEntry[]>();
  for (const p of table) {
    const siblings = children.get(p.ppid);
    if (siblings) siblings.push(p);
    else children.set(p.ppid, [p]);
  }
  const found = new Map<number, ProcessEntry>();
  const queue = [...roots].filter((pid) => pid > 1);
  for (let pid = queue.pop(); pid !== undefined; pid = queue.pop()) {
    for (const child of children.get(pid) ?? []) {
      if (found.has(child.pid) || child.pid === process.pid) continue;
      found.set(child.pid, child);
      queue.push(child.pid);
    }
  }
  return [...found.values()];
}

function exists(target: number): boolean {
  try {
    process.kill(target, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Processes the CLI started outside its own process group: Claude Code starts its tool commands
 * detached, each in a group of its own. Signalling the CLI's group does not reach them, but while
 * the CLI is alive they are its descendants in the process table, so they are looked up then and
 * remembered. Anything that has already left that tree (re-parented, daemonized) is not seen.
 */
class OutsideGroupProcesses {
  #rootPid: number | undefined;
  #onUnreadable: (reason: string) => void;
  #procs = new Map<number, number>(); // pid -> pgid
  #ownPgid = 0;
  #unreadable = false;

  constructor(rootPid: number | undefined, onUnreadable: (reason: string) => void) {
    this.#rootPid = rootPid;
    this.#onUnreadable = onUnreadable;
  }

  get size(): number {
    return this.#procs.size;
  }

  /** Remember the root's descendants outside its group, and anything new below those already remembered. */
  remember(): void {
    if (this.#rootPid === undefined || this.#rootPid <= 1) return;
    const table = this.#read();
    if (!table) return;
    for (const p of descendantsOf(table, [this.#rootPid, ...this.#procs.keys()])) {
      if (p.pgid !== this.#rootPid) this.#procs.set(p.pid, p.pgid);
    }
  }

  /** Forget what is gone or whose pid now sits in another group (reused); add what survivors started since. */
  refresh(): void {
    if (this.#procs.size === 0) return;
    const table = this.#read();
    if (!table) return;
    const groups = this.#groups();
    const kept = new Map<number, number>();
    for (const p of table) {
      if (this.#procs.get(p.pid) === p.pgid || groups.has(p.pgid)) kept.set(p.pid, p.pgid);
    }
    for (const p of descendantsOf(table, kept.keys())) kept.set(p.pid, p.pgid);
    this.#procs = kept;
  }

  alive(): boolean {
    for (const pid of this.#procs.keys()) if (exists(pid)) return true;
    for (const pgid of this.#groups()) if (exists(-pgid)) return true;
    return false;
  }

  signal(sig: NodeJS.Signals): void {
    for (const pgid of this.#groups()) {
      try {
        process.kill(-pgid, sig);
      } catch {
        // already gone
      }
    }
    for (const pid of this.#procs.keys()) {
      try {
        process.kill(pid, sig);
      } catch {
        // already gone
      }
    }
  }

  // Never this process's own group, and never 0 or 1: kill(-1) would reach every process we may signal.
  #groups(): Set<number> {
    const groups = new Set<number>();
    for (const pgid of this.#procs.values()) if (pgid > 1 && pgid !== this.#ownPgid) groups.add(pgid);
    return groups;
  }

  #read(): ProcessEntry[] | undefined {
    const table = readProcessTable();
    if (typeof table !== "string") {
      this.#ownPgid = table.find((p) => p.pid === process.pid)?.pgid ?? 0;
      return table;
    }
    if (!this.#unreadable) {
      this.#unreadable = true;
      this.#onUnreadable(table);
    }
    return undefined;
  }
}

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
 * Before it settles, the adapter stops the CLI, the CLI's process group, and the descendants of
 * the CLI it saw in the process table when the turn was stopped or the result event arrived. It
 * cannot stop a process that had already left the CLI's process tree by then, for example by
 * daemonizing. If `ps` cannot be run, only the CLI and its process group are stopped. A Host that
 * releases what it checked must not rely on the draft being quiet after this returns; it should
 * bind the release to the content it checked.
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
      // Own process group. The CLI's tool commands are not in it; `outside` covers those.
      detached: true,
    });
    // A multi-byte character can be split across two pipe reads.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const outside = new OutsideGroupProcesses(child.pid, (reason) =>
      log(`[claude:cannot read the process table (${reason}); stopping only the CLI's process group]`),
    );

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
    let aborted = false;
    let exited = false;
    let closed = false;
    let settled = false;
    // Until then, what the CLI started outside its group is left to the CLI's own cleanup.
    let cleanupUntil = 0;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      abortSignal?.removeEventListener("abort", onAbort);
      fn();
    };
    let killingOutside = false;
    const killOutside = (): void => {
      if (killingOutside) return;
      killingOutside = true;
      outside.refresh();
      if (!outside.alive()) return;
      log(`[claude:stopping ${outside.size} process(es) the CLI started outside its process group]`);
      outside.signal("SIGKILL");
    };
    // The CLI can exit while a backgrounded tool, or a grandchild that ignored SIGINT, is still
    // running; that process must not keep writing after we settle.
    const reapThenSettle = (fn: () => void): void => {
      const deadline = Math.max(Date.now(), cleanupUntil) + SETTLE_CAP_AFTER_KILL_MS;
      const poll = (): void => {
        if (settled) return;
        const now = Date.now();
        if (now >= cleanupUntil) killOutside();
        const groupUp = groupAlive();
        const outsideUp = outside.alive();
        if (!groupUp && !outsideUp) {
          settle(fn);
          return;
        }
        if (now >= deadline) {
          log("[claude:processes still alive after SIGKILL, settling anyway]");
          settle(fn);
          return;
        }
        if (groupUp) signalGroup("SIGKILL");
        if (killingOutside && outsideUp) outside.signal("SIGKILL");
        after(GROUP_POLL_MS, poll);
      };
      poll();
    };
    // An abort wins over a timeout: the caller must not treat an aborted turn as recoverable.
    const stoppedError = (): Error => (aborted ? new Error(TURN_ABORTED_MESSAGE) : new Error(`${TURN_TIMEOUT_MESSAGE} after ${timeoutMs}ms`));

    let stopping = false;
    const stop = (): void => {
      if (closed || stopping) return;
      stopping = true;
      outside.remember();
      cleanupUntil = Date.now() + killGraceMs;
      signalGroup("SIGINT");
      after(killGraceMs, () => {
        if (closed) return;
        if (!exited) {
          log(`[claude:still running ${killGraceMs}ms after SIGINT, sending SIGKILL]`);
          outside.remember();
        }
        signalGroup("SIGKILL");
        // Also here, not only on `close`: a process outside the group could be holding the pipes open.
        killOutside();
      });
      after(killGraceMs + SETTLE_CAP_AFTER_KILL_MS, () => {
        log(closed ? "[claude:processes still alive after SIGKILL, settling anyway]" : "[claude:no close after SIGKILL, abandoning process]");
        settle(() => {
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
          reject(stoppedError());
        });
      });
    };

    after(timeoutMs, () => {
      if (closed) return;
      timedOut = true;
      log(`[claude:timeout after ${timeoutMs}ms, stopping process group]`);
      stop();
    });
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
        // The CLI is normally still alive here; once it has exited, a tool it left in the background can no longer be found.
        if (!exited) outside.remember();
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
    child.on("exit", () => {
      exited = true;
    });
    child.on("close", (code) => {
      closed = true;
      if (buffer.trim()) onLine(buffer.trim());
      reapThenSettle(() => {
        if (aborted || timedOut) {
          reject(stoppedError());
          return;
        }
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
