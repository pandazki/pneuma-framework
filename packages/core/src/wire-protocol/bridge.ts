import type { Session } from "./session-registry.js";
import type { AgentBackend } from "../agent-backend/types.js";
import type { WireEnvelope, SessionId } from "./types.js";

export interface BridgeOptions {
  broadcast: (sid: SessionId, env: WireEnvelope) => void;
  autoAcceptPermissions: boolean;
}

export function attachBackendBridge(
  session: Session,
  backend: AgentBackend,
  opts: BridgeOptions,
): void {
  const unsubscribe = backend.onEvent((ev) => {
    // If this framework session has bound to a specific backend session id
    // (set after backend.launch via session.backendSessionId), only dispatch
    // events from THAT backend session. Prevents cross-session leakage when
    // the same backend instance drives multiple wire sessions. When unset
    // (pre-launch or single-session setups), pass through.
    if (session.backendSessionId && ev.sessionId !== session.backendSessionId) return;
    if (ev.type === "text") {
      const part = (ev.payload as { part?: { id?: string; type?: string; text?: string } }).part;
      if (!part?.id || part.type !== "text" || typeof part.text !== "string") return;
      // Cumulative text → delta. opencode emits the user's own message as a
      // text part too (without a time.start); downstream filters that if it
      // matters. At the bridge level, we just publish every delta.
      const prev = session.textDeltaState.get(part.id) ?? 0;
      if (part.text.length <= prev) return;
      const delta = part.text.slice(prev);
      session.textDeltaState.set(part.id, part.text.length);
      opts.broadcast(session.sid, {
        dir: "a2v", kind: "text",
        turnId: ((ev.payload as { messageID?: string }).messageID) ?? "turn",
        partId: part.id,
        delta,
      });
      return;
    }
    if (ev.type === "permission-request") {
      const p = ev.payload as { requestId?: string; toolName?: string; input?: unknown };
      const id = p.requestId ?? `req-${Date.now()}`;
      if (opts.autoAcceptPermissions) {
        void backend.respondToPermission(ev.sessionId, { requestId: id, decision: "allow" });
        // Dropped without broadcasting — the viewer doesn't need to see
        // prompts that the framework auto-approved.
        return;
      }
      opts.broadcast(session.sid, {
        dir: "a2v", kind: "permission-prompt",
        prompt: { id, tool: p.toolName ?? "unknown", detail: (p.input as Record<string, unknown>) ?? {} },
      });
      return;
    }
    if (ev.type === "error") {
      opts.broadcast(session.sid, {
        dir: "a2v", kind: "viewer-request",
        req: { kind: "toast", message: String((ev.payload as { message?: string }).message ?? "agent error"), level: "error" },
      });
      return;
    }
    // session-ready / session-exited / tool-call: ignored in v0 viewer.
  });

  session.disposers.push(unsubscribe);
}
