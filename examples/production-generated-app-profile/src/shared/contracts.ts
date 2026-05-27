import { z } from "zod";

export const itemPrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);
export const itemStatusSchema = z.enum([
  "triage",
  "in_progress",
  "blocked",
  "ready_for_release",
  "released",
]);
export const itemRiskSchema = z.enum(["low", "medium", "high", "critical"]);

export const releaseItemSchema = z.object({
  id: z.string().min(3),
  title: z.string().min(3),
  owner: z.string().min(2),
  priority: itemPrioritySchema,
  status: itemStatusSchema,
  slaAt: z.string().nullable(),
  risk: itemRiskSchema,
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const releaseEventSchema = z.object({
  id: z.string().min(3),
  itemId: z.string().min(3),
  kind: z.string().min(2),
  message: z.string().min(2),
  actor: z.string().min(2),
  createdAt: z.string(),
});

export const createReleaseItemSchema = z.object({
  title: z.string().min(3).max(120),
  owner: z.string().min(2).max(64),
  priority: itemPrioritySchema.default("P2"),
  risk: itemRiskSchema.default("medium"),
  notes: z.string().max(500).default(""),
  slaAt: z.string().datetime().nullable().optional(),
});

export const transitionReleaseItemSchema = z.object({
  status: itemStatusSchema,
  actor: z.string().min(2).max(64).default("Builder"),
  message: z.string().min(2).max(240).optional(),
});

export const summarySchema = z.object({
  total: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  highRisk: z.number().int().nonnegative(),
  releaseReady: z.number().int().nonnegative(),
});

export type ItemPriority = z.infer<typeof itemPrioritySchema>;
export type ItemStatus = z.infer<typeof itemStatusSchema>;
export type ItemRisk = z.infer<typeof itemRiskSchema>;
export type ReleaseItem = z.infer<typeof releaseItemSchema>;
export type ReleaseEvent = z.infer<typeof releaseEventSchema>;
export type CreateReleaseItemInput = z.infer<typeof createReleaseItemSchema>;
export type TransitionReleaseItemInput = z.infer<typeof transitionReleaseItemSchema>;
export type ReleaseSummary = z.infer<typeof summarySchema>;
