# AppConfig Authoring Cheatsheet

**Audience:** Developers writing a Host-owned runtime entrypoint or generated-app `AppConfig`  
**Chinese version:** [app-config-authoring.zh-CN.md](./app-config-authoring.zh-CN.md)

This page collects the small invariants that are easy to miss when you stop copying an example and author a generated app runtime yourself.

## Cell Types

Primitive cell type spelling is exact:

```ts
{ kind: "primitive", of: "Text" }
{ kind: "primitive", of: "RichText" }
{ kind: "primitive", of: "Number" }
{ kind: "primitive", of: "Bool" }
{ kind: "primitive", of: "Date" }
{ kind: "primitive", of: "Duration" }
{ kind: "primitive", of: "URL" }
```

`URL` is uppercase. `Json` is not a primitive. Use JSON as its own kind:

```ts
{ kind: "json" }
{ kind: "json", schema: { type: "object" } }
```

## Reserved Row Columns

These names are reserved by the row aggregate and cannot be declared as table columns:

```text
id
created_at
updated_at
owner_id
```

If you need a user-visible or queryable cell for a similar concept, use a domain column name such as:

```text
created_at_cell
updated_at_cell
owner_id_cell
```

## Operation Surface

`Operation.surface` is optional because the constructor derives a default surface from `affects`.

The default is:

```text
agent_callable: true
public_surface: true
view_mountable: affects.reads_only
framework_internal: false
```

Only pass `surface` when you are intentionally changing exposure. Framework-internal operations cannot be public or view-mounted.

## Destructive Operations

Any operation with:

```ts
affects: { destructive: true, ... }
```

must also include an `impact` descriptor. This is how the runtime can produce impact disclosure before confirmation.

## SQLite Runtime Path

Host-owned runtime entrypoints should use the exported constant instead of spelling the environment variable by hand:

```ts
import { PNEUMA_SQLITE_PATH_ENV, bootAppRuntime } from "@pneuma-framework/runtime";

process.env[PNEUMA_SQLITE_PATH_ENV] = sqlitePath;

const { config } = await import("./app-config");
const runtime = await bootAppRuntime(config);
```

Set the environment variable before importing a module that reads it while constructing `AppConfig`.

## Table Materialization

The runtime can lazily materialize stored SQLite tables when rows are first written. If a Host tool directly inspects SQLite, it should tolerate a declared table that has not yet appeared in `sqlite_master`.

The framework may add eager table materialization later; RC 0.1.1 does not require direct SQLite inspectors to assume it.
