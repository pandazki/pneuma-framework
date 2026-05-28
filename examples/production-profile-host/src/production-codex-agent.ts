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

export interface ProductionCodeAgentLogEntry {
  readonly kind: "session" | "assistant" | "tool" | "warning" | "error";
  readonly text: string;
}

export interface RunCodexProductionAgentInput {
  readonly draft_root: string;
  readonly builder_request: string;
  readonly model?: string;
  readonly timeout_ms?: number;
  readonly append_log?: (entry: ProductionCodeAgentLogEntry, options?: { readonly merge_with_previous?: boolean }) => void;
}

export async function runCodexAppServerProductionAgent(
  input: RunCodexProductionAgentInput,
): Promise<{ readonly summary: string; readonly thread_id: string }> {
  const timeoutMs = input.timeout_ms ?? 600_000;
  input.append_log?.({ kind: "session", text: "Starting Codex app-server for the production scaffold draft." });
  const run = Bun.spawn(["codex", "app-server", "--listen", "stdio://"], {
    cwd: input.draft_root,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const stderr = drainStream(run.stderr, (text) => {
    input.append_log?.({ kind: "tool", text: `codex stderr: ${text}` }, { merge_with_previous: true });
  });
  const client = new CodexAppServerJsonlClient(run, {
    onNotification(notification) {
      const mapped = logEntryForCodexNotification(notification);
      if (mapped) input.append_log?.(mapped.entry, mapped.options);
    },
    onParseError(line, err) {
      input.append_log?.({
        kind: "error",
        text: `Codex emitted non-JSON output: ${line.slice(0, 300)} (${err instanceof Error ? err.message : String(err)})`,
      });
    },
  });

  try {
    await client.request("initialize", {
      clientInfo: {
        name: "pneuma-production-profile-host",
        title: "Pneuma Production Profile Host",
        version: "0.4.0",
      },
      capabilities: null,
    });
    await client.notify("initialized", {});
    const threadStart = await client.request("thread/start", {
      ...(input.model ? { model: input.model } : {}),
      cwd: input.draft_root,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      serviceName: "pneuma-production-profile-host",
      baseInstructions: productionCodeAgentSystemPrompt(),
      ephemeral: true,
    }) as { thread?: { id?: unknown } };
    const threadId = typeof threadStart.thread?.id === "string" ? threadStart.thread.id : undefined;
    if (!threadId) throw new Error("Codex app-server did not return thread.id");

    const completion = client.waitForTurnCompleted(threadId, timeoutMs);
    completion.catch(() => {});
    await client.request("turn/start", {
      threadId,
      input: [{ type: "text", text: buildProductionCodeAgentPrompt(input.builder_request), text_elements: [] }],
      cwd: input.draft_root,
      approvalPolicy: "never",
      ...(input.model ? { model: input.model } : {}),
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [input.draft_root],
        networkAccess: true,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
    });
    await completion;
    return {
      summary: "Codex app-server completed a production scaffold draft edit.",
      thread_id: threadId,
    };
  } finally {
    await client.close();
    await stderr.catch(() => "");
  }
}

export function isCodexTurnCompletionTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.includes("Timed out waiting for Codex turn completion");
}

function productionCodeAgentSystemPrompt(): string {
  return [
    "You are the Build-phase Code Agent inside a Pneuma Creation Host.",
    "You are editing a generated product scaffold, not the framework itself.",
    "The scaffold stack is Bun + Hono + React + Drizzle + Zod, with Neon/Postgres, Docker, and Vercel boundaries.",
    "Only modify product source roots inside the current workspace. Do not edit protected deployment/profile files unless explicitly asked.",
    "A proposal can only be shown after the Host verification command passes.",
    "If `bun run verify` exits 0 while Vite prints a Node-version warning, treat that warning as non-blocking environment noise.",
    "Keep the React UI product-grade: no unstyled native selects, use existing local primitives and lucide icons, keep the restrained light design language.",
  ].join("\n");
}

function buildProductionCodeAgentPrompt(builderRequest: string): string {
  return [
    "[pneuma:builder_request]",
    builderRequest,
    "[/pneuma:builder_request]",
    "",
    "Implement the request in this generated app scaffold.",
    "For the default request, add release environment tracking so operators can separate development, staging, and production work.",
    "",
    "Acceptance criteria:",
    "- Update shared Zod contracts and TypeScript types.",
    "- Update demo data and scaffold demo scenarios if the input contract changes.",
    "- Update Drizzle schema and SQL migration when persisted shape changes.",
    "- Update memory and Drizzle repository mapping.",
    "- Update the React UI so the new field is visible and can be set without raw browser-native select controls.",
    "- Do not modify api/, Dockerfile, vercel.json, drizzle.config.ts, or package manager files.",
    "- Make `bun run verify` pass.",
    "- Do not chase a Vite Node-version warning when the command exits successfully; the Host environment owns that runtime patch.",
  ].join("\n");
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
      readonly entry: ProductionCodeAgentLogEntry;
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
