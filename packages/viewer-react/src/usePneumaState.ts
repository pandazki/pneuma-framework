import { useEffect, useState } from "react";
import type { WireEnvelope } from "@pneuma-framework/core";
import { useWireConnection } from "./useWireConnection.js";

export interface PneumaViewerState {
  /** Accumulated assistant text keyed by turnId. */
  turns: Record<string, string>;
  /** Current content of workspace files keyed by workspace-relative path. */
  docs: Record<string, string>;
  /** Toasts emitted via a2v viewer-request; newest last, capped at 20. */
  toasts: Array<{ message: string; level: "info" | "warn" | "error"; ts: number }>;
}

const empty: PneumaViewerState = { turns: {}, docs: {}, toasts: [] };

export function usePneumaState(): PneumaViewerState {
  const conn = useWireConnection();
  const [state, setState] = useState<PneumaViewerState>(empty);
  useEffect(() => {
    return conn.subscribe((env: WireEnvelope) => {
      if (env.dir !== "a2v") return;
      if (env.kind === "text") {
        setState((s) => ({
          ...s,
          turns: { ...s.turns, [env.turnId]: (s.turns[env.turnId] ?? "") + env.delta },
        }));
        return;
      }
      if (env.kind === "state") {
        setState((s) => ({ ...s, docs: { ...s.docs, [env.state.path]: env.state.content } }));
        return;
      }
      if (env.kind === "viewer-request" && env.req.kind === "toast") {
        const req = env.req;
        setState((s) => ({
          ...s,
          toasts: [
            ...s.toasts,
            { message: req.message, level: req.level ?? "info", ts: Date.now() },
          ].slice(-20),
        }));
        return;
      }
    });
  }, [conn]);
  return state;
}
