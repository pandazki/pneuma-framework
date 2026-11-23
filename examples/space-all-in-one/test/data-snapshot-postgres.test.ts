import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dataSnapshotFromEnv } from "../src/config";
import { ident, literal, openBunSql, postgresTemplateSnapshot, serverOf, type SqlSession } from "../src/data-snapshot-postgres";
import { AppHost } from "../src/host";
import { loadRiskPolicy } from "../src/policy";
import type { SpaceBinding } from "../src/space";
import { FakeSpace } from "./fake-space";

const EXAMPLE = join(import.meta.dir, "..");
const AT = new Date("2026-11-23T22:48:12.345Z");
const STAMP = "20261123t224812";
const DB = "app_0a1b2c3d4e5f";
const pg = (database: string, state = "active"): SpaceBinding => ({ kind: "db", provider: "postgres", state, location: { service: "postgres:5432", database } });
const sqlite = (state = "active"): SpaceBinding => ({ kind: "db", provider: "sqlite", state, location: { volume: "pneuma-space-db-0a1b2c3d4e5f" } });

/**
 * A scripted PostgreSQL: it keeps the set of databases and their owners, answers the few statements
 * the capability sends, and writes each statement into `log` (the fake space's log, so stopping the
 * app and the SQL appear in one order). `fail` can turn any statement into an error before it applies.
 */
class ScriptedPostgres {
  readonly databases = new Map<string, string>();
  fail: ((sql: string) => Error | undefined) | null = null;
  opened = 0;
  closed = 0;
  refuseConnect: Error | null = null;
  constructor(readonly log: string[]) {}

  async connect(): Promise<SqlSession> {
    if (this.refuseConnect) throw this.refuseConnect;
    this.opened++;
    return { run: async (sql) => this.run(sql), close: async () => void this.closed++ };
  }

  private async run(sql: string): Promise<Record<string, unknown>[]> {
    this.log.push(`sql ${sql}`);
    const error = this.fail?.(sql);
    if (error) throw error;
    const lit = (text: string) => /'((?:[^']|'')*)'/.exec(text)![1]!.replaceAll("''", "'");
    const ids = (text: string) => [...text.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1]!.replaceAll('""', '"'));
    if (sql.startsWith("SELECT 1 FROM pg_database")) return this.databases.has(lit(sql)) ? [{ "?column?": 1 }] : [];
    if (sql.startsWith("SELECT pg_get_userbyid")) {
      const owner = this.databases.get(lit(sql));
      return owner === undefined ? [] : [{ owner }];
    }
    if (sql.startsWith("SELECT pg_terminate_backend")) return [];
    if (sql.startsWith("CREATE DATABASE")) {
      const [name, template, owner] = ids(sql);
      if (this.databases.has(name!)) throw Object.assign(new Error(`database "${name}" already exists`), { errno: "42P04" });
      if (!this.databases.has(template!)) throw Object.assign(new Error(`template database "${template}" does not exist`), { errno: "3D000" });
      this.databases.set(name!, owner ?? "postgres");
      return [];
    }
    if (sql.startsWith("ALTER DATABASE")) {
      const [from, to] = ids(sql);
      const owner = this.databases.get(from!);
      if (owner === undefined) throw Object.assign(new Error(`database "${from}" does not exist`), { errno: "3D000" });
      this.databases.delete(from!);
      this.databases.set(to!, owner);
      return [];
    }
    if (sql.startsWith("REVOKE CONNECT")) return [];
    throw new Error(`the scripted server does not know: ${sql}`);
  }
}

const busy = (database: string) => Object.assign(new Error(`source database "${database}" is being accessed by other users`), { errno: "55006" });

let work: string;
let space: FakeSpace;
let server: ScriptedPostgres;
let slept: number[];

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "pneuma-pg-snapshot-"));
  space = new FakeSpace();
  server = new ScriptedPostgres(space.log);
  slept = [];
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** An app directory the way the Host lays them out: <apps dir>/<name>. */
function appRoot(name = "todo"): string {
  const root = join(work, "apps", name);
  mkdirSync(root, { recursive: true });
  return root;
}

function capability(now: () => Date = () => AT) {
  return postgresTemplateSnapshot({
    space,
    connect: () => server.connect(),
    server: "postgres:5432",
    now,
    sleep: async (ms) => void slept.push(ms),
  });
}

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected it to fail");
}

const terminate = (database: string) => `sql SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${database}' AND pid <> pg_backend_pid()`;

describe("postgres-template: snapshot", () => {
  test("asks PneumaSpace for the database, checks it, stops the app, ends its sessions, copies it and closes the copy", async () => {
    space.bindings.set("todo", [sqlite("suspended"), pg(DB)]);
    server.databases.set(DB, DB);
    const { ref } = await capability().snapshot({ appRoot: appRoot(), version: "v1" });

    expect(ref).toBe(`snap_todo_v1_${STAMP}`);
    expect(space.log).toEqual([
      `sql SELECT 1 FROM pg_database WHERE datname = '${DB}'`,
      `sql SELECT 1 FROM pg_database WHERE datname = '${ref}'`,
      "stop todo",
      terminate(DB),
      `sql CREATE DATABASE "${ref}" TEMPLATE "${DB}"`,
      `sql REVOKE CONNECT ON DATABASE "${ref}" FROM PUBLIC`,
    ]);
    expect(server.databases.get(ref)).toBe("postgres");
    expect([server.opened, server.closed]).toEqual([1, 1]);
  });

  test("a copy refused because the waking app reconnected is tried again, ending the sessions before each try", async () => {
    space.bindings.set("todo", [pg(DB)]);
    server.databases.set(DB, DB);
    let refusals = 2;
    server.fail = (sql) => (sql.startsWith("CREATE DATABASE") && refusals-- > 0 ? busy(DB) : undefined);
    const { ref } = await capability().snapshot({ appRoot: appRoot(), version: "v1" });

    const steps = space.log.filter((line) => line.includes("pg_terminate_backend") || line.includes("CREATE DATABASE"));
    expect(steps).toEqual([terminate(DB), `sql CREATE DATABASE "${ref}" TEMPLATE "${DB}"`, terminate(DB), `sql CREATE DATABASE "${ref}" TEMPLATE "${DB}"`, terminate(DB), `sql CREATE DATABASE "${ref}" TEMPLATE "${DB}"`]);
    expect(slept).toEqual([200, 400]);
    expect(server.databases.has(ref)).toBe(true);
  });

  test("the retry is bounded, and an error that is not about other sessions is not retried", async () => {
    space.bindings.set("todo", [pg(DB)]);
    server.databases.set(DB, DB);
    server.fail = (sql) => (sql.startsWith("CREATE DATABASE") ? busy(DB) : undefined);
    const err = await failure(capability().snapshot({ appRoot: appRoot(), version: "v1" }));
    expect(err.message).toContain(`could not copy ${DB} to snap_todo_v1_${STAMP}: something kept connecting to ${DB} (tried 5 times`);
    expect(space.log.filter((line) => line.includes("CREATE DATABASE"))).toHaveLength(5);
    expect(slept).toEqual([200, 400, 600, 800]);
    expect(server.closed).toBe(1);

    space.log.length = 0;
    slept.length = 0;
    server.fail = (sql) => (sql.startsWith("CREATE DATABASE") ? Object.assign(new Error("permission denied to create database"), { errno: "42501" }) : undefined);
    expect((await failure(capability().snapshot({ appRoot: appRoot(), version: "v1" }))).message).toBe("permission denied to create database");
    expect(space.log.filter((line) => line.includes("CREATE DATABASE"))).toHaveLength(1);
    expect(slept).toEqual([]);
  });

  test("an app on SQLite, or with no database, is not handled, and the error says what to do; nothing is touched", async () => {
    space.bindings.set("todo", [sqlite()]);
    const onSqlite = await failure(capability().snapshot({ appRoot: appRoot(), version: "v1" }));
    expect(onSqlite.message).toContain("todo keeps its data in SQLite, PneumaSpace's default database engine.");
    expect(onSqlite.message).toContain("(postgres-template) handles PostgreSQL databases only, so it cannot save todo's data.");
    expect(onSqlite.message).toContain(`curl -X PUT http://127.0.0.1:8081/api/policy -H 'content-type: application/json' -d '{"db_backend":"postgres"}'`);
    expect(onSqlite.message).toContain("before the app's first publish that declares a database");
    expect(onSqlite.message).toContain("does not move its data");

    // Switched back to SQLite: the PostgreSQL database is suspended and is not the app's data any more.
    space.bindings.set("todo", [pg(DB, "suspended"), sqlite()]);
    expect((await failure(capability().snapshot({ appRoot: appRoot(), version: "v1" }))).message).toContain("keeps its data in SQLite");

    space.bindings.set("todo", []);
    space.live.set("todo", { files: [], boots: true });
    const none = await failure(capability().snapshot({ appRoot: appRoot(), version: "v1" }));
    expect(none.message).toContain('todo declares no database ("db" in pneuma-space.json)');
    expect(none.message).toContain("handles PostgreSQL databases only");

    expect(server.opened).toBe(0);
    expect(space.log).toEqual([]);
  });

  test("an app PneumaSpace does not know, an unreachable server, or a database the server does not have stops before the app is stopped", async () => {
    const unknown = await failure(capability().snapshot({ appRoot: appRoot("ghost"), version: "v1" }));
    expect(unknown.message).toBe("cannot ask PneumaSpace where ghost keeps its data (PneumaSpace has no app named ghost)");

    space.bindings.set("todo", [pg(DB)]);
    server.refuseConnect = new Error("Failed to connect");
    const down = await failure(capability().snapshot({ appRoot: appRoot(), version: "v1" }));
    expect(down.message).toContain("cannot reach the PostgreSQL server at postgres:5432 that PNEUMA_DATA_SNAPSHOT_URL names (Failed to connect)");
    expect(down.message).toContain("docker compose --profile postgres up -d");

    server.refuseConnect = null;
    const elsewhere = await failure(capability().snapshot({ appRoot: appRoot(), version: "v1" }));
    expect(elsewhere.message).toContain(`PneumaSpace says todo's database is ${DB}, but the PostgreSQL server at postgres:5432 has none by that name`);
    expect(space.log.filter((line) => !line.startsWith("sql SELECT 1"))).toEqual([]);
  });

  test("names are quoted, fit in 63 bytes, stay readable, and do not collide", async () => {
    const odd = 'we"ird db';
    space.bindings.set("a-very-long-app-name-that-goes-on", [pg(odd)]);
    server.databases.set(odd, "app_x");
    const cap = capability();
    const first = (await cap.snapshot({ appRoot: appRoot("a-very-long-app-name-that-goes-on"), version: "v1234567" })).ref;
    expect(first).toBe("snap_a_very_long_app_name_that_goes_on_v1234567_20261123t224812");
    expect(Buffer.byteLength(first)).toBe(63);
    expect(space.log).toContain(`sql CREATE DATABASE "${first}" TEMPLATE "we""ird db"`);
    expect(space.log).toContain(`sql SELECT 1 FROM pg_database WHERE datname = 'we"ird db'`);
    // The same app and version in the same second gets a name of its own; the app part gives way, never the version or the time.
    const second = (await cap.snapshot({ appRoot: appRoot("a-very-long-app-name-that-goes-on"), version: "v1234567" })).ref;
    expect(second).toBe("snap_a_very_long_app_name_that_goes__v1234567_20261123t224812_2");
    expect(Buffer.byteLength(second)).toBe(63);

    expect(ident('a"b')).toBe('"a""b"');
    expect(literal("it's")).toBe("'it''s'");
    expect(literal("a\\b")).toBe("E'a\\\\b'");
    expect(() => ident("a\0b")).toThrow("NUL");
  });
});

describe("postgres-template: restore", () => {
  const SNAP = `snap_todo_v1_${STAMP}`;
  const RESTORE_AT = new Date("2026-11-23T23:00:00.000Z");
  const ASIDE = `${DB}_replaced_20261123t230000`;

  beforeEach(() => {
    space.bindings.set("todo", [pg(DB)]);
    server.databases.set(DB, DB);
    server.databases.set(SNAP, "postgres");
  });

  test("checks the snapshot, stops the app, renames its database aside, copies the snapshot in under the app's role, and closes it to others", async () => {
    const cap = capability(() => RESTORE_AT);
    const root = appRoot();
    expect(cap.setAsideAfter!({ appRoot: root })).toBeUndefined();
    await cap.restore({ appRoot: root, ref: SNAP });

    expect(space.log).toEqual([
      `sql SELECT 1 FROM pg_database WHERE datname = '${SNAP}'`,
      `sql SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = '${DB}'`,
      `sql SELECT 1 FROM pg_database WHERE datname = '${ASIDE}'`,
      "stop todo",
      terminate(DB),
      `sql ALTER DATABASE "${DB}" RENAME TO "${ASIDE}"`,
      terminate(SNAP),
      `sql CREATE DATABASE "${DB}" TEMPLATE "${SNAP}" OWNER "${DB}"`,
      `sql REVOKE CONNECT ON DATABASE "${DB}" FROM PUBLIC`,
    ]);
    // Nothing is dropped: the replaced data and the snapshot both stay.
    expect([...server.databases.keys()].sort()).toEqual([DB, ASIDE, SNAP].sort());
    expect(server.databases.get(DB)).toBe(DB);
    expect(cap.setAsideAfter!({ appRoot: root })).toBe(`The database that was in use is kept as ${ASIDE} on the PostgreSQL server at postgres:5432.`);
    expect(cap.setAsideNote).toContain("is not dropped");

    // The snapshot stays, so the same restore can be repeated; the next replaced database gets a name of its own.
    await cap.restore({ appRoot: root, ref: SNAP });
    expect(server.databases.has(`${ASIDE}_2`)).toBe(true);
    expect(cap.setAsideAfter!({ appRoot: root })).toContain(`${ASIDE}_2`);
  });

  test("a snapshot that is not there is a plain error before anything is touched", async () => {
    const err = await failure(capability().restore({ appRoot: appRoot(), ref: "snap_gone" }));
    expect(err.message).toBe("the snapshot snap_gone is not on the PostgreSQL server at postgres:5432, so todo's data cannot be put back to it. Nothing was changed");
    expect(space.log).toEqual([`sql SELECT 1 FROM pg_database WHERE datname = 'snap_gone'`]);
    expect(server.databases.has(DB)).toBe(true);
  });

  test("an app that is not on PostgreSQL is refused like a snapshot of one", async () => {
    space.bindings.set("todo", [sqlite()]);
    expect((await failure(capability().restore({ appRoot: appRoot(), ref: SNAP }))).message).toContain("keeps its data in SQLite");
    expect(space.log).toEqual([]);
  });

  test("renaming aside is retried while the app reconnects", async () => {
    let refusals = 1;
    server.fail = (sql) => (sql.startsWith("ALTER DATABASE") && refusals-- > 0 ? Object.assign(new Error(`database "${DB}" is being accessed by other users`), { errno: "55006" }) : undefined);
    await capability(() => RESTORE_AT).restore({ appRoot: appRoot(), ref: SNAP });
    expect(space.log.filter((line) => line.includes(`datname = '${DB}' AND`) || line.includes("ALTER DATABASE"))).toEqual([
      terminate(DB),
      `sql ALTER DATABASE "${DB}" RENAME TO "${ASIDE}"`,
      terminate(DB),
      `sql ALTER DATABASE "${DB}" RENAME TO "${ASIDE}"`,
    ]);
    expect(slept).toEqual([200]);
  });

  test("a copy that fails after the rename renames the app's database back and says nothing changed", async () => {
    server.fail = (sql) => (sql.startsWith("CREATE DATABASE") ? Object.assign(new Error("could not write to file: No space left on device"), { errno: "53100" }) : undefined);
    const err = await failure(capability(() => RESTORE_AT).restore({ appRoot: appRoot(), ref: SNAP }));
    expect(err.message).toBe(
      `could not make ${DB} a copy of the snapshot ${SNAP} (could not write to file: No space left on device). The database that was in use was renamed back, so nothing was changed`,
    );
    expect(space.log.slice(-3)).toEqual([`sql CREATE DATABASE "${DB}" TEMPLATE "${SNAP}" OWNER "${DB}"`, terminate(ASIDE), `sql ALTER DATABASE "${ASIDE}" RENAME TO "${DB}"`]);
    expect([...server.databases.keys()].sort()).toEqual([DB, SNAP].sort());
    expect(server.databases.get(DB)).toBe(DB);
  });

  test("when renaming back fails too, the error says where the data is and the command that brings it back", async () => {
    server.fail = (sql) =>
      sql.startsWith("CREATE DATABASE") ? new Error("out of disk") : sql.startsWith(`ALTER DATABASE "${ASIDE}"`) ? new Error("the server went away") : undefined;
    const err = await failure(capability(() => RESTORE_AT).restore({ appRoot: appRoot(), ref: SNAP }));
    expect(err.message).toContain(`could not make ${DB} a copy of the snapshot ${SNAP} (out of disk), and could not rename the database that was in use back (the server went away).`);
    expect(err.message).toContain(`todo's data is intact in ${ASIDE} on postgres:5432`);
    expect(err.message).toContain(`ALTER DATABASE "${ASIDE}" RENAME TO "${DB}"`);
    expect(server.databases.has(ASIDE)).toBe(true);
  });
});

describe("postgres-template through the Host", () => {
  test("an app on SQLite: the one-way change is not released, and the owner reads why", async () => {
    const host = new AppHost({
      appsDir: join(work, "apps"),
      space,
      overlayDir: join(EXAMPLE, "overlay"),
      cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
      owner: "user:me",
      policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
      runVerify: async () => ({ ok: true, output: "tests passed" }),
      dataSnapshot: capability(),
    });
    await host.create("todo");
    space.bindings.set("todo", [sqlite()]);
    await Bun.write(join(work, "apps", "todo", "src", "server.ts"), "export const sql = `ALTER TABLE todos DROP COLUMN note`;\n");
    const pending = await host.submit({ name: "todo", intent: "remove notes", agent: "codex" });
    if (pending.status !== "needs_approval") throw new Error(`expected needs_approval, got ${pending.status}`);
    expect(pending.disclosure.join(" ")).toContain("This Host declares a data snapshot capability (postgres-template)");

    const result = await host.resolve("todo", pending.change_id, "approved", "user:me");
    expect(result).toMatchObject({ status: "rejected", reason: "data_snapshot_failed" });
    if (result.status !== "rejected") return;
    expect(result.detail).toContain("todo keeps its data in SQLite");
    expect((await host.status("todo")).active_version).toBe("v1");
    expect(space.log).not.toContain("stop todo");
  });
});

describe("PNEUMA_DATA_SNAPSHOT=postgres-template", () => {
  test("needs PNEUMA_DATA_SNAPSHOT_URL, says so in plain words, and takes only a postgresql:// URL", () => {
    expect(() => dataSnapshotFromEnv({ PNEUMA_DATA_SNAPSHOT: "postgres-template" }, { space })).toThrow(
      "PNEUMA_DATA_SNAPSHOT is postgres-template, which needs PNEUMA_DATA_SNAPSHOT_URL: a superuser connection to the PostgreSQL server PneumaSpace puts app databases on",
    );
    expect(() => dataSnapshotFromEnv({ PNEUMA_DATA_SNAPSHOT: "postgres-template", PNEUMA_DATA_SNAPSHOT_URL: "  " }, { space })).toThrow("needs PNEUMA_DATA_SNAPSHOT_URL");
    expect(() => dataSnapshotFromEnv({ PNEUMA_DATA_SNAPSHOT: "postgres-template", PNEUMA_DATA_SNAPSHOT_URL: "not a url" }, { space })).toThrow("is not a URL");
    expect(() => dataSnapshotFromEnv({ PNEUMA_DATA_SNAPSHOT: "postgres-template", PNEUMA_DATA_SNAPSHOT_URL: "mysql://root@db/x" }, { space })).toThrow("must be a postgresql:// URL");
    // Nothing connects at start: the server is reached only when a snapshot or a restore runs.
    const cap = dataSnapshotFromEnv({ PNEUMA_DATA_SNAPSHOT: "postgres-template", PNEUMA_DATA_SNAPSHOT_URL: "postgresql://postgres:pneuma-local@postgres:5432/postgres" }, { space });
    expect(cap?.id).toBe("postgres-template");
    expect(serverOf("postgresql://postgres:secret@postgres:5432/postgres")).toBe("postgres:5432");
    expect(serverOf("postgres://u:p@db.local/x")).toBe("db.local:5432");
  });
});

// --- against a real PostgreSQL ------------------------------------------------------------------
//
// Skipped unless PNEUMA_TEST_POSTGRES_URL names a superuser connection to a server this test may
// create and drop roles and databases on, e.g. a throwaway container:
//   docker run -d --rm -e POSTGRES_PASSWORD=test -p 127.0.0.1:0:5432 postgres:16-alpine
//   PNEUMA_TEST_POSTGRES_URL=postgresql://postgres:test@127.0.0.1:<port>/postgres bun test ...

const ADMIN_URL = process.env.PNEUMA_TEST_POSTGRES_URL;

describe.skipIf(!ADMIN_URL)("postgres-template against a real PostgreSQL", () => {
  const id = randomBytes(6).toString("hex");
  const role = `app_${id}`;
  const password = randomBytes(12).toString("hex");
  const outsider = `it_outsider_${id}`;
  const urlAs = (user: string, secret: string, database: string) => {
    const url = new URL(ADMIN_URL!);
    url.username = user;
    url.password = secret;
    url.pathname = `/${database}`;
    return url.toString();
  };
  async function sql<T = Record<string, unknown>>(url: string, ...statements: string[]): Promise<T[]> {
    const session = await openBunSql(url);
    try {
      let rows: Record<string, unknown>[] = [];
      for (const statement of statements) rows = await session.run(statement);
      return rows as T[];
    } finally {
      await session.close();
    }
  }
  const admin = <T = Record<string, unknown>>(...statements: string[]) => sql<T>(ADMIN_URL!, ...statements);
  const asApp = <T = Record<string, unknown>>(database: string, ...statements: string[]) => sql<T>(urlAs(role, password, database), ...statements);
  /** Every database whose name carries this run's id (the app's, the replaced ones, the snapshot), then the roles. */
  async function cleanUp(): Promise<void> {
    const dbs = await admin<{ datname: string }>(`SELECT datname FROM pg_database WHERE datname LIKE ${literal(`%${id}%`)}`);
    for (const { datname } of dbs) await admin(`DROP DATABASE IF EXISTS ${ident(datname)} WITH (FORCE)`);
    await admin(`DROP ROLE IF EXISTS ${ident(role)}`, `DROP ROLE IF EXISTS ${ident(outsider)}`);
  }

  test("snapshot, a column dropped and a row written, restore: the column and the first row are back, the later row is set aside, the role still owns its data", async () => {
    try {
      await roundTrip();
    } finally {
      await cleanUp();
    }
  });

  async function roundTrip(): Promise<void> {
    // The app's role and database, made the way PneumaSpace provisions them (gateway/src/providers.ts).
    await admin(
      `CREATE ROLE ${ident(role)}`,
      `ALTER ROLE ${ident(role)} LOGIN PASSWORD ${literal(password)}`,
      `CREATE DATABASE ${ident(role)} OWNER ${ident(role)}`,
      `REVOKE CONNECT ON DATABASE ${ident(role)} FROM PUBLIC`,
      `CREATE ROLE ${ident(outsider)} LOGIN PASSWORD ${literal(password)}`,
    );
    await asApp(role, "CREATE TABLE notes (id integer PRIMARY KEY, body text NOT NULL, note text)", "INSERT INTO notes VALUES (1, 'first', 'kept note')");

    const appDir = join(work, "it-apps", `it${id}`);
    mkdirSync(appDir, { recursive: true });
    const itSpace = new FakeSpace();
    itSpace.bindings.set(`it${id}`, [pg(role)]);
    const lines: string[] = [];
    const cap = postgresTemplateSnapshot({ space: itSpace, connect: () => openBunSql(ADMIN_URL!), server: serverOf(ADMIN_URL!), log: (line) => lines.push(line) });

    // The app is still connected when the snapshot starts, as a running app would be.
    const running = await openBunSql(urlAs(role, password, role));
    const { ref } = await cap.snapshot({ appRoot: appDir, version: "v1" });
    await running.close().catch(() => {});
    expect(ref).toStartWith(`snap_it${id}_v1_`);
    expect(itSpace.log).toContain(`stop it${id}`);
    const privilege = async (database: string, who: string) =>
      (await admin<{ ok: boolean }>(`SELECT has_database_privilege(${literal(who)}, ${literal(database)}, 'CONNECT') AS ok`))[0]!.ok;
    expect(await privilege(ref, role)).toBe(false);
    expect(await privilege(ref, outsider)).toBe(false);

    // The one-way change, then more data on top of it.
    await asApp(role, "ALTER TABLE notes DROP COLUMN note", "INSERT INTO notes VALUES (2, 'second')");

    await cap.restore({ appRoot: appDir, ref });

    const columns = await asApp<{ column_name: string }>(role, "SELECT column_name FROM information_schema.columns WHERE table_name = 'notes' ORDER BY ordinal_position");
    expect(columns.map((c) => c.column_name)).toEqual(["id", "body", "note"]);
    expect(await asApp(role, "SELECT id, body, note FROM notes ORDER BY id")).toEqual([{ id: 1, body: "first", note: "kept note" }]);
    expect(await asApp(role, "SELECT tableowner FROM pg_tables WHERE tablename = 'notes'")).toEqual([{ tableowner: role }]);
    expect(await admin(`SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = ${literal(role)}`)).toEqual([{ owner: role }]);
    expect(await privilege(role, role)).toBe(true);
    expect(await privilege(role, outsider)).toBe(false);

    // Nothing was dropped: the replaced database holds the later row, and the snapshot is still there.
    const aside = await admin<{ datname: string }>(`SELECT datname FROM pg_database WHERE datname LIKE ${literal(`${role}_replaced_%`)}`);
    expect(aside).toHaveLength(1);
    expect(await asApp(aside[0]!.datname, "SELECT id, body FROM notes ORDER BY id")).toEqual([
      { id: 1, body: "first" },
      { id: 2, body: "second" },
    ]);
    expect(cap.setAsideAfter!({ appRoot: appDir })).toContain(aside[0]!.datname);
    expect(await admin(`SELECT 1 AS here FROM pg_database WHERE datname = ${literal(ref)}`)).toEqual([{ here: 1 }]);
    expect(lines.join("\n")).toContain(`kept as ${aside[0]!.datname}`);

    // The same restore can be run again.
    await asApp(role, "INSERT INTO notes VALUES (3, 'third', 'x')");
    await cap.restore({ appRoot: appDir, ref });
    expect(await asApp(role, "SELECT id FROM notes ORDER BY id")).toEqual([{ id: 1 }]);
    expect(await admin(`SELECT datname FROM pg_database WHERE datname LIKE ${literal(`${role}_replaced_%`)}`)).toHaveLength(2);
  }
});
