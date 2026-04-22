import type { SessionId, WireEnvelope } from "./types.js";
import type { SessionRegistry, Session } from "./session-registry.js";
import type { Server } from "bun";

export interface WireServerOptions {
  /** 0 lets the OS pick; otherwise use the given port. */
  port: number;
  /** Callback fired for every valid v2a envelope received. */
  onViewerEnvelope: (session: Session, env: WireEnvelope) => void;
  /**
   * Fires when a viewer WebSocket opens. Use to push seed envelopes so
   * newly-connected viewers get the current workspace state without waiting
   * for a change event.
   */
  onViewerOpen?: (session: Session, send: (env: WireEnvelope) => void) => void;
}

export interface WireServer {
  /** e.g. "http://127.0.0.1:39281" — always 127.0.0.1 for v0. */
  readonly url: string;
  /** Broadcast an a2v envelope to every viewer connected to the given session. */
  broadcast(sid: SessionId, env: WireEnvelope): void;
  close(): Promise<void>;
}

interface SocketData {
  sid: SessionId;
}

const VIEWER_PATH_RE = /^\/ws\/viewer\/([a-zA-Z0-9_-]+)$/;

/**
 * Shape-validate a v2a envelope. Returns true only for payloads that downstream
 * handlers can safely destructure. Unknown/malformed kinds drop silently so
 * future v2a kinds don't crash older servers.
 */
function isValidV2a(env: unknown): env is WireEnvelope & { dir: "v2a" } {
  if (!env || typeof env !== "object") return false;
  const e = env as { dir?: unknown; kind?: unknown; [k: string]: unknown };
  if (e.dir !== "v2a") return false;
  switch (e.kind) {
    case "focus":
      return !!e.focus && typeof e.focus === "object";
    case "action": {
      const a = e.action as { kind?: unknown; text?: unknown; target?: unknown } | undefined;
      if (!a || typeof a !== "object") return false;
      if (a.kind === "user-message") return typeof a.text === "string";
      if (a.kind === "click") return typeof a.target === "string";
      return false;
    }
    case "permission-response": {
      const r = e.response as { id?: unknown; decision?: unknown } | undefined;
      if (!r || typeof r !== "object") return false;
      if (typeof r.id !== "string") return false;
      return r.decision === "allow" || r.decision === "deny" || r.decision === "allow-always";
    }
    default:
      return false;
  }
}

export function createWireServer(registry: SessionRegistry, opts: WireServerOptions): WireServer {
  const server: Server<SocketData> = Bun.serve<SocketData>({
    hostname: "127.0.0.1",
    port: opts.port,
    fetch(req, srv) {
      const url = new URL(req.url);
      const m = VIEWER_PATH_RE.exec(url.pathname);
      if (!m) return new Response("not found", { status: 404 });
      const sid = m[1]!;
      if (!registry.getSession(sid)) return new Response("unknown session", { status: 404 });
      const upgraded = srv.upgrade(req, { data: { sid } });
      if (!upgraded) return new Response("upgrade failed", { status: 500 });
      return undefined;
    },
    websocket: {
      open(ws) {
        const session = registry.getSession(ws.data.sid);
        if (!session) { ws.close(1008, "unknown session"); return; }
        session.viewerSockets.add(ws);
        opts.onViewerOpen?.(session, (env) => {
          ws.send(JSON.stringify(env));
        });
      },
      close(ws) {
        const session = registry.getSession(ws.data.sid);
        session?.viewerSockets.delete(ws);
      },
      message(ws, raw) {
        const session = registry.getSession(ws.data.sid);
        if (!session) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
        } catch {
          // drop silently — malformed JSON isn't fatal, just ignored.
          return;
        }
        if (!isValidV2a(parsed)) return;
        opts.onViewerEnvelope(session, parsed);
      },
    },
  });

  return {
    get url() { return `http://127.0.0.1:${server.port}`; },
    broadcast(sid, env) {
      const session = registry.getSession(sid);
      if (!session) return;
      const payload = JSON.stringify(env);
      for (const ws of session.viewerSockets) ws.send(payload);
    },
    async close() {
      server.stop(true);
    },
  };
}
