import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonTone = "primary" | "secondary" | "quiet" | "danger";

export function Button({
  children,
  tone = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  children: ReactNode;
}) {
  return (
    <button className={`ui-button ui-button-${tone} ${className}`} {...props}>
      {children}
    </button>
  );
}
