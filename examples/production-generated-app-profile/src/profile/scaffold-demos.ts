import type { CreateReleaseItemInput, ItemStatus } from "../shared/contracts";

export interface ScaffoldDemo {
  readonly id: string;
  readonly title: string;
  readonly builderStory: string;
  readonly createItem: CreateReleaseItemInput;
  readonly transitions: readonly ItemStatus[];
  readonly expectedFinalStatus: ItemStatus;
}

export const scaffoldDemos = [
  {
    id: "critical-security-release",
    title: "Critical security release",
    builderStory: "A release captain tracks a blocked P0 fix until it is ready for release.",
    createItem: {
      title: "Rotate compromised webhook credentials",
      owner: "Nora",
      priority: "P0",
      risk: "critical",
      notes: "Requires credential evidence before the train can move.",
    },
    transitions: ["blocked", "in_progress", "ready_for_release"],
    expectedFinalStatus: "ready_for_release",
  },
  {
    id: "staging-rehearsal",
    title: "Staging rehearsal",
    builderStory: "An operator rehearses a risky migration before production publish.",
    createItem: {
      title: "Rehearse billing migration in staging",
      owner: "Iris",
      priority: "P1",
      risk: "high",
      notes: "Must pass carry-forward data verification before publish.",
    },
    transitions: ["in_progress", "ready_for_release"],
    expectedFinalStatus: "ready_for_release",
  },
  {
    id: "release-notes-closeout",
    title: "Release notes closeout",
    builderStory: "A lower-risk documentation task moves all the way through release.",
    createItem: {
      title: "Publish customer-facing release notes",
      owner: "Mateo",
      priority: "P2",
      risk: "medium",
      notes: "Confirm examples match the shipped build.",
    },
    transitions: ["in_progress", "ready_for_release", "released"],
    expectedFinalStatus: "released",
  },
] as const satisfies readonly ScaffoldDemo[];
