import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
  /** Each database's comment, as COMMENT ON DATABASE sets it. */
  readonly comments = new Map<string, string>();
  /** Roles that are superusers. Only they can set a comment on a database they own, so only their comment counts. */
  readonly superusers = new Set(["postgres"]);
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
    // A string literal as PostgreSQL reads it, the E'' form (backslashes doubled) included.
    const lit = (text: string) => {
      const [, escaped, body] = /(E?)'((?:[^']|'')*)'/.exec(text)!;
      const value = body!.replaceAll("''", "'");
      return escaped ? value.replaceAll("\\\\", "\\") : value;
    };
    const ids = (text: string) => [...text.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1]!.replaceAll('""', '"'));
    if (sql.startsWith("SELECT 1 FROM pg_database")) return this.databases.has(lit(sql)) ? [{ "?column?": 1 }] : [];
    if (sql.startsWith("SELECT pg_get_userbyid")) {
      const owner = this.databases.get(lit(sql));
      return owner === undefined ? [] : [{ owner }];
    }
    if (sql.startsWith("SELECT pg_terminate_backend")) return [];
    if (sql.startsWith("SELECT d.datname, shobj_description")) {
      const name = /d\.datname = '((?:[^']|'')*)'/.exec(sql)![1]!.replaceAll("''", "'");
      const owner = this.databases.get(name);
      return owner === undefined ? [] : [{ datname: name, marker: this.comments.get(name) ?? null, superuser_owner: this.superusers.has(owner) }];
    }
    if (sql.startsWith("COMMENT ON DATABASE")) {
      const [name] = ids(sql);
      this.comments.set(name!, lit(sql));
      return [];
    }
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
afterEach(() => rmSync(work, { recursive: true, force: true }));

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
/** How restore reads a database's mark, over the admin connection. */
const markOf = (database: string) =>
  `sql SELECT d.datname, shobj_description(d.oid, 'pg_database') AS marker, r.rolsuper AS superuser_owner FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE d.datname = '${database}'`;
/** The mark a snapshot carries: which app, which version, which database it was copied from, and when. */
const mark = (app: string, version: string, source: string, at = AT) =>
  JSON.stringify({ pneuma_snapshot: 1, capability: "postgres-template", app, version, source, taken_at: at.toISOString() });

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
      `sql COMMENT ON DATABASE "${ref}" IS '${mark("todo", "v1", DB)}'`,
    ]);
    expect(server.databases.get(ref)).toBe("postgres");
    // Set over the admin connection on a database a superuser owns: the app's own role can neither make nor mark one.
    expect(JSON.parse(server.comments.get(ref)!)).toEqual({ pneuma_snapshot: 1, capability: "postgres-template", app: "todo", version: "v1", source: DB, taken_at: AT.toISOString() });
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
    space.live.set("todo", { id: "a1", status: "registered", files: [], boots: true, expiresAt: null, manager: null, releases: 1 });
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
    // The same app and version in the same second gets a name of its own. The version part gives way, never
    // the app part (restore reads it to know the snapshot is this app's) or the time; the mark keeps the version.
    const second = (await cap.snapshot({ appRoot: appRoot("a-very-long-app-name-that-goes-on"), version: "v1234567" })).ref;
    expect(second).toBe("snap_a_very_long_app_name_that_goes_on_v12345_20261123t224812_2");
    expect(Buffer.byteLength(second)).toBe(63);
    expect(JSON.parse(server.comments.get(second)!)).toMatchObject({ app: "a-very-long-app-name-that-goes-on", version: "v1234567" });

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
    server.comments.set(SNAP, mark("todo", "v1", DB));
  });

  test("checks the snapshot's mark, stops the app, renames its database aside, copies the snapshot in under the app's role, and closes it to others", async () => {
    const cap = capability(() => RESTORE_AT);
    const root = appRoot();
    expect(cap.setAsideAfter!({ appRoot: root })).toBeUndefined();
    await cap.restore({ appRoot: root, ref: SNAP });

    expect(space.log).toEqual([
      markOf(SNAP),
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
    const gone = "snap_todo_v1_20261101t000000";
    const err = await failure(capability().restore({ appRoot: appRoot(), ref: gone }));
    expect(err.message).toBe(`the snapshot ${gone} is not on the PostgreSQL server at postgres:5432, so todo's data cannot be put back to it. Nothing was changed`);
    expect(space.log).toEqual([markOf(gone)]);
    expect(server.databases.has(DB)).toBe(true);
  });

  // The ref comes from the app's history, which the coding agent can write. Each of these is refused before
  // the app is stopped, before any session is ended and before anything is renamed or copied.
  const untouched = () => {
    expect(space.log.filter((line) => line === "stop todo" || line.includes("pg_terminate_backend") || line.includes("ALTER DATABASE") || line.includes("CREATE DATABASE"))).toEqual([]);
    expect([...server.databases.keys()].sort()).toEqual([...server.databases.keys()].filter((name) => !name.includes("_replaced_")).sort());
    expect(server.databases.get(DB)).toBe(DB);
  };

  test("a ref naming another app's database is refused in plain words, and nothing is touched", async () => {
    server.databases.set("app_otherapp", "app_otherapp");
    const err = await failure(capability().restore({ appRoot: appRoot(), ref: "app_otherapp" }));
    expect(err.message).toBe(
      "refused to put todo's data back from app_otherapp: this capability names todo's snapshots snap_todo_<version>_<time>, so it did not make app_otherapp for todo. " +
        "The name came from the app's history, which the coding agent can write. Nothing was changed",
    );
    expect(space.log).toEqual([]);
    untouched();
  });

  test("a ref with this app's prefix but no mark is refused, also when the mark was set by a role that is not a superuser", async () => {
    const forged = `snap_todo_v1_${STAMP}_2`;
    server.databases.set(forged, "postgres");
    const err = await failure(capability().restore({ appRoot: appRoot(), ref: forged }));
    expect(err.message).toBe(
      `refused to put todo's data back from ${forged}: it carries no mark that this capability made it, so it may not be a snapshot of todo at all. Nothing was changed`,
    );
    expect(space.log).toEqual([markOf(forged)]);

    // The owner of a database can set its comment. A database the app's own role owns proves nothing.
    server.databases.set(forged, DB);
    server.comments.set(forged, mark("todo", "v1", DB));
    expect((await failure(capability().restore({ appRoot: appRoot(), ref: forged }))).message).toContain("it carries no mark that this capability made it");
    untouched();
  });

  test("a ref whose mark names another app, or another database of this app, is refused", async () => {
    // "todo-v1" reads as snap_todo_v1_..., so todo's snapshot of v1 has the right prefix for it. The mark tells them apart.
    const DB2 = "app_ffffffffffff";
    space.bindings.set("todo-v1", [pg(DB2)]);
    server.databases.set(DB2, DB2);
    const err = await failure(capability().restore({ appRoot: appRoot("todo-v1"), ref: SNAP }));
    expect(err.message).toBe(
      `refused to put todo-v1's data back from ${SNAP}: its mark says it was copied from todo's database ${DB}, not from todo-v1's database ${DB2}. Nothing was changed`,
    );
    expect(space.log).toEqual([markOf(SNAP)]);
    expect(server.databases.get(DB2)).toBe(DB2);

    // The same app, but a database PneumaSpace no longer gives it (a switch of engine gives a new, empty one).
    space.log.length = 0;
    server.comments.set(SNAP, mark("todo", "v1", "app_000000000000"));
    expect((await failure(capability().restore({ appRoot: appRoot(), ref: SNAP }))).message).toContain(
      `its mark says it was copied from todo's database app_000000000000, not from todo's database ${DB}`,
    );
    untouched();
  });

  test("an app that is not on PostgreSQL is refused like a snapshot of one", async () => {
    // The ref passes the name check, so the next thing asked is where the app keeps its data.
    space.bindings.set("todo", [sqlite()]);
    expect((await failure(capability().restore({ appRoot: appRoot(), ref: SNAP }))).message).toContain("keeps its data in SQLite");
    expect(space.log).toEqual([]);
  });

  describe("check: the same checks, before anything is released", () => {
    const ownerOf = (database: string) => `sql SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = '${database}'`;

    test("accepts this app's own snapshot, only reads, and closes its session", async () => {
      await capability().check!({ appRoot: appRoot(), ref: SNAP });
      expect(space.log).toEqual([markOf(SNAP), ownerOf(DB)]);
      expect(server.closed).toBe(server.opened);
      untouched();
    });

    // Each case: a name for it, the app, the ref, and what is on the server.
    const refused: [string, string, string, () => void][] = [
      ["another app's database", "todo", "app_otherapp", () => void server.databases.set("app_otherapp", "app_otherapp")],
      ["a snapshot that is not there", "todo", "snap_todo_v1_20261101t000000", () => {}],
      ["a database with this app's prefix and no mark", "todo", `snap_todo_v1_${STAMP}_2`, () => void server.databases.set(`snap_todo_v1_${STAMP}_2`, "postgres")],
      [
        "a mark set by a role that is not a superuser",
        "todo",
        `snap_todo_v1_${STAMP}_2`,
        () => {
          server.databases.set(`snap_todo_v1_${STAMP}_2`, DB);
          server.comments.set(`snap_todo_v1_${STAMP}_2`, mark("todo", "v1", DB));
        },
      ],
      [
        "a mark that names another app",
        "todo-v1",
        SNAP,
        () => {
          space.bindings.set("todo-v1", [pg("app_ffffffffffff")]);
          server.databases.set("app_ffffffffffff", "app_ffffffffffff");
        },
      ],
      ["a mark that names a database PneumaSpace no longer gives the app", "todo", SNAP, () => void server.comments.set(SNAP, mark("todo", "v1", "app_000000000000"))],
      ["an app database the server does not have", "todo", SNAP, () => void server.databases.delete(DB)],
      ["an app that is not on PostgreSQL", "todo", SNAP, () => void space.bindings.set("todo", [sqlite()])],
    ];
    test.each(refused)("refuses %s in the words restore uses, and touches nothing", async (_, app, ref, setup) => {
      setup();
      const before = [...server.databases];
      const byCheck = await failure(capability().check!({ appRoot: appRoot(app), ref }));
      const checked = space.log.splice(0);
      const byRestore = await failure(capability().restore({ appRoot: appRoot(app), ref }));
      expect(byCheck.message).toBe(byRestore.message);
      // Up to the refusal, restore asked exactly what check asked, and neither stopped the app or changed a database.
      expect(space.log).toEqual(checked);
      expect(checked.filter((line) => !line.startsWith("sql SELECT"))).toEqual([]);
      expect([...server.databases]).toEqual(before);
      expect(server.closed).toBe(server.opened);
    });

    test("restore checks again itself: a snapshot that changed after the check is refused", async () => {
      const cap = capability();
      await cap.check!({ appRoot: appRoot(), ref: SNAP });
      // Time passes between the two: here the mark no longer names todo.
      server.comments.set(SNAP, mark("billing", "v1", "app_billing"));
      expect((await failure(cap.restore({ appRoot: appRoot(), ref: SNAP }))).message).toContain("its mark says it was copied from billing's database app_billing");
      untouched();
    });
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
  const roleB = `app_${id}_b`;
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
    await admin(`DROP ROLE IF EXISTS ${ident(role)}`, `DROP ROLE IF EXISTS ${ident(outsider)}`, `DROP ROLE IF EXISTS ${ident(roleB)}`);
  }

  test("another app's snapshot is refused, by its name and by its mark, before either app or its database is touched", async () => {
    try {
      await crossApp();
    } finally {
      await cleanUp();
    }
  });

  async function crossApp(): Promise<void> {
    // App A is it<id>; app B is it<id>-v1, so B's snapshots are named snap_it<id>_v1_... and A's snapshot of v1 has B's prefix too.
    const a = `it${id}`;
    const b = `it${id}-v1`;
    for (const r of [role, roleB]) {
      await admin(`CREATE ROLE ${ident(r)}`, `ALTER ROLE ${ident(r)} LOGIN PASSWORD ${literal(password)}`, `CREATE DATABASE ${ident(r)} OWNER ${ident(r)}`, `REVOKE CONNECT ON DATABASE ${ident(r)} FROM PUBLIC`);
    }
    await asApp(role, "CREATE TABLE notes (id integer PRIMARY KEY, body text NOT NULL)", "INSERT INTO notes VALUES (1, 'a row of A')");
    const asB = <T = Record<string, unknown>>(...statements: string[]) => sql<T>(urlAs(roleB, password, roleB), ...statements);
    await asB("CREATE TABLE notes (id integer PRIMARY KEY, body text NOT NULL)", "INSERT INTO notes VALUES (1, 'a row of B')");
    const dirA = join(work, "it-apps", a);
    const dirB = join(work, "it-apps", b);
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    const itSpace = new FakeSpace();
    itSpace.bindings.set(a, [pg(role)]);
    itSpace.bindings.set(b, [pg(roleB)]);
    const cap = postgresTemplateSnapshot({ space: itSpace, connect: () => openBunSql(ADMIN_URL!), server: serverOf(ADMIN_URL!) });

    const { ref } = await cap.snapshot({ appRoot: dirA, version: "v1" });
    expect(ref).toStartWith(`snap_it${id}_v1_`);
    // The mark is on the server, set over the admin connection, on a database the admin role owns.
    const [stored] = await admin<{ marker: string; superuser_owner: boolean }>(
      `SELECT shobj_description(d.oid, 'pg_database') AS marker, r.rolsuper AS superuser_owner FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE d.datname = ${literal(ref)}`,
    );
    expect(stored!.superuser_owner).toBe(true);
    expect(JSON.parse(stored!.marker)).toMatchObject({ pneuma_snapshot: 1, capability: "postgres-template", app: a, version: "v1", source: role });
    itSpace.log.length = 0;

    // B is handed A's snapshot: the name fits B's prefix, the mark does not name B.
    const byMark = await failure(cap.restore({ appRoot: dirB, ref }));
    expect(byMark.message).toContain(`its mark says it was copied from ${a}'s database ${role}, not from ${b}'s database ${roleB}`);
    // A is handed B's own database: the name is not one of A's snapshots.
    const byName = await failure(cap.restore({ appRoot: dirA, ref: roleB }));
    expect(byName.message).toContain(`so it did not make ${roleB} for ${a}`);
    // check, which runs before anything is released, says the same.
    expect((await failure(cap.check!({ appRoot: dirB, ref }))).message).toBe(byMark.message);
    expect((await failure(cap.check!({ appRoot: dirA, ref: roleB }))).message).toBe(byName.message);
    await cap.check!({ appRoot: dirA, ref });

    // Neither app was stopped, no database was renamed, and each still holds its own row.
    expect(itSpace.log).toEqual([]);
    expect(await admin(`SELECT datname FROM pg_database WHERE datname LIKE ${literal(`%${id}%_replaced_%`)}`)).toEqual([]);
    expect(await asB("SELECT body FROM notes")).toEqual([{ body: "a row of B" }]);
    expect(await asApp(role, "SELECT body FROM notes")).toEqual([{ body: "a row of A" }]);

    // A's own snapshot still restores A.
    await asApp(role, "INSERT INTO notes VALUES (2, 'later')");
    await cap.restore({ appRoot: dirA, ref });
    expect(await asApp(role, "SELECT body FROM notes ORDER BY id")).toEqual([{ body: "a row of A" }]);
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
