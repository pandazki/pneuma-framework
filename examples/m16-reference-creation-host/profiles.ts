import { join } from "node:path";
import type { CreationHostProfile } from "@pneuma-framework/core";

const ROOT = join(import.meta.dir, "..", "..");

export const M16_STACK_PROFILES: readonly CreationHostProfile[] = [
  {
    id: "knowledge-inbox-bun-sqlite",
    display_name: "Knowledge Inbox",
    description: "Capture, triage, evolve, and publish a team knowledge inbox.",
    template_dir: join(ROOT, "templates", "knowledge-inbox-core-domain"),
    persistence: "sqlite",
    runtime: "bun-typescript",
    read_operation_id: "list_inbox_items",
    data_table_id: "inbox_items",
    supports_evolution: true,
    supports_publish: true,
  },
  {
    id: "team-decision-log-bun-sqlite",
    display_name: "Team Decision Log",
    description: "Record and inspect team decisions through a second app shape.",
    template_dir: join(ROOT, "examples", "m15-generality-pressure-app", "templates", "team-decision-log"),
    persistence: "sqlite",
    runtime: "bun-typescript",
    read_operation_id: "list_decisions",
    data_table_id: "decisions",
    supports_evolution: false,
    supports_publish: false,
  },
];

export function getM16StackProfile(profileId: string): CreationHostProfile {
  const profile = M16_STACK_PROFILES.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error(`unknown M16 stack profile: ${profileId}`);
  return profile;
}
