"use client";
// Pieces of Beautiful UI's ToolChips (MIT, © 2026 Shane Levine; see ../LICENSE), from https://www.beautifului.dev/r/tool-chips.json.
// Adapted for the owner page: the demo run (steps revealed one by one, the diff hover cards) is gone; what is left:
//   Collapsible  the collapsed run header (chevron + quiet label) and the rows that open beneath it, as a disclosure
//                whose content is the caller's; the expanded-detail rail (`border-l` + indent) is the library's
//   FileChips    the file-diff chips, without line counts (the record names the files a change touched, not its diff)
//   InlineChip   the inline field chip a tool row shows its argument in

import { useState, type ReactNode } from "react";

export function Collapsible({
  label,
  children,
  defaultOpen = false,
  className = "",
}: {
  label: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="-mx-1.5 flex w-fit items-center gap-1.5 rounded-control px-1.5 py-1 text-[12.5px] text-ink-2 transition-colors duration-100 hover:bg-hover-2"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span className="tabular-nums">{label}</span>
      </button>
      <div className="grid transition-[grid-template-rows,opacity] duration-300" style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}>
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="mt-1 mb-1 ml-[5px] flex flex-col gap-1 border-l border-line py-0.5 pl-3.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function FileChips({ files, more }: { files: readonly string[]; more?: string }) {
  return (
    <div className="flex max-w-full flex-wrap gap-1.5">
      {files.map((file, i) => (
        <span
          key={file}
          className="inline-flex h-7 max-w-full items-center gap-2 rounded-chip bg-surface px-2 font-mono text-[11.5px] text-ink shadow-btn"
          style={{ animation: `pop-in 250ms cubic-bezier(0.23,1,0.32,1) ${Math.min(i, 10) * 40}ms both` }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          <span className="min-w-0 truncate">{file}</span>
        </span>
      ))}
      {more && <span className="inline-flex h-7 items-center rounded-chip px-1.5 font-mono text-[11.5px] text-ink-3">{more}</span>}
    </div>
  );
}

export function InlineChip({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <span className={`inline-flex h-5.5 min-w-0 max-w-full items-center truncate rounded-chip bg-field px-1.5 text-[11.5px] text-ink-2 shadow-hairline ${mono ? "font-mono" : ""}`}>
      {children}
    </span>
  );
}
