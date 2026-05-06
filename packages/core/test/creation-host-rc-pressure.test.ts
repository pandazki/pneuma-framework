import { describe, expect, test } from "bun:test";
import {
  buildDevBoardRcPressureScenario,
  evaluateCreationHostRcPressure,
} from "../src/index.js";

describe("M24 Creation Host RC pressure", () => {
  test("proves Alice can prepare Bob's Build Agent package without provider special-casing", () => {
    const scenario = buildDevBoardRcPressureScenario();
    const report = evaluateCreationHostRcPressure(scenario);

    expect(report.ok).toBe(true);
    expect(report.agent_package.provider_specialization_policy).toEqual({
      mode: "capability-contract-only",
      provider_specific_branches: "forbidden",
      allowed_context: ["profile_id", "capabilities", "credential_requirements"],
    });
    expect(report.agent_context_visible_to_builder_agent).toEqual([
      "profile_id",
      "capabilities",
      "credential_requirements",
    ]);
    expect(report.provider_specific_branching_allowed).toBe(false);
  });

  test("proves Charlie can install Bob's artifact by rebinding credentials", () => {
    const scenario = buildDevBoardRcPressureScenario();
    const report = evaluateCreationHostRcPressure(scenario);

    expect(report.charlie_install.allowed).toBe(true);
    expect(report.charlie_install.reason_code).toBe("explicit-grant");
    expect(report.charlie_install.matched_grants).toEqual(["charlie-install"]);
    expect(report.charlie_install.missing_credential_requirement_ids).toEqual([]);
  });

  test("proves Dave can fork only after unsupported Apple Notes is removed", () => {
    const scenario = buildDevBoardRcPressureScenario();
    const report = evaluateCreationHostRcPressure(scenario);

    expect(report.dave_fork.allowed).toBe(true);
    expect(report.dave_fork.target_profile_id).toBe("remote-postgres-docker");
    expect(report.dave_fork.removed_capability_ids).toEqual(["apple-notes"]);
    expect(report.dave_fork.unsupported_capabilities_acknowledged).toEqual(["apple-notes"]);
    expect(report.dave_fork.provider_specific_migration_used).toBe(false);
  });
});
