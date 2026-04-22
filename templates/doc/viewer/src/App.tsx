import { PneumaViewer } from "@pneuma-framework/viewer-react";
import { MarkdownPreview } from "./MarkdownPreview.js";
import { ChatPanel } from "./ChatPanel.js";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("sid");
  const ws = params.get("ws");
  if (!sid || !ws) {
    return (
      <div style={{ padding: 32, fontFamily: "monospace" }}>
        <h1>Pneuma Doc Viewer</h1>
        <p>Missing <code>?sid</code> or <code>&amp;ws</code> query parameter.</p>
        <p>URL 缺少 <code>?sid</code> 或 <code>&amp;ws</code> 参数。</p>
        <p>Open the URL printed by <code>pneuma-framework dev</code>.</p>
        <p>打开 <code>pneuma-framework dev</code> 在终端里打印出的那条 URL。</p>
      </div>
    );
  }
  // The framework's wire server exposes its URL as http://... but the
  // WebSocket constructor requires ws:// (or wss:// for TLS). Rewrite the
  // scheme so browsers can connect.
  const wsBase = ws.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
  const wsUrl = `${wsBase}/ws/viewer/${sid}`;
  return (
    <PneumaViewer wsUrl={wsUrl} sid={sid}>
      <MarkdownPreview />
      <ChatPanel />
    </PneumaViewer>
  );
}
