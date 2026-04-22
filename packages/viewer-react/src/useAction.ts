import { useCallback } from "react";
import type { Action } from "@pneuma-framework/core";
import { useWireConnection } from "./useWireConnection.js";

export function useAction(): (action: Action) => boolean {
  const conn = useWireConnection();
  return useCallback((action) => conn.send({ dir: "v2a", kind: "action", action }), [conn]);
}
