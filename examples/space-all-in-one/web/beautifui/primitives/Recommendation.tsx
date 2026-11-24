"use client";
// Pieces of Beautiful UI's RecommendationCard and ApprovalCard (MIT, © 2026 Shane Levine; see ../LICENSE), from
// https://www.beautifului.dev/r/recommendation-card.json and https://www.beautifului.dev/r/approval-card.json.
// Adapted for the owner page: the cards' demo state (options, questions, the "Alternatives" list) is gone; what is
// left are their parts, so a decision card can be put together from them:
//   Meter       RecommendationCard's three-bar confidence meter, unchanged
//   Drawer      RecommendationCard's alternatives drawer (the card holds its shape; a new section opens below)
//   CheckOption ApprovalCard's check option row (box, label, colour change), as a controlled checkbox
//   SentPill    ApprovalCard's "Answers sent" pill, with its pop-in
//   FieldRow    ApprovalCard's free-text row, as a multi-line field

import type { ReactNode } from "react";

export function Meter({ signal, tone }: { signal: number; tone: string }) {
  return (
    <span className="flex items-end gap-0.5" aria-hidden>
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="w-1 rounded-full transition-colors duration-300"
          style={{ height: 10, background: bar < signal ? tone : "var(--line-strong)" }}
        />
      ))}
    </span>
  );
}

export function Drawer({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-300"
      style={{
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div className="overflow-hidden" inert={!open}>
        <div className="border-t border-line bg-surface px-3 py-2.5">{children}</div>
      </div>
    </div>
  );
}

export function CheckOption({ checked, onChange, children, disabled }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className={`relative z-10 -mx-1 flex items-start gap-2 rounded-control py-1 pr-2 pl-1 text-left transition-colors duration-100 hover:bg-hover ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span
        aria-hidden
        className={`mt-px flex size-4 shrink-0 items-center justify-center rounded-[5px] transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent
          ${checked ? "bg-ink text-canvas" : "text-transparent shadow-[inset_0_0_0_1.5px_var(--line-strong)]"}`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      </span>
      <span className={`text-[13px] leading-snug transition-colors duration-200 ${checked ? "text-ink" : "text-ink-2"}`}>{children}</span>
    </label>
  );
}

export function SentPill({ tone = "green", children }: { tone?: "green" | "neutral"; children: ReactNode }) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-[12.5px] font-medium ${tone === "green" ? "bg-green-tint text-green" : "bg-field text-ink-2 shadow-hairline"}`}
      style={{ animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      <span className={`flex size-4.5 items-center justify-center rounded-full text-white ${tone === "green" ? "bg-green" : "bg-ink-3"}`}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      </span>
      {children}
    </span>
  );
}

export function FieldRow({ value, onChange, placeholder, label, maxLength }: { value: string; onChange: (value: string) => void; placeholder?: string; label: string; maxLength?: number }) {
  return (
    <label className="relative z-10 -mx-1 flex items-start gap-1.5 rounded-control py-1 pr-2 pl-1 transition-colors duration-100 hover:bg-hover">
      <textarea
        value={value}
        rows={2}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="min-w-0 flex-1 resize-none bg-transparent pl-1.5 text-[13px] leading-snug text-ink outline-none placeholder:text-ink-3"
      />
    </label>
  );
}
