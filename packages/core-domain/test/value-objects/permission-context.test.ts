import { describe, test, expect } from "bun:test";
import {
  buildRootContext,
  deriveSpan,
  type PermissionContext,
} from "../../src/value-objects/permission-context.js";

describe("PermissionContext · per-request runtime value", () => {
  test("root context defaults tenant to 'default'", () => {
    const ctx = buildRootContext({
      app_id: "ai-bookmarks",
      invoked_via: "ui",
    });
    expect(ctx.tenant_id).toBe("default");
    expect(ctx.anonymous).toBe(true);
    expect(ctx.user).toBeUndefined();
    expect(ctx.trace_id).toBeDefined();
    expect(ctx.trace_id.length).toBeGreaterThan(0);
    expect(ctx.span_id).toBeUndefined();
  });

  test("root context with user", () => {
    const ctx = buildRootContext({
      app_id: "ai-bookmarks",
      invoked_via: "agent",
      user: {
        id: "u1",
        attrs: { linear_user_id: "LIN-xyz" },
        roles: ["team"],
      },
    });
    expect(ctx.anonymous).toBe(false);
    expect(ctx.user?.id).toBe("u1");
    expect(ctx.user?.roles).toEqual(["team"]);
  });

  test("deriveSpan keeps trace_id, parent chain, and fresh span_id", () => {
    const root = buildRootContext({
      app_id: "app",
      invoked_via: "ui",
    });
    const child = deriveSpan(root);
    expect(child.trace_id).toBe(root.trace_id);
    expect(child.parent_span_id).toBe(root.span_id); // undefined at root
    expect(child.span_id).toBeDefined();
    expect(child.span_id).not.toBe(root.span_id);

    const grandchild = deriveSpan(child);
    expect(grandchild.trace_id).toBe(root.trace_id);
    expect(grandchild.parent_span_id).toBe(child.span_id);
    expect(grandchild.span_id).not.toBe(child.span_id);
  });

  test("context is structurally compatible with PermissionContext type", () => {
    const ctx: PermissionContext = buildRootContext({
      app_id: "app",
      invoked_via: "cli",
    });
    expect(ctx.app_id).toBe("app");
  });
});
