import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WireEnvelope } from "@pneuma-framework/core";
import { WireContext, type WireContextValue, type WireStatus } from "./context.js";

export interface PneumaViewerProps {
  wsUrl: string;
  sid: string;
  /** Initial backoff (ms) for reconnect attempts. Doubles up to reconnectMaxMs. Default 500. */
  reconnectMinMs?: number;
  /** Cap for reconnect backoff. Default 10000. */
  reconnectMaxMs?: number;
  children: ReactNode;
}

export function PneumaViewer({
  wsUrl, sid, reconnectMinMs = 500, reconnectMaxMs = 10_000, children,
}: PneumaViewerProps) {
  const [status, setStatus] = useState<WireStatus>("connecting");
  const [error, setError] = useState<Error | undefined>(undefined);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Set<(env: WireEnvelope) => void>());
  const backoffRef = useRef(reconnectMinMs);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const connect = (): void => {
      if (stoppedRef.current) return;
      setStatus("connecting");
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.addEventListener("open", () => {
        backoffRef.current = reconnectMinMs;
        setStatus("open");
        // Clear any stale error from a previous failed attempt — consumers
        // read `error` alongside `status`, and a truthy error after recovery
        // is confusing.
        setError(undefined);
      });
      ws.addEventListener("message", (e) => {
        try {
          const env = JSON.parse(typeof e.data === "string" ? e.data : "") as WireEnvelope;
          for (const cb of listenersRef.current) cb(env);
        } catch {
          /* skip malformed frames */
        }
      });
      ws.addEventListener("error", (e) => {
        setError(new Error((e as ErrorEvent).message ?? "websocket error"));
        setStatus("error");
      });
      ws.addEventListener("close", () => {
        setStatus("closed");
        if (stoppedRef.current) return;
        const delay = Math.min(backoffRef.current, reconnectMaxMs);
        backoffRef.current = Math.min(backoffRef.current * 2, reconnectMaxMs);
        reconnectTimer = setTimeout(connect, delay);
      });
    };
    connect();
    return () => {
      stoppedRef.current = true;
      // Cancel any pending reconnect from the previous close — otherwise a
      // wsUrl prop change that races with a backoff would spawn a second
      // socket pointing at the stale url.
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [wsUrl, reconnectMinMs, reconnectMaxMs]);

  // Transport callbacks read from refs at invocation time, so they are safe
  // to memoize with empty deps — their identity stays stable across the
  // entire Provider lifetime. Consumer hooks (useAction, usePneumaState, …)
  // depend on these, so stability prevents a status transition from
  // retriggering `useEffect([sendAction])` and duplicating one-shot actions.
  const send = useCallback((env: WireEnvelope) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(env));
    return true;
  }, []);
  const subscribe = useCallback((cb: (env: WireEnvelope) => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  const value = useMemo<WireContextValue>(() => ({
    sid, status, error, send, subscribe,
  }), [sid, status, error, send, subscribe]);

  return (
    <WireContext.Provider value={value}>
      <div data-pneuma-sid={sid} style={{ display: "contents" }}>
        {children}
      </div>
    </WireContext.Provider>
  );
}
