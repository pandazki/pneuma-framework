import { PneumaViewer } from "@pneuma-framework/viewer-react";
import { MarkdownPreview } from "./MarkdownPreview.js";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("sid");
  const ws = params.get("ws");
  if (!sid || !ws) {
    return (
      <div style={{ padding: 32, fontFamily: "monospace" }}>
        <h1>Pneuma Doc Viewer</h1>
        <p>Missing <code>?sid</code> or <code>&amp;ws</code> query parameter.</p>
      </div>
    );
  }
  const wsUrl = `${ws}/ws/viewer/${sid}`;
  return (
    <PneumaViewer wsUrl={wsUrl} sid={sid}>
      <MarkdownPreview />
    </PneumaViewer>
  );
}
