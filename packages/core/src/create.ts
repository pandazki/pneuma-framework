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
      await orchestrator.runStop().catch(() => { /* best-effort */ });
    },
  };
}
