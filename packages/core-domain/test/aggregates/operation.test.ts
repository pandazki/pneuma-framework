import { describe, test, expect } from "bun:test";
import {
  Operation,
  OperationInvariantViolation,
  type OperationInit,
  type InputSchema,
  type AffectDeclaration,
  type HandlerRef,
  type QueryBody,
  type ImpactDescriptor,
} from "../../src/aggregates/operation.js";
import type { CellType } from "../../src/value-objects/cell-type.js";

const emptyInput: InputSchema = { type: "record", fields: {} };

const codeHandler: HandlerRef = { kind: "code", ref: "./ops/foo.ts" };

const queryHandler: QueryBody = {
  kind: "query",
  on: "bookmarks",
  pagination: { kind: "cursor", size: 25 },
};

const impact: ImpactDescriptor = {
  compute: { kind: "code", ref: "./ops/foo.impact.ts" },
  disclosure_template: "将删除 {{title}}",
};

function mkOpInit(over: Partial<OperationInit> = {}): OperationInit {
  return {
    id: "foo",
    app_id: "app",
    name: "Foo",
    description: "does foo",
    input: emptyInput,
    output: { kind: "void" },
    affects: {
      mutations: ["bookmarks"],
      adapter_writes: [],
      destructive: false,
      reads_only: false,
    },
    handler: codeHandler,
    ...over,
  };
}

describe("Operation · single-source-of-truth primitive (ADR-0018)", () => {
  describe("invariants at construction", () => {
    test("id / app_id / name required", () => {
      expect(() => new Operation(mkOpInit({ id: "" }))).toThrow(OperationInvariantViolation);
      expect(() => new Operation(mkOpInit({ app_id: "" }))).toThrow(OperationInvariantViolation);
      expect(() => new Operation(mkOpInit({ name: "" }))).toThrow(OperationInvariantViolation);
    });

    test("reads_only AND destructive → reject (contradiction)", () => {
      expect(
        () =>
          new Operation(
            mkOpInit({
              affects: { mutations: [], adapter_writes: [], reads_only: true, destructive: true },
              handler: queryHandler,
              impact,
            })
          )
      ).toThrow(OperationInvariantViolation);
    });

    test("reads_only=true + code handler → reject", () => {
      expect(
        () =>
          new Operation(
            mkOpInit({
              affects: { mutations: [], adapter_writes: [], reads_only: true, destructive: false },
              handler: codeHandler,
            })
          )
      ).toThrow(OperationInvariantViolation);
    });

    test("reads_only=false + query handler → reject", () => {
      expect(
        () =>
          new Operation(
            mkOpInit({
              affects: { mutations: [], adapter_writes: [], reads_only: false, destructive: false },
              handler: queryHandler,
            })
          )
      ).toThrow(OperationInvariantViolation);
    });

    test("destructive=true without impact → reject", () => {
      expect(
        () =>
          new Operation(
            mkOpInit({
              affects: {
                mutations: ["bookmarks"],
                adapter_writes: [],
                destructive: true,
                reads_only: false,
              },
              handler: codeHandler,
              // impact 故意留空
            })
          )
      ).toThrow(OperationInvariantViolation);
    });

    test("destructive=true with impact → OK", () => {
      const op = new Operation(
        mkOpInit({
          affects: {
            mutations: ["bookmarks"],
            adapter_writes: [],
            destructive: true,
            reads_only: false,
          },
          handler: codeHandler,
          impact,
        })
      );
      expect(op.impact).toBeDefined();
    });

    test("invalid input CellType → reject", () => {
      const bad: InputSchema = {
        type: "record",
        fields: {
          id: { type: { kind: "vector", dim: -1 } as CellType, required: true },
        },
      };
      expect(() =>
        new Operation(mkOpInit({ input: bad }))
      ).toThrow(OperationInvariantViolation);
    });

    test("empty / non-string id in affects.mutations → reject", () => {
      expect(() =>
        new Operation(
          mkOpInit({
            affects: {
              mutations: [""],
              adapter_writes: [],
              reads_only: false,
              destructive: false,
            },
          })
        )
      ).toThrow(OperationInvariantViolation);
    });
  });

  describe("canonical examples", () => {
    test("delete_bookmark (destructive + code)", () => {
      const op = new Operation({
        id: "delete_bookmark",
        app_id: "ai-bookmarks",
        name: "删除书签",
        description: "从 timeline 和 graph 中永久移除 bookmark 及全部解读",
        input: {
          type: "record",
          fields: {
            bookmark_id: {
              type: { kind: "ref-row", table: "bookmarks" },
              required: true,
            },
          },
        },
        output: { kind: "void" },
        affects: {
          mutations: ["bookmarks", "interpretations"],
          adapter_writes: [],
          destructive: true,
          reads_only: false,
        },
        handler: { kind: "code", ref: "./operations/delete_bookmark.ts" },
        impact: {
          compute: { kind: "code", ref: "./operations/delete_bookmark.impact.ts" },
          disclosure_template:
            "将删除 bookmark 「{{bookmark.title}}」及其 {{interpretation_count}} 条解读",
        },
      });
      expect(op.isQuery()).toBe(false);
      expect(op.requiresConfirmation()).toBe(true);
    });

    test("recent_pending_bookmarks (query)", () => {
      const op = new Operation({
        id: "recent_pending_bookmarks",
        app_id: "ai-bookmarks",
        name: "最近待处理书签",
        description: "过去 N 天内 status=pending 的 bookmark",
        input: {
          type: "record",
          fields: {
            days: { type: { kind: "primitive", of: "Number" }, default: 7 },
          },
        },
        output: { kind: "row-list", row_type: "bookmarks" },
        affects: {
          mutations: [],
          adapter_writes: [],
          reads_only: true,
          destructive: false,
        },
        handler: {
          kind: "query",
          on: "bookmarks",
          pagination: { kind: "cursor", size: 25 },
        },
      });
      expect(op.isQuery()).toBe(true);
      expect(op.requiresConfirmation()).toBe(false);
    });
  });

  describe("requiresConfirmation", () => {
    test("default: destructive → require", () => {
      const op = new Operation(
        mkOpInit({
          affects: {
            mutations: ["t"],
            adapter_writes: [],
            destructive: true,
            reads_only: false,
          },
          impact,
        })
      );
      expect(op.requiresConfirmation()).toBe(true);
    });

    test("explicit confirm_dialog: false overrides", () => {
      const op = new Operation(
        mkOpInit({
          affects: {
            mutations: ["t"],
            adapter_writes: [],
            destructive: true,
            reads_only: false,
          },
          impact,
          ui_binding: { confirm_dialog: false },
        })
      );
      expect(op.requiresConfirmation()).toBe(false);
    });

    test("non-destructive → no confirm", () => {
      const op = new Operation(mkOpInit());
      expect(op.requiresConfirmation()).toBe(false);
    });
  });
});
