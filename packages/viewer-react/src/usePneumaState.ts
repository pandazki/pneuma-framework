import { useMemo } from "react";
import type { PneumaViewerState } from "./context.js";
import { useWireConnection } from "./useWireConnection.js";

export type { PneumaViewerState } from "./context.js";

export function usePneumaState(): PneumaViewerState & { clearPendingPrompt: () => void } {
  const { viewerState, clearPendingPrompt } = useWireConnection();
  return useMemo(
    () => ({ ...viewerState, clearPendingPrompt }),
    [viewerState, clearPendingPrompt],
  );
}
