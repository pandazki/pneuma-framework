import { describe, test, expect } from "bun:test";
import {
  Adapter,
  AdapterInvariantViolation,
  type AdapterInit,
  type Capabilities,
  type ExternalTypeDef,
  type IdentityBinding,
} from "../../src/aggregates/adapter.js";
import type { CellType } from "../../src/value-objects/cell-type.js";

const TEXT: CellType = { kind: "primitive", of: "Text" };
const DATE_T: CellType = { kind: "primitive", of: "Date" };

const LINEAR_ISSUE_TYPE: ExternalTypeDef = {
  name: "Issue",
  columns: [
    { name: "id", type: TEXT },
    { name: "title", type: TEXT },
    { name: "state", type: TEXT },
    { name: "assignee_id", type: TEXT },
    { name: "completed_at", type: DATE_T },
  ],
};

function mkInit(over: Partial<AdapterInit> = {}): AdapterInit {
  const caps: Capabilities = {
    list: true,
    read: true,
    insert: false,
    update: false,
    delete: false,
  };
  return {
    id: "linear",
    app_id: "app",
    externalTypes: [LINEAR_ISSUE_TYPE],
    auth: { kind: "oauth2", scopes: ["read:all"] },
    capabilities: caps,
    credential_mode: "shared",
    ...over,
  };
}

describe("Adapter · aggregate (ADR-0004/0005/0011/0021)", () => {
  describe("construction basics", () => {
    test("requires id / app_id / non-empty externalTypes", () => {
      expect(() => new Adapter(mkInit({ id: "" }))).toThrow(AdapterInvariantViolation);
      expect(() => new Adapter(mkInit({ app_id: "" }))).toThrow(AdapterInvariantViolation);
      expect(() => new Adapter(mkInit({ externalTypes: [] }))).toThrow(
        AdapterInvariantViolation
      );
    });

    test("simplest shared adapter OK", () => {
      const a = new Adapter(mkInit());
      expect(a.id).toBe("linear");
      expect(a.credential_mode).toBe("shared");
      expect(a.supported_credential_modes).toEqual(["shared"]);
    });
  });

  describe("capabilities invariants", () => {
    test("update=true requires non-empty updatableColumns", () => {
      expect(
        () =>
          new Adapter(
            mkInit({
              capabilities: {
                list: true,
                read: true,
                insert: false,
                update: true,
                delete: false,
              },
            })
          )
      ).toThrow(AdapterInvariantViolation);
    });

    test("update=true + updatableColumns valid", () => {
      const a = new Adapter(
        mkInit({
          capabilities: {
            list: true,
            read: true,
            insert: false,
            update: true,
            delete: false,
            updatableColumns: ["state"],
          },
        })
      );
      expect(a.canWrite("state")).toBe(true);
      expect(a.canWrite("title")).toBe(false);
      expect(a.canWrite("nonexistent")).toBe(false);
    });

    test("updatableColumns referencing unknown column rejected", () => {
      expect(
        () =>
          new Adapter(
            mkInit({
              capabilities: {
                list: true,
                read: true,
                insert: false,
                update: true,
                delete: false,
                updatableColumns: ["mystery"],
              },
            })
          )
      ).toThrow(AdapterInvariantViolation);
    });

    test("filter_pushdown unknown column in supported_ops rejected", () => {
      expect(
        () =>
          new Adapter(
            mkInit({
              capabilities: {
                list: true,
                read: true,
                insert: false,
                update: false,
                delete: false,
                filter_pushdown: {
                  supported_ops: { mystery: ["eq"] },
                },
              },
            })
          )
      ).toThrow(AdapterInvariantViolation);
    });

    test("canPushdownFilter matches supported_ops", () => {
      const a = new Adapter(
        mkInit({
          capabilities: {
            list: true,
            read: true,
            insert: false,
            update: false,
            delete: false,
            filter_pushdown: {
              supported_ops: {
                assignee_id: ["eq", "in"],
                state: ["eq"],
                completed_at: ["gte", "lte", "date"],
              },
            },
          },
        })
      );
      expect(a.canPushdownFilter("assignee_id", "eq")).toBe(true);
      expect(a.canPushdownFilter("assignee_id", "like")).toBe(false);
      expect(a.canPushdownFilter("state", "in")).toBe(false);
      expect(a.canPushdownFilter("nonexistent", "eq")).toBe(false);
    });
  });

  describe("admin_delegated mode (ADR-0021)", () => {
    const binding: IdentityBinding = {
      strategy: "email_match",
      store_at: "user.attrs.linear_user_id",
    };

    test("admin_delegated missing identity_binding → reject", () => {
      expect(
        () =>
          new Adapter(
            mkInit({
              credential_mode: "admin_delegated",
              supported_credential_modes: ["admin_delegated"],
            })
          )
      ).toThrow(AdapterInvariantViolation);
    });

    test("admin_delegated missing filter_pushdown.required_for_admin_delegated → reject", () => {
      expect(
        () =>
          new Adapter(
            mkInit({
              credential_mode: "admin_delegated",
              supported_credential_modes: ["admin_delegated"],
              identity_binding: binding,
            })
          )
      ).toThrow(AdapterInvariantViolation);
    });

    test("admin_delegated valid config accepted", () => {
      const a = new Adapter(
        mkInit({
          credential_mode: "admin_delegated",
          supported_credential_modes: ["admin_delegated"],
          identity_binding: binding,
          capabilities: {
            list: true,
            read: true,
            insert: false,
            update: false,
            delete: false,
            filter_pushdown: {
              supported_ops: { assignee_id: ["eq", "in"] },
              required_for_admin_delegated: [
                { column: "assignee_id", required_ops: ["eq"] },
              ],
            },
          },
        })
      );
      expect(a.credential_mode).toBe("admin_delegated");
      expect(a.requiresAdminDelegatedFilter()).toEqual([
        { column: "assignee_id", required_ops: ["eq"] },
      ]);
    });

    test("required_for_admin_delegated column not in supported_ops → reject", () => {
      expect(
        () =>
          new Adapter(
            mkInit({
              credential_mode: "admin_delegated",
              supported_credential_modes: ["admin_delegated"],
              identity_binding: binding,
              capabilities: {
                list: true,
                read: true,
                insert: false,
                update: false,
                delete: false,
                filter_pushdown: {
                  supported_ops: { state: ["eq"] },
                  required_for_admin_delegated: [
                    { column: "assignee_id", required_ops: ["eq"] },
                  ],
                },
              },
            })
          )
      ).toThrow(AdapterInvariantViolation);
    });

    test("required op not in supported_ops[column] → reject", () => {
      expect(
        () =>
          new Adapter(
            mkInit({
              credential_mode: "admin_delegated",
              supported_credential_modes: ["admin_delegated"],
              identity_binding: binding,
              capabilities: {
                list: true,
                read: true,
                insert: false,
                update: false,
                delete: false,
                filter_pushdown: {
                  supported_ops: { assignee_id: ["in"] },
                  required_for_admin_delegated: [
                    { column: "assignee_id", required_ops: ["eq"] }, // 'eq' not in ['in']
                  ],
                },
              },
            })
          )
      ).toThrow(AdapterInvariantViolation);
    });
  });

  describe("supported_credential_modes", () => {
    test("chosen mode must be in supported list", () => {
      expect(
        () =>
          new Adapter(
            mkInit({
              credential_mode: "per-user",
              supported_credential_modes: ["shared"],
            })
          )
      ).toThrow(AdapterInvariantViolation);
    });

    test("defaults to [credential_mode] if not supplied", () => {
      const a = new Adapter(mkInit());
      expect(a.supported_credential_modes).toEqual(["shared"]);
    });
  });

  test("requiresAdminDelegatedFilter empty for non-admin modes", () => {
    const a = new Adapter(mkInit());
    expect(a.requiresAdminDelegatedFilter()).toEqual([]);
  });

  test("externalTypeByName lookup", () => {
    const a = new Adapter(mkInit());
    expect(a.externalTypeByName("Issue")?.name).toBe("Issue");
    expect(a.externalTypeByName("NotFound")).toBeUndefined();
  });
});
