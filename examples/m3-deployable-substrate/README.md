# M3 Deployable Substrate Demo

中文版见下半部分。

## What This Proves

M3 proves that a pneuma-app can move beyond an in-memory/browser demo:

```text
dev mode
  -> SQLite app database
  -> release manifest
  -> Docker image
  -> mounted volume
  -> restart-persistent app state
```

The important claim is not that Docker or SQLite are the final platform. The claim is that Pneuma primitives can survive a real backend, real persistence, a release artifact, and a deployable runtime.

## Run

```bash
bun test packages/core-domain/test/persistence/sqlite-database.test.ts packages/core-domain/test/persistence/sqlite-migrations.test.ts
bun test packages/runtime/test/deployable-substrate.test.ts packages/core/test/permission-ledger-sqlite.test.ts
bun test templates/bookmarks-core-domain/test/deployable-substrate.test.ts examples/m3-deployable-substrate/smoke.test.ts
```

If Docker is available:

```bash
docker compose -f templates/bookmarks-core-domain/docker-compose.yml config
bun test examples/m3-deployable-substrate/docker-smoke.test.ts
```

The Docker smoke builds the image, starts a container with a mounted volume,
waits for `/healthz`, verifies `/data/app.db`, restarts the container, and
verifies `/healthz` plus `/data/app.db` again.

## Inspect

For a local template workspace:

```bash
sqlite3 <workspace>/data/app.db ".tables"
sqlite3 <workspace>/data/app.db "select id, table_id from rows;"
sqlite3 <workspace>/data/app.db "select version, description from app_history;"
sqlite3 <workspace>/data/app.db "select event_type, prompt_id from permission_ledger_events;"
```

## Story

1. Dev mode creates data rows and app-definition rows through Pneuma primitives.
2. `migrate.sh` creates a real SQLite app database.
3. `build.sh` emits a release manifest with web process, healthcheck, migrations, and volume contract.
4. Docker runs the same app against `/data/app.db`.
5. Restart keeps rows, app definition, app history, and permission ledger events.

Success sentence:

```text
A Builder/Agent-created capability survives real SQLite persistence, release manifest generation, Docker packaging, container restart, and remains inspectable through Pneuma primitives.
```

---

# M3 可部署 Substrate Demo

## 这证明了什么

M3 证明 pneuma-app 不再只是一个内存态/browser demo：

```text
dev mode
  -> SQLite app database
  -> release manifest
  -> Docker image
  -> mounted volume
  -> restart-persistent app state
```

关键结论不是 Docker 或 SQLite 会成为最终平台，而是 Pneuma primitives 能穿过真实 backend、真实持久化、release artifact 和可部署 runtime 之后依然成立。

## 运行

```bash
bun test packages/core-domain/test/persistence/sqlite-database.test.ts packages/core-domain/test/persistence/sqlite-migrations.test.ts
bun test packages/runtime/test/deployable-substrate.test.ts packages/core/test/permission-ledger-sqlite.test.ts
bun test templates/bookmarks-core-domain/test/deployable-substrate.test.ts examples/m3-deployable-substrate/smoke.test.ts
```

如果机器上有 Docker：

```bash
docker compose -f templates/bookmarks-core-domain/docker-compose.yml config
bun test examples/m3-deployable-substrate/docker-smoke.test.ts
```

Docker smoke 会 build image、启动带 volume 的容器、等待 `/healthz`、确认
`/data/app.db` 存在、重启容器，然后再次确认 `/healthz` 和 `/data/app.db`。

## 检查

对于本地 template workspace：

```bash
sqlite3 <workspace>/data/app.db ".tables"
sqlite3 <workspace>/data/app.db "select id, table_id from rows;"
sqlite3 <workspace>/data/app.db "select version, description from app_history;"
sqlite3 <workspace>/data/app.db "select event_type, prompt_id from permission_ledger_events;"
```

## 讲述方式

1. Dev mode 通过 Pneuma primitives 创建数据 rows 和 app-definition rows。
2. `migrate.sh` 创建真实 SQLite app database。
3. `build.sh` 产出 release manifest，里面包含 web process、healthcheck、migration 和 volume contract。
4. Docker 用 `/data/app.db` 运行同一个 app。
5. 重启后 rows、app definition、app history 和 permission ledger events 都保留。

一句话结论：

```text
Builder/Agent 创建出的 capability 能穿过真实 SQLite 持久化、release manifest、Docker 打包和容器重启，并且仍然能被 Pneuma primitives 解释和检查。
```
