import type { ReleaseEvent, ReleaseItem } from "./contracts";

const now = new Date("2026-05-28T09:00:00.000Z").toISOString();
const tomorrow = new Date("2026-05-29T09:00:00.000Z").toISOString();

export const demoItems: ReleaseItem[] = [
  {
    id: "rel-auth-001",
    title: "Finalize OAuth callback hardening",
    owner: "Nora",
    priority: "P0",
    status: "blocked",
    slaAt: tomorrow,
    risk: "critical",
    notes: "Waiting for credential rotation evidence before release.",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rel-board-002",
    title: "Ship review queue dashboard",
    owner: "Iris",
    priority: "P1",
    status: "in_progress",
    slaAt: tomorrow,
    risk: "high",
    notes: "Needs final data carry-forward smoke.",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rel-docs-003",
    title: "Publish operator rollback notes",
    owner: "Mateo",
    priority: "P2",
    status: "ready_for_release",
    slaAt: null,
    risk: "medium",
    notes: "Ready after release captain sign-off.",
    createdAt: now,
    updatedAt: now,
  },
];

export const demoEvents: ReleaseEvent[] = [
  {
    id: "evt-001",
    itemId: "rel-auth-001",
    kind: "blocked",
    message: "Security owner requested credential evidence.",
    actor: "Nora",
    createdAt: now,
  },
  {
    id: "evt-002",
    itemId: "rel-board-002",
    kind: "check",
    message: "Preview data rehearsal passed with existing records.",
    actor: "Iris",
    createdAt: now,
  },
  {
    id: "evt-003",
    itemId: "rel-docs-003",
    kind: "ready",
    message: "Release notes are ready for operator review.",
    actor: "Mateo",
    createdAt: now,
  },
];
