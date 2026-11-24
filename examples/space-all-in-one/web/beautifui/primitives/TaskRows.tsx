"use client";
// Beautiful UI TaskRows (MIT, © 2026 Shane Levine; see ../LICENSE), from https://www.beautifului.dev/r/task-rows.json.
// Adapted for the owner page:
//   - rows come from the caller and keep their status (the demo's timed run, useTick and the "sequence" row are gone);
//   - statuses "waiting" (orange badge), "plain" and "undo" (neutral badges) join "done", "failed" and "running";
//   - a row's label may wrap to two lines (a person's own words are not cut), so a row is at least, not exactly, 44px;
//     a row marked `wrap` (a notice the owner has to read whole) is not cut at all;
//   - the pill and the expanded detail are the caller's (a ReactNode), and a row without detail does not expand.
// Badge, SpinnerRing, the staggered entry, the chevron and the expanding detail are the library's.

import { useState, type ReactNode } from "react";

function SpinnerRing({ active, children }: { active?: boolean; children?: ReactNode }) {
  const size = 24, stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size} height={size} className="absolute inset-0"
        style={active ? { animation: "spin 1.1s linear infinite" } : undefined}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {active && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="var(--ink-3)" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${c * 0.28} ${c * 0.72}`}
          />
        )}
      </svg>
      <span className="relative text-[10.5px] font-semibold tabular-nums text-ink">{children}</span>
    </span>
  );
}

type BadgeTone = "red" | "green" | "orange" | "neutral";

const BADGE: Record<BadgeTone, string> = {
  red: "bg-red text-white",
  green: "bg-green text-white",
  orange: "bg-orange text-white",
  neutral: "bg-field text-ink-3 shadow-hairline",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`flex size-5.5 shrink-0 items-center justify-center rounded-full ${BADGE[tone]}`}
      style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      {children}
    </span>
  );
}

export const XIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
);
export const CheckIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);
export const RetryIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
);
const UndoIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 2.64-6.36M3 3v6h6" /></svg>
);
const ClockIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7v5l3 2" /></svg>
);
const DotIcon = <span className="size-1.5 rounded-full bg-current" />;
const BangIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M12 6v7M12 18h.01" /></svg>
);

export type TaskStatus = "done" | "failed" | "running" | "waiting" | "caution" | "plain" | "undo";

export type TaskRow = {
  key: string;
  label: ReactNode;
  /** Right-aligned, quiet: a count, a time. */
  amount?: ReactNode;
  status: TaskStatus;
  step?: number;
  pill?: ReactNode;
  /** What the row opens to; none: the row does not expand. */
  details?: ReactNode;
  defaultOpen?: boolean;
  /** The label wraps as far as it needs instead of two lines. */
  wrap?: boolean;
};

export function badgeFor(status: TaskStatus, step?: number) {
  switch (status) {
    case "done":
      return <Badge tone="green">{CheckIcon}</Badge>;
    case "failed":
      return <Badge tone="red">{XIcon}</Badge>;
    case "waiting":
      return <Badge tone="orange">{ClockIcon}</Badge>;
    case "caution":
      return <Badge tone="orange">{BangIcon}</Badge>;
    case "undo":
      return <Badge tone="neutral">{UndoIcon}</Badge>;
    case "running":
      return <SpinnerRing active>{step}</SpinnerRing>;
    default:
      return <Badge tone="neutral">{DotIcon}</Badge>;
  }
}

/** The library's pill grammar: 22px tall, tinted, 11.5px medium. */
export function TaskPill({ tone, children }: { tone: "green" | "red" | "orange" | "neutral" | "accent"; children: ReactNode }) {
  const cls =
    tone === "green" ? "bg-green-tint text-green"
    : tone === "red" ? "bg-red-tint text-red"
    : tone === "orange" ? "bg-orange-tint text-orange"
    : tone === "accent" ? "bg-accent-tint text-accent-ink"
    : "bg-field text-ink-2 shadow-hairline";
  return <span className={`inline-flex h-5.5 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium ${cls}`}>{children}</span>;
}

export default function TaskRows({
  variant = "List",
  rows,
  className,
  onToggleRow,
}: {
  variant?: "List" | "Capsules";
  rows: TaskRow[];
  className?: string;
  onToggleRow?: (key: string, open: boolean) => void;
}) {
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});
  const list = variant === "List";
  return (
    <div
      className={`flex w-full flex-col ${
        list ? "gap-0 self-start overflow-hidden rounded-card bg-surface shadow-card" : "gap-2"
      }${className ? ` ${className}` : ""}`}
    >
      {rows.map((row, i) => {
        const open = Boolean(row.details) && (manualOpen[row.key] ?? row.defaultOpen ?? false);
        const head = (
          <>
            <span className="flex size-6 shrink-0 items-center justify-center">{badgeFor(row.status, row.step)}</span>
            <span className={`${row.wrap ? "" : "line-clamp-2 "}min-w-0 flex-1 text-[13px] font-medium text-ink [overflow-wrap:anywhere]`}>{row.label}</span>
            {row.amount !== undefined && <span className="hidden shrink-0 text-[12.5px] text-ink-2 tabular-nums sm:inline">{row.amount}</span>}
            {row.pill}
          </>
        );
        return (
          <div
            key={row.key}
            className={`self-stretch overflow-hidden transition-[border-radius,background-color] duration-300 ${row.details ? "hover:bg-inset" : ""} ${
              list ? "border-b border-line last:border-0" : "bg-surface shadow-card"
            }`}
            style={{
              borderRadius: list ? 0 : open ? 14 : 22,
              animation: `fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${Math.min(i, 8) * 80}ms both`,
            }}
          >
            {row.details ? (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => {
                  setManualOpen((current) => ({ ...current, [row.key]: !open }));
                  onToggleRow?.(row.key, !open);
                }}
                className="flex min-h-11 w-full items-center gap-2.5 px-2.5 py-2 text-left"
              >
                {head}
                <span aria-hidden="true" className="-ml-2 flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3">
                  <svg
                    width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    className="transition-transform duration-300"
                    style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
            ) : (
              <div className="flex min-h-11 w-full items-center gap-2.5 px-2.5 py-2">{head}</div>
            )}

            {row.details && (
              <div
                className="grid transition-[grid-template-rows,opacity] duration-300"
                style={{
                  gridTemplateRows: open ? "1fr" : "0fr",
                  opacity: open ? 1 : 0,
                  transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
                }}
              >
                <div className="overflow-hidden" inert={!open}>
                  <div className="mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-2.5">
                    <span aria-hidden className="mx-auto h-full w-px bg-line" />
                    <div className="flex min-w-0 flex-col gap-1.5" style={open ? { animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) 120ms both" } : undefined}>
                      {row.details}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** One line of a row's detail, as the library sets it: label left, mono meta right. */
export function TaskDetail({ label, meta }: { label: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 text-[12px] text-ink-2 [overflow-wrap:anywhere]">{label}</span>
      {meta !== undefined && <span className="shrink-0 font-mono text-[11.5px] text-ink-3 tabular-nums">{meta}</span>}
    </div>
  );
}
