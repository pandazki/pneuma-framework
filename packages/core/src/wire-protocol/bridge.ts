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
  const debug = !!process.env.PNEUMA_DEBUG_BRIDGE;
  const unsubscribe = backend.onEvent((ev) => {
    if (debug) {
      const snippet = JSON.stringify(ev).slice(0, 260);
      console.error(`[pneuma:bridge] ev=${ev.type} from=${ev.sessionId} bound=${session.backendSessionId ?? "-"} ${snippet}`);
    }
    // Fail-safe routing: only dispatch events from the backend session this
    // framework session is bound to. Until `session.backendSessionId` is set
    // (via annotateBackendSession after backend.launch), drop every event.
    // Pass-through while unset would leak early-launch events across sessions
    // when a backend instance is shared between frameworks.
    if (!session.backendSessionId || ev.sessionId !== session.backendSessionId) return;
    if (ev.type === "text") {
      // Two input shapes from adapters:
      //   1. Delta event: payload = { partId, messageID, delta }
      //      — already incremental, pass through and bump textDeltaState by
      //        the string length so a subsequent cumulative "updated" event
      //        doesn't re-emit the same content.
      //   2. Updated event: payload = { part: { id, type, text, time? }, messageID? }
      //      — cumulative text; compute the new suffix. Assistant-generated
      //        parts carry time.start; user-prompt echoes don't.
      const payload = ev.payload as {
        partId?: string;
        messageID?: string;
        delta?: string;
        part?: { id?: string; type?: string; text?: string; time?: { start?: number } };
      };
      let partId: string | undefined;
      let incremental: string | undefined;
      if (typeof payload.delta === "string" && payload.partId) {
        partId = payload.partId;
        incremental = payload.delta;
        const prev = session.textDeltaState.get(partId) ?? 0;
        session.textDeltaState.set(partId, prev + incremental.length);
      } else if (payload.part) {
        const p = payload.part;
        if (!p.id || p.type !== "text" || typeof p.text !== "string") return;
        if (!p.time?.start) return;           // user-echo filter
        const prev = session.textDeltaState.get(p.id) ?? 0;
        if (p.text.length <= prev) return;    // already streamed via deltas
        partId = p.id;
        incremental = p.text.slice(prev);
        session.textDeltaState.set(p.id, p.text.length);
      } else {
        return;
      }
      if (!incremental) return;
      opts.broadcast(session.sid, {
        dir: "a2v", kind: "text",
        turnId: payload.messageID ?? "turn",
        partId,
        delta: incremental,
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
      // sendUserMessage is fire-and-forget from here (the WS handler is
      // synchronous), but silent errors make "chat doesn't respond" bugs
      // un-diagnosable. Log to stderr; M3 surfaces as a viewer toast via
      // the error-event path.
      backend.sendUserMessage(backendSessionId, `${prefix}${env.action.text}`).catch((err: unknown) => {
        console.error(`[pneuma] sendUserMessage failed: ${(err as Error).message ?? err}`);
      });
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
