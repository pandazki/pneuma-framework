import { getAgentBackendFactory } from "@pneuma-framework/core";
import { registerOpencodeBackend } from "@pneuma-framework/backend-opencode";
import { createBackendReviewQueueDraftAgent, type ReviewQueueDraftAgent } from "./code-agent.js";

export const DEFAULT_OPENCODE_MODEL = "openrouter/anthropic/claude-opus-4.7";

export function createOpencodeReviewQueueDraftAgent(input?: {
  readonly model?: string;
  readonly timeout_ms?: number;
}): ReviewQueueDraftAgent {
  registerOpencodeBackend();
  const factory = getAgentBackendFactory("opencode");
  if (!factory) {
    throw new Error("opencode backend factory was not registered");
  }
  const backend = factory({
    defaultModel: input?.model ?? DEFAULT_OPENCODE_MODEL,
    serverPort: 0,
    serverStartTimeoutMs: 60_000,
  });
  return createBackendReviewQueueDraftAgent({
    backend,
    model: input?.model ?? DEFAULT_OPENCODE_MODEL,
    timeout_ms: input?.timeout_ms,
  });
}
