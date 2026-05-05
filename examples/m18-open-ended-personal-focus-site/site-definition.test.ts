import { describe, expect, test } from "bun:test";
import {
  createPersonalFocusSiteDefinition,
  evolvePersonalFocusSiteDefinition,
  M18_OPEN_ENDED_DEFINITION_BOUNDARY,
  summarizeSiteDefinition,
} from "./site-definition.js";

describe("M18 Personal Focus Site definition", () => {
  test("creates v0 as an open-ended personal site definition", () => {
    const definition = createPersonalFocusSiteDefinition();

    expect(definition.version).toBe("v0");
    expect(definition.routes.map((route) => route.path)).toEqual(["/"]);
    expect(definition.sections.map((section) => section.kind)).toEqual([
      "hero",
      "project_gallery",
      "focus_note",
      "github_attention",
      "contact",
    ]);
    expect(definition.modules.github_attention.ranking.top_n).toBe(3);
    expect(Object.keys(definition.style_tokens)).toEqual([
      "accent",
      "background",
      "surface",
      "text",
      "muted",
      "type_scale",
      "density",
      "tone",
    ]);

    const summary = summarizeSiteDefinition(definition);
    expect(summary.primary_shape).toBe("open-ended-site");
    expect(summary.table_like_surfaces).toHaveLength(0);
  });

  test("applies focus evolution by changing sections, style tokens, and GitHub ranking module", () => {
    const before = createPersonalFocusSiteDefinition();
    const after = evolvePersonalFocusSiteDefinition(before);

    expect(after.version).toBe("v1");
    expect(after.sections.find((section) => section.id === "github_attention")?.title).toBe(
      "What needs attention now",
    );
    expect(after.modules.github_attention.ranking.signals).toEqual([
      "assigned",
      "review_requested",
      "mentioned",
      "priority_label",
      "recent_activity",
    ]);
    expect(after.style_tokens.tone).toBe("editorial");
    expect(after.style_tokens.accent).not.toBe(before.style_tokens.accent);
    expect(summarizeSiteDefinition(after).changed_surface).toBe("sections+style+github_attention");
  });

  test("declares open-ended UI/module artifacts as Host-owned, not framework definition rows", () => {
    expect(M18_OPEN_ENDED_DEFINITION_BOUNDARY).toEqual({
      artifact_kind: "host_owned_open_ended_definition",
      artifact_path: "site-definition.json",
      governance_scope: "host_approval",
      host_operation: "host.apply_open_ended_evolution",
      framework_definition_rows: false,
      framework_definition_apply_change_set: false,
    });
  });
});
