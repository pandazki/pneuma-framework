import type { LifecycleOrchestrator } from "../lifecycle.js";
import type { AgentBackend } from "../agent-backend/types.js";
import type { Focus, SessionId } from "./types.js";
import type { ServerWebSocket } from "bun";

export interface Session {
  sid: SessionId;
  orchestrator: LifecycleOrchestrator;
  backend?: AgentBackend;
  viewerSockets: Set<ServerWebSocket<{ sid: SessionId }>>;
  currentFocus?: Focus;
  /** Per-partId last-emitted text length, for delta computation. */
  textDeltaState: Map<string, number>;
  /** Unsubscribe handles for backend event subscriptions. */
  disposers: Array<() => void>;
}

export interface SessionRegistry {
  createSession(
    sid: SessionId,
    deps: { orchestrator: LifecycleOrchestrator; backend?: AgentBackend },
  ): Session;
  getSession(sid: SessionId): Session | undefined;
  removeSession(sid: SessionId): void;
  listSessions(): Session[];
}

export function createSessionRegistry(): SessionRegistry {
  const sessions = new Map<SessionId, Session>();
  return {
    createSession(sid, deps) {
      if (sessions.has(sid)) {
        throw new Error(`session ${sid} already exists`);
      }
      const s: Session = {
        sid,
        orchestrator: deps.orchestrator,
        backend: deps.backend,
        viewerSockets: new Set(),
        textDeltaState: new Map(),
        disposers: [],
      };
      sessions.set(sid, s);
      return s;
    },
    getSession(sid) {
      return sessions.get(sid);
    },
    removeSession(sid) {
      const s = sessions.get(sid);
      if (!s) return;
      // Close viewer sockets BEFORE deleting the session map entry: the WS
      // `close` handler in server.ts looks up the session to remove the socket,
      // which would fail after the delete. Closing first also gives viewers a
      // clean 1001 shutdown frame instead of silent dangling connections.
      for (const ws of s.viewerSockets) {
        try { ws.close(1001, "session ended"); } catch { /* best-effort */ }
      }
      s.viewerSockets.clear();
      for (const d of s.disposers) {
        try { d(); } catch { /* best-effort teardown */ }
      }
      sessions.delete(sid);
    },
    listSessions() {
      return [...sessions.values()];
    },
  };
}
