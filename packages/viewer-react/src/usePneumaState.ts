import { useCallback, useEffect, useState } from "react";
import type { PermissionPrompt, WireEnvelope } from "@pneuma-framework/core";
import { useWireConnection } from "./useWireConnection.js";

export interface PneumaViewerState {
  /** Accumulated assistant text keyed by turnId. */
  turns: Record<string, string>;
  /** Current content of workspace files keyed by workspace-relative path. */
  docs: Record<string, string>;
  /** Toasts emitted via a2v viewer-request; newest last, capped at 20. */
  toasts: Array<{ message: string; level: "info" | "warn" | "error"; ts: number }>;
  /** Most recent a2v permission-prompt, cleared once the builder answers. */
  pendingPrompt?: PermissionPrompt;
}

const empty: PneumaViewerState = { turns: {}, docs: {}, toasts: [] };

export function usePneumaState(): PneumaViewerState & { clearPendingPrompt: () => void } {
  const { sid, subscribe } = useWireConnection();
  const [state, setState] = useState<PneumaViewerState>(empty);
  // Reset accumulated state when the Provider is wired to a new session —
  // otherwise a parent that swaps sid while keeping <PneumaViewer> mounted
  // would see the previous session's turns/docs/toasts leak through.
  useEffect(() => {
    setState(empty);
  }, [sid]);
  useEffect(() => {
    return subscribe((env: WireEnvelope) => {
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
      if (env.kind === "permission-prompt") {
        setState((s) => ({ ...s, pendingPrompt: env.prompt }));
        return;
      }
    });
  }, [subscribe]);
  const clearPendingPrompt = useCallback(() => {
    setState((s) => ({ ...s, pendingPrompt: undefined }));
  }, []);
  return { ...state, clearPendingPrompt };
}
