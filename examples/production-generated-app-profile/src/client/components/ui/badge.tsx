import type { ReactNode } from "react";

type BadgeTone = "neutral" | "info" | "warning" | "danger" | "success";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}
