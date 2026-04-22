import { createContext } from "react";
import type { WireEnvelope } from "@pneuma-framework/core";

export type WireStatus = "connecting" | "open" | "closed" | "error";

export interface WireContextValue {
  status: WireStatus;
  /** Last connection error, if any. */
  error?: Error;
  /** Send a v2a envelope. Returns false if the socket isn't open. */
  send: (env: WireEnvelope) => boolean;
  /** Subscribe to a2v envelopes. Returns an unsubscribe. */
  subscribe: (cb: (env: WireEnvelope) => void) => () => void;
}

export const WireContext = createContext<WireContextValue | null>(null);
