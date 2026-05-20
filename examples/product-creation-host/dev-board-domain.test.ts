import { describe, expect, test } from "bun:test";
import {
  createInitialDevBoard,
  evolveDefinitionForIntent,
  validateDevBoardDefinition,
} from "./src/domain/dev-board.js";

describe("dev board domain contract", () => {
  test("accepts evolved GitHub and priority definitions with canonical field types", () => {
    const initial = createInitialDevBoard({
      app_id: "dev-board",
      name: "Dev Board",
      goal: "Track work.",
      template_id: "engineering",
    });
    const evolved = evolveDefinitionForIntent(initial.definition, "Add GitHub issue attention and a priority lane.");

    expect(validateDevBoardDefinition(evolved)).toEqual({ ok: true });
    expect(evolved.fields.find((field) => field.id === "priority")?.type).toBe("priority");
    expect(evolved.fields.find((field) => field.id === "url")?.type).toBe("url");
  });

  test("rejects code-agent drafts that invent unsupported field types", () => {
    const initial = createInitialDevBoard({
      app_id: "dev-board",
      name: "Dev Board",
      goal: "Track work.",
      template_id: "engineering",
    });
    const invalid = {
      ...initial.definition,
      modules: [
        ...initial.definition.modules,
        { id: "priority_lane", kind: "priority_lane", title: "Priority lane", description: "Sort work." },
      ],
      fields: [
        ...initial.definition.fields,
        { id: "priority", label: "Priority", type: "select", options: ["P1", "P2", "P3"] },
      ],
    };

    const validation = validateDevBoardDefinition(invalid);

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues).toContain("unknown field type for priority: select");
    }
  });

  test("accepts complex delivery, dependency, blocker, and CI capability evolution", () => {
    const initial = createInitialDevBoard({
      app_id: "dev-board",
      name: "Dev Board",
      goal: "Track work.",
      template_id: "engineering",
    });
    const evolved = evolveDefinitionForIntent(
      initial.definition,
      "Add dependency tracking, blocker triage, CI health, and a delivery timeline.",
    );

    expect(validateDevBoardDefinition(evolved)).toEqual({ ok: true });
    expect(evolved.modules.map((mod) => mod.kind)).toContain("dependency_map");
    expect(evolved.modules.map((mod) => mod.kind)).toContain("blocker_triage");
    expect(evolved.modules.map((mod) => mod.kind)).toContain("ci_health");
    expect(evolved.modules.map((mod) => mod.kind)).toContain("delivery_timeline");
    expect(evolved.fields.find((field) => field.id === "depends_on")?.type).toBe("text");
    expect(evolved.fields.find((field) => field.id === "blocked_reason")?.type).toBe("text");
    expect(evolved.fields.find((field) => field.id === "ci_status")?.type).toBe("signal");
    expect(evolved.fields.find((field) => field.id === "due_date")?.type).toBe("date");
    expect(evolved.fields.find((field) => field.id === "effort")?.type).toBe("text");
  });

  test("rejects complex capability drafts that use plausible but non-canonical field ids", () => {
    const initial = createInitialDevBoard({
      app_id: "dev-board",
      name: "Dev Board",
      goal: "Track work.",
      template_id: "engineering",
    });
    const invalid = {
      ...initial.definition,
      modules: [
        ...initial.definition.modules,
        { id: "dependency_map", kind: "dependency_map", title: "Dependency map", description: "Track prerequisites." },
        { id: "ci_health", kind: "ci_health", title: "CI health", description: "Track checks." },
      ],
      fields: [
        ...initial.definition.fields,
        { id: "dependency", label: "Dependency", type: "text" },
        { id: "ci", label: "CI", type: "signal" },
      ],
    };

    const validation = validateDevBoardDefinition(invalid);

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues).toContain("missing field for dependency_map: depends_on");
      expect(validation.issues).toContain("missing field for ci_health: ci_status");
    }
  });
});
