import { z } from "zod";

// ---------------------------------------------------------------------------
// Release Operations Board — shared contracts.
//
// This module is the single source of truth for the wire shapes used by both
// the Hono API and the React client. Zod gives runtime validation at the API
// boundary; the inferred TypeScript types flow into the UI for free.
// ---------------------------------------------------------------------------

export const RELEASE_STATUSES = ["queued", "in_progress", "blocked", "shipped"] as const;
export const releaseStatusSchema = z.enum(RELEASE_STATUSES);
export type ReleaseStatus = z.infer<typeof releaseStatusSchema>;

export const RELEASE_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const releasePrioritySchema = z.enum(RELEASE_PRIORITIES);
export type ReleasePriority = z.infer<typeof releasePrioritySchema>;

export const RELEASE_RISKS = ["low", "elevated", "high"] as const;
export const releaseRiskSchema = z.enum(RELEASE_RISKS);
export type ReleaseRisk = z.infer<typeof releaseRiskSchema>;

export const releaseItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(140),
  summary: z.string().max(600).default(""),
  status: releaseStatusSchema,
  priority: releasePrioritySchema,
  risk: releaseRiskSchema,
  owner: z.string().min(1).max(80),
  slaDueAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReleaseItem = z.infer<typeof releaseItemSchema>;

export const RELEASE_EVENT_KINDS = ["created", "transition", "note"] as const;
export const releaseEventKindSchema = z.enum(RELEASE_EVENT_KINDS);
export type ReleaseEventKind = z.infer<typeof releaseEventKindSchema>;

export const releaseEventSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  kind: releaseEventKindSchema,
  message: z.string(),
  fromStatus: releaseStatusSchema.nullable(),
  toStatus: releaseStatusSchema.nullable(),
  createdAt: z.string().datetime(),
});
export type ReleaseEvent = z.infer<typeof releaseEventSchema>;

export const releaseItemWithEventsSchema = releaseItemSchema.extend({
  events: z.array(releaseEventSchema),
});
export type ReleaseItemWithEvents = z.infer<typeof releaseItemWithEventsSchema>;

// --- inputs ---------------------------------------------------------------

export const createReleaseItemInputSchema = z.object({
  title: z.string().min(1, "Title is required").max(140),
  summary: z.string().max(600).optional().default(""),
  priority: releasePrioritySchema.default("medium"),
  risk: releaseRiskSchema.default("low"),
  owner: z.string().min(1, "Owner is required").max(80),
  slaDueAt: z.string().datetime().nullable().optional().default(null),
});
export type CreateReleaseItemInput = z.input<typeof createReleaseItemInputSchema>;

export const transitionReleaseItemInputSchema = z.object({
  toStatus: releaseStatusSchema,
  note: z.string().max(400).optional(),
});
export type TransitionReleaseItemInput = z.infer<typeof transitionReleaseItemInputSchema>;

// --- read models ----------------------------------------------------------

export const releaseSummarySchema = z.object({
  total: z.number(),
  byStatus: z.record(releaseStatusSchema, z.number()),
  atRisk: z.number(),
  shippedThisCycle: z.number(),
});
export type ReleaseSummary = z.infer<typeof releaseSummarySchema>;

export const healthSchema = z.object({
  ok: z.boolean(),
  persistence: z.enum(["neon", "memory"]),
  schemaSignature: z.string(),
});
export type Health = z.infer<typeof healthSchema>;

// The schema signature is a compact fingerprint of the columns this build of
// the app understands. The Creation Host watches it change across applies, so
// it is intentionally derived from the contract, not hand-written.
export const RELEASE_ITEM_FIELDS = [
  "id",
  "title",
  "summary",
  "status",
  "priority",
  "risk",
  "owner",
  "slaDueAt",
  "createdAt",
  "updatedAt",
] as const;

export function schemaSignature(): string {
  return `release_items(${RELEASE_ITEM_FIELDS.join(",")})`;
}
