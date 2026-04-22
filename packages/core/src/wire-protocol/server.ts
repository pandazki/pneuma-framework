import type { SessionId, WireEnvelope } from "./types.js";
import type { SessionRegistry, Session } from "./session-registry.js";
import type { Server } from "bun";

export interface WireServerOptions {
  /** 0 lets the OS pick; otherwise use the given port. */
  port: number;
  /** Callback fired for every valid v2a envelope received. */
  onViewerEnvelope: (session: Session, env: WireEnvelope) => void;
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
      },
      close(ws) {
        const session = registry.getSession(ws.data.sid);
        session?.viewerSockets.delete(ws);
      },
      message(ws, raw) {
        const session = registry.getSession(ws.data.sid);
        if (!session) return;
        let env: WireEnvelope;
        try {
          env = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as WireEnvelope;
        } catch {
          // drop silently — malformed frames aren't fatal, just ignored.
          return;
        }
        if (env?.dir !== "v2a") return;
        opts.onViewerEnvelope(session, env);
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
