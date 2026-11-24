import { basename, resolve } from "node:path";
import { SQL } from "bun";
import type { HostDataSnapshot } from "./host";
import type { SpaceBinding, SpaceRuntime } from "./space";

// ---------------------------------------------------------------------------
// A practice, not a promise: a data snapshot capability for apps whose database
// PneumaSpace put on PostgreSQL. `PNEUMA_DATA_SNAPSHOT=postgres-template`.
//
// `CREATE DATABASE new TEMPLATE old` makes a full copy of a database inside the
// server. That is the local stand-in for a database branch (Neon's branching,
// for instance). The snapshot is a database of its own. Restoring renames the
// app's database aside and makes a fresh copy of the snapshot under its name.
//
// Neither the framework nor PneumaSpace promises any of this. The framework
// only defines the interface; PneumaSpace leaves backups to the storage layer
// and says where each binding's data lives (`GET /api/apps/<name>/state`).
// This file is one Host's way of filling that gap on one trusted machine: the
// admin connection it needs is superuser access to every app's database.
//
// The ref `restore` receives comes from the app's history, which the coding agent
// can write. So `restore` uses a ref only when it is a snapshot this capability
// made for this app: the name has this app's prefix, and the database carries a
// mark set over the admin connection when the snapshot was taken, naming the
// app, the version and the database it was copied from. `check` makes the same
// checks, through the same function, before the Host releases anything; `restore`
// makes them again, because the server can change in between.
// ---------------------------------------------------------------------------

export const POSTGRES_TEMPLATE = "postgres-template";

/**
 * The SQL this capability needs, behind the smallest seam a test can script. One statement per call,
 * sent as a simple query and never inside a transaction: `CREATE DATABASE` refuses to run in one.
 */
export interface SqlSession {
  run(sql: string): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

export interface PostgresTemplateOptions {
  /** Where an app keeps its data, and how to stop its instance. */
  readonly space: Pick<SpaceRuntime, "state" | "stop">;
  /** Opens a superuser session on the server PneumaSpace puts app databases on. */
  readonly connect: () => Promise<SqlSession>;
  /** That server, for messages, without credentials, e.g. postgres:5432. */
  readonly server: string;
  /** How many times to try a step a waking app can get in the way of. Default 5. */
  readonly attempts?: number;
  /** The wait after the first busy answer; it grows by this much after each one. Default 200 ms. */
  readonly retryDelayMs?: number;
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly log?: (line: string) => void;
}

/** PostgreSQL keeps 63 bytes of an identifier and silently cuts the rest, which could make two names one. */
const MAX_IDENTIFIER_BYTES = 63;

/** A quoted identifier. Doubling the quote character is all quoting needs; a NUL byte cannot be in a name at all. */
export function ident(name: string): string {
  if (name.includes("\0")) throw new Error(`a database name cannot contain a NUL byte: ${JSON.stringify(name)}`);
  return `"${name.replaceAll('"', '""')}"`;
}

/** A string literal, as PostgreSQL's own quote_literal writes it: doubled quotes, and the E'' form when there is a backslash. */
export function literal(text: string): string {
  if (text.includes("\0")) throw new Error(`a string sent to PostgreSQL cannot contain a NUL byte: ${JSON.stringify(text)}`);
  const quoted = `'${text.replaceAll("'", "''")}'`;
  return text.includes("\\") ? `E${quoted.replaceAll("\\", "\\\\")}` : quoted;
}

/** `keep + cut + tail`, with `cut` shortened a character at a time until the whole fits in 63 bytes. `keep` and `tail` are never cut. */
function fit(keep: string, cut: string, tail: string): string {
  let middle = cut;
  while (middle && Buffer.byteLength(keep + middle + tail) > MAX_IDENTIFIER_BYTES) middle = Array.from(middle).slice(0, -1).join("");
  const name = keep + middle + tail;
  if (Buffer.byteLength(name) > MAX_IDENTIFIER_BYTES) throw new Error(`cannot make a database name of at most ${MAX_IDENTIFIER_BYTES} bytes from ${JSON.stringify(keep + cut + tail)}`);
  return name;
}

/** 2026-11-23T22:48:12.345Z -> 20261123t224812: sortable, readable, and valid unquoted. */
function stamp(at: Date): string {
  return at.toISOString().replace(/\.\d+Z$/, "").replace(/[-:]/g, "").replace("T", "t");
}

/** Lower-case letters, digits and underscores only, so the name reads the same quoted or not. */
function plain(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** How this capability names an app's snapshots: snap_<app>_<version>_<time>. The app part is never shortened. */
function snapshotPrefix(app: string): string {
  return `snap_${plain(app)}_`;
}

/**
 * What `snapshot` writes into the snapshot database's comment, over the admin connection. Only the owner
 * of a database or a superuser can set its comment, and a snapshot is owned by the admin role, so the
 * app's own role cannot forge one; `restore` also checks that a superuser owns the database.
 */
interface SnapshotMark {
  readonly pneuma_snapshot: 1;
  readonly capability: typeof POSTGRES_TEMPLATE;
  readonly app: string;
  readonly version: string;
  /** The app's database the snapshot was copied from. */
  readonly source: string;
  readonly taken_at: string;
}

function readMark(text: unknown): SnapshotMark | undefined {
  if (typeof text !== "string") return undefined;
  try {
    const mark = JSON.parse(text) as Partial<SnapshotMark>;
    if (mark.pneuma_snapshot !== 1 || mark.capability !== POSTGRES_TEMPLATE) return undefined;
    if (typeof mark.app !== "string" || typeof mark.source !== "string" || typeof mark.version !== "string") return undefined;
    return mark as SnapshotMark;
  } catch {
    return undefined;
  }
}

/** PostgreSQL's answer when a database it must copy or rename still has a session on it (SQLSTATE 55006). */
function busy(err: unknown): boolean {
  const e = err as { errno?: unknown; code?: unknown } | null;
  return e?.errno === "55006" || e?.code === "55006" || /is being accessed by other users/.test(message(err));
}

const ON_POSTGRES =
  "An app gets a PostgreSQL database when the operator sets PneumaSpace's global policy db_backend to postgres before the app's first publish that declares a database " +
  `(on the compose stack: curl -X PUT http://127.0.0.1:8081/api/policy -H 'content-type: application/json' -d '{"db_backend":"postgres"}'). ` +
  "An app that already has a database keeps it: switching that app with PUT /api/apps/<name>/policy gives it a new, empty PostgreSQL database and does not move its data.";

/** Why an app without an active PostgreSQL `db` binding cannot be handled here, and what to do about it. */
function notOnPostgres(name: string, dbBindings: readonly SpaceBinding[]): string {
  const active = dbBindings.find((binding) => binding.state === "active");
  const where = active
    ? `${name} keeps its data in ${active.provider === "sqlite" ? "SQLite, PneumaSpace's default database engine" : `a ${active.provider} database`}.`
    : `${name} declares no database ("db" in pneuma-space.json), so its stored data, if any, is files or key-value data.`;
  return `${where} This Host's data snapshot capability (${POSTGRES_TEMPLATE}) handles PostgreSQL databases only, so it cannot save ${name}'s data. ${ON_POSTGRES}`;
}

/**
 * The capability. `snapshot` copies the app's database to a new one; `restore` puts the app's database
 * back to such a copy; `check` says, changing nothing, whether `restore` would accept a ref. The ref is
 * the snapshot database's name.
 */
export function postgresTemplateSnapshot(opts: PostgresTemplateOptions): HostDataSnapshot {
  const attempts = Math.max(1, opts.attempts ?? 5);
  const delay = opts.retryDelayMs ?? 200;
  const now = opts.now ?? (() => new Date());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const log = opts.log ?? (() => {});
  /** Where the last restore in this process put each app's replaced database, by app directory. */
  const setAside = new Map<string, string>();

  /** The PneumaSpace name of the app in `appRoot`: the Host keeps each app at <apps dir>/<name>. */
  const appName = (appRoot: string): string => basename(resolve(appRoot));

  /** The app's database, as PneumaSpace says, not as a guess from its name. */
  async function appDatabase(name: string): Promise<string> {
    let bindings: readonly SpaceBinding[];
    try {
      bindings = (await opts.space.state(name)).bindings;
    } catch (err) {
      throw new Error(`cannot ask PneumaSpace where ${name} keeps its data (${message(err)})`);
    }
    const db = bindings.filter((binding) => binding.kind === "db");
    const postgres = db.find((binding) => binding.provider === "postgres" && binding.state === "active");
    if (!postgres) throw new Error(notOnPostgres(name, db));
    const database = postgres.location.database;
    if (typeof database !== "string" || !database) throw new Error(`PneumaSpace lists a PostgreSQL database for ${name} but does not say its name, so there is nothing to copy`);
    return database;
  }

  async function open(): Promise<SqlSession> {
    try {
      return await opts.connect();
    } catch (err) {
      throw new Error(
        `cannot reach the PostgreSQL server at ${opts.server} that PNEUMA_DATA_SNAPSHOT_URL names (${message(err)}). ` +
          "On the compose stack, start it with: docker compose --profile postgres up -d",
      );
    }
  }

  async function exists(session: SqlSession, database: string): Promise<boolean> {
    return (await session.run(`SELECT 1 FROM pg_database WHERE datname = ${literal(database)}`)).length > 0;
  }

  /** `keep + cut + tail` with `cut` shortened to fit, or with `_2`, `_3` ... after it when a database by that name is already there. */
  async function freeName(session: SqlSession, keep: string, cut: string, tail: string): Promise<string> {
    for (let n = 1; n <= 20; n++) {
      const name = fit(keep, cut, n === 1 ? tail : `${tail}_${n}`);
      if (!(await exists(session, name))) return name;
    }
    throw new Error(`could not find a free database name starting with ${keep}${cut}${tail}`);
  }

  /** Take the app's instance down so it lets go of its database. The next request wakes it again. */
  async function quiesce(name: string): Promise<void> {
    try {
      await opts.space.stop(name);
    } catch (err) {
      throw new Error(`could not stop ${name} before touching its database (${message(err)}). Nothing was changed`);
    }
  }

  /**
   * End every other session on `database`, then run `step`. A request that arrives meanwhile wakes the
   * app, which connects again, and PostgreSQL then refuses to copy or rename the database. So a busy
   * answer is tried again a few times, ending the sessions before each try.
   */
  async function onlyUs(session: SqlSession, database: string, what: string, step: () => Promise<unknown>): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      await session.run(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${literal(database)} AND pid <> pg_backend_pid()`);
      try {
        await step();
        return;
      } catch (err) {
        if (!busy(err)) throw err;
        if (attempt >= attempts) {
          throw new Error(`could not ${what}: something kept connecting to ${database} (tried ${attempts} times; ${message(err)})`);
        }
        await sleep(delay * attempt);
      }
    }
  }

  /**
   * The checks `check` and `restore` both make, in this order, before the app is stopped or any session is
   * ended: the ref has this app's prefix; PneumaSpace names the app's PostgreSQL database; the snapshot is on
   * the server, owned by a superuser, and its mark names this app and that database; the app's database is
   * on the server. The ref was read from the app's history, which the coding agent can write, and what
   * `restore` does next runs as a superuser. Each refusal is a plain error, thrown before anything changed.
   * When all pass, `then` (restore's own work) runs on the same session; the session is closed either way.
   */
  async function withOwnSnapshot(
    name: string,
    ref: string,
    then?: (session: SqlSession, found: { database: string; owner: string }) => Promise<void>,
  ): Promise<void> {
    const prefix = snapshotPrefix(name);
    if (typeof ref !== "string" || !ref.startsWith(prefix)) {
      throw new Error(
        `refused to put ${name}'s data back from ${String(ref)}: this capability names ${name}'s snapshots ${prefix}<version>_<time>, so it did not make ${String(ref)} for ${name}. ` +
          "The name came from the app's history, which the coding agent can write. Nothing was changed",
      );
    }
    const database = await appDatabase(name);
    const session = await open();
    try {
      const [row] = await session.run(
        `SELECT d.datname, shobj_description(d.oid, 'pg_database') AS marker, r.rolsuper AS superuser_owner FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE d.datname = ${literal(ref)}`,
      );
      if (!row) {
        throw new Error(`the snapshot ${ref} is not on the PostgreSQL server at ${opts.server}, so ${name}'s data cannot be put back to it. Nothing was changed`);
      }
      // A database's owner can set its comment; only a mark on a database a superuser owns was set by an admin.
      const mark = row.superuser_owner === true || row.superuser_owner === "t" ? readMark(row.marker) : undefined;
      if (!mark) {
        throw new Error(`refused to put ${name}'s data back from ${ref}: it carries no mark that this capability made it, so it may not be a snapshot of ${name} at all. Nothing was changed`);
      }
      if (mark.app !== name || mark.source !== database) {
        throw new Error(
          `refused to put ${name}'s data back from ${ref}: its mark says it was copied from ${mark.app}'s database ${mark.source}, not from ${name}'s database ${database}. Nothing was changed`,
        );
      }
      const owner = (await session.run(`SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = ${literal(database)}`))[0]?.owner;
      if (typeof owner !== "string") {
        throw new Error(`PneumaSpace says ${name}'s database is ${database}, but the PostgreSQL server at ${opts.server} has none by that name. Nothing was changed`);
      }
      await then?.(session, { database, owner });
    } finally {
      await session.close().catch(() => {});
    }
  }

  return {
    id: POSTGRES_TEMPLATE,
    setAsideNote: "The database in use now is not dropped: it is renamed to <its name>_replaced_<date and time of the undo> on the same PostgreSQL server.",

    setAsideAfter({ appRoot }) {
      const name = setAside.get(resolve(appRoot));
      return name ? `The database that was in use is kept as ${name} on the PostgreSQL server at ${opts.server}.` : undefined;
    },

    async snapshot({ appRoot, version }) {
      const name = appName(appRoot);
      const database = await appDatabase(name);
      const session = await open();
      try {
        if (!(await exists(session, database))) {
          throw new Error(`PneumaSpace says ${name}'s database is ${database}, but the PostgreSQL server at ${opts.server} has none by that name. PNEUMA_DATA_SNAPSHOT_URL must name the server PneumaSpace uses`);
        }
        const takenAt = now();
        const ref = await freeName(session, snapshotPrefix(name), plain(version), `_${stamp(takenAt)}`);
        await quiesce(name);
        await onlyUs(session, database, `copy ${database} to ${ref}`, () => session.run(`CREATE DATABASE ${ident(ref)} TEMPLATE ${ident(database)}`));
        try {
          // The copy does not inherit the app database's REVOKE: a new database lets PUBLIC connect.
          await session.run(`REVOKE CONNECT ON DATABASE ${ident(ref)} FROM PUBLIC`);
        } catch (err) {
          throw new Error(`copied ${database} to ${ref}, but could not close the copy to other roles (${message(err)}); ${ref} is left on the server`);
        }
        const mark: SnapshotMark = { pneuma_snapshot: 1, capability: POSTGRES_TEMPLATE, app: name, version, source: database, taken_at: takenAt.toISOString() };
        try {
          await session.run(`COMMENT ON DATABASE ${ident(ref)} IS ${literal(JSON.stringify(mark))}`);
        } catch (err) {
          // Without the mark, restore refuses this copy, so an undo could not use it: the snapshot failed.
          throw new Error(`copied ${database} to ${ref}, but could not mark the copy as ${name}'s snapshot (${message(err)}); ${ref} is left on the server`);
        }
        log(`${name}: stored data before leaving ${version} copied to the database ${ref} on ${opts.server}`);
        return { ref };
      } finally {
        await session.close().catch(() => {});
      }
    },

    async check({ appRoot, ref }) {
      // Runs before the Host releases the older code, and only reads.
      await withOwnSnapshot(appName(appRoot), ref);
    },

    async restore({ appRoot, ref }) {
      const name = appName(appRoot);
      // The same checks as check, again: time has passed since, and the server may have changed.
      await withOwnSnapshot(name, ref, async (session, { database, owner }) => {
        const aside = await freeName(session, "", database, `_replaced_${stamp(now())}`);
        await quiesce(name);
        await onlyUs(session, database, `rename ${database} aside`, () => session.run(`ALTER DATABASE ${ident(database)} RENAME TO ${ident(aside)}`));
        try {
          await onlyUs(session, ref, `copy the snapshot ${ref} to ${database}`, () =>
            session.run(`CREATE DATABASE ${ident(database)} TEMPLATE ${ident(ref)} OWNER ${ident(owner)}`),
          );
        } catch (err) {
          try {
            await onlyUs(session, aside, `rename ${aside} back`, () => session.run(`ALTER DATABASE ${ident(aside)} RENAME TO ${ident(database)}`));
          } catch (back) {
            throw new Error(
              `could not make ${database} a copy of the snapshot ${ref} (${message(err)}), and could not rename the database that was in use back (${message(back)}). ` +
                `${name}'s data is intact in ${aside} on ${opts.server}, but ${name} cannot reach it until a superuser runs: ALTER DATABASE ${ident(aside)} RENAME TO ${ident(database)}`,
            );
          }
          throw new Error(`could not make ${database} a copy of the snapshot ${ref} (${message(err)}). The database that was in use was renamed back, so nothing was changed`);
        }
        try {
          // As PneumaSpace provisions it: only the app's own role connects.
          await session.run(`REVOKE CONNECT ON DATABASE ${ident(database)} FROM PUBLIC`);
        } catch (err) {
          // The data is back; failing the restore now would report that nothing changed. Say it instead.
          log(`${name}: ${database} was put back from ${ref}, but REVOKE CONNECT ... FROM PUBLIC failed (${message(err)}); run it as a superuser`);
        }
        setAside.set(resolve(appRoot), aside);
        log(`${name}: stored data put back from ${ref}; the database that was in use is kept as ${aside} on ${opts.server}`);
      });
    },
  };
}

/** Bun's built-in PostgreSQL client as an `SqlSession`. Connects before it returns, so an unreachable server is reported first. */
export async function openBunSql(url: string): Promise<SqlSession> {
  const sql = new SQL(url, { max: 1, connectionTimeout: 10, idleTimeout: 30 });
  const session: SqlSession = {
    run: async (text) => Array.from(await sql.unsafe<Record<string, unknown>[]>(text).simple()),
    close: () => sql.close({ timeout: 5 }),
  };
  try {
    await session.run("SELECT 1");
  } catch (err) {
    await sql.close({ timeout: 0 }).catch(() => {});
    throw err;
  }
  return session;
}

/** host:port of a PostgreSQL URL, with no credentials, for messages. */
export function serverOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || "5432"}`;
}
