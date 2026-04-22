import { useCallback } from "react";
import type { Focus } from "@pneuma-framework/core";
import { useWireConnection } from "./useWireConnection.js";

export function useFocus(): (focus: Focus) => boolean {
  const { send } = useWireConnection();
  // Stable `send` identity — see useAction for the rationale.
  return useCallback((focus) => send({ dir: "v2a", kind: "focus", focus }), [send]);
}
