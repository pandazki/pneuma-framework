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
      // Only invoke teardown when runDev was ever called on this orchestrator.
      // state.dev is set (regardless of current verb state) the moment runDev
      // spawns — so `state.dev !== undefined` correctly distinguishes:
      //   - build-only flow (never set) → skip runStop, no stop.sh side effects
      //   - dev flow, incl. daemonizer-exit (state.dev defined) → run stop.sh
      //     for cleanup even if dev.sh already exited.
      if (orchestrator.state.dev !== undefined) {
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
