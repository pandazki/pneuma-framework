# AppConfig 编写速查

**读者：** 正在编写 Host-owned runtime entrypoint 或 generated-app `AppConfig` 的 Developer  
**English version:** [app-config-authoring.md](./app-config-authoring.md)

这页整理的是脱离 example、自己编写 generated app runtime 时最容易漏掉的小 invariant。

## Cell Types

Primitive cell type 的拼写是精确的：

```ts
{ kind: "primitive", of: "Text" }
{ kind: "primitive", of: "RichText" }
{ kind: "primitive", of: "Number" }
{ kind: "primitive", of: "Bool" }
{ kind: "primitive", of: "Date" }
{ kind: "primitive", of: "Duration" }
{ kind: "primitive", of: "URL" }
```

`URL` 是大写。`Json` 不是 primitive。JSON 是独立 kind：

```ts
{ kind: "json" }
{ kind: "json", schema: { type: "object" } }
```

## 保留 Row 列名

下面这些名字由 row aggregate 保留，不能声明成 table column：

```text
id
created_at
updated_at
owner_id
```

如果你需要一个用户可见、可查询的类似字段，请使用领域列名，例如：

```text
created_at_cell
updated_at_cell
owner_id_cell
```

## Operation Surface

`Operation.surface` 是可选的，因为构造器会从 `affects` 推导默认 surface。

默认值是：

```text
agent_callable: true
public_surface: true
view_mountable: affects.reads_only
framework_internal: false
```

只有在你刻意改变暴露面时才传 `surface`。Framework-internal operation 不能 public，也不能被 view mount。

## Destructive Operations

任何带有：

```ts
affects: { destructive: true, ... }
```

的 operation 都必须包含 `impact` 描述子。runtime 依赖它在确认前生成 impact disclosure。

## SQLite Runtime Path

Host-owned runtime entrypoint 应使用导出的常量，不要手写环境变量名：

```ts
import { PNEUMA_SQLITE_PATH_ENV, bootAppRuntime } from "@pneuma-framework/runtime";

process.env[PNEUMA_SQLITE_PATH_ENV] = sqlitePath;

const { config } = await import("./app-config");
const runtime = await bootAppRuntime(config);
```

如果某个模块在构造 `AppConfig` 时会读取该环境变量，请先设置 env，再 import 该模块。

## Table Materialization

runtime 可能在第一次写入 row 时才把 stored SQLite table 物化出来。Host tool 如果直接检查 SQLite，需要容忍一个已声明 table 暂时还没有出现在 `sqlite_master` 中。

framework 未来可以加入 eager table materialization；RC 0.1.1 不要求直接 SQLite inspector 假设它已经存在。
