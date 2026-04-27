import { useCallback } from "react";
import { useWireConnection } from "./useWireConnection.js";

export { PneumaViewer } from "./PneumaViewer.js";
export type { PneumaViewerProps } from "./PneumaViewer.js";
export { useWireConnection } from "./useWireConnection.js";
export { useFocus } from "./useFocus.js";
export { useAction } from "./useAction.js";
export { usePneumaState } from "./usePneumaState.js";
export type { PneumaViewerState } from "./usePneumaState.js";
export { WireContext } from "./context.js";
export type { WireStatus, WireContextValue } from "./context.js";

export function usePermissionResponder(): (id: string, decision: "allow" | "deny" | "allow-always") => boolean {
  const { send } = useWireConnection();
  return useCallback(
    (id, decision) => send({ dir: "v2a", kind: "permission-response", response: { id, decision } }),
    [send],
  );
}

export { PermissionPrompt } from "./PermissionPrompt.js";
export { PneumaViewRenderer } from "./ViewRenderer.js";
export type {
  PneumaViewRendererProps,
  ViewCellRenderContext,
  ViewRendererView,
} from "./ViewRenderer.js";
export {
  normalizeViewPresentationForRender,
  valueText as viewValueText,
  viewTableRows,
} from "./view-presentation.js";
export type {
  NormalizedViewColumn,
  NormalizedViewPresentation,
  ViewPresentationFallbacks,
} from "./view-presentation.js";
