import { createNeonDb } from "../db/client";
import { NeonReleaseRepository } from "../db/neon-repository";
import { MemoryReleaseRepository, type ReleaseRepository } from "./repository";

// Chooses persistence from the environment:
//   - DATABASE_URL present → Neon (a published runtime). Seeding happens at
//     migrate time, not per request, so the production boundary stays honest.
//   - otherwise → in-memory, pre-seeded (preview / local dev). Disposable.
export async function buildRepository(): Promise<ReleaseRepository> {
  const db = createNeonDb();
  if (db) return new NeonReleaseRepository(db);
  const repo = new MemoryReleaseRepository();
  await repo.seedIfEmpty();
  return repo;
}
