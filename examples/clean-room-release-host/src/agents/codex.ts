import type { Subprocess } from "bun";

// ---------------------------------------------------------------------------
// Codex app-server code-agent lane.
//
// Drives the local `codex` CLI in app-server mode over newline-delimited
// JSON-RPC on stdio. One Builder request = one coding turn against a draft
// workspace. Turn completion is the `turn/completed` notification; a timeout is
// NOT trusted as success — the caller kills the process and lets the scaffold's
// own `verify` decide whether a proposal may be built (fail-closed).
//
// Transport mechanics were derived from the existing host examples; this is a
// fresh implementation, not a copy of their product code.
// ---------------------------------------------------------------------------

const TURN_TIMEOUT_MESSAGE = "Timed out waiting for Codex turn completion";

export function isCodexTurnCompletionTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.includes(TURN_TIMEOUT_MESSAGE);
}

type Json = Record<string, unknown>;
interface Pending {
  resolve: (value: Json) => void;
  reject: (err: Error) => void;
}

class CodexClient {
  #proc: Subprocess<"pipe", "pipe", "pipe">;
  #nextId = 0;
  #pending = new Map<number, Pending>();
  #turnWaiters = new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  #activeThreads = new Set<string>();
  #buffer = "";
  #readDone: Promise<void>;
  #log: (line: string) => void;

  constructor(cwd: string, log: (line: string) => void) {
    this.#log = log;
    this.#proc = Bun.spawn(["codex", "app-server", "--listen", "stdio://"], {
      cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });
    this.#readDone = this.#readLoop();
    void this.#drainStderr();
  }

  async #readLoop(): Promise<void> {
    const decoder = new TextDecoder();
    const reader = this.#proc.stdout.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      this.#buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = this.#buffer.indexOf("\n")) !== -1) {
        const line = this.#buffer.slice(0, nl).trim();
        this.#buffer = this.#buffer.slice(nl + 1);
        if (line.length === 0) continue;
        let msg: Json;
        try {
          msg = JSON.parse(line) as Json;
        } catch {
          this.#log(`[codex:nonjson] ${line.slice(0, 200)}`);
          continue;
        }
        this.#dispatch(msg);
      }
    }
  }

  async #drainStderr(): Promise<void> {
    const decoder = new TextDecoder();
    const reader = this.#proc.stderr.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value).trim();
      if (text) this.#log(`[codex:stderr] ${text.slice(0, 400)}`);
    }
  }

  #dispatch(msg: Json): void {
    if (typeof msg.id === "number") {
      const pending = this.#pending.get(msg.id);
      if (!pending) return;
      this.#pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(`codex rpc error: ${JSON.stringify(msg.error)}`));
      else pending.resolve((msg.result as Json) ?? {});
      return;
    }
    const method = msg.method as string | undefined;
    const params = (msg.params as Json) ?? {};
    if (method === "thread/status/changed") {
      const s = params.status as { type?: string } | undefined;
      this.#log(`[codex:thread/status/changed status=${s?.type ?? "?"}]`);
    } else if (method) {
      this.#log(`[codex:${method}]`);
    }

    // Turn completion. codex app-server (0.128) reliably emits
    // `thread/status/changed` with status.type === "idle" when a turn ends, and
    // emits `turn/completed` only for some turns. Resolve on either. An early
    // resolve is still safe because the scaffold verify gate is fail-closed.
    const status = params.status as { type?: string } | undefined;
    const threadId = params.threadId as string | undefined;
    if (method === "thread/status/changed" && threadId && status?.type === "active") {
      this.#activeThreads.add(threadId);
    }
    const isTurnCompleted = method === "turn/completed";
    const isIdle =
      method === "thread/status/changed" &&
      status?.type === "idle" &&
      !!threadId &&
      this.#activeThreads.has(threadId);
    if ((isTurnCompleted || isIdle) && threadId && this.#turnWaiters.has(threadId)) {
      const waiter = this.#turnWaiters.get(threadId)!;
      clearTimeout(waiter.timer);
      this.#turnWaiters.delete(threadId);
      this.#activeThreads.delete(threadId);
      this.#log(`turn completed via ${isTurnCompleted ? "turn/completed" : "thread/status idle"}`);
      waiter.resolve();
    }
  }

  request(method: string, params: Json): Promise<Json> {
    const id = ++this.#nextId;
    const payload = JSON.stringify({ method, id, params }) + "\n";
    return new Promise<Json>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#proc.stdin.write(payload);
      this.#proc.stdin.flush();
    });
  }

  notify(method: string, params: Json): void {
    this.#proc.stdin.write(JSON.stringify({ method, params }) + "\n");
    this.#proc.stdin.flush();
  }

  waitForTurnCompleted(threadId: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#turnWaiters.delete(threadId);
        reject(new Error(`${TURN_TIMEOUT_MESSAGE} after ${timeoutMs}ms`));
      }, timeoutMs);
      this.#turnWaiters.set(threadId, { resolve, reject, timer });
    });
  }

  async close(): Promise<void> {
    for (const [, p] of this.#pending) p.reject(new Error("codex client closed"));
    this.#pending.clear();
    for (const [, w] of this.#turnWaiters) {
      clearTimeout(w.timer);
      w.reject(new Error("codex client closed"));
    }
    this.#turnWaiters.clear();
    try {
      this.#proc.stdin.end();
    } catch {
      // already closed
    }
    this.#proc.kill();
    await Promise.race([this.#proc.exited, new Promise((r) => setTimeout(r, 2_000))]);
    await Promise.race([this.#readDone, new Promise((r) => setTimeout(r, 1_000))]);
  }
}

export interface RunCodexOptions {
  draftRoot: string;
  prompt: string;
  baseInstructions: string;
  model?: string;
  timeoutMs?: number;
  log?: (line: string) => void;
}

/** Run one Codex coding turn against the draft workspace. Throws on timeout. */
export async function runCodexAgent(opts: RunCodexOptions): Promise<void> {
  const log = opts.log ?? (() => {});
  const timeoutMs = opts.timeoutMs ?? 900_000;
  const client = new CodexClient(opts.draftRoot, log);
  try {
    await client.request("initialize", {
      clientInfo: { name: "clean-room-release-host", title: "Clean Room Release Host", version: "0.0.0" },
      capabilities: null,
    });
    client.notify("initialized", {});
    const started = await client.request("thread/start", {
      ...(opts.model ? { model: opts.model } : {}),
      cwd: opts.draftRoot,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      serviceName: "clean-room-release-host",
      baseInstructions: opts.baseInstructions,
      ephemeral: true,
    });
    const thread = started.thread as { id?: string } | undefined;
    const threadId = thread?.id;
    if (!threadId) throw new Error("codex thread/start returned no thread id");

    const completion = client.waitForTurnCompleted(threadId, timeoutMs);
    completion.catch(() => {});

    await client.request("turn/start", {
      threadId,
      input: [{ type: "text", text: opts.prompt, text_elements: [] }],
      cwd: opts.draftRoot,
      approvalPolicy: "never",
      ...(opts.model ? { model: opts.model } : {}),
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [opts.draftRoot],
        networkAccess: true,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
    });

    await completion;
  } finally {
    await client.close();
  }
}
