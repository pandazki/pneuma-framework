import { LifecycleOrchestrator, type OrchestratorOptions } from "./lifecycle.js";
import type { LifecycleState } from "./types.js";

export interface PneumaFramework {
  orchestrator: LifecycleOrchestrator;
  state: LifecycleState;
  close: () => Promise<void>;
}

export function createPneumaFramework(opts: OrchestratorOptions): PneumaFramework {
  const orchestrator = new LifecycleOrchestrator(opts);
  return {
    orchestrator,
    state: orchestrator.state,
    close: async () => {
      // Skip teardown when:
      //   - runDev was never called (build-only flow) → state.dev undefined
      //   - caller already invoked runStop() → state.dev.state === "stopped"
      // This makes close() safe to call in a `finally` block after an explicit stop,
      // and preserves stop.sh's non-idempotent semantics.
      if (orchestrator.state.dev !== undefined && orchestrator.state.dev.state !== "stopped") {
        try {
          await orchestrator.runStop();
        } catch {
          // runStop is already responsible for guaranteeing the dev process
          // is killed. Swallowing here is deliberate: close() must be safe
          // in finally blocks.
        }
      }
    },
  };
}
