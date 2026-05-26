import { runAgentDebugLoop } from "@pneuma-framework/core";
import type { HostKitCodeAgentDraftReceipt } from "@pneuma-framework/host-kit";
import {
  buildCodeAgentUserMessage,
  codeAgentSystemPrompt,
  verifyWorkflowDraft,
  type WorkflowDraftAgentInput,
  type WorkflowDraftAgent,
} from "./workflow-code-agent.js";
import type { WorkflowAgentLogEntry } from "./store.js";

type JsonRpcId = number;

interface JsonRpcResponse {
  readonly id: JsonRpcId;
  readonly result?: unknown;
  readonly error?: unknown;
}

interface JsonRpcNotification {
  readonly method: string;
  readonly params?: unknown;
}

export interface CodexAppServerWorkflowDraftAgentOptions {
  readonly command?: string;
  readonly args?: readonly string[];
  readonly model?: string;
  readonly timeout_ms?: number;
  readonly service_name?: string;
}

export function createCodexAppServerWorkflowDraftAgent(
  input?: CodexAppServerWorkflowDraftAgentOptions,
): WorkflowDraftAgent {
  const command = input?.command ?? "codex";
  const args = input?.args ?? ["app-server", "--listen", "stdio://"];
  return {
    async produceDraft(agentInput) {
      const timeoutMs = input?.timeout_ms ?? 600_000;
      agentInput.append_log?.({
        kind: "session",
        text: `Starting Codex app-server debug loop${input?.model ? ` with ${input.model}` : ""}.`,
      });

      const debug = await runAgentDebugLoop({
        session_id: `debug-${agentInput.proposal_id}`,
        budget: { max_attempts: 2, max_wall_time_ms: timeoutMs },
        checks: [{ id: "draft-verification", description: "Validate generated workflow draft." }],
        thread_store: agentInput.thread_store,
        thread_id: agentInput.thread_id,
        run_attempt: async (attempt) => {
          agentInput.append_log?.({
            kind: "session",
            text: `Codex debug attempt ${attempt.attempt_index}/2 started.`,
          });
          try {
            const sessionId = await runCodexAppServerAttempt({
              command,
              args,
              model: input?.model,
              service_name: input?.service_name,
              timeout_ms: timeoutMs,
              agent_input: agentInput,
              failure_feedback: attempt.feedback?.summary,
            });
            return {
              ok: true,
              backend_type: "codex-app-server",
              summary: `Codex completed debug attempt ${attempt.attempt_index}.`,
              evidence: { session_id: sessionId },
            };
          } catch (err) {
            return {
              ok: false,
              backend_type: "codex-app-server",
              message: err instanceof Error ? err.message : String(err),
            };
          }
        },
        run_check: async (checkInput) => {
          agentInput.append_log?.({
            kind: "host",
            text: `Running debug check ${checkInput.check.id} for attempt ${checkInput.attempt.attempt_index}.`,
          });
          const verification = await verifyWorkflowDraft(
            agentInput.source_root,
            agentInput.draft_root,
            agentInput.builder_message,
          );
          if (!verification.ok) {
            agentInput.append_log?.({
              kind: "warning",
              text: `Debug attempt ${checkInput.attempt.attempt_index} failed: ${verification.message}`,
            });
          }
          return {
            ok: verification.ok,
            message: verification.message,
            output: verification.changed_paths?.length
              ? `changed_paths: ${verification.changed_paths.join(", ")}`
              : undefined,
          };
        },
      });
      if (!debug.ok) {
        const latest = debug.latest_attempt;
        const message = latest?.checks.find((check) => check.status === "failed")?.message
          ?? latest?.agent.summary
          ?? "debug budget exhausted";
        await agentInput.thread_store.appendTurn(agentInput.thread_id, {
          kind: "host_event",
          label: "code_agent_draft_failed",
          payload: {
            reason: "debug_budget_exhausted",
            message,
            backend_type: "codex-app-server",
            session_id: debug.session.session_id,
          },
        });
        throw new Error(`Code agent debug loop failed: ${debug.reason}: ${message}`);
      }

      const verification = await verifyWorkflowDraft(
        agentInput.source_root,
        agentInput.draft_root,
        agentInput.builder_message,
      );
      if (!verification.ok) {
        throw new Error(`Code agent debug loop passed but final verification failed: ${verification.message}`);
      }

      const receipt: HostKitCodeAgentDraftReceipt = {
        receipt_id: `code-agent-draft-${agentInput.proposal_id}`,
        app_id: agentInput.app_id,
        proposal_id: agentInput.proposal_id,
        thread_id: agentInput.thread_id,
        backend_type: "codex-app-server",
        status: "completed",
        changed_paths: verification.changed_paths ?? [],
        created_at_ms: Date.now(),
        evidence_refs: [{ kind: "host_check", check_id: "draft-verification", status: "passed" }],
      };
      await agentInput.thread_store.appendTurn(agentInput.thread_id, {
        kind: "host_event",
        label: "code_agent_draft",
        payload: receipt,
      });
      agentInput.append_log?.({
        kind: "host",
        text: `Draft verification passed after ${debug.session.attempts.length} debug attempt(s). Changed paths: ${receipt.changed_paths.join(", ")}.`,
      });
      return {
        source: agentInput.source_root,
        draft: agentInput.draft_root,
        mode: "codex-app-server",
        receipt,
      };
    },
  };
}

async function runCodexAppServerAttempt(input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly model?: string;
  readonly service_name?: string;
  readonly timeout_ms: number;
  readonly agent_input: WorkflowDraftAgentInput;
  readonly failure_feedback?: string;
}): Promise<string> {
  const agentInput = input.agent_input;
  const run = Bun.spawn([input.command, ...input.args], {
        cwd: agentInput.draft_root,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });
      const stderr = drainStream(run.stderr, (text) => {
        agentInput.append_log?.({ kind: "tool", text: `codex app-server stderr: ${text}` }, { merge_with_previous: true });
      });
      const client = new CodexAppServerJsonlClient(run, {
        onNotification(notification) {
          const mapped = logEntryForCodexNotification(notification);
          if (mapped) agentInput.append_log?.(mapped.entry, mapped.options);
        },
        onParseError(line, err) {
          agentInput.append_log?.({
            kind: "error",
            text: `Codex app-server emitted non-JSON output: ${line.slice(0, 300)} (${err instanceof Error ? err.message : String(err)})`,
          });
        },
      });

      try {
        await client.request("initialize", {
          clientInfo: {
            name: "pneuma-workflow-app-studio",
            title: "Pneuma Workflow App Studio",
            version: "0.4.0",
          },
          capabilities: null,
        });
        await client.notify("initialized", {});
        const threadStart = await client.request("thread/start", {
          ...(input.model ? { model: input.model } : {}),
          cwd: agentInput.draft_root,
          approvalPolicy: "never",
          sandbox: "workspace-write",
          serviceName: input.service_name ?? "pneuma-workflow-app-studio",
          baseInstructions: codeAgentSystemPrompt(),
          ephemeral: true,
        }) as { thread?: { id?: unknown } };
        const threadId = typeof threadStart.thread?.id === "string" ? threadStart.thread.id : undefined;
        if (!threadId) throw new Error("Codex app-server did not return thread.id");

        const completion = client.waitForTurnCompleted(threadId, input.timeout_ms);
        completion.catch(() => {});
        const prompt = [
          "[pneuma:context_snapshot]",
          JSON.stringify(agentInput.context_snapshot, null, 2),
          "[/pneuma:context_snapshot]",
          input.failure_feedback
            ? [
                "[pneuma:previous_debug_failure]",
                input.failure_feedback,
                "[/pneuma:previous_debug_failure]",
              ].join("\n")
            : "",
          "[pneuma:user]",
          buildCodeAgentUserMessage(agentInput),
          "[/pneuma:user]",
        ].filter(Boolean).join("\n");
        await client.request("turn/start", {
          threadId,
          input: [{ type: "text", text: prompt, text_elements: [] }],
          cwd: agentInput.draft_root,
          approvalPolicy: "never",
          ...(input.model ? { model: input.model } : {}),
          sandboxPolicy: {
            type: "workspaceWrite",
            writableRoots: [agentInput.draft_root],
            networkAccess: true,
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false,
          },
        });
        await completion;
        return threadId;
      } finally {
        await client.close();
        await stderr.catch(() => "");
      }
}

class CodexAppServerJsonlClient {
  #nextId = 0;
  #closed = false;
  #stdoutDone: Promise<void>;
  #pending = new Map<JsonRpcId, {
    readonly resolve: (value: unknown) => void;
    readonly reject: (err: Error) => void;
  }>();
  #turnWaiters = new Map<string, Array<{
    readonly resolve: (value: unknown) => void;
    readonly reject: (err: Error) => void;
    readonly timeout: ReturnType<typeof setTimeout>;
  }>>();

  constructor(
    private readonly process: Bun.Subprocess<"pipe", "pipe", "pipe">,
    private readonly hooks: {
      readonly onNotification: (notification: JsonRpcNotification) => void;
      readonly onParseError: (line: string, err: unknown) => void;
    },
  ) {
    this.#stdoutDone = this.#readStdout();
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    if (this.#closed) throw new Error("Codex app-server connection is closed");
    const id = ++this.#nextId;
    const result = new Promise<unknown>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
    await this.#write({ method, id, ...(params === undefined ? {} : { params }) });
    return result;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (this.#closed) throw new Error("Codex app-server connection is closed");
    await this.#write({ method, ...(params === undefined ? {} : { params }) });
  }

  waitForTurnCompleted(threadId: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const waiters = this.#turnWaiters.get(threadId) ?? [];
        this.#turnWaiters.set(threadId, waiters.filter((waiter) => waiter.reject !== reject));
        reject(new Error(`Timed out waiting for Codex turn completion after ${timeoutMs}ms`));
      }, timeoutMs);
      const waiters = this.#turnWaiters.get(threadId) ?? [];
      waiters.push({ resolve, reject, timeout });
      this.#turnWaiters.set(threadId, waiters);
    });
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#pending.values()) waiter.reject(new Error("Codex app-server connection closed"));
    this.#pending.clear();
    for (const waiters of this.#turnWaiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error("Codex app-server connection closed"));
      }
    }
    this.#turnWaiters.clear();
    try {
      this.process.stdin.end();
    } catch {}
    this.process.kill();
    await Promise.race([
      this.process.exited.catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    await this.#stdoutDone.catch(() => {});
  }

  async #write(payload: unknown): Promise<void> {
    this.process.stdin.write(`${JSON.stringify(payload)}\n`);
    await this.process.stdin.flush();
  }

  async #readStdout(): Promise<void> {
    try {
      const decoder = new TextDecoder();
      const reader = this.process.stdout.getReader();
      let buffer = "";
      while (true) {
        const read = await reader.read();
        if (read.done) break;
        buffer += decoder.decode(read.value, { stream: true });
        buffer = this.#consumeLines(buffer);
      }
      buffer += decoder.decode();
      this.#consumeLines(`${buffer}\n`);
    } catch (err) {
      this.#failConnection(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      if (!this.#closed && this.#pending.size > 0) {
        this.#failConnection(new Error("Codex app-server stdout closed before pending requests completed"));
      }
    }
  }

  #consumeLines(buffer: string): string {
    let cursor = 0;
    while (true) {
      const newline = buffer.indexOf("\n", cursor);
      if (newline === -1) return buffer.slice(cursor);
      const line = buffer.slice(cursor, newline).trim();
      cursor = newline + 1;
      if (!line) continue;
      try {
        this.#handleMessage(JSON.parse(line) as JsonRpcResponse | JsonRpcNotification);
      } catch (err) {
        this.hooks.onParseError(line, err);
      }
    }
  }

  #handleMessage(message: JsonRpcResponse | JsonRpcNotification): void {
    if ("id" in message) {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error !== undefined) {
        pending.reject(new Error(stableSnippet(message.error)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    this.hooks.onNotification(message);
    if (message.method === "turn/completed") {
      const threadId = extractString(message.params, "threadId");
      if (!threadId) return;
      const waiters = this.#turnWaiters.get(threadId) ?? [];
      this.#turnWaiters.delete(threadId);
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.resolve(message.params);
      }
    }
  }

  #failConnection(err: Error): void {
    for (const waiter of this.#pending.values()) waiter.reject(err);
    this.#pending.clear();
    for (const waiters of this.#turnWaiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(err);
      }
    }
    this.#turnWaiters.clear();
  }
}

function logEntryForCodexNotification(notification: JsonRpcNotification):
  | {
      readonly entry: Omit<WorkflowAgentLogEntry, "at_ms">;
      readonly options?: { readonly merge_with_previous?: boolean };
    }
  | undefined {
  const params = notification.params;
  if (notification.method === "thread/started") {
    return { entry: { kind: "session", text: `Codex thread started: ${extractNestedString(params, ["thread", "id"]) ?? "unknown"}` } };
  }
  if (notification.method === "turn/started") {
    return { entry: { kind: "session", text: `Codex turn started: ${extractNestedString(params, ["turn", "id"]) ?? "unknown"}` } };
  }
  if (notification.method === "turn/completed") {
    return { entry: { kind: "session", text: `Codex turn completed: ${extractNestedString(params, ["turn", "status"]) ?? "completed"}` } };
  }
  if (notification.method === "item/agentMessage/delta" || notification.method === "item/reasoning/textDelta") {
    const delta = extractString(params, "delta");
    return delta ? { entry: { kind: "assistant", text: delta }, options: { merge_with_previous: true } } : undefined;
  }
  if (notification.method === "item/commandExecution/outputDelta" || notification.method === "item/fileChange/outputDelta") {
    const delta = extractString(params, "delta");
    return delta ? { entry: { kind: "tool", text: delta }, options: { merge_with_previous: true } } : undefined;
  }
  if (notification.method === "turn/plan/updated") {
    const explanation = extractString(params, "explanation");
    const plan = Array.isArray((params as { plan?: unknown } | undefined)?.plan)
      ? ((params as { plan: Array<{ step?: unknown; status?: unknown }> }).plan)
        .map((step) => `${typeof step.status === "string" ? step.status : "step"}: ${typeof step.step === "string" ? step.step : ""}`)
        .join("\n")
      : "";
    return { entry: { kind: "assistant", text: [explanation, plan].filter(Boolean).join("\n") } };
  }
  if (notification.method === "item/started" || notification.method === "item/completed") {
    const item = (params as { item?: unknown } | undefined)?.item;
    const formatted = formatThreadItem(item, notification.method.endsWith("completed") ? "completed" : "started");
    return formatted ? { entry: { kind: "tool", text: formatted } } : undefined;
  }
  if (notification.method === "item/fileChange/patchUpdated") {
    return { entry: { kind: "tool", text: `file patch updated: ${stableSnippet((params as { changes?: unknown } | undefined)?.changes)}` } };
  }
  if (
    notification.method === "error"
    || notification.method === "warning"
    || notification.method === "guardianWarning"
    || notification.method === "configWarning"
  ) {
    const kind = notification.method === "error" ? "error" : "warning";
    return { entry: { kind, text: `${notification.method}: ${stableSnippet(params)}` } };
  }
  return undefined;
}

function formatThreadItem(item: unknown, phase: "started" | "completed"): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  const typed = item as {
    type?: unknown;
    command?: unknown;
    cwd?: unknown;
    status?: unknown;
    exitCode?: unknown;
    changes?: unknown;
    tool?: unknown;
    text?: unknown;
  };
  const type = typeof typed.type === "string" ? typed.type : "item";
  if (type === "commandExecution") {
    const command = typeof typed.command === "string" ? typed.command : "command";
    const status = typeof typed.status === "string" ? typed.status : phase;
    const exit = typeof typed.exitCode === "number" ? ` exit=${typed.exitCode}` : "";
    return `command ${status}: ${command}${exit}`;
  }
  if (type === "fileChange") {
    return `file change ${phase}: ${stableSnippet(typed.changes)}`;
  }
  if (type === "mcpToolCall" || type === "dynamicToolCall") {
    const tool = typeof typed.tool === "string" ? typed.tool : type;
    const status = typeof typed.status === "string" ? typed.status : phase;
    return `${tool} ${status}`;
  }
  if (type === "agentMessage" && typeof typed.text === "string" && typed.text) {
    return typed.text;
  }
  return `${type} ${phase}`;
}

async function waitForDraftToStabilize(input: {
  readonly source_root: string;
  readonly draft_root: string;
  readonly builder_message: string;
  readonly timeout_ms: number;
  readonly poll_interval_ms: number;
}): Promise<{ readonly ok: boolean; readonly message: string; readonly changed_paths?: readonly string[] }> {
  const started = Date.now();
  let latest: { readonly ok: boolean; readonly message: string; readonly changed_paths?: readonly string[] } = {
    ok: false,
    message: "draft verification not started",
  };
  while (Date.now() - started <= input.timeout_ms) {
    latest = await verifyWorkflowDraft(input.source_root, input.draft_root, input.builder_message);
    if (latest.ok) return latest;
    await new Promise((resolve) => setTimeout(resolve, input.poll_interval_ms));
  }
  return latest;
}

async function drainStream(stream: ReadableStream<Uint8Array>, onChunk: (text: string) => void): Promise<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const read = await reader.read();
    if (read.done) break;
    const text = decoder.decode(read.value, { stream: true });
    chunks.push(text);
    if (text.trim()) onChunk(text);
  }
  const tail = decoder.decode();
  if (tail) chunks.push(tail);
  return chunks.join("");
}

function extractString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "string" ? found : undefined;
}

function extractNestedString(value: unknown, path: readonly string[]): string | undefined {
  let cursor: unknown = value;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" ? cursor : undefined;
}

function stableSnippet(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text.length > 500 ? `${text.slice(0, 497)}...` : text;
  } catch {
    return String(value);
  }
}
