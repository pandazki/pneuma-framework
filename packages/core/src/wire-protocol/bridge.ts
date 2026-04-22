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
    // Fail-safe routing: only dispatch events from the backend session this
    // framework session is bound to. Until `session.backendSessionId` is set
    // (via annotateBackendSession after backend.launch), drop every event.
    // Pass-through while unset would leak early-launch events across sessions
    // when a backend instance is shared between frameworks.
    if (!session.backendSessionId || ev.sessionId !== session.backendSessionId) return;
    if (ev.type === "text") {
      const part = (ev.payload as {
        part?: { id?: string; type?: string; text?: string; time?: { start?: number } };
      }).part;
      if (!part?.id || part.type !== "text" || typeof part.text !== "string") return;
      // Filter out user-prompt echoes: opencode (and potentially other
      // backends) emit the user's own message as a text part on the same
      // turn. Assistant-generated parts carry a `time.start` timestamp;
      // echoes don't. Skipping parts without it keeps the viewer transcript
      // clean of `[Context: ...]` prefixes that the framework injected.
      if (!part.time?.start) return;
      // Cumulative text → delta.
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

function formatFocusContext(session: Session): string {
  const f = session.currentFocus;
  if (!f) return "";
  const lines: string[] = [];
  if (f.file) lines.push(`[Context: file "${f.file}"]`);
  if (f.element) {
    const { kind, level, text } = f.element;
    const levelPart = kind === "heading" && typeof level === "number" ? ` (level ${level})` : "";
    const textPart = text ? ` "${text}"` : "";
    lines.push(`[User selected: ${kind}${levelPart}${textPart}]`);
  }
  return lines.length > 0 ? lines.join("\n") + "\n\n" : "";
}

export function handleViewerEnvelope(session: Session, env: WireEnvelope): void {
  if (env.dir !== "v2a") return;
  switch (env.kind) {
    case "focus":
      session.currentFocus = env.focus;
      return;
    case "action": {
      if (env.action.kind !== "user-message") {
        // click actions have no v0 meaning; storage-for-future-routing is out of scope.
        return;
      }
      const backend = session.backend;
      if (!backend) return;
      const backendSessionId = session.backendSessionId;
      if (!backendSessionId) return;
      const prefix = formatFocusContext(session);
      void backend.sendUserMessage(backendSessionId, `${prefix}${env.action.text}`);
      return;
    }
    case "permission-response": {
      const backend = session.backend;
      if (!backend) return;
      const backendSessionId = session.backendSessionId;
      if (!backendSessionId) return;
      void backend.respondToPermission(backendSessionId, {
        requestId: env.response.id,
        decision: env.response.decision,
      });
      return;
    }
  }
}
