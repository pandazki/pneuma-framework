import { usePneumaState, usePermissionResponder } from "./index.js";

/**
 * Renders a dismissible banner whenever the agent backend has requested
 * permission to run a tool. Calling Allow or Deny sends a permission-response
 * envelope back and clears the pending prompt.
 */
export function PermissionPrompt() {
  const { pendingPrompt, clearPendingPrompt } = usePneumaState();
  const respond = usePermissionResponder();
  if (!pendingPrompt) return null;

  const answer = (decision: "allow" | "deny"): void => {
    respond(pendingPrompt.id, decision);
    clearPendingPrompt();
  };

  return (
    <div
      className="pneuma-prompt"
      role="alertdialog"
      aria-live="assertive"
      style={{
        position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 10, background: "var(--paper, #fff)",
        border: "1px solid var(--rule-strong, #bbb)",
        padding: "12px 16px", fontFamily: "var(--type-sans, system-ui)",
        fontSize: 13, display: "flex", gap: 12, alignItems: "center",
      }}
    >
      <span>
        Agent wants to run <code>{pendingPrompt.tool}</code>
        {Object.keys(pendingPrompt.detail).length > 0 && (
          <> — <span style={{ color: "var(--ink-muted, #888)" }}>{Object.keys(pendingPrompt.detail).join(", ")}</span></>
        )}
      </span>
      <button
        data-permission="allow"
        onClick={() => answer("allow")}
        style={{ padding: "4px 10px", border: "1px solid var(--accent, #c66)", cursor: "pointer" }}
      >Allow · 允许</button>
      <button
        data-permission="deny"
        onClick={() => answer("deny")}
        style={{ padding: "4px 10px", border: "1px solid var(--rule, #ccc)", cursor: "pointer" }}
      >Deny · 拒绝</button>
    </div>
  );
}
