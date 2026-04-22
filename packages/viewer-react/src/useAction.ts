import { useCallback } from "react";
import type { Action } from "@pneuma-framework/core";
import { useWireConnection } from "./useWireConnection.js";

export function useAction(): (action: Action) => boolean {
  const { send } = useWireConnection();
  // Depend on `send` (stable across status changes) rather than the whole
  // context object, so consumers that do `useEffect(..., [sendAction])`
  // don't re-fire on every connecting→open transition.
  return useCallback((action) => send({ dir: "v2a", kind: "action", action }), [send]);
}
