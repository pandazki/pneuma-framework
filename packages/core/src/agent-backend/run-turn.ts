import {
  packBuildTurnsForRoleContent,
  type BuildTurnRoleContentMessage,
} from "../build-thread.js";
import type {
  AgentRunTurnOptions,
  AgentRunTurnResult,
  AgentRunTurnSessionCache,
  AgentRunTurnTransport,
} from "./types.js";

export interface RunAgentTurnThroughLaunchSendOptions extends AgentRunTurnOptions {
  readonly transport: AgentRunTurnTransport;
  readonly session_cache?: AgentRunTurnSessionCache;
}

export async function runAgentTurnThroughLaunchSend(
  options: RunAgentTurnThroughLaunchSendOptions,
): Promise<AgentRunTurnResult> {
  const appended = await options.thread_store.appendTurn(options.thread_id, {
    kind: "user",
    text: options.new_user_message,
  });
  const turns = await options.thread_store.listTurns(options.thread_id);
  const messages = packBuildTurnsForRoleContent(turns, options.packing);
  const prompt = formatAgentRunTurnPrompt({
    system_prompt: options.system_prompt,
    context_snapshot: options.context_snapshot,
    messages,
  });

  const cachedSession = options.session_cache?.get(options.thread_id);
  const backendSessionCached = cachedSession !== undefined;
  const session = cachedSession ?? await options.transport.launch({
    ...(options.launch ?? {}),
    cwd: options.cwd,
  });
  if (!backendSessionCached) {
    options.session_cache?.set(options.thread_id, session);
  }

  await options.transport.sendUserMessage(session.sessionId, prompt);

  return {
    thread_id: options.thread_id,
    session,
    backend_session_cached: backendSessionCached,
    appended_user_turn: appended,
    messages,
    message_count: messages.length,
    prompt,
  };
}

export function formatAgentRunTurnPrompt(input: {
  readonly system_prompt: string;
  readonly context_snapshot?: unknown;
  readonly messages: readonly BuildTurnRoleContentMessage[];
}): string {
  const lines = [
    "[pneuma:system]",
    input.system_prompt,
    "[/pneuma:system]",
  ];

  if (input.context_snapshot !== undefined) {
    lines.push(
      "[pneuma:context_snapshot]",
      stableJson(input.context_snapshot),
      "[/pneuma:context_snapshot]",
    );
  }

  lines.push("[pneuma:build_thread]");
  for (const message of input.messages) {
    lines.push(`${message.role}: ${message.content}`);
  }
  lines.push("[/pneuma:build_thread]");

  return lines.join("\n");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}
