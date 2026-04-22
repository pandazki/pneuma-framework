import { PneumaViewer } from "@pneuma-framework/viewer-react";
import { Shell } from "./Shell.js";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("sid");
  const ws = params.get("ws");
  if (!sid || !ws) return <Onboard />;
  const wsBase = ws.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
  const wsUrl = `${wsBase}/ws/viewer/${sid}`;
  return (
    <PneumaViewer wsUrl={wsUrl} sid={sid}>
      <Shell />
    </PneumaViewer>
  );
}

function Onboard() {
  return (
    <main className="onboard">
      <h1>Pneuma Doc</h1>
      <p>URL is missing <code>?sid</code> or <code>&amp;ws</code>.</p>
      <p>URL 缺少 <code>?sid</code> 或 <code>&amp;ws</code> 参数。</p>
      <p style={{ marginTop: "var(--sp-xl)" }}>
        Copy the Builder URL printed by <code>pneuma-framework dev</code>.
      </p>
      <p>
        复制 <code>pneuma-framework dev</code> 终端打印的那条 URL 到浏览器。
      </p>
    </main>
  );
}
