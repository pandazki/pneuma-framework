import { resolve } from "node:path";
import type { StackProfile } from "./types.js";

export const KNOWLEDGE_INBOX_PROFILE: StackProfile = {
  id: "knowledge-inbox-bun-sqlite",
  display_name: "Knowledge Inbox",
  description: "Bun TypeScript backend with SQLite persistence and the existing Knowledge Inbox domain.",
  template_dir: resolve(import.meta.dir, "../../templates/knowledge-inbox-core-domain"),
  persistence: "sqlite",
  runtime: "bun-typescript",
};

export const STACK_PROFILES = [KNOWLEDGE_INBOX_PROFILE] as const;

export function getStackProfile(profileId: string): StackProfile {
  const profile = STACK_PROFILES.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error(`unknown stack profile: ${profileId}`);
  return profile;
}
