import { createContext } from "react";
import type { FrameworkEvent, PermissionPrompt, WireEnvelope } from "@pneuma-framework/core";

export type WireStatus = "connecting" | "open" | "closed" | "error";

export interface PneumaViewerState {
  /** Accumulated assistant text keyed by turnId. */
  turns: Record<string, string>;
  /** Current content of workspace files keyed by workspace-relative path. */
  docs: Record<string, string>;
  /** Toasts emitted via a2v viewer-request; newest last, capped at 20. */
  toasts: Array<{ message: string; level: "info" | "warn" | "error"; ts: number }>;
  /** Framework lifecycle/protocol events; newest last, capped at 50. */
  frameworkEvents: FrameworkEvent[];
  /** Most recent a2v permission-prompt, cleared once the builder answers. */
  pendingPrompt?: PermissionPrompt;
}

export const emptyPneumaViewerState: PneumaViewerState = {
  turns: {},
  docs: {},
  toasts: [],
  frameworkEvents: [],
};

export interface WireContextValue {
  /** Session id currently wired to the provider. Changes on sid prop change. */
  sid: string;
  status: WireStatus;
  /** Last connection error, if any. */
  error?: Error;
  /** Shared viewer state derived from a2v envelopes. */
  viewerState: PneumaViewerState;
  /** Clear the shared pending permission prompt after the builder responds. */
  clearPendingPrompt: () => void;
  /** Send a v2a envelope. Returns false if the socket isn't open. STABLE identity. */
  send: (env: WireEnvelope) => boolean;
  /** Subscribe to a2v envelopes. Returns an unsubscribe. STABLE identity. */
  subscribe: (cb: (env: WireEnvelope) => void) => () => void;
}

export const WireContext = createContext<WireContextValue | null>(null);
