import type { HostKitCodeAgentDraftReceipt } from "@pneuma-framework/host-kit";
import {
  buildCodeAgentUserMessage,
  codeAgentSystemPrompt,
  verifyWorkflowDraft,
  type WorkflowDraftAgent,
} from "./workflow-code-agent.js";

export const DEFAULT_WORKFLOW_OPENCODE_MODEL = "openrouter/anthropic/claude-opus-4.7";

export function createOpencodeWorkflowDraftAgent(input?: {
  readonly model?: string;
  readonly timeout_ms?: number;
}): WorkflowDraftAgent {
  const model = input?.model ?? DEFAULT_WORKFLOW_OPENCODE_MODEL;
  return {
    async produceDraft(agentInput) {
      agentInput.append_log?.({
        kind: "session",
        text: `Starting opencode run with ${model}.`,
      });
      const prompt = [
        "[pneuma:system]",
        codeAgentSystemPrompt(),
        "[/pneuma:system]",
        "[pneuma:context_snapshot]",
        JSON.stringify(agentInput.context_snapshot, null, 2),
        "[/pneuma:context_snapshot]",
        "[pneuma:user]",
        buildCodeAgentUserMessage(agentInput),
        "[/pneuma:user]",
      ].join("\n");
      const run = Bun.spawn([
        "opencode",
        "run",
        "--model",
        model,
        "--dir",
        agentInput.draft_root,
        "--format",
        "json",
        prompt,
      ], {
        cwd: agentInput.draft_root,
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });

      const stdout = drainStream(run.stdout, (text) => {
        agentInput.append_log?.({ kind: "assistant", text }, { merge_with_previous: true });
      });
      const stderr = drainStream(run.stderr, (text) => {
        agentInput.append_log?.({ kind: "tool", text }, { merge_with_previous: true });
      });
      const timeoutMs = input?.timeout_ms ?? 600_000;
      const exitCode = await waitForProcess(run, timeoutMs);
      await Promise.all([stdout, stderr]);
      if (exitCode !== 0) {
        throw new Error(`opencode run exited with code ${exitCode}`);
      }

      const verification = await waitForDraftToStabilize({
        source_root: agentInput.source_root,
        draft_root: agentInput.draft_root,
        builder_message: agentInput.builder_message,
        timeout_ms: 90_000,
        poll_interval_ms: 1_000,
      });
      if (!verification.ok) {
        await agentInput.thread_store.appendTurn(agentInput.thread_id, {
          kind: "host_event",
          label: "code_agent_draft_failed",
          payload: {
            reason: "draft_verification_failed",
            message: verification.message,
            backend_type: "opencode",
          },
        });
        throw new Error(`Code agent draft failed: draft_verification_failed: ${verification.message}`);
      }

      const receipt: HostKitCodeAgentDraftReceipt = {
        receipt_id: `code-agent-draft-${agentInput.proposal_id}`,
        app_id: agentInput.app_id,
        proposal_id: agentInput.proposal_id,
        thread_id: agentInput.thread_id,
        backend_type: "opencode",
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
        text: `Draft verification passed. Changed paths: ${receipt.changed_paths.join(", ")}.`,
      });
      return {
        source: agentInput.source_root,
        draft: agentInput.draft_root,
        mode: "opencode",
        receipt,
      };
    },
  };
}

async function waitForProcess(process: Bun.Subprocess<"ignore", "pipe", "pipe">, timeoutMs: number): Promise<number | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      process.exited,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => {
          process.kill();
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
