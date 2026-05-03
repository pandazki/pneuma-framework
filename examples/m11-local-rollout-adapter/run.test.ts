import { expect, test } from "bun:test";
import { runM11RolloutDemo } from "./run.js";

test("M11 rollout demo records baseline active, candidate promotion, and rollback", async () => {
  const result = await runM11RolloutDemo({ mode: "model" });

  expect(result.summary.before.active_candidate_id).toBe("rc-baseline");
  expect(result.summary.after_promote.active_candidate_id).toBe("rc-semantic-search");
  expect(result.summary.after_rollback.active_candidate_id).toBe("rc-baseline");
  expect(result.timeline.map((event) => event.type)).toEqual([
    "candidate_staged",
    "candidate_promoted",
    "candidate_staged",
    "candidate_promoted",
    "rollback_completed",
  ]);
});
