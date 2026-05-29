import type { CreateReleaseItemInput } from "./contracts";

// Seed stories for an empty board. These are inserted as real rows (in memory
// for preview, in Neon for a published runtime) — never fabricated per request.
// A published runtime seeds these only when the target tables are empty.
export const DEMO_RELEASE_ITEMS: Array<
  CreateReleaseItemInput & { status?: "queued" | "in_progress" | "blocked" | "shipped" }
> = [
  {
    title: "Cut 4.8.0 release branch",
    summary: "Branch off main, freeze features, kick CI release pipeline.",
    priority: "high",
    risk: "low",
    owner: "Release Eng",
    status: "in_progress",
    slaDueAt: null,
  },
  {
    title: "Patch checkout latency regression",
    summary: "p95 checkout latency up 40% after 4.7.2. Needs hotfix before promo window.",
    priority: "critical",
    risk: "high",
    owner: "Payments",
    status: "blocked",
    slaDueAt: null,
  },
  {
    title: "Roll search reindex to 25% traffic",
    summary: "Staged rollout of the new ANN index. Watch recall + tail latency.",
    priority: "medium",
    risk: "elevated",
    owner: "Search",
    status: "queued",
    slaDueAt: null,
  },
  {
    title: "Ship dark-mode tokens",
    summary: "Design-system token pass shipped to all surfaces.",
    priority: "low",
    risk: "low",
    owner: "Design Systems",
    status: "shipped",
    slaDueAt: null,
  },
];
