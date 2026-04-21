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
      //   - runStop was already called on this orchestrator → stopInvoked true
      // state.dev.state ("stopped") is NOT a reliable "did stop.sh run" signal
      // because ##pneuma:stopping from the dev script also sets it.
      if (orchestrator.state.dev !== undefined && !orchestrator.stopInvoked) {
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
