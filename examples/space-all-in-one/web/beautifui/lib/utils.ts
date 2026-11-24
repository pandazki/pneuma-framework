// Beautiful UI (MIT, © 2026 Shane Levine; see ../LICENSE) imports `cn` from "@/lib/utils", which the registry
// does not ship: in shadcn projects it is clsx + tailwind-merge. The owner page passes no class that conflicts
// with a component's own, so joining is enough.
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
