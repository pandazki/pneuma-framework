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

/** Run one Claude Code coding turn against the draft workspace. Throws on failure or timeout. */
export function runClaudeCodeAgent(opts: RunClaudeCodeOptions): Promise<ClaudeCodeTurnResult> {
  const log = opts.log ?? (() => {});
  const timeoutMs = opts.timeoutMs ?? 900_000;

  return new Promise<ClaudeCodeTurnResult>((resolve, reject) => {
    const child = spawn(opts.claudeBin ?? "claude", claudeCodeArgs(opts), {
      cwd: opts.draftRoot,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let buffer = "";
    let stderr = "";
    let final: Json | undefined;
    let sessionId = "";
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill("SIGINT");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
      settle(() => reject(new Error(`${TURN_TIMEOUT_MESSAGE} after ${timeoutMs}ms`)));
    }, timeoutMs);

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

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) onLine(line);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => settle(() => reject(new Error(`could not start claude: ${err.message}`))));
    child.on("close", (code) => {
      if (buffer.trim()) onLine(buffer.trim());
      settle(() => {
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
