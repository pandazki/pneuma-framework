import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";

export interface SpawnScriptOptions {
  scriptPath: string;
  cwd: string;
  env: Record<string, string>;
  stdinInput?: string;
}

export interface ScriptLine {
  stream: "stdout" | "stderr";
  line: string;
  ts: number;
}

export interface ScriptExitResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
}

export interface ScriptProcess {
  pid: number;
  exit: Promise<ScriptExitResult>;
  onLine: (cb: (ev: ScriptLine) => void) => void;
  kill: (signal?: NodeJS.Signals) => Promise<void>;
  writeStdin: (data: string) => void;
}

export function spawnScript(opts: SpawnScriptOptions): ScriptProcess {
  const startedAt = Date.now();
  const child = spawn("/bin/sh", [opts.scriptPath], {
    cwd: opts.cwd,
    env: opts.env,
    detached: true, // new process group
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;

  if (opts.stdinInput !== undefined) {
    child.stdin.write(opts.stdinInput);
    child.stdin.end();
  }

  const listeners = new Set<(ev: ScriptLine) => void>();
  const history: ScriptLine[] = [];
  const HISTORY_CAP = 2000;
  const dispatch = (ev: ScriptLine): void => {
    if (history.length >= HISTORY_CAP) history.shift();
    history.push(ev);
    for (const cb of listeners) cb(ev);
  };
  attachLineReader(child.stdout, "stdout", dispatch);
  attachLineReader(child.stderr, "stderr", dispatch);

  const exitPromise = new Promise<ScriptExitResult>((resolve) => {
    let exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null;
    let resolved = false;
    const done = (): void => {
      if (resolved || !exitInfo) return;
      resolved = true;
      resolve({ ...exitInfo, durationMs: Date.now() - startedAt });
    };
    child.once("close", (code, signal) => {
      exitInfo ??= { code, signal };
      done();
    });
    child.once("exit", (code, signal) => {
      exitInfo = { code, signal };
      // If 'close' doesn't fire within 500ms (backgrounded children holding stdio),
      // resolve anyway. 500ms is a pragmatic balance: long enough for normal stdio
      // drain, short enough to not hang the orchestrator on daemonized scripts.
      // unref() so this timer doesn't keep the event loop alive when 'close'
      // already resolved on the normal path.
      setTimeout(done, 500).unref();
    });
  });

  const pid = child.pid;
  if (pid === undefined) {
    throw new Error("failed to spawn script (no pid)");
  }

  return {
    pid,
    exit: exitPromise,
    onLine: (cb) => {
      for (const ev of history) cb(ev);
      listeners.add(cb);
    },
    kill: async (signal = "SIGTERM") => {
      try {
        process.kill(-pid, signal); // negative = process group
      } catch {
        // process may have already exited
      }
    },
    writeStdin: (data) => {
      child.stdin.write(data);
    },
  };
}

function attachLineReader(
  stream: NodeJS.ReadableStream,
  kind: "stdout" | "stderr",
  dispatch: (ev: ScriptLine) => void,
): void {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      dispatch({ stream: kind, line, ts: Date.now() });
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      const line = buffer.replace(/\r$/, "");
      dispatch({ stream: kind, line, ts: Date.now() });
      buffer = "";
    }
  });
}

// Silence "once" import as unused — kept for future signal-await refinements.
void once;
