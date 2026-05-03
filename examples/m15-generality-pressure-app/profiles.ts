import { resolve } from "node:path";
import type { M15StackProfile } from "./types.js";

export const STACK_PROFILES: readonly M15StackProfile[] = [
  {
    id: "knowledge-inbox-bun-sqlite",
    display_name: "Knowledge Inbox",
    description: "Capture and triage source material in a shared inbox.",
    template_dir: resolve(import.meta.dir, "../../templates/knowledge-inbox-core-domain"),
    persistence: "sqlite",
    runtime: "bun-typescript",
    read_operation_id: "list_inbox_items",
    data_table_id: "inbox_items",
  },
  {
    id: "team-decision-log-bun-sqlite",
    display_name: "Team Decision Log",
    description: "Record decisions, owners, and follow-up status.",
    template_dir: resolve(import.meta.dir, "templates/team-decision-log"),
    persistence: "sqlite",
    runtime: "bun-typescript",
    read_operation_id: "list_decisions",
    data_table_id: "decisions",
  },
];

export function getM15StackProfile(profileId: string): M15StackProfile {
  const profile = STACK_PROFILES.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error(`unknown stack profile: ${profileId}`);
  return profile;
}
