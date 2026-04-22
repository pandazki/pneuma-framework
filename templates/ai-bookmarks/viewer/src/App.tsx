import { useState, useEffect, useCallback } from "react";
import { PneumaViewer, PermissionPrompt } from "@pneuma-framework/viewer-react";
import { AddBookmark } from "./AddBookmark.js";
import { TimelineView } from "./TimelineView.js";
import { GraphView } from "./GraphView.js";
import type { BookmarkWithInterpretations, GraphResponse } from "../../server/api-types.js";
import { fetchBookmarks, fetchGraph } from "./api.js";

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

  const refresh = useCallback(async () => {
    const [b, g] = await Promise.all([fetchBookmarks(), fetchGraph()]);
    setBookmarks(b); setGraph(g);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="shell">
      <main className="main-col">
        <AddBookmark onAdded={refresh} />
        <nav className="view-tabs">
          <button data-active={view === "timeline"} onClick={() => setView("timeline")}>Timeline · 时间线</button>
          <button data-active={view === "graph"} onClick={() => setView("graph")}>Graph · 关系图</button>
        </nav>
        {view === "timeline"
          ? <TimelineView bookmarks={bookmarks} />
          : <GraphView graph={graph} bookmarks={bookmarks} />}
      </main>
      <aside className="chat" aria-label="Chat">
        <div style={{ padding: "var(--sp-lg)", color: "var(--ink-muted)", fontSize: "var(--fs-small)" }}>
          Chat panel will mount here once the build-phase agent is wired.
        </div>
      </aside>
    </div>
  );
}
