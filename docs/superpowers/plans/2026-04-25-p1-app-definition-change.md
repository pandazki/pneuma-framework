# P1 App Definition Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Builder (through a Build-phase Agent) add a new column to an existing stored Table by invoking a framework-injected `add_table_column` Operation — the row persists in a system-owned `pneuma_table_columns` Table, the change is recorded in `app_history`, and a subsequent `bootAppRuntime` picks the column up onto the in-memory Table so writes that use the new column validate against the normal schema path.

**Architecture:** Introduce one narrow system-owned Table (`pneuma_table_columns`) that stores column additions as Rows, following the IdentityRegistry precedent of many-narrow-tables over one-JSON-blob-table. Frameworks inject this Table plus an `add_table_column` Operation into every `AppConfig` at boot via a `applyFrameworkInjections(config)` helper in `packages/runtime`. The handler validates (reserved names, CellType legality, no-duplicate, existing target table), writes the Row, and appends a snapshot to `app_history` — flipping on the previously dormant `app_history` schema. A new `applyDefinitionOverlay(runtime)` step runs between construction and HTTP-serving to read the Rows and call `Table.addColumn` on matching base tables, so the overlay becomes effective on the next boot. P1 intentionally does NOT restart — the in-memory Table in the process that invoked `add_table_column` stays unchanged; P2's future `definition.apply` will bundle add + restart + refetch into one transaction.

**Tech Stack:** TypeScript + Bun, `bun:sqlite`, existing `packages/core-domain` aggregates (Table, Operation, StorageService, BunSqliteAppHistoryStore), existing `packages/runtime` AppRuntime + HTTP layer. No new npm dependencies.

---

## Design Decisions (already pinned, don't re-debate)

1. **`pneuma_table_columns` is narrow.** One row per column addition. Future definition kinds (operations, lenses, transforms, policies) each get their own `pneuma_definition_*` Table. This follows the IdentityRegistry precedent (3 narrow Tables, not 1 JSON-blob Table). Rejected: generic `pneuma_definition_entries` with `{ kind, payload: JSON }` shape.

2. **`add_table_column` is a framework-injected Operation**, not a lifecycle tool.
   - Auto-merged into every `AppConfig.operations` at boot via `applyFrameworkInjections(config)` in runtime.
   - Same pipeline as template ops: PolicyEvaluator check, audit events, MCP bridge exposure via `/api/config`, confirmation gate.
   - `affects: { mutations: ["pneuma_table_columns"], adapter_writes: [], reads_only: false, destructive: false }`.
   - Future P2's `definition.apply` will be a lifecycle tool that orchestrates `add_table_column` + stop + start + `##pneuma:service-ready` wait + `/api/config` refetch, but that's out of P1 scope.

3. **P1 does NOT restart.** After `add_table_column` returns, the Row exists in `pneuma_table_columns` but the in-memory `bookmarks` Table in this process does NOT have the new column. The column becomes effective only on the next `bootAppRuntime(config)`. Acceptance check is exactly this boot-time pickup.

4. **P1 does NOT change the viewer.** No UI work. Acceptance criterion "a row write using `tags` is validated by the normal schema/CellType path" is a storage-layer check, not a UI check.

5. **`app_history` writes snapshot-only** for P1. Payload: `{ kind: "pneuma_table_columns_snapshot", rows: [<all pneuma_table_columns rows after this write, lightly serialized>] }`. Delta writing is deferred until real usage approaches `SNAPSHOT_FREQUENCY = 10`.

## Key Risks

- **Table mutation after construction.** `Table.addColumn(col)` exists and mutates an internal `_columns` array (verified at `packages/core-domain/src/aggregates/table.ts:117-120`). `system_owned` Tables reject the call. `bookmarks` in `ai-bookmarks-core-domain` is NOT `system_owned`, so this works. The overlay must be applied AFTER construction but BEFORE any handler sees the Table (we solve this by running `applyDefinitionOverlay` inside `bootAppRuntime`'s async path, after the constructor but before returning).
- **Framework Operation `app_id` binding.** `Operation` constructor requires a concrete `app_id`. We handle this with a factory function `createAddTableColumnOp(app_id: string): Operation` invoked at inject time with `config.app_id`.
- **Bootstrap ordering.** `pneuma_table_columns` must be in `config.tables` BEFORE the storage layer is built, so reading the Rows back works. `applyFrameworkInjections` runs first (adds the Table), then the `AppRuntime` constructor seeds it into the `InMemoryRepository<Table>`, then `applyDefinitionOverlay` reads the Rows from SQLite. Plan Tasks 5, 6, 7 make this sequence explicit.
- **Reserved column names differ from what controller first wrote.** The actual `RESERVED_COLUMN_NAMES` in `table.ts:7-12` is `["id", "created_at", "updated_at", "owner_id"]` — NOT `_version` / `_created_at` / `_updated_at`. The plan uses the real names.
- **No existing `operations.length === N` assertion**. Verified via repo-wide grep: no test hard-codes a length that would break when framework-injected ops arrive.

---

## File Structure

### Created

- `packages/core-domain/src/lifecycle/pneuma-table-columns.ts` — system-owned Table factory + Entry↔Row codec.
- `packages/core-domain/test/lifecycle/pneuma-table-columns.test.ts` — unit tests for Table shape + round-trip.
- `packages/runtime/src/framework-operations.ts` — `createAddTableColumnOp(app_id)` + handler factory + policy rule helper + `applyFrameworkInjections(config)` merge helper.
- `packages/runtime/test/framework-operations.test.ts` — unit tests for the Operation + handler validations + injection merge.
- `packages/runtime/src/definition-loader.ts` — `applyDefinitionOverlay(runtime): Promise<void>` reads `pneuma_table_columns` rows and calls `Table.addColumn`.
- `packages/runtime/test/definition-loader.test.ts` — unit tests for overlay apply.
- `packages/runtime/test/app-definition-change.test.ts` — cross-restart integration test (boot → POST add_table_column → close → re-boot → assert column present → write row with new column).
- `examples/p1-definition-change-demo/run.ts` — developer-facing end-to-end demo script.
- `examples/p1-definition-change-demo/package.json` — workspace + bun script.
- `examples/p1-definition-change-demo/README.md` — short "what this demonstrates" note.

### Modified

- `packages/core-domain/src/index.ts` — re-export pneuma_table_columns helpers.
- `packages/core-domain/src/services/operation-executor.ts` — extend `HandlerServices` with optional `history?: AppHistoryStore` field so framework handlers can append history entries.
- `packages/runtime/src/runtime.ts` — (a) call `applyFrameworkInjections(config)` before constructor; (b) thread `this.history` into `services.history`; (c) `bootAppRuntime` awaits `applyDefinitionOverlay` before returning.
- `packages/runtime/src/index.ts` — re-export `applyFrameworkInjections` and `applyDefinitionOverlay` for tests / consumers.
- `docs/architecture/adr/0017-rollback-data-semantics.md` — append dated amendment noting `app_history` is now actively written; P1 uses snapshot-only.
- `docs/architecture/adr/0018-operations-as-primitive.md` — append dated amendment noting framework-injected Operations (`add_table_column` is the first).
- `docs/architecture/OPEN-QUESTIONS.md` — bump amendment count 12 → 14; note main-line D (Phase 3 P1) started.

---

## Task 1: `pneuma_table_columns` system-owned Table factory

**Files:**
- Create: `packages/core-domain/src/lifecycle/pneuma-table-columns.ts`
- Create: `packages/core-domain/test/lifecycle/pneuma-table-columns.test.ts`

### - [ ] Step 1: Write failing test

Create `packages/core-domain/test/lifecycle/pneuma-table-columns.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import {
  createPneumaTableColumnsTable,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
} from "../../src/lifecycle/pneuma-table-columns.js";

describe("createPneumaTableColumnsTable", () => {
  test("returns a system-owned Table with the expected shape", () => {
    const t = createPneumaTableColumnsTable("ai-bookmarks");
    expect(t.id).toBe(PNEUMA_TABLE_COLUMNS_TABLE_ID);
    expect(t.id).toBe("pneuma_table_columns");
    expect(t.app_id).toBe("ai-bookmarks");
    expect(t.system_owned).toBe(true);
    expect(t.source.kind).toBe("stored");
    const names = t.columns.map((c) => c.name).sort();
    expect(names).toEqual(
      [
        "table_id",
        "column_name",
        "cell_type",
        "nullable",
        "default_value",
        "created_by",
        "created_by_kind",
        "definition_version",
      ].sort(),
    );
  });

  test("cell_type column is json", () => {
    const t = createPneumaTableColumnsTable("app");
    const ct = t.columns.find((c) => c.name === "cell_type")!;
    expect(ct.type.kind).toBe("json");
  });

  test("default_value column is json and nullable", () => {
    const t = createPneumaTableColumnsTable("app");
    const ct = t.columns.find((c) => c.name === "default_value")!;
    expect(ct.type.kind).toBe("json");
    expect(ct.nullable).toBe(true);
  });

  test("system_owned Table rejects addColumn", () => {
    const t = createPneumaTableColumnsTable("app");
    expect(() =>
      t.addColumn({ name: "extra", type: { kind: "primitive", of: "Text" } }),
    ).toThrow();
  });
});
```

### - [ ] Step 2: Run to verify failure

Run: `bun test packages/core-domain/test/lifecycle/pneuma-table-columns.test.ts`
Expected: FAIL with `Cannot find module '.../pneuma-table-columns.js'`.

### - [ ] Step 3: Implement the factory

Create `packages/core-domain/src/lifecycle/pneuma-table-columns.ts`:

```typescript
// pneuma_table_columns — system-owned Table holding Builder-authored column additions.
// Each row represents one "add this column to this existing stored Table" declaration.
// Follows the IdentityRegistry precedent of narrow many-table definition storage.
//
// Mirrors the P1 §Design Decisions in the plan:
// - narrow (one row per column addition), not a JSON-blob generic entry
// - system_owned so `addColumn` on itself is locked
// - definition_version monotonically increasing per target table_id

import { Table } from "../aggregates/table.js";
import type { CellType } from "../value-objects/cell-type.js";

export const PNEUMA_TABLE_COLUMNS_TABLE_ID = "pneuma_table_columns";

const TEXT: CellType = { kind: "primitive", of: "Text" };
const NUMBER: CellType = { kind: "primitive", of: "Number" };
const BOOL: CellType = { kind: "primitive", of: "Bool" };
const JSON_T: CellType = { kind: "json" };

/**
 * Construct the system-owned `pneuma_table_columns` Table for the given app_id.
 *
 * Columns:
 *   - table_id            (Text)   : which base Table this column targets
 *   - column_name         (Text)   : the new column's name
 *   - cell_type           (json)   : serialized CellType (e.g. { kind: "primitive", of: "Text" })
 *   - nullable            (Bool)   : whether the new column is nullable
 *   - default_value       (json?)  : optional default (null if absent)
 *   - created_by          (Text)   : actor_id from PermissionContext
 *   - created_by_kind     (Text)   : "builder" | "agent" | "framework" (actor_kind)
 *   - definition_version  (Number) : monotonically increasing per-target-table version
 */
export function createPneumaTableColumnsTable(app_id: string): Table {
  return new Table({
    id: PNEUMA_TABLE_COLUMNS_TABLE_ID,
    app_id,
    system_owned: true,
    source: { kind: "stored" },
    columns: [
      { name: "table_id", type: TEXT },
      { name: "column_name", type: TEXT },
      { name: "cell_type", type: JSON_T },
      { name: "nullable", type: BOOL },
      { name: "default_value", type: JSON_T, nullable: true },
      { name: "created_by", type: TEXT },
      { name: "created_by_kind", type: TEXT },
      { name: "definition_version", type: NUMBER },
    ],
  });
}
```

### - [ ] Step 4: Run tests to verify pass

Run: `bun test packages/core-domain/test/lifecycle/pneuma-table-columns.test.ts`
Expected: all 4 tests PASS.

### - [ ] Step 5: Typecheck core-domain

Run: `tsc --noEmit -p packages/core-domain/tsconfig.json`
Expected: no errors.

### - [ ] Step 6: Commit

```bash
git add packages/core-domain/src/lifecycle/pneuma-table-columns.ts packages/core-domain/test/lifecycle/pneuma-table-columns.test.ts
git commit -m "$(cat <<'EOF'
feat(core-domain): pneuma_table_columns system-owned Table factory

First system-owned definition Table (Phase 3 P1). Each row represents one
Builder-authored "add this column to this existing stored Table" declaration.
Mirrors IdentityRegistry's narrow-many-table precedent; rejected a generic
JSON-blob definition entry shape.

Columns: table_id, column_name, cell_type (json), nullable, default_value
(json?), created_by, created_by_kind, definition_version (monotonic per
target table_id).

Subsequent tasks wire the framework-injected `add_table_column` Operation
(T3/T4), the injection merge helper (T5), and the boot-time overlay loader
(T7) that reads these rows and calls Table.addColumn on base tables.
EOF
)"
```

---

## Task 2: Entry ↔ Row codec for `pneuma_table_columns`

**Files:**
- Modify: `packages/core-domain/src/lifecycle/pneuma-table-columns.ts`
- Modify: `packages/core-domain/test/lifecycle/pneuma-table-columns.test.ts` (append tests)
- Modify: `packages/core-domain/src/index.ts` (re-exports)

### - [ ] Step 1: Write failing tests for the codec

Append to `packages/core-domain/test/lifecycle/pneuma-table-columns.test.ts`:

```typescript
import {
  pneumaTableColumnEntryToRow,
  rowToPneumaTableColumnEntry,
  type PneumaTableColumnEntry,
} from "../../src/lifecycle/pneuma-table-columns.js";

describe("PneumaTableColumnEntry ↔ Row round-trip", () => {
  test("entry with all fields round-trips through Row", () => {
    const entry: PneumaTableColumnEntry = {
      id: "ptc-abc123",
      app_id: "ai-bookmarks",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
      default_value: "",
      created_by: "agent:builder-01",
      created_by_kind: "agent",
      definition_version: 1,
    };
    const row = pneumaTableColumnEntryToRow(entry);
    const back = rowToPneumaTableColumnEntry(row);
    expect(back).toEqual(entry);
  });

  test("entry with missing default_value encodes null cell and decodes undefined", () => {
    const entry: PneumaTableColumnEntry = {
      id: "ptc-no-default",
      app_id: "app",
      table_id: "items",
      column_name: "label",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: false,
      created_by: "builder:u1",
      created_by_kind: "builder",
      definition_version: 1,
    };
    const row = pneumaTableColumnEntryToRow(entry);
    const back = rowToPneumaTableColumnEntry(row);
    expect(back.default_value).toBeUndefined();
  });

  test("decoding rejects rows from a different table", () => {
    // Construct a Row against a different table_id — should throw on decode
    const { Row } = require("../../src/aggregates/row.js") as typeof import("../../src/aggregates/row.js");
    const wrong = new Row({
      id: "bad",
      table_id: "bookmarks",
      app_id: "app",
      cells: { url: "x" },
    });
    expect(() => rowToPneumaTableColumnEntry(wrong)).toThrow();
  });
});
```

### - [ ] Step 2: Run to verify failure

Run: `bun test packages/core-domain/test/lifecycle/pneuma-table-columns.test.ts`
Expected: FAIL with import errors for the new exports.

### - [ ] Step 3: Implement the codec

Append to `packages/core-domain/src/lifecycle/pneuma-table-columns.ts`:

```typescript
import { Row } from "../aggregates/row.js";
import type { ActorKind } from "./app-history.js";

/**
 * Domain-facing entry shape for one row of `pneuma_table_columns`.
 * Stored as a Row under that Table; this struct is the decoded form.
 */
export interface PneumaTableColumnEntry {
  readonly id: string;
  readonly app_id: string;
  readonly table_id: string;
  readonly column_name: string;
  readonly cell_type: CellType;
  readonly nullable: boolean;
  /** Undefined when not declared. Encoded as null in the Row cell. */
  readonly default_value?: unknown;
  readonly created_by: string;
  readonly created_by_kind: ActorKind;
  readonly definition_version: number;
}

/** Convert a decoded entry to a Row for persistence via StorageService.saveRow. */
export function pneumaTableColumnEntryToRow(entry: PneumaTableColumnEntry): Row {
  return new Row({
    id: entry.id,
    table_id: PNEUMA_TABLE_COLUMNS_TABLE_ID,
    app_id: entry.app_id,
    cells: {
      table_id: entry.table_id,
      column_name: entry.column_name,
      cell_type: entry.cell_type as unknown,
      nullable: entry.nullable,
      // Null is valid for the `default_value` json cell (Table declares nullable: true).
      default_value: entry.default_value ?? null,
      created_by: entry.created_by,
      created_by_kind: entry.created_by_kind,
      definition_version: entry.definition_version,
    },
  });
}

/**
 * Decode a Row back into the domain entry. Throws if the Row is not for
 * `pneuma_table_columns` or required cells are missing / malformed.
 */
export function rowToPneumaTableColumnEntry(row: Row): PneumaTableColumnEntry {
  if (row.table_id !== PNEUMA_TABLE_COLUMNS_TABLE_ID) {
    throw new Error(
      `rowToPneumaTableColumnEntry: row.table_id is '${row.table_id}', expected '${PNEUMA_TABLE_COLUMNS_TABLE_ID}'`,
    );
  }
  const table_id = row.getCell("table_id");
  const column_name = row.getCell("column_name");
  const cell_type = row.getCell("cell_type");
  const nullable = row.getCell("nullable");
  const default_value = row.getCell("default_value");
  const created_by = row.getCell("created_by");
  const created_by_kind = row.getCell("created_by_kind");
  const definition_version = row.getCell("definition_version");

  if (typeof table_id !== "string" || typeof column_name !== "string") {
    throw new Error(`rowToPneumaTableColumnEntry: missing table_id/column_name on row ${row.id}`);
  }
  if (typeof nullable !== "boolean") {
    throw new Error(`rowToPneumaTableColumnEntry: nullable must be boolean on row ${row.id}`);
  }
  if (typeof definition_version !== "number") {
    throw new Error(`rowToPneumaTableColumnEntry: definition_version must be number on row ${row.id}`);
  }
  if (typeof created_by !== "string" || typeof created_by_kind !== "string") {
    throw new Error(`rowToPneumaTableColumnEntry: created_by fields missing on row ${row.id}`);
  }

  return {
    id: row.id,
    app_id: row.app_id,
    table_id,
    column_name,
    cell_type: cell_type as CellType,
    nullable,
    default_value: default_value === null ? undefined : default_value,
    created_by,
    created_by_kind: created_by_kind as ActorKind,
    definition_version,
  };
}
```

### - [ ] Step 4: Re-export from core-domain index

Open `packages/core-domain/src/index.ts`. Find the section with existing `./lifecycle/` re-exports and add:

```typescript
export * from "./lifecycle/pneuma-table-columns.js";
```

### - [ ] Step 5: Run tests + typecheck

Run: `bun test packages/core-domain/test/lifecycle/pneuma-table-columns.test.ts`
Expected: all tests PASS (4 + 3 = 7).

Run: `bun test packages/core-domain`
Expected: all green.

Run: `tsc --noEmit -p packages/core-domain/tsconfig.json`
Expected: no errors.

### - [ ] Step 6: Commit

```bash
git add packages/core-domain/src/lifecycle/pneuma-table-columns.ts packages/core-domain/test/lifecycle/pneuma-table-columns.test.ts packages/core-domain/src/index.ts
git commit -m "$(cat <<'EOF'
feat(core-domain): PneumaTableColumnEntry ↔ Row codec

Domain-facing entry struct + round-trip codec for pneuma_table_columns rows.
ActorKind ("builder" | "agent" | "framework") aligns with app_history actor
categories. default_value encodes null when undefined (since the cell type
allows null).
EOF
)"
```

---

## Task 3: `add_table_column` Operation declaration

**Files:**
- Create: `packages/runtime/src/framework-operations.ts`
- Create: `packages/runtime/test/framework-operations.test.ts`

### - [ ] Step 1: Write failing test for the Operation shape

Create `packages/runtime/test/framework-operations.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import {
  createAddTableColumnOp,
  ADD_TABLE_COLUMN_OP_ID,
  ADD_TABLE_COLUMN_HANDLER_REF,
} from "../src/framework-operations.js";
import { PNEUMA_TABLE_COLUMNS_TABLE_ID } from "@pneuma-framework/core-domain";

describe("createAddTableColumnOp", () => {
  test("returns an Operation with the framework id and correct affects", () => {
    const op = createAddTableColumnOp("ai-bookmarks");
    expect(op.id).toBe(ADD_TABLE_COLUMN_OP_ID);
    expect(op.id).toBe("add_table_column");
    expect(op.app_id).toBe("ai-bookmarks");
    expect(op.affects.mutations).toEqual([PNEUMA_TABLE_COLUMNS_TABLE_ID]);
    expect(op.affects.adapter_writes).toEqual([]);
    expect(op.affects.reads_only).toBe(false);
    expect(op.affects.destructive).toBe(false);
  });

  test("input schema requires table_id, column_name, cell_type; optional nullable + default_value", () => {
    const op = createAddTableColumnOp("app");
    const fields = op.input.fields;
    expect(fields.table_id?.required).toBe(true);
    expect(fields.column_name?.required).toBe(true);
    expect(fields.cell_type?.required).toBe(true);
    expect(fields.nullable?.required).not.toBe(true);
    expect(fields.default_value?.required).not.toBe(true);
  });

  test("output is object with entry_id + definition_version fields", () => {
    const op = createAddTableColumnOp("app");
    expect(op.output.kind).toBe("object");
    if (op.output.kind === "object") {
      const schema = op.output.schema as {
        properties: Record<string, unknown>;
        required: string[];
      };
      expect(schema.properties.entry_id).toBeDefined();
      expect(schema.properties.definition_version).toBeDefined();
      expect(schema.required).toEqual(expect.arrayContaining(["entry_id", "definition_version"]));
    }
  });

  test("handler is a code ref with the framework prefix", () => {
    const op = createAddTableColumnOp("app");
    expect(op.handler.kind).toBe("code");
    if (op.handler.kind === "code") {
      expect(op.handler.ref).toBe(ADD_TABLE_COLUMN_HANDLER_REF);
      expect(op.handler.ref).toBe("framework://add_table_column");
    }
  });
});
```

### - [ ] Step 2: Run to verify failure

Run: `bun test packages/runtime/test/framework-operations.test.ts`
Expected: FAIL with module-not-found.

### - [ ] Step 3: Implement the Operation factory

Create `packages/runtime/src/framework-operations.ts`:

```typescript
// framework-operations.ts — Operations injected into every AppConfig by the runtime.
// First member: add_table_column (Phase 3 P1).
//
// Framework Operations share the Operation pipeline with template Operations
// (same PolicyEvaluator gate, audit events, /api/config exposure, MCP bridge
// visibility). The only difference is ownership: they're declared here, not
// in the template's config.ts.

import type {
  HandlerFn,
  Operation,
  AppHistoryStore,
} from "@pneuma-framework/core-domain";
import {
  Operation as OperationClass,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
} from "@pneuma-framework/core-domain";

export const ADD_TABLE_COLUMN_OP_ID = "add_table_column";
export const ADD_TABLE_COLUMN_HANDLER_REF = "framework://add_table_column";

/**
 * Build the `add_table_column` Operation for a concrete app_id.
 *
 * Input:
 *   - table_id       (Text, required)  : id of the existing stored Table to extend
 *   - column_name    (Text, required)  : name of the new column
 *   - cell_type      (json, required)  : serialized CellType (discriminated union)
 *   - nullable       (Bool, optional)  : default false
 *   - default_value  (json, optional)
 *
 * Output: { entry_id, definition_version }
 */
export function createAddTableColumnOp(app_id: string): Operation {
  const TEXT = { kind: "primitive", of: "Text" } as const;
  const BOOL = { kind: "primitive", of: "Bool" } as const;
  const JSON_T = { kind: "json" } as const;

  return new OperationClass({
    id: ADD_TABLE_COLUMN_OP_ID,
    app_id,
    name: "Add column to a stored Table",
    description:
      "Framework-injected Operation. Declares a new column on an existing stored Table by writing a row to pneuma_table_columns. The new column becomes effective on the next bootAppRuntime — this call does NOT restart.",
    input: {
      type: "record",
      fields: {
        table_id: { type: TEXT, required: true },
        column_name: { type: TEXT, required: true },
        cell_type: { type: JSON_T, required: true },
        nullable: { type: BOOL },
        default_value: { type: JSON_T },
      },
    },
    output: {
      kind: "object",
      schema: {
        type: "object",
        properties: {
          entry_id: { type: "string" },
          definition_version: { type: "number" },
        },
        required: ["entry_id", "definition_version"],
      },
    },
    affects: {
      mutations: [PNEUMA_TABLE_COLUMNS_TABLE_ID],
      adapter_writes: [],
      reads_only: false,
      destructive: false,
    },
    handler: { kind: "code", ref: ADD_TABLE_COLUMN_HANDLER_REF },
  });
}
```

### - [ ] Step 4: Run tests to verify pass

Run: `bun test packages/runtime/test/framework-operations.test.ts`
Expected: 4 tests PASS.

Run: `tsc --noEmit -p packages/runtime/tsconfig.json`
Expected: no errors.

### - [ ] Step 5: Commit

```bash
git add packages/runtime/src/framework-operations.ts packages/runtime/test/framework-operations.test.ts
git commit -m "$(cat <<'EOF'
feat(runtime): add_table_column framework Operation declaration

First framework-injected Operation (Phase 3 P1). Same pipeline as template
operations (policy / audit / /api/config / MCP bridge) with ownership in
packages/runtime. Operation id = "add_table_column"; handler ref namespaced
as "framework://add_table_column" so it cannot collide with
template-declared handler refs.

Output is `object` — returns { entry_id, definition_version }. affects
mutations = [pneuma_table_columns]; reads_only false; non-destructive.

The handler implementation lands in Task 4; the injection merge helper in
Task 5.
EOF
)"
```

---

## Task 4: `HandlerServices.history` + `add_table_column` handler

**Files:**
- Modify: `packages/core-domain/src/services/operation-executor.ts:38-47` (extend `HandlerServices`)
- Modify: `packages/runtime/src/framework-operations.ts` (append handler factory)
- Modify: `packages/runtime/test/framework-operations.test.ts` (append handler tests)

### - [ ] Step 1: Extend `HandlerServices` with optional `history`

Open `packages/core-domain/src/services/operation-executor.ts`. Find the `HandlerServices` interface (around line 38-47):

```typescript
export interface HandlerServices {
  readonly queryExec?: unknown;         // QueryExecutor — 不在这里 import 避免循环
  readonly transformRunner?: unknown;   // TransformRunner
  readonly adapterInvoker?: unknown;    // AdapterInvoker
}
```

Replace with:

```typescript
export interface HandlerServices {
  readonly queryExec?: unknown;         // QueryExecutor — 不在这里 import 避免循环
  readonly transformRunner?: unknown;   // TransformRunner
  readonly adapterInvoker?: unknown;    // AdapterInvoker
  /** AppHistoryStore — used by framework handlers that append history entries. */
  readonly history?: unknown;           // AppHistoryStore — typed `unknown` to avoid circular dep
}
```

### - [ ] Step 2: Typecheck

Run: `tsc --noEmit -p packages/core-domain/tsconfig.json`
Expected: no errors.

### - [ ] Step 3: Write failing tests for the handler

Append to `packages/runtime/test/framework-operations.test.ts`:

```typescript
import { createAddTableColumnHandler } from "../src/framework-operations.js";
import {
  Table,
  Row,
  StorageService,
  InMemoryRepository,
  BunSqliteRowRepository,
  BunSqliteAppHistoryStore,
  openRowDatabase,
  buildRootContext,
  pneumaTableColumnEntryToRow,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
  createPneumaTableColumnsTable,
  type AppHistoryStore,
  type CellType,
} from "@pneuma-framework/core-domain";
import { Database } from "bun:sqlite";

function bootHandlerTestBed(app_id: string) {
  const rowDb = openRowDatabase(":memory:");
  const historyDb = new Database(":memory:");
  const tables = new InMemoryRepository<Table>((t) => t.id);
  const rows = new BunSqliteRowRepository(rowDb);
  // Target Table (a non-system stored table)
  const bookmarks = new Table({
    id: "bookmarks",
    app_id,
    source: { kind: "stored" },
    columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
  });
  // Framework Table
  const ptc = createPneumaTableColumnsTable(app_id);
  void tables.save(bookmarks);
  void tables.save(ptc);
  const storage = new StorageService(tables, rows);
  const history: AppHistoryStore = new BunSqliteAppHistoryStore(historyDb);
  const handler = createAddTableColumnHandler();
  return { handler, storage, history, rowDb, historyDb, bookmarks };
}

function agentCtx(app_id: string) {
  return buildRootContext({
    app_id,
    invoked_via: "agent",
    user: { id: "agent:builder-01", attrs: {}, roles: [] },
  });
}

describe("createAddTableColumnHandler", () => {
  test("happy path: writes row + appends snapshot history entry + returns entry_id/version", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-a");
    const result = (await handler({
      ctx: agentCtx("app-a"),
      input: {
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" } as CellType,
        nullable: true,
      },
      storage,
      services: { history },
    })) as { entry_id: string; definition_version: number };
    expect(typeof result.entry_id).toBe("string");
    expect(result.definition_version).toBe(1);

    // Row persisted
    const rows = await storage.listRowsByTable(PNEUMA_TABLE_COLUMNS_TABLE_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getCell("column_name")).toBe("tags");
    expect(rows[0]!.getCell("nullable")).toBe(true);

    // History appended (use listEntries with direction=desc + limit=1 to fetch the most recent)
    const entries = await history.listEntries("app-a", { direction: "desc", limit: 1 });
    const latest = entries[0];
    expect(latest).toBeDefined();
    expect(latest!.history_type).toBe("snapshot");
    expect(latest!.actor_kind).toBe("agent");
    expect(latest!.is_ai_generated).toBe(true);
    expect(latest!.operation_scope).toContain("table:bookmarks");
    expect(latest!.operation_scope).toContain("operation:add_table_column");
    const payload = latest!.payload as { kind: string; rows: unknown[] };
    expect(payload.kind).toBe("pneuma_table_columns_snapshot");
    expect(payload.rows).toHaveLength(1);
  });

  test("rejects reserved column name on stored table", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-b");
    await expect(
      handler({
        ctx: agentCtx("app-b"),
        input: {
          table_id: "bookmarks",
          column_name: "id", // reserved
          cell_type: { kind: "primitive", of: "Text" } as CellType,
        },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/reserved/i);
  });

  test("rejects duplicate column name on base table", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-c");
    await expect(
      handler({
        ctx: agentCtx("app-c"),
        input: {
          table_id: "bookmarks",
          column_name: "url", // already on base
          cell_type: { kind: "primitive", of: "Text" } as CellType,
        },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/already (exists|present)/i);
  });

  test("rejects invalid CellType", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-d");
    await expect(
      handler({
        ctx: agentCtx("app-d"),
        input: {
          table_id: "bookmarks",
          column_name: "broken",
          cell_type: { kind: "vector", dim: -1 } as CellType,
        },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/invalid.*CellType/i);
  });

  test("rejects unknown target table", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-e");
    await expect(
      handler({
        ctx: agentCtx("app-e"),
        input: {
          table_id: "missing_table",
          column_name: "foo",
          cell_type: { kind: "primitive", of: "Text" } as CellType,
        },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/table.*not.*found/i);
  });

  test("rejects non-stored target table", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-f");
    // Swap out bookmarks for a derived table under same id
    const tables = (storage as unknown as { tables: { save(t: Table): void } }).tables;
    const derived = new Table({
      id: "bookmarks",
      app_id: "app-f",
      source: { kind: "derived", expression: {} },
      columns: [],
    });
    tables.save(derived);
    await expect(
      handler({
        ctx: agentCtx("app-f"),
        input: {
          table_id: "bookmarks",
          column_name: "tags",
          cell_type: { kind: "primitive", of: "Text" } as CellType,
        },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/stored/i);
  });

  test("definition_version increments within a table_id", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-g");
    const r1 = (await handler({
      ctx: agentCtx("app-g"),
      input: {
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" } as CellType,
      },
      storage,
      services: { history },
    })) as { definition_version: number };
    const r2 = (await handler({
      ctx: agentCtx("app-g"),
      input: {
        table_id: "bookmarks",
        column_name: "summary",
        cell_type: { kind: "primitive", of: "RichText" } as CellType,
      },
      storage,
      services: { history },
    })) as { definition_version: number };
    expect(r1.definition_version).toBe(1);
    expect(r2.definition_version).toBe(2);
  });
});
```

### - [ ] Step 4: Run to verify failure

Run: `bun test packages/runtime/test/framework-operations.test.ts`
Expected: import errors for `createAddTableColumnHandler`.

### - [ ] Step 5: Implement the handler

Append to `packages/runtime/src/framework-operations.ts`:

```typescript
import {
  RESERVED_COLUMN_NAMES,
  isCellType,
  pneumaTableColumnEntryToRow,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
  rowToPneumaTableColumnEntry,
  type ActorKind,
  type CellType,
  type PermissionContext,
  type PneumaTableColumnEntry,
  type StorageService,
} from "@pneuma-framework/core-domain";

export function createAddTableColumnHandler(): HandlerFn {
  return async ({ ctx, input, storage, services }) => {
    const history = (services?.history ?? undefined) as AppHistoryStore | undefined;
    if (!history) {
      throw new Error(
        "add_table_column: AppHistoryStore must be provided via services.history (framework runtime wires this)",
      );
    }
    const i = input as {
      table_id?: unknown;
      column_name?: unknown;
      cell_type?: unknown;
      nullable?: unknown;
      default_value?: unknown;
    };

    // 1. Shape validation
    if (typeof i.table_id !== "string" || i.table_id.length === 0) {
      throw new Error(`add_table_column: input.table_id must be a non-empty string`);
    }
    if (typeof i.column_name !== "string" || i.column_name.length === 0) {
      throw new Error(`add_table_column: input.column_name must be a non-empty string`);
    }
    if (!isCellType(i.cell_type as CellType)) {
      throw new Error(
        `add_table_column: input.cell_type is not a valid CellType (got ${JSON.stringify(i.cell_type).slice(0, 120)})`,
      );
    }
    const cell_type = i.cell_type as CellType;
    const nullable = i.nullable === true;

    // 2. Target table existence + kind check
    const target = await storage.getTable(i.table_id);
    if (!target) {
      throw new Error(`add_table_column: target table "${i.table_id}" not found`);
    }
    if (target.source.kind !== "stored") {
      throw new Error(
        `add_table_column: target table "${i.table_id}" is not stored (source=${target.source.kind})`,
      );
    }

    // 3. Reserved + duplicate-name checks (mirror Table.addColumn invariants — do NOT mutate the in-memory Table here)
    if (RESERVED_COLUMN_NAMES.has(i.column_name)) {
      throw new Error(
        `add_table_column: column name "${i.column_name}" is reserved for stored tables`,
      );
    }
    if (target.hasColumn(i.column_name)) {
      throw new Error(
        `add_table_column: column "${i.column_name}" already exists on "${i.table_id}"`,
      );
    }

    // 4. Load current pneuma_table_columns rows (for duplicate-against-overlay + snapshot + version)
    const existing = await storage.listRowsByTable(PNEUMA_TABLE_COLUMNS_TABLE_ID);
    const existingEntries = existing.map(rowToPneumaTableColumnEntry);
    for (const e of existingEntries) {
      if (e.table_id === i.table_id && e.column_name === i.column_name) {
        throw new Error(
          `add_table_column: column "${i.column_name}" already present on "${i.table_id}" in pneuma_table_columns (entry ${e.id})`,
        );
      }
    }
    const versionsForTarget = existingEntries
      .filter((e) => e.table_id === i.table_id)
      .map((e) => e.definition_version);
    const nextVersion = versionsForTarget.length > 0 ? Math.max(...versionsForTarget) + 1 : 1;

    // 5. Persist the entry
    const actor_id = ctx.user?.id ?? "anonymous";
    const actor_kind = actorKindFromInvokedVia(ctx.invoked_via);
    const entryId = newEntryId();
    const entry: PneumaTableColumnEntry = {
      id: entryId,
      app_id: ctx.app_id,
      table_id: i.table_id,
      column_name: i.column_name,
      cell_type,
      nullable,
      default_value: i.default_value,
      created_by: actor_id,
      created_by_kind: actor_kind,
      definition_version: nextVersion,
    };
    await storage.saveRow(pneumaTableColumnEntryToRow(entry));

    // 6. Append app_history snapshot (P1: snapshot-only, no delta yet)
    const allEntriesAfter = [...existingEntries, entry].map(serializeEntryForSnapshot);
    await history.append({
      app_id: ctx.app_id,
      history_type: "snapshot",
      payload: {
        kind: "pneuma_table_columns_snapshot",
        rows: allEntriesAfter,
      },
      is_ai_generated: actor_kind === "agent",
      actor_id,
      actor_kind,
      description: `Added column '${i.column_name}' to table '${i.table_id}'`,
      operation_scope: [`table:${i.table_id}`, "operation:add_table_column"],
    });

    return { entry_id: entryId, definition_version: nextVersion };
  };
}

function actorKindFromInvokedVia(invoked_via: PermissionContext["invoked_via"]): ActorKind {
  // Map PermissionContext.invoked_via (six values) down to the three ActorKinds used by app_history.
  if (invoked_via === "agent") return "agent";
  if (invoked_via === "system") return "framework";
  // ui / cli / webhook / (default) → builder
  return "builder";
}

function serializeEntryForSnapshot(e: PneumaTableColumnEntry): unknown {
  // Snapshot payload rows are lightly serialized; keep structure the same as the entry itself.
  return { ...e };
}

let _entryCounter = 0;
function newEntryId(): string {
  _entryCounter += 1;
  return `ptc-${Date.now().toString(36)}-${_entryCounter.toString(36)}`;
}
```

### - [ ] Step 6: Run tests + typecheck

Run: `bun test packages/runtime/test/framework-operations.test.ts`
Expected: all tests PASS (7 total: 4 from Task 3 + 7 from Task 4 — actually 4+7=11, update the number when the subagent counts).

Run: `bun test packages/core-domain`
Expected: all green (no regressions from `HandlerServices` change).

Run: `tsc --noEmit -p packages/core-domain/tsconfig.json`
Run: `tsc --noEmit -p packages/runtime/tsconfig.json`
Expected: no errors.

### - [ ] Step 7: Commit

```bash
git add packages/core-domain/src/services/operation-executor.ts packages/runtime/src/framework-operations.ts packages/runtime/test/framework-operations.test.ts
git commit -m "$(cat <<'EOF'
feat(runtime): add_table_column handler + HandlerServices.history

Handler validates and writes to pneuma_table_columns, then appends a
snapshot to app_history (flipping on the previously dormant schema).

Validation rules:
- table_id must be a non-empty string
- target Table must exist and have source.kind === "stored"
- column_name cannot be a reserved name (id, created_at, updated_at, owner_id)
- column_name cannot duplicate an existing column on the base table
- column_name cannot duplicate an existing overlay entry for the same table_id
- cell_type must pass isCellType

Side effects:
- Writes a Row to pneuma_table_columns with monotonic per-target
  definition_version
- Appends app_history snapshot with actor_kind derived from
  PermissionContext.invoked_via; is_ai_generated = actor_kind === "agent";
  operation_scope = [table:<id>, operation:add_table_column]

HandlerServices.history (optional AppHistoryStore) was added so framework
handlers can reach the store. Template handlers keep working because the
field is optional.

The in-memory Table is NOT mutated by this handler. The column becomes
effective only on the next bootAppRuntime — P2 will add the restart
orchestration.
EOF
)"
```

---

## Task 5: `applyFrameworkInjections` merge helper + policy rule

**Files:**
- Modify: `packages/runtime/src/framework-operations.ts` (append helper)
- Modify: `packages/runtime/test/framework-operations.test.ts` (append merge tests)

### - [ ] Step 1: Write failing test for the merge

Append to `packages/runtime/test/framework-operations.test.ts`:

```typescript
import {
  applyFrameworkInjections,
  ADD_TABLE_COLUMN_OP_ID,
} from "../src/framework-operations.js";
import { PolicySet, Subjects, Resources } from "@pneuma-framework/core-domain";
import type { AppConfig } from "../src/types.js";

function baseConfig(app_id: string): AppConfig {
  const policy = new PolicySet({ app_id });
  return {
    app_id,
    tables: [],
    operations: [],
    policy,
    handlers: {},
  };
}

describe("applyFrameworkInjections", () => {
  test("merges pneuma_table_columns Table into config.tables", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-1"));
    const ids = merged.tables.map((t) => t.id);
    expect(ids).toContain("pneuma_table_columns");
  });

  test("merges add_table_column Operation into config.operations", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-2"));
    const ids = merged.operations.map((o) => o.id);
    expect(ids).toContain(ADD_TABLE_COLUMN_OP_ID);
  });

  test("merges add_table_column handler into config.handlers", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-3"));
    expect(merged.handlers["framework://add_table_column"]).toBeTypeOf("function");
  });

  test("merges allow-all policy rule for add_table_column into config.policy", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-4"));
    const compiled = merged.policy.compile();
    // Existence check: there must be at least one rule on operation:add_table_column
    const rules = (merged.policy as unknown as { rules: Array<{ on: unknown }> }).rules;
    const match = rules.some((r) => {
      const on = r.on as { kind?: string; id?: string };
      return on.kind === "operation" && on.id === ADD_TABLE_COLUMN_OP_ID;
    });
    expect(match).toBe(true);
    void compiled; // compiled is smoke-checked above; rules array is the authoritative source
  });

  test("does not double-inject if already present (idempotent)", () => {
    const once = applyFrameworkInjections(baseConfig("app-merge-5"));
    const twice = applyFrameworkInjections(once);
    const tableIds = twice.tables.map((t) => t.id);
    expect(tableIds.filter((id) => id === "pneuma_table_columns")).toHaveLength(1);
    const opIds = twice.operations.map((o) => o.id);
    expect(opIds.filter((id) => id === ADD_TABLE_COLUMN_OP_ID)).toHaveLength(1);
  });
});
```

### - [ ] Step 2: Run to verify failure

Run: `bun test packages/runtime/test/framework-operations.test.ts`
Expected: FAIL with import missing `applyFrameworkInjections`.

### - [ ] Step 3: Implement the merge helper

Append to `packages/runtime/src/framework-operations.ts`:

```typescript
import type { AppConfig } from "./types.js";
import {
  PolicySet,
  Subjects,
  Resources,
  createPneumaTableColumnsTable,
} from "@pneuma-framework/core-domain";

/**
 * Merge framework-provided Tables, Operations, handlers, and policy rules
 * into a user-supplied AppConfig. Idempotent — calling twice yields the
 * same effective config.
 *
 * Injections (Phase 3 P1):
 *   - Table `pneuma_table_columns` (system-owned, stored)
 *   - Operation `add_table_column`
 *   - Handler `framework://add_table_column`
 *   - PolicyRule allowing anyone (including anonymous) to invoke
 *     `operation:add_table_column` (MVP — Phase 3 P2 will tighten
 *     once proper Builder attribution lands)
 */
export function applyFrameworkInjections(config: AppConfig): AppConfig {
  // Tables
  const tables = [...config.tables];
  if (!tables.some((t) => t.id === PNEUMA_TABLE_COLUMNS_TABLE_ID)) {
    tables.push(createPneumaTableColumnsTable(config.app_id));
  }

  // Operations
  const operations = [...config.operations];
  if (!operations.some((o) => o.id === ADD_TABLE_COLUMN_OP_ID)) {
    operations.push(createAddTableColumnOp(config.app_id));
  }

  // Handlers
  const handlers = {
    ...config.handlers,
    [ADD_TABLE_COLUMN_HANDLER_REF]: createAddTableColumnHandler(),
  };

  // Policy rule (idempotent — only add if missing)
  const policy = ensureFrameworkPolicyRules(config.policy, config.app_id);

  return {
    ...config,
    tables,
    operations,
    handlers,
    policy,
  };
}

function ensureFrameworkPolicyRules(policy: PolicySet, app_id: string): PolicySet {
  // Read existing rules (readonly-ish — we construct a new PolicySet if missing).
  // PolicySet internal shape: `rules: PolicyRule[]`. We use addRule if the
  // target rule isn't already present.
  const existingRules = (policy as unknown as { rules: Array<{ on: unknown }> }).rules;
  const hasRule = existingRules.some((r) => {
    const on = r.on as { kind?: string; id?: string };
    return on.kind === "operation" && on.id === ADD_TABLE_COLUMN_OP_ID;
  });
  if (hasRule) return policy;
  policy.addRule({
    id: `framework-allow-${ADD_TABLE_COLUMN_OP_ID}`,
    allow: [Subjects.anyone(), Subjects.anonymous()],
    do: ["invoke"],
    on: Resources.operation(ADD_TABLE_COLUMN_OP_ID),
  });
  void app_id;
  return policy;
}
```

### - [ ] Step 4: Run tests + typecheck

Run: `bun test packages/runtime/test/framework-operations.test.ts`
Expected: all tests PASS (additional 5 merge tests).

Run: `tsc --noEmit -p packages/runtime/tsconfig.json`
Expected: no errors.

### - [ ] Step 5: Re-export from runtime index

Open `packages/runtime/src/index.ts`. Append:

```typescript
export {
  applyFrameworkInjections,
  createAddTableColumnOp,
  createAddTableColumnHandler,
  ADD_TABLE_COLUMN_OP_ID,
  ADD_TABLE_COLUMN_HANDLER_REF,
} from "./framework-operations.js";
```

### - [ ] Step 6: Commit

```bash
git add packages/runtime/src/framework-operations.ts packages/runtime/test/framework-operations.test.ts packages/runtime/src/index.ts
git commit -m "$(cat <<'EOF'
feat(runtime): applyFrameworkInjections merge helper

Framework-owned Tables / Operations / handlers / policy rules merged into
the caller's AppConfig. Idempotent. First injections (Phase 3 P1):

- Table pneuma_table_columns (system-owned, stored)
- Operation add_table_column
- Handler framework://add_table_column
- PolicyRule allowing anyone-and-anonymous to invoke
  operation:add_table_column (MVP posture; Phase 3 P2 will tighten once
  proper Builder attribution lands)

The merge is additive — templates that already declare any of these IDs
are left alone. bootAppRuntime calls this helper in Task 6.
EOF
)"
```

---

## Task 6: Wire `applyFrameworkInjections` into `bootAppRuntime` + thread `history` into services

**Files:**
- Modify: `packages/runtime/src/runtime.ts` (constructor + bootAppRuntime)

### - [ ] Step 1: Write failing test for the boot integration

Append to `packages/runtime/test/framework-operations.test.ts`:

```typescript
import { bootAppRuntime } from "../src/runtime.js";

describe("bootAppRuntime + framework injections", () => {
  test("booted runtime exposes pneuma_table_columns Table", async () => {
    const runtime = await bootAppRuntime(baseConfig("app-boot-1"));
    const t = await runtime.tables.get("pneuma_table_columns");
    expect(t).toBeDefined();
    expect(t!.system_owned).toBe(true);
    await runtime.close();
  });

  test("booted runtime lists add_table_column Operation via listOperations()", async () => {
    const runtime = await bootAppRuntime(baseConfig("app-boot-2"));
    const ids = runtime.listOperations().map((o) => o.id);
    expect(ids).toContain(ADD_TABLE_COLUMN_OP_ID);
    await runtime.close();
  });

  test("invoking add_table_column via runtime.executor actually writes to pneuma_table_columns", async () => {
    const base = baseConfig("app-boot-3");
    base.tables.push(
      new (require("@pneuma-framework/core-domain").Table)({
        id: "items",
        app_id: "app-boot-3",
        source: { kind: "stored" },
        columns: [{ name: "label", type: { kind: "primitive", of: "Text" } }],
      }),
    );
    const runtime = await bootAppRuntime(base);
    const op = runtime.getOperation(ADD_TABLE_COLUMN_OP_ID)!;
    const ctx = (require("@pneuma-framework/core-domain").buildRootContext as any)({
      app_id: "app-boot-3",
      invoked_via: "agent",
      user: { id: "agent:x", attrs: {}, roles: [] },
    });
    const result = await runtime.executor.invoke(
      op,
      { table_id: "items", column_name: "color", cell_type: { kind: "primitive", of: "Text" } },
      ctx,
    );
    const output = result.output as { entry_id: string; definition_version: number };
    expect(output.entry_id).toMatch(/^ptc-/);
    expect(output.definition_version).toBe(1);
    const rows = await runtime.storage.listRowsByTable("pneuma_table_columns");
    expect(rows).toHaveLength(1);
    await runtime.close();
  });
});
```

### - [ ] Step 2: Run to verify failure

Run: `bun test packages/runtime/test/framework-operations.test.ts`
Expected: the three new tests FAIL because `bootAppRuntime` hasn't been updated to apply injections nor thread `history` into services yet. Likely failure: "handler_not_registered" or "policy_denied".

### - [ ] Step 3: Update `bootAppRuntime` to inject + thread history

Open `packages/runtime/src/runtime.ts`. Find the existing `bootAppRuntime` export (near the end of the file, around line 199):

```typescript
export async function bootAppRuntime(config: AppConfig): Promise<AppRuntime> {
  return new AppRuntime(config);
}
```

Replace with:

```typescript
import { applyFrameworkInjections } from "./framework-operations.js";

export async function bootAppRuntime(config: AppConfig): Promise<AppRuntime> {
  const merged = applyFrameworkInjections(config);
  const runtime = new AppRuntime(merged);
  return runtime;
}
```

(Note: `applyDefinitionOverlay` will be added in Task 7. For now `bootAppRuntime` just merges + constructs.)

Then inside the `AppRuntime` constructor, find the `OperationExecutor` construction block (around line 130-140):

```typescript
    this.executor = new OperationExecutor(
      this.policyEvaluator,
      this.events,
      this.storage,
      this.handlerRegistry,
      {
        queryExec: this.queryExec,
        transformRunner: this.transformRunner,
        adapterInvoker: this.adapterInvoker,
      }
    );
```

Extend the services object to include `history`:

```typescript
    this.executor = new OperationExecutor(
      this.policyEvaluator,
      this.events,
      this.storage,
      this.handlerRegistry,
      {
        queryExec: this.queryExec,
        transformRunner: this.transformRunner,
        adapterInvoker: this.adapterInvoker,
        history: this.history,
      }
    );
```

### - [ ] Step 4: Run tests + typecheck

Run: `bun test packages/runtime/test/framework-operations.test.ts`
Expected: all tests PASS.

Run: `bun test packages/runtime`
Expected: all green.

Run: `tsc --noEmit -p packages/runtime/tsconfig.json`
Expected: no errors.

### - [ ] Step 5: Commit

```bash
git add packages/runtime/src/runtime.ts
git commit -m "$(cat <<'EOF'
feat(runtime): bootAppRuntime applies framework injections + threads history

bootAppRuntime now:
- Calls applyFrameworkInjections(config) before constructing AppRuntime, so
  pneuma_table_columns + add_table_column land in every app.
- Threads AppHistoryStore into HandlerServices.history so the framework
  handler can append history entries.

No template changes required — existing templates get the framework Ops
for free. No change to bun test counts because the merge is additive.
EOF
)"
```

---

## Task 7: `applyDefinitionOverlay` — load `pneuma_table_columns` and mutate base Tables at boot

**Files:**
- Create: `packages/runtime/src/definition-loader.ts`
- Create: `packages/runtime/test/definition-loader.test.ts`
- Modify: `packages/runtime/src/runtime.ts` (await overlay in bootAppRuntime)
- Modify: `packages/runtime/src/index.ts` (re-export)

### - [ ] Step 1: Write failing test

Create `packages/runtime/test/definition-loader.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import {
  Table,
  pneumaTableColumnEntryToRow,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
  type CellType,
} from "@pneuma-framework/core-domain";
import { bootAppRuntime } from "../src/runtime.js";
import { applyDefinitionOverlay } from "../src/definition-loader.js";
import type { AppConfig } from "../src/types.js";
import { PolicySet } from "@pneuma-framework/core-domain";

function cfg(app_id: string, baseTables: Table[]): AppConfig {
  return {
    app_id,
    tables: baseTables,
    operations: [],
    policy: new PolicySet({ app_id }),
    handlers: {},
  };
}

function bookmarks(app_id: string): Table {
  return new Table({
    id: "bookmarks",
    app_id,
    source: { kind: "stored" },
    columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
  });
}

describe("applyDefinitionOverlay", () => {
  test("reads pneuma_table_columns rows and calls addColumn on the matching base Table", async () => {
    const runtime = await bootAppRuntime(cfg("ovl-1", [bookmarks("ovl-1")]));
    // Pre-seed a pneuma_table_columns row directly
    await runtime.storage.saveRow(
      pneumaTableColumnEntryToRow({
        id: "ptc-1",
        app_id: "ovl-1",
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" } as CellType,
        nullable: true,
        created_by: "tester",
        created_by_kind: "builder",
        definition_version: 1,
      }),
    );
    // Base Table should NOT yet have `tags` — bootAppRuntime hasn't run overlay yet
    // in this test path (we don't call it twice).
    const base = await runtime.tables.get("bookmarks");
    expect(base!.hasColumn("tags")).toBe(false);

    // Apply the overlay manually
    await applyDefinitionOverlay(runtime);

    const after = await runtime.tables.get("bookmarks");
    expect(after!.hasColumn("tags")).toBe(true);
    const col = after!.columns.find((c) => c.name === "tags")!;
    expect(col.type.kind).toBe("primitive");
    expect(col.nullable).toBe(true);

    await runtime.close();
  });

  test("skips rows pointing at missing tables (logs warning, continues)", async () => {
    const runtime = await bootAppRuntime(cfg("ovl-2", [bookmarks("ovl-2")]));
    await runtime.storage.saveRow(
      pneumaTableColumnEntryToRow({
        id: "ptc-stale",
        app_id: "ovl-2",
        table_id: "missing_table",
        column_name: "extra",
        cell_type: { kind: "primitive", of: "Text" } as CellType,
        nullable: false,
        created_by: "system",
        created_by_kind: "framework",
        definition_version: 1,
      }),
    );
    // Should not throw — just skips the stale row.
    await applyDefinitionOverlay(runtime);
    const base = await runtime.tables.get("bookmarks");
    // bookmarks unchanged
    expect(base!.hasColumn("extra")).toBe(false);
    await runtime.close();
  });

  test("bootAppRuntime applies overlay before returning", async () => {
    const db = await import("bun:sqlite");
    const rowPath = `:memory:`;
    // Simulate the "prior process" — boot, write overlay entry, close.
    const app_id = "ovl-3-cross";
    const runtime1 = await bootAppRuntime({
      ...cfg(app_id, [bookmarks(app_id)]),
      storage: { sqlite_path: rowPath },
    });
    // With :memory: each boot is a fresh DB, so this test just verifies
    // the in-process overlay path end-to-end. For true cross-restart we use
    // Task 8's test.
    await runtime1.storage.saveRow(
      pneumaTableColumnEntryToRow({
        id: "ptc-same-proc",
        app_id,
        table_id: "bookmarks",
        column_name: "summary",
        cell_type: { kind: "primitive", of: "RichText" } as CellType,
        nullable: false,
        created_by: "tester",
        created_by_kind: "builder",
        definition_version: 1,
      }),
    );
    // Re-run overlay (this is what happens on next boot)
    await applyDefinitionOverlay(runtime1);
    const t = await runtime1.tables.get("bookmarks");
    expect(t!.hasColumn("summary")).toBe(true);
    await runtime1.close();
    void db;
  });
});
```

### - [ ] Step 2: Run to verify failure

Run: `bun test packages/runtime/test/definition-loader.test.ts`
Expected: module-not-found for `definition-loader`.

### - [ ] Step 3: Implement `applyDefinitionOverlay`

Create `packages/runtime/src/definition-loader.ts`:

```typescript
// definition-loader.ts — reads pneuma_table_columns rows and applies them to base Tables.
//
// Runs once at bootAppRuntime, after the AppRuntime constructor finishes (so the
// framework Table pneuma_table_columns is already in runtime.tables + rows
// repository reflects the SQLite file). Calls Table.addColumn on each matching
// base Table so downstream HTTP / handler / QueryExecutor paths see the
// extended schema.

import {
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
  rowToPneumaTableColumnEntry,
  type CellType,
} from "@pneuma-framework/core-domain";
import type { AppRuntime } from "./runtime.js";

export async function applyDefinitionOverlay(runtime: AppRuntime): Promise<void> {
  const rows = await runtime.storage.listRowsByTable(PNEUMA_TABLE_COLUMNS_TABLE_ID);
  for (const row of rows) {
    let entry;
    try {
      entry = rowToPneumaTableColumnEntry(row);
    } catch (err) {
      process.stderr.write(
        `[definition-loader] skipping malformed pneuma_table_columns row ${row.id}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      continue;
    }
    const target = await runtime.tables.get(entry.table_id);
    if (!target) {
      process.stderr.write(
        `[definition-loader] skipping overlay entry ${entry.id}: target table '${entry.table_id}' not registered in AppConfig.tables\n`,
      );
      continue;
    }
    if (target.source.kind !== "stored") {
      process.stderr.write(
        `[definition-loader] skipping overlay entry ${entry.id}: target table '${entry.table_id}' is not stored (source=${target.source.kind})\n`,
      );
      continue;
    }
    if (target.hasColumn(entry.column_name)) {
      // Idempotent: already-applied overlay on restart is a no-op.
      continue;
    }
    try {
      target.addColumn({
        name: entry.column_name,
        type: entry.cell_type as CellType,
        nullable: entry.nullable,
      });
    } catch (err) {
      process.stderr.write(
        `[definition-loader] failed to apply overlay entry ${entry.id} (${entry.table_id}.${entry.column_name}): ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}
```

### - [ ] Step 4: Wire into `bootAppRuntime`

Open `packages/runtime/src/runtime.ts`. Find:

```typescript
import { applyFrameworkInjections } from "./framework-operations.js";

export async function bootAppRuntime(config: AppConfig): Promise<AppRuntime> {
  const merged = applyFrameworkInjections(config);
  const runtime = new AppRuntime(merged);
  return runtime;
}
```

Replace with:

```typescript
import { applyFrameworkInjections } from "./framework-operations.js";
import { applyDefinitionOverlay } from "./definition-loader.js";

export async function bootAppRuntime(config: AppConfig): Promise<AppRuntime> {
  const merged = applyFrameworkInjections(config);
  const runtime = new AppRuntime(merged);
  await applyDefinitionOverlay(runtime);
  return runtime;
}
```

### - [ ] Step 5: Re-export from runtime index

Open `packages/runtime/src/index.ts`. Append:

```typescript
export { applyDefinitionOverlay } from "./definition-loader.js";
```

### - [ ] Step 6: Run tests + typecheck

Run: `bun test packages/runtime/test/definition-loader.test.ts`
Expected: 3 tests PASS.

Run: `bun test packages/runtime`
Expected: all green.

Run: `tsc --noEmit -p packages/runtime/tsconfig.json`
Expected: no errors.

### - [ ] Step 7: Commit

```bash
git add packages/runtime/src/definition-loader.ts packages/runtime/test/definition-loader.test.ts packages/runtime/src/runtime.ts packages/runtime/src/index.ts
git commit -m "$(cat <<'EOF'
feat(runtime): applyDefinitionOverlay at bootAppRuntime

After the AppRuntime constructor completes, bootAppRuntime reads all rows
from pneuma_table_columns and calls Table.addColumn on the matching base
Tables before returning. On the next process start with the same SQLite
file, the overlay is picked up and the extended schema becomes visible to
HTTP / handlers / QueryExecutor.

Resilient to stale or malformed rows:
- Missing target Table → skip + stderr warning
- Non-stored target → skip + stderr warning
- Column already present (idempotent re-apply) → skip silently
- Malformed row (bad cells, unknown schema) → skip + stderr warning

Normal per-process failures do not block boot.
EOF
)"
```

---

## Task 8: Cross-restart integration test (end-to-end boot → write → close → reboot → verify)

**Files:**
- Create: `packages/runtime/test/app-definition-change.test.ts`

### - [ ] Step 1: Write the integration test

Create `packages/runtime/test/app-definition-change.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Table,
  Row,
  PolicySet,
  Subjects,
  Resources,
  buildRootContext,
  type CellType,
} from "@pneuma-framework/core-domain";
import { bootAppRuntime, ADD_TABLE_COLUMN_OP_ID } from "../src/index.js";
import type { AppConfig } from "../src/types.js";

function scratch(): { dir: string; rowPath: string; historyPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "p1-def-"));
  return {
    dir,
    rowPath: join(dir, "rows.db"),
    historyPath: join(dir, "history.db"),
  };
}

function baseConfig(app_id: string, paths: { rowPath: string; historyPath: string }): AppConfig {
  const bookmarks = new Table({
    id: "bookmarks",
    app_id,
    source: { kind: "stored" },
    columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
  });
  const policy = new PolicySet({ app_id });
  // No template ops in this test — we only exercise the framework-injected one.
  return {
    app_id,
    tables: [bookmarks],
    operations: [],
    policy,
    handlers: {},
    storage: { sqlite_path: paths.rowPath },
    history: { sqlite_path: paths.historyPath },
  };
}

describe("P1 end-to-end: add_table_column survives process restart", () => {
  test("column added in process 1 is visible in process 2, and a new row with the column can be saved", async () => {
    const app_id = "p1-e2e";
    const paths = scratch();

    // ---- Process 1: boot, invoke add_table_column, close ----
    {
      const runtime = await bootAppRuntime(baseConfig(app_id, paths));

      // Confirm tags not yet present
      const before = await runtime.tables.get("bookmarks");
      expect(before!.hasColumn("tags")).toBe(false);

      const op = runtime.getOperation(ADD_TABLE_COLUMN_OP_ID)!;
      const ctx = buildRootContext({
        app_id,
        invoked_via: "agent",
        user: { id: "agent:test", attrs: {}, roles: [] },
      });
      const result = await runtime.executor.invoke(
        op,
        {
          table_id: "bookmarks",
          column_name: "tags",
          cell_type: { kind: "primitive", of: "Text" } as CellType,
          nullable: true,
        },
        ctx,
      );
      const output = result.output as { entry_id: string; definition_version: number };
      expect(output.entry_id).toMatch(/^ptc-/);
      expect(output.definition_version).toBe(1);

      // app_history has the entry (listEntries desc+limit=1 is the "most recent" pattern)
      const histEntries = await runtime.history.listEntries(app_id, { direction: "desc", limit: 1 });
      const latest = histEntries[0];
      expect(latest).toBeDefined();
      expect(latest!.actor_kind).toBe("agent");
      expect(latest!.is_ai_generated).toBe(true);
      expect(latest!.operation_scope).toContain("table:bookmarks");

      // In-process effect: base Table in THIS process should NOT yet have tags
      // (P1 does not restart; the column is row-persisted but the base Table
      // in runtime.tables is unmodified.)
      const after = await runtime.tables.get("bookmarks");
      expect(after!.hasColumn("tags")).toBe(false);

      await runtime.close();
    }

    // ---- Process 2: boot with same SQLite file, assert overlay applied ----
    {
      const runtime = await bootAppRuntime(baseConfig(app_id, paths));
      const base = await runtime.tables.get("bookmarks");
      expect(base!.hasColumn("tags")).toBe(true);

      const tagsCol = base!.columns.find((c) => c.name === "tags")!;
      expect(tagsCol.type.kind).toBe("primitive");
      expect(tagsCol.nullable).toBe(true);

      // Save a Row using the new column — validated by normal schema path
      const row = new Row({
        id: "bm-1",
        table_id: "bookmarks",
        app_id,
        cells: {
          url: "https://example.com",
          tags: "one,two",
        },
      });
      await runtime.storage.saveRow(row);
      const back = await runtime.storage.getRow("bm-1");
      expect(back).toBeDefined();
      expect(back!.getCell("tags")).toBe("one,two");

      await runtime.close();
    }
  });
});
```

### - [ ] Step 2: Run the integration test

Run: `bun test packages/runtime/test/app-definition-change.test.ts`
Expected: the test PASSES end-to-end. If it fails, the most likely causes are:
- `Row.saveRow` rejects the `tags` cell because the overlay wasn't applied — double-check Task 7's wire-up in `bootAppRuntime`.
- `listEntries` returning the wrong ordering — the store uses `direction: "desc" | "asc"` with `limit`; pattern `await history.listEntries(app_id, { direction: "desc", limit: 1 })` then `entries[0]` returns the most-recent entry.

### - [ ] Step 3: Run the full runtime suite + typecheck

Run: `bun test packages/runtime`
Expected: all green.

Run: `bun run typecheck`
Expected: no errors.

### - [ ] Step 4: Commit

```bash
git add packages/runtime/test/app-definition-change.test.ts
git commit -m "$(cat <<'EOF'
test(runtime): P1 end-to-end cross-restart integration test

Two-process test with a shared SQLite file:
- Process 1: boot empty app, invoke add_table_column for bookmarks.tags,
  assert pneuma_table_columns row + app_history entry, close.
- Process 2: re-boot with same SQLite path, assert bookmarks.hasColumn
  ("tags") is true, save a Row using the new column, read it back.

Also pins the P1 "no in-process restart" invariant: in process 1, the
base Table's hasColumn("tags") remains false after the Operation returns.
EOF
)"
```

---

## Task 9: Developer demo script

**Files:**
- Create: `examples/p1-definition-change-demo/package.json`
- Create: `examples/p1-definition-change-demo/run.ts`
- Create: `examples/p1-definition-change-demo/README.md`

### - [ ] Step 1: Create the example package manifest

Create `examples/p1-definition-change-demo/package.json`:

```json
{
  "name": "p1-definition-change-demo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "run": "bun run.ts"
  },
  "dependencies": {
    "@pneuma-framework/core-domain": "workspace:*",
    "@pneuma-framework/runtime": "workspace:*"
  }
}
```

### - [ ] Step 2: Create the README

Create `examples/p1-definition-change-demo/README.md`:

```markdown
# P1 App Definition Change — Demo

Demonstrates Phase 3 P1 in a single script:

1. Boots an empty pneuma-app with one base Table (`bookmarks`).
2. Invokes the framework-injected `add_table_column` Operation to declare
   a new column `tags` on `bookmarks`.
3. Closes the app.
4. Re-boots with the same SQLite file → the column is now effective.
5. Writes a Row using the new column.

Run:

```bash
bun run run.ts
```

Cleanup: the script uses a temp directory under `/tmp`, reported on
stdout. Remove it manually if you want a clean slate.
```

### - [ ] Step 3: Create the demo script

Create `examples/p1-definition-change-demo/run.ts`:

```typescript
#!/usr/bin/env bun
// P1 definition-change demo — see README.md.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Table,
  Row,
  PolicySet,
  buildRootContext,
  type CellType,
} from "@pneuma-framework/core-domain";
import {
  bootAppRuntime,
  ADD_TABLE_COLUMN_OP_ID,
  type AppConfig,
} from "@pneuma-framework/runtime";

async function main() {
  const app_id = "p1-demo";
  const dir = mkdtempSync(join(tmpdir(), "p1-demo-"));
  const rowPath = join(dir, "rows.db");
  const historyPath = join(dir, "history.db");

  const makeConfig = (): AppConfig => ({
    app_id,
    tables: [
      new Table({
        id: "bookmarks",
        app_id,
        source: { kind: "stored" },
        columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
      }),
    ],
    operations: [],
    policy: new PolicySet({ app_id }),
    handlers: {},
    storage: { sqlite_path: rowPath },
    history: { sqlite_path: historyPath },
  });

  console.log(`📁 Workspace: ${dir}`);

  // ---- Act 1: Process 1 ----
  console.log(`\n🔹 Process 1: boot, invoke add_table_column("bookmarks", "tags")`);
  {
    const runtime = await bootAppRuntime(makeConfig());
    const before = (await runtime.tables.get("bookmarks"))!;
    console.log(`   before: bookmarks has ${before.columns.length} columns -> ${before.columns.map((c) => c.name).join(", ")}`);

    const op = runtime.getOperation(ADD_TABLE_COLUMN_OP_ID)!;
    const ctx = buildRootContext({
      app_id,
      invoked_via: "agent",
      user: { id: "agent:demo", attrs: {}, roles: [] },
    });
    const result = await runtime.executor.invoke(
      op,
      {
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" } as CellType,
        nullable: true,
      },
      ctx,
    );
    const output = result.output as { entry_id: string; definition_version: number };
    console.log(`   → add_table_column returned ${JSON.stringify(output)}`);

    const histEntries = await runtime.history.listEntries(app_id, { direction: "desc", limit: 1 });
    const latest = histEntries[0];
    console.log(`   → app_history latest: v${latest?.version} ${latest?.actor_kind}/${latest?.description}`);

    const after = (await runtime.tables.get("bookmarks"))!;
    console.log(`   after (same process): bookmarks has ${after.columns.length} columns -> ${after.columns.map((c) => c.name).join(", ")}`);
    console.log(`   ℹ️  In-process Table is intentionally unchanged (P1 no-restart). Next boot picks it up.`);

    await runtime.close();
  }

  // ---- Act 2: Process 2 ----
  console.log(`\n🔹 Process 2: re-boot from the same SQLite file`);
  {
    const runtime = await bootAppRuntime(makeConfig());
    const base = (await runtime.tables.get("bookmarks"))!;
    console.log(`   bookmarks now has ${base.columns.length} columns -> ${base.columns.map((c) => c.name).join(", ")}`);
    if (!base.hasColumn("tags")) {
      throw new Error("overlay did not apply: 'tags' missing on bookmarks");
    }

    const row = new Row({
      id: "bm-demo",
      table_id: "bookmarks",
      app_id,
      cells: {
        url: "https://example.com/demo",
        tags: "p1,demo",
      },
    });
    await runtime.storage.saveRow(row);
    const back = await runtime.storage.getRow("bm-demo");
    console.log(`   ✅ saved + read-back: ${back?.getCell("url")} tags='${back?.getCell("tags")}'`);

    await runtime.close();
  }

  console.log(`\n🎉 P1 demo complete. Cleanup (manual): rm -rf ${dir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### - [ ] Step 4: Install workspace + run the demo

Run: `bun install`
Run: `bun --cwd examples/p1-definition-change-demo run`

Expected: console output resembling:

```
📁 Workspace: /tmp/p1-demo-<random>

🔹 Process 1: boot, invoke add_table_column("bookmarks", "tags")
   before: bookmarks has 1 columns -> url
   → add_table_column returned {"entry_id":"ptc-...","definition_version":1}
   → app_history latest: v1 agent/Added column 'tags' to table 'bookmarks'
   after (same process): bookmarks has 1 columns -> url
   ℹ️  In-process Table is intentionally unchanged (P1 no-restart). Next boot picks it up.

🔹 Process 2: re-boot from the same SQLite file
   bookmarks now has 2 columns -> url, tags
   ✅ saved + read-back: https://example.com/demo tags='p1,demo'

🎉 P1 demo complete. Cleanup (manual): rm -rf /tmp/p1-demo-...
```

### - [ ] Step 5: Commit

```bash
git add examples/p1-definition-change-demo/
git commit -m "$(cat <<'EOF'
feat(examples): P1 definition-change demo script

Single-script demonstration of Phase 3 P1: boot empty app → invoke
add_table_column → close → re-boot same SQLite file → write Row using
the new column. Prints each phase to stdout so the no-restart invariant
(in-process Table unchanged after the Op) is visible to a reader.

bun --cwd examples/p1-definition-change-demo run
EOF
)"
```

---

## Task 10: ADR amendments + OPEN-QUESTIONS.md sync

**Files:**
- Modify: `docs/architecture/adr/0017-rollback-data-semantics.md` (append Amendments entry)
- Modify: `docs/architecture/adr/0018-operations-as-primitive.md` (append Amendments entry)
- Modify: `docs/architecture/OPEN-QUESTIONS.md` (bump amendment count; note main-line D started)

### - [ ] Step 1: Append ADR-0017 amendment

Open `docs/architecture/adr/0017-rollback-data-semantics.md`. Append to the `## Amendments` section (after the existing 2026-04-24 entry):

```markdown

### 2026-04-25 — `app_history` 首次被激活写入（Phase 3 P1）

**触发**：Phase 3 P1（"True App Definition Change"）引入 framework-injected Operation `add_table_column`，每次成功调用都会往 `app_history` 写一条 snapshot。在此之前 `app_history` schema 已就绪（2026-04-24 amendment）但从无 Operation 写过一行。P1 是第一条真写路径。

**Decision**：

1. **P1 只写 snapshot**：payload shape 固定为 `{ kind: "pneuma_table_columns_snapshot", rows: [<所有 pneuma_table_columns entries after this write>] }`。delta / JSON-Patch 路径等真的跑到 `SNAPSHOT_FREQUENCY = 10` 再启用。
2. **attribution 从 PermissionContext 推导**：
   - `actor_id` = `ctx.user?.id ?? "anonymous"`
   - `actor_kind` = `"agent" | "builder" | "framework"` 依 `ctx.invoked_via` 映射（agent → agent；system → framework；其它 → builder）
   - `is_ai_generated` = `actor_kind === "agent"`
   - `operation_scope` = `[`table:<id>`, "operation:add_table_column"]`
   - `description` = 自然语言（handler 拼 `"Added column '<name>' to table '<id>'"`）
3. **未来 destructive rollback 流程（ADR-0017 原 decision）仍是目标**：P1 只激活 write path，restore / rollback / impact disclosure 还没跑到。P2 `definition.apply` 加 restart orchestration；真 rollback 入口留给 P3 或专门 ADR。

**Follow-up**：
- delta 路径（RFC 6902 JSON-Patch）首次启用、`parent_snapshot_version` 的回溯恢复实现等、等真 rollback 场景触发时再落。
- 跨 app_id 跨 deploy 场景的 retention 策略由 `RETENTION_BUFFER_LIMIT * SNAPSHOT_FREQUENCY` 常量控制；P1 不调整。
```

### - [ ] Step 2: Append ADR-0018 amendment

Open `docs/architecture/adr/0018-operations-as-primitive.md`. Append to the `## Amendments` section (after the 2026-04-25 reads_only boundary entry):

```markdown

### 2026-04-25 — Framework-injected Operations（Phase 3 P1）

**触发**：Phase 3 P1 需要一个 agent 可调用的"给已有 Table 加列"入口。若让 template 作者在每个 template 的 config.ts 里手写这个 Operation，就违背 ADR-0018 的一致性约束（所有 template 都得 reimplement 同一件事）。解法：framework 在 `bootAppRuntime` 时把这类 Operation **自动 merge** 进每个 `AppConfig.operations`。

**Decision**：

1. **Framework-injected Operation 定义**：由 `packages/runtime` 提供的 Operation（目前只有 `add_table_column`），`bootAppRuntime` 里的 `applyFrameworkInjections(config)` 把它 merge 进 `config.operations`、把 handler merge 进 `config.handlers`、把 system-owned Table（`pneuma_table_columns`）merge 进 `config.tables`、把 allow-invoke policy 规则 merge 进 `config.policy`。
2. **pipeline 与 template Operation 完全相同**：PolicyEvaluator 闸门、audit event emit、`/api/config` 暴露、MCP bridge 翻译全部一致。framework op 唯一区别是 handler ref 使用 `framework://` 前缀命名空间，避免与 template 相对路径冲突。
3. **handler 通过 `HandlerServices.history`（新）访问 AppHistoryStore**：不 import 到 Operation aggregate，runtime 注入。template handler 若用到 history 也可以访问，但目前没消费者。
4. **policy rule 目前是 anyone+anonymous allow-invoke**（MVP 姿态）；Phase 3 P2（attribution）会引入 Builder / Agent 身份后再收紧。
5. **idempotent merge**：template 若已声明同 id 的 Operation / Table，framework 不覆盖（先声明者胜）。目前没 template 这么做，但这条是未来扩展的兼容保证。

**范围限制**：
- P1 只加 `add_table_column` 一个 framework Op；其它定义维度（operations / transforms / lenses / policies）各自走独立 `pneuma_definition_*` Table + 独立 framework Op，由 Phase 3 后续阶段补。
- Framework Op 目前没有 destructive 能力；增 column 是非破坏性的（老 row 的新 column 自动 null）。未来 `drop_table_column` 会是 destructive，走 ADR-0018 + ADR-0017 的 impact disclosure 流程。

**Follow-up**：
- `drop_table_column` / `change_column_type`（destructive）作为 Phase 3 P3b 之后的候选。
- framework Operation 与 template Operation 之间的命名空间（`framework://` 前缀）是否固化为正式规范，等第二个 framework Op 出现再定。
```

### - [ ] Step 3: Update OPEN-QUESTIONS.md

Open `docs/architecture/OPEN-QUESTIONS.md`. Three edits:

(a) Find the header line `**最后更新**：2026-04-24（P0 Operation Semantics Cleanup 完成...)` and replace with:

```markdown
**最后更新**：2026-04-25（Phase 3 P1 True App Definition Change 落地；0017 + 0018 各加一条 amendment）
```

(b) Find the amendment count line (currently `**12 条 amend**（...)`) and replace with:

```markdown
- **14 条 amend**（0005 filter_pushdown / 0009 template default_posture / 0013 access event MVP + operation 类别路由 / 0017 app_history schema v1 蓝本 + **app_history 首次激活写入** / **0019 target namespace + input ValueRef (2 条)** / 0020 cache key auto-derive / 0002 ref-row-list + json CellType + reserved-name 放宽 / 0003 purity 三档正式化 / **0018 P0 semantics cleanup — reads_only+code / derived-list / graph / object** + **reads_only 语义边界澄清** + **framework-injected Operations** / **0026 output_schema symmetry**）
```

(c) Find the 主线 D section (around line 340 "主线 D — Phase 3: Builder 通过对话构建 app 本身"). Currently reads `（仍候选）` (or similar — it was "新的深水区" in earlier versions). Update the lead paragraph to reflect P1 shipping. Near its beginning add:

```markdown
> **2026-04-25 更新**：P1 (add column to existing stored Table) 已落地。`add_table_column` 是第一个 framework-injected Operation；`pneuma_table_columns` 是第一张 system-owned 定义 Table；`app_history` 第一次真写。P2 (attribution + definition.apply restart orchestration) 是下一步。
```

### - [ ] Step 4: Visual review

Run: `git diff docs/architecture/adr/0017-rollback-data-semantics.md docs/architecture/adr/0018-operations-as-primitive.md docs/architecture/OPEN-QUESTIONS.md`

Confirm: the two ADR amendments match the existing Chinese bolded-label style; heading levels are `###` inside the existing `## Amendments` section; no stray whitespace / fences.

### - [ ] Step 5: Commit

```bash
git add docs/architecture/adr/0017-rollback-data-semantics.md docs/architecture/adr/0018-operations-as-primitive.md docs/architecture/OPEN-QUESTIONS.md
git commit -m "$(cat <<'EOF'
docs(adr): amendments for P1 — app_history activated + framework Operations

ADR-0017: new dated amendment notes that app_history is now actively
written (snapshot-only for P1) with actor_id / actor_kind / is_ai_generated
derived from PermissionContext. Payload shape fixed to
pneuma_table_columns_snapshot; delta path deferred until real usage hits
SNAPSHOT_FREQUENCY.

ADR-0018: new dated amendment notes framework-injected Operations as a
concept (add_table_column is the first). applyFrameworkInjections merges
the Table / Operation / handler / policy rule into every AppConfig at boot.
Same pipeline as template Operations; handler ref uses "framework://"
namespace to avoid collision.

OPEN-QUESTIONS: amendment count 12 → 14; header stamp updated;
main-line D section notes P1 landed and P2 is next.
EOF
)"
```

---

## Task 11: Full-suite verification sweep

**Files:** none (verification-only).

### - [ ] Step 1: Run the entire test suite

Run: `bun test`
Expected: all tests PASS. Test count should be the P0 698 baseline + the P1 additions (approximately +20 tests across core-domain + runtime). Exact count isn't load-bearing — just confirm no regression.

### - [ ] Step 2: Full typecheck sweep

Run: `bun run typecheck`
Expected: no errors across all 13+ packages.

### - [ ] Step 3: Run the demo script (again, for clean-slate confirmation)

Run: `bun --cwd examples/p1-definition-change-demo run`
Expected: both process phases print; column visible in process 2; row with `tags='p1,demo'` saves + reads back.

### - [ ] Step 4: Smoke-run `/api/config` on one existing template to confirm `add_table_column` is exposed

```bash
cd /tmp && rm -rf pneuma-p1-smoke && mkdir pneuma-p1-smoke && \
  PNEUMA_WORKSPACE=/tmp/pneuma-p1-smoke \
  OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-dummy}" \
  bun run /Users/pandazki/Codes/pneuma-framework/templates/ai-bookmarks-core-domain/server/app.ts &
SERVER_PID=$!
sleep 2
curl -s http://127.0.0.1:8765/api/config | bun -e 'const d = JSON.parse(await Bun.stdin.text()); const op = d.operations.find(o => o.id === "add_table_column"); console.log("add_table_column present:", !!op); if (op) { console.log("  action:", op.action); console.log("  input_schema.required:", op.input_schema?.required); console.log("  output.kind:", op.output?.kind); }'
kill $SERVER_PID 2>/dev/null || true
```

Expected:
```
add_table_column present: true
  action: write
  input_schema.required: [ "table_id", "column_name", "cell_type" ]
  output.kind: object
```

### - [ ] Step 5: No commit

Verification-only. If any step regresses, open a new `fix(p1): ...` commit with the specific repair. Do not amend prior commits.

---

## Rollback procedure

If P1 needs to be reverted, revert in reverse order — each revert is safe alone:

1. Revert Task 10 (ADR amendments + OPEN-QUESTIONS sync) — doc-only.
2. Revert Task 9 (demo + examples package) — doesn't affect test / typecheck.
3. Revert Task 8 (cross-restart integration test) — test-only.
4. Revert Task 7 (`applyDefinitionOverlay` + boot wire-up) — the boot overlay step goes away; existing pneuma_table_columns rows remain unread but don't break.
5. Revert Task 6 (boot + history thread) — framework Op + Table stop being merged.
6. Revert Task 5 (`applyFrameworkInjections`).
7. Revert Task 4 (handler + HandlerServices.history).
8. Revert Task 3 (framework Operation declaration).
9. Revert Task 2 (Entry ↔ Row codec).
10. Revert Task 1 (`pneuma_table_columns` Table factory).

Each revert leaves the repo at a consistent intermediate state. Only Task 4's `HandlerServices.history` addition has an ABI shape change; reverting it is safe because all current consumers treat it as optional.
