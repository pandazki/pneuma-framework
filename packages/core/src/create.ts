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
      // Only invoke teardown when there's an active dev session.
      // This avoids running `stop.sh` for build-only lifecycle use.
      if (orchestrator.state.dev && orchestrator.state.dev.state === "running") {
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
