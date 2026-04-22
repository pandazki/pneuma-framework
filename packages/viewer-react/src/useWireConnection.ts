import { useContext } from "react";
import { WireContext, type WireContextValue } from "./context.js";

export function useWireConnection(): WireContextValue {
  const ctx = useContext(WireContext);
  if (!ctx) throw new Error("useWireConnection must be used inside <PneumaViewer>");
  return ctx;
}
