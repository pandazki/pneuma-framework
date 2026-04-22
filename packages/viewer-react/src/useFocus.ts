import { useCallback } from "react";
import type { Focus } from "@pneuma-framework/core";
import { useWireConnection } from "./useWireConnection.js";

export function useFocus(): (focus: Focus) => boolean {
  const conn = useWireConnection();
  return useCallback((focus) => conn.send({ dir: "v2a", kind: "focus", focus }), [conn]);
}
