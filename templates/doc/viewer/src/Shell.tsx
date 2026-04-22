import { useState } from "react";
import { PermissionPrompt } from "@pneuma-framework/viewer-react";
import { MarkdownPreview } from "./MarkdownPreview.js";
import { ChatPanel } from "./ChatPanel.js";

/**
 * Two-column layout shell. The grid collapses the chat column to 0 when the
 * drawer is closed, so the reading column reclaims the full width — that
 * transition is driven purely by `data-chat` on the shell (see styles.css).
 */
export function Shell() {
  const [chatOpen, setChatOpen] = useState(true);
  return (
    <div className="shell" data-chat={chatOpen ? "open" : "closed"}>
      <PermissionPrompt />
      <div className="reading-col">
        <MarkdownPreview />
      </div>
      <ChatPanel open={chatOpen} onToggle={() => setChatOpen((o) => !o)} />
    </div>
  );
}
