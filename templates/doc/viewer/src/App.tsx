import { PneumaViewer } from "@pneuma-framework/viewer-react";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("sid");
  const ws = params.get("ws");
  if (!sid || !ws) {
    return (
      <div style={{ padding: 32, fontFamily: "monospace" }}>
        <h1>Pneuma Doc Viewer</h1>
        <p>Missing <code>?sid</code> or <code>&amp;ws</code> query parameter.</p>
        <p>Open the URL printed by <code>pneuma-framework dev</code>.</p>
      </div>
    );
  }
  const wsUrl = `${ws}/ws/viewer/${sid}`;
  return (
    <PneumaViewer wsUrl={wsUrl} sid={sid}>
      <div style={{ padding: 24 }}>
        <h1>Pneuma Doc</h1>
        <p>Connected. MarkdownPreview + ChatPanel land in Tasks D4/D5.</p>
      </div>
    </PneumaViewer>
  );
}
