import * as sdk from "@opencode-ai/sdk";
import { registerAgentBackend, type AgentBackendFactory } from "@pneuma-framework/core";
import { OpencodeBackend, OPENCODE_CAPS, type OpencodeBackendConfig, type OpencodeSdk } from "./adapter.js";

export { OpencodeBackend, OPENCODE_CAPS, type OpencodeBackendConfig };

const factory: AgentBackendFactory = (config) =>
  new OpencodeBackend((config as OpencodeBackendConfig) ?? {}, sdk as unknown as OpencodeSdk);

export function registerOpencodeBackend(): void {
  registerAgentBackend(
    {
      type: "opencode",
      displayName: "opencode",
      capabilities: OPENCODE_CAPS,
      detect: async () => {
        // Presence of the SDK export pair is enough; a live server check happens on launch.
        const hasFactory =
          typeof (sdk as unknown as { createOpencode?: unknown }).createOpencode === "function" ||
          typeof (sdk as unknown as { createOpencodeClient?: unknown }).createOpencodeClient === "function";
        return hasFactory ? { available: true } : { available: false, reason: "@opencode-ai/sdk not loaded" };
      },
    },
    factory,
  );
}
