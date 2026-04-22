import { useState, useEffect, useCallback } from "react";
import { PneumaViewer, PermissionPrompt } from "@pneuma-framework/viewer-react";
import { AddBookmark } from "./AddBookmark.js";
import { TimelineView } from "./TimelineView.js";
import { GraphView } from "./GraphView.js";
import { ChatPanel } from "./ChatPanel.js";
import type { BookmarkWithInterpretations, GraphResponse } from "../../server/api-types.js";
import type { Lens } from "../../server/lenses.js";
import { fetchBookmarks, fetchGraph, fetchLenses } from "./api.js";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("sid");
  const ws = params.get("ws");
  if (!sid || !ws) {
    return <AppCore />;
  }
  const wsBase = ws.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
  return (
    <PneumaViewer wsUrl={`${wsBase}/ws/viewer/${sid}`} sid={sid}>
      <PermissionPrompt />
      <AppCore />
    </PneumaViewer>
  );
}

function AppCore() {
  const [view, setView] = useState<"timeline" | "graph">("timeline");
  const [bookmarks, setBookmarks] = useState<BookmarkWithInterpretations[]>([]);
  const [graph, setGraph] = useState<GraphResponse>({ nodes: [], edges: [] });
  const [lenses, setLenses] = useState<Lens[]>([]);

  const refresh = useCallback(async () => {
    const [b, g] = await Promise.all([fetchBookmarks(), fetchGraph()]);
    setBookmarks(b); setGraph(g);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void fetchLenses().then((r) => setLenses(r.lenses)); }, []);
  // Poll every 3s so backgrounded lens interpretations trickle in without a reload.
  useEffect(() => {
    const id = setInterval(() => { void refresh(); }, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="shell">
      <main className="main-col">
        <AddBookmark onAdded={refresh} />
        <nav className="view-tabs">
          <button data-active={view === "timeline"} onClick={() => setView("timeline")}>Timeline · 时间线</button>
          <button data-active={view === "graph"} onClick={() => setView("graph")}>Graph · 关系图</button>
        </nav>
        {view === "timeline"
          ? <TimelineView bookmarks={bookmarks} lenses={lenses} />
          : <GraphView graph={graph} bookmarks={bookmarks} />}
      </main>
      <ChatPanel />
    </div>
  );
}
