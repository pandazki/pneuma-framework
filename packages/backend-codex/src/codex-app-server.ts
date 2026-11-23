import type { Subprocess } from "bun";

// ---------------------------------------------------------------------------
// Reference adapter: a Codex app-server code-agent lane.
//
// Drives the local `codex` CLI in app-server mode over newline-delimited
// JSON-RPC on stdio. One Builder request = one coding turn against a draft
// workspace.
//
// This is a REFERENCE adapter, not framework core. A Host opts into it; the
// framework never depends on it. It follows the published app-server protocol
// (https://developers.openai.com/codex/app-server) and keeps three behaviours
// that are easy to get wrong:
//
//   - Turn completion is `turn/completed`, whose `turn.status` is `completed`,
//     `interrupted` or `failed`. Only `completed` is success. Older CLIs
//     (0.128) ended some turns with `thread/status/changed` -> `idle` and no
//     `turn/completed`; that is still accepted as a fallback. Current CLIs
//     (0.167) send both, `idle` first, so `idle` only starts a short grace
//     period in which `turn/completed` and its status still decide.
//   - The server can send requests of its own (approvals, elicitations). They
//     carry both `id` and `method` and must be answered, and their ids are in
//     a different space from ours. This lane runs with `approvalPolicy:
//     "never"`, so it declines anything that still asks.
//   - A timeout is NOT trusted as success; the caller's verify gate is
//     fail-closed.
// ---------------------------------------------------------------------------

const TURN_TIMEOUT_MESSAGE = "Timed out waiting for Codex turn completion";
/** How long `turn/completed` may follow `thread/status/changed` -> `idle` before idle alone ends the turn. */
const IDLE_GRACE_MS = 3_000;

/** True when an error is a recoverable Codex turn-completion timeout. */
export function isCodexTurnCompletionTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.includes(TURN_TIMEOUT_MESSAGE);
}

type Json = Record<string, unknown>;
interface Pending {
  resolve: (value: Json) => void;
  reject: (err: Error) => void;
}

export type CodexTurnStatus = "completed" | "idle-fallback";

export interface CodexTurnResult {
  threadId: string;
  /** `completed` from `turn/completed`; `idle-fallback` when only the thread went idle. */
  status: CodexTurnStatus;
  /** Text of the last agent message of the turn, when the server reported one. */
  finalMessage: string;
}

/**
 * The answer this lane gives to a server-initiated request it will not grant.
 * Shapes follow `codex app-server generate-json-schema` (checked against codex-cli 0.167).
 * `null` means the request has no "no" answer (token refresh, attestation); the caller
 * replies with a JSON-RPC error instead.
 */
export function declineServerRequest(method: string): Json | null {
  switch (method) {
    case "item/commandExecution/requestApproval":
    case "item/fileChange/requestApproval":
      return { decision: "decline" };
    // The pre-v2 approval requests use ReviewDecision, whose refusal is "denied".
    case "execCommandApproval":
    case "applyPatchApproval":
      return { decision: "denied" };
    case "mcpServer/elicitation/request":
      return { action: "decline", content: null };
    case "item/permissions/requestApproval":
      return { permissions: {} };
    case "item/tool/requestUserInput":
      return { answers: {} };
    case "item/tool/call":
      return { contentItems: [], success: false };
    default:
      return null;
  }
}

class CodexClient {
  #proc: Subprocess<"pipe", "pipe", "pipe">;
  #nextId = 0;
  #pending = new Map<number, Pending>();
  #turnWaiters = new Map<
    string,
    {
      resolve: (status: CodexTurnStatus) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      idleTimer?: ReturnType<typeof setTimeout>;
    }
  >();
  #activeThreads = new Set<string>();
  #lastAgentMessage = new Map<string, string>();
  #buffer = "";
  #readDone: Promise<void>;
  #log: (line: string) => void;

  #idleGraceMs: number;

  constructor(cwd: string, log: (line: string) => void, bin: string, idleGraceMs: number) {
    this.#log = log;
    this.#idleGraceMs = idleGraceMs;
    this.#proc = Bun.spawn([bin, "app-server", "--listen", "stdio://"], {
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
    // The process is gone; nothing more will arrive for anyone still waiting.
    for (const [, w] of this.#turnWaiters) {
      clearTimeout(w.timer);
      clearTimeout(w.idleTimer);
      w.reject(new Error("codex app-server exited before the turn completed"));
    }
    this.#turnWaiters.clear();
    for (const [, p] of this.#pending) p.reject(new Error("codex app-server exited"));
    this.#pending.clear();
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

  #send(msg: Json): void {
    this.#proc.stdin.write(JSON.stringify(msg) + "\n");
    this.#proc.stdin.flush();
  }

  #dispatch(msg: Json): void {
    const method = typeof msg.method === "string" ? msg.method : undefined;
    const hasId = typeof msg.id === "number" || typeof msg.id === "string";

    // Server-initiated request: has both a method and an id, and must be answered.
    if (method && hasId) {
      const answer = declineServerRequest(method);
      this.#log(`[codex:server-request ${method}] ${answer ? "declined" : "unsupported"}`);
      if (answer) this.#send({ id: msg.id, result: answer });
      else this.#send({ id: msg.id, error: { code: -32601, message: `${method} is not supported by this client` } });
      return;
    }

    // Response to one of our requests.
    if (hasId) {
      const pending = typeof msg.id === "number" ? this.#pending.get(msg.id) : undefined;
      if (!pending) return;
      this.#pending.delete(msg.id as number);
      if (msg.error) pending.reject(new Error(`codex rpc error: ${JSON.stringify(msg.error)}`));
      else pending.resolve((msg.result as Json) ?? {});
      return;
    }

    // Notification.
    const params = (msg.params as Json) ?? {};
    const status = params.status as { type?: string } | undefined;
    const turn = params.turn as { status?: string; error?: { message?: string } | null } | undefined;
    const threadId = params.threadId as string | undefined;
    if (method === "thread/status/changed") {
      this.#log(`[codex:thread/status/changed status=${status?.type ?? "?"} thread=${threadId?.slice(-6) ?? "?"}]`);
    } else if (method === "error") {
      const error = params.error as { message?: string } | undefined;
      this.#log(`[codex:error willRetry=${String(params.willRetry)}] ${error?.message ?? ""}`);
    } else if (method && !/delta$/i.test(method)) {
      // Streaming deltas arrive by the hundred and carry nothing the log needs.
      this.#log(`[codex:${method}]`);
    }

    if (method === "item/completed" && threadId) {
      const item = params.item as { type?: string; text?: string } | undefined;
      if (item?.type === "agentMessage" && typeof item.text === "string") this.#lastAgentMessage.set(threadId, item.text);
    }
    if (method === "thread/status/changed" && threadId && status?.type === "active") {
      this.#activeThreads.add(threadId);
      // Active again (a hook or a follow-up kept the turn going): the earlier idle did not end it.
      const waiting = this.#turnWaiters.get(threadId);
      if (waiting?.idleTimer) {
        clearTimeout(waiting.idleTimer);
        waiting.idleTimer = undefined;
      }
    }

    const waiter = threadId ? this.#turnWaiters.get(threadId) : undefined;
    if (!waiter || !threadId) return;
    const finish = (settle: () => void): void => {
      clearTimeout(waiter.timer);
      clearTimeout(waiter.idleTimer);
      this.#turnWaiters.delete(threadId);
      this.#activeThreads.delete(threadId);
      settle();
    };

    if (method === "turn/completed") {
      const turnStatus = turn?.status ?? "completed";
      this.#log(`turn completed via turn/completed status=${turnStatus} thread=${threadId.slice(-6)}`);
      if (turnStatus === "completed") finish(() => waiter.resolve("completed"));
      else finish(() => waiter.reject(new Error(`codex turn ${turnStatus}: ${turn?.error?.message ?? "no error message"}`)));
      return;
    }
    if (method === "thread/status/changed" && status?.type === "systemError") {
      finish(() => waiter.reject(new Error("codex thread entered systemError")));
      return;
    }
    if (method === "thread/status/changed" && status?.type === "idle" && this.#activeThreads.has(threadId) && !waiter.idleTimer) {
      waiter.idleTimer = setTimeout(() => {
        this.#log("turn completed via thread/status idle (no turn/completed followed)");
        finish(() => waiter.resolve("idle-fallback"));
      }, this.#idleGraceMs);
    }
  }

  request(method: string, params: Json): Promise<Json> {
    const id = ++this.#nextId;
    return new Promise<Json>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#send({ method, id, params });
    });
  }

  notify(method: string, params: Json): void {
    this.#send({ method, params });
  }

  waitForTurnCompleted(threadId: string, timeoutMs: number): Promise<CodexTurnStatus> {
    return new Promise<CodexTurnStatus>((resolve, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(this.#turnWaiters.get(threadId)?.idleTimer);
        this.#turnWaiters.delete(threadId);
        reject(new Error(`${TURN_TIMEOUT_MESSAGE} after ${timeoutMs}ms`));
      }, timeoutMs);
      this.#turnWaiters.set(threadId, { resolve, reject, timer });
    });
  }

  lastAgentMessage(threadId: string): string {
    return this.#lastAgentMessage.get(threadId) ?? "";
  }

  async close(): Promise<void> {
    for (const [, p] of this.#pending) p.reject(new Error("codex client closed"));
    this.#pending.clear();
    for (const [, w] of this.#turnWaiters) {
      clearTimeout(w.timer);
      clearTimeout(w.idleTimer);
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
  /** Draft workspace the agent edits (also the codex process cwd + writable root). */
  draftRoot: string;
  /** The Builder request for this turn. */
  prompt: string;
  /**
   * Host instructions for the turn (e.g. editable/protected roots). Sent as the
   * leading text input of the turn, which every app-server version accepts;
   * Codex also reads the draft's own AGENTS.md.
   */
  baseInstructions: string;
  model?: string;
  /** Reasoning effort for the turn, e.g. "medium". */
  effort?: string;
  /** Let commands in the sandbox reach the network (package installs). Default true. */
  networkAccess?: boolean;
  /** Default 900_000ms; a generous cap to absorb variable turn duration. */
  timeoutMs?: number;
  clientName?: string;
  serviceName?: string;
  /** Default "codex". */
  codexBin?: string;
  /** How long `turn/completed` may follow an idle thread before idle alone ends the turn. Default 3_000ms. */
  idleGraceMs?: number;
  log?: (line: string) => void;
}

/** Run one Codex coding turn against the draft workspace. Throws on a failed turn or a timeout. */
export async function runCodexAgent(opts: RunCodexOptions): Promise<CodexTurnResult> {
  const log = opts.log ?? (() => {});
  const timeoutMs = opts.timeoutMs ?? 900_000;
  const clientName = opts.clientName ?? "pneuma-codex-backend";
  const serviceName = opts.serviceName ?? "pneuma-host";
  const client = new CodexClient(opts.draftRoot, log, opts.codexBin ?? "codex", opts.idleGraceMs ?? IDLE_GRACE_MS);
  try {
    await client.request("initialize", {
      clientInfo: { name: clientName, title: clientName, version: "0.5.0" },
    });
    client.notify("initialized", {});
    const started = await client.request("thread/start", {
      ...(opts.model ? { model: opts.model } : {}),
      cwd: opts.draftRoot,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      serviceName,
    });
    const thread = started.thread as { id?: string } | undefined;
    const threadId = thread?.id;
    if (!threadId) throw new Error("codex thread/start returned no thread id");

    const completion = client.waitForTurnCompleted(threadId, timeoutMs);
    completion.catch(() => {});

    await client.request("turn/start", {
      threadId,
      input: [
        ...(opts.baseInstructions.trim() ? [{ type: "text", text: opts.baseInstructions }] : []),
        { type: "text", text: opts.prompt },
      ],
      cwd: opts.draftRoot,
      approvalPolicy: "never",
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.effort ? { effort: opts.effort } : {}),
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [opts.draftRoot],
        networkAccess: opts.networkAccess ?? true,
      },
    });

    const status = await completion;
    return { threadId, status, finalMessage: client.lastAgentMessage(threadId) };
  } finally {
    await client.close();
  }
}
