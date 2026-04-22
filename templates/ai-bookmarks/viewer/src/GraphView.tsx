import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import type { BookmarkWithInterpretations, GraphResponse } from "../../server/api-types.js";
import { useMemo } from "react";

export function GraphView({ graph, bookmarks }: { graph: GraphResponse; bookmarks: BookmarkWithInterpretations[] }) {
  const titles = new Map(bookmarks.map((b) => [b.id, b.title ?? b.url]));
  const nodes: Node[] = useMemo(() =>
    graph.nodes.map((n, i) => {
      const angle = (i / Math.max(graph.nodes.length, 1)) * Math.PI * 2;
      return {
        id: String(n.id),
        data: { label: titles.get(n.id) ?? n.url },
        position: { x: 300 + 240 * Math.cos(angle), y: 240 + 200 * Math.sin(angle) },
        style: {
          background: "var(--paper)",
          border: "1px solid var(--rule-strong)",
          borderRadius: 2,
          padding: "6px 10px",
          fontSize: 12,
          fontFamily: "var(--type-sans)",
          maxWidth: 220,
        },
      } satisfies Node;
    })
  , [graph.nodes, titles]);
  const edges: Edge[] = useMemo(() =>
    graph.edges.map((e, i) => ({
      id: `e-${i}`,
      source: String(e.source),
      target: String(e.target),
      label: e.weight.toFixed(2),
      style: { stroke: `var(--accent)`, strokeWidth: 1 + e.weight * 2 },
      labelStyle: { fill: "var(--ink-muted)", fontSize: 10 },
    }))
  , [graph.edges]);

  if (graph.nodes.length === 0) {
    return <p style={{ color: "var(--ink-muted)", textAlign: "center", padding: "var(--sp-3xl)" }}>
      No graph yet · 还没有图。
    </p>;
  }

  return (
    <div className="bm-graph">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
