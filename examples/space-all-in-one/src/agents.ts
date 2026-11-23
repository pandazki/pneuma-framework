import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isClaudeCodeTurnCompletionTimeout, runClaudeCodeAgent } from "@pneuma-framework/backend-claude-code";
import type { SubmitInput } from "./host";

// ---------------------------------------------------------------------------
// Host-driven control plane: the code agents a Host can start on a draft.
//
// Each lane is a closure with the same shape, so the governed loop does not
// know which product edited the draft. `scripted` needs no login and exists to
// exercise the loop offline.
// ---------------------------------------------------------------------------

export type AgentKind = "claude-code" | "codex" | "scripted";
export const AGENT_KINDS: readonly AgentKind[] = ["claude-code", "codex", "scripted"];

const DRAFT_RULES = [
  "You are working in a draft copy that the host manages.",
  "Ignore the 'Changing this app' section of AGENTS.md: do not run .pneuma/pneuma.mjs, do not publish.",
  "Edit files, make sure `npm test` passes, then stop. The host verifies, previews and releases the draft.",
].join("\n");

export interface AgentLane {
  readonly runAgent: NonNullable<SubmitInput["runAgent"]>;
  readonly isAgentTimeout: (err: unknown) => boolean;
}

export interface AgentLaneOptions {
  model?: string;
  log?: (line: string) => void;
  /** Stops a running turn; the turn then fails with an error the lane does not count as a timeout. */
  signal?: AbortSignal;
}

export async function agentLane(kind: AgentKind, intent: string, opts: AgentLaneOptions = {}): Promise<AgentLane> {
  const log = opts.log ?? (() => {});
  if (kind === "claude-code") {
    return {
      isAgentTimeout: isClaudeCodeTurnCompletionTimeout,
      runAgent: async (draftRoot, context) => {
        const turn = await runClaudeCodeAgent({
          draftRoot,
          prompt: intent,
          appendSystemPrompt: `${context.system_prompt}\n${DRAFT_RULES}`,
          model: opts.model,
          signal: opts.signal,
          log,
        });
        // Nobody answers a permission prompt in this lane, so a tool call outside the allow-list is denied.
        // Say so: a denied `npm test` means the agent stopped without checking its own work.
        for (const denial of turn.permissionDenials as { tool_name?: string; tool_input?: { command?: string } }[]) {
          log(`[claude:denied ${denial.tool_name ?? "?"}] ${(denial.tool_input?.command ?? "").slice(0, 160)}`);
        }
        return { note: turn.result.slice(0, 600) };
      },
    };
  }
  if (kind === "codex") {
    // Imported on demand: the Codex adapter is the one lane that needs the Bun runtime.
    const { isCodexTurnCompletionTimeout, runCodexAgent } = await import("@pneuma-framework/backend-codex");
    return {
      isAgentTimeout: isCodexTurnCompletionTimeout,
      runAgent: async (draftRoot, context) => {
        const turn = await runCodexAgent({
          draftRoot,
          prompt: intent,
          baseInstructions: `${context.system_prompt}\n${DRAFT_RULES}`,
          model: opts.model,
          signal: opts.signal,
          log,
        });
        return { note: turn.finalMessage.slice(0, 600) || `codex turn ${turn.status}` };
      },
    };
  }
  return {
    isAgentTimeout: () => false,
    runAgent: async (draftRoot) => {
      mkdirSync(join(draftRoot, "public", "app"), { recursive: true });
      writeFileSync(join(draftRoot, "public", "app", "note.txt"), `${intent}\n`);
      return { note: "scripted lane wrote public/app/note.txt" };
    },
  };
}
