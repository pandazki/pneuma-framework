import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "@pneuma-framework/host-kit/workspace";
import type { CommandResult, ProbeResult, PublishOptions, PublishResult, SpaceApp, SpaceBinding, SpaceRuntime, SpaceState } from "../src/space";

export const FIXTURE_TEMPLATE = join(import.meta.dir, "fixture-template");

type FakeStatus = "registered" | "removed" | "purging";

interface FakeApp {
  /** The app's id, as PneumaSpace makes one at the first publish: a later app of the same name has another. */
  id: string;
  status: FakeStatus;
  files: string[];
  boots: boolean;
  /** When an ephemeral app ends itself (ms since the epoch); null for a durable app. */
  expiresAt: number | null;
  manager: { name: string; url: string | null } | null;
  releases: number;
}

let nextId = 0;
const newAppId = () => (0xa00000000000 + nextId++).toString(16);

/**
 * An in-memory PneumaSpace. It keeps what the real platform would keep that the
 * loop depends on: which source is live under each name, and whether it boots.
 * A published tree containing src/BOOT_FAILS answers 502, like an app that
 * crashes on start. A tree containing src/PUBLISH_FAILS is refused at publish.
 *
 * It enforces what PneumaSpace (at the commit compose.yaml pins) enforces on the
 * writes the Host makes, with the same answers (ADRs 0038 and 0039): a write to a
 * managed app that does not name its manager is refused with 409; a publish whose
 * ephemeral marker does not match the app is refused with 409, and one onto an app
 * being purged too; discard ends only an ephemeral app, from any status, and with
 * an app id it ends nothing when the name now belongs to another app; an ephemeral
 * app's ttl is fixed at its first publish and may not exceed `maxTtlSeconds`; the
 * tenant holds at most `ephemeralQuota` ephemeral apps that are not being purged.
 *
 * Like PneumaSpace it lists an app until it is purged, whatever its status, and
 * an ephemeral app whose end has passed stays listed, and keeps answering, until
 * the leader's sweep ends it. Nothing sweeps here on its own: a test calls
 * `sweep()`. `now` is the clock the end is set and swept by.
 */
export class FakeSpace implements SpaceRuntime {
  readonly live = new Map<string, FakeApp>();
  readonly log: string[] = [];
  /** When set, a publish it returns true for is refused, whatever the tree holds. */
  refuse: ((name: string, dir: string) => boolean) | null = null;
  /** When set, a publish it returns true for goes up but does not boot. */
  unhealthy: ((name: string, dir: string) => boolean) | null = null;
  /** When set, a discard or take-down it returns true for fails and the app stays live. */
  failDiscard: ((name: string) => boolean) | null = null;
  /** Called at the start of every publish: stands in for whatever else happens while a publish is under way. */
  onPublish: ((name: string, dir: string) => void) | null = null;
  /** What `state` lists for an app, by name. An app with none set answers with no bindings. */
  readonly bindings = new Map<string, SpaceBinding[]>();
  /** When set, `stop` throws for the names it returns true for. */
  failStop: ((name: string) => boolean) | null = null;
  /** When set, `app` throws, as when the admin API does not answer. */
  unreachable = false;
  /** PneumaSpace's global ephemeral_max_ttl_seconds. */
  maxTtlSeconds = 3600;
  /** The tenant's `ephemeral` quota: 3 for every tenant but `default`, and for a row without the field. Null: unlimited. */
  ephemeralQuota: number | null = 3;
  /** The clock an ephemeral app's end is set and swept by. */
  now: () => number = () => Date.now();

  async init(dir: string): Promise<CommandResult> {
    cpSync(FIXTURE_TEMPLATE, dir, { recursive: true });
    return { code: 0, output: `created ${dir}` };
  }

  /** The leader's sweep: every ephemeral app whose end has come is ended, with its data, whatever its status. */
  sweep(): void {
    for (const [name, app] of this.live) {
      if (app.expiresAt !== null && app.expiresAt <= this.now()) {
        this.live.delete(name);
        this.log.push(`expire ${name}`);
      }
    }
  }

  /** PneumaSpace's 409 for a write to a managed app that does not name its manager, or null when the write may go ahead. */
  private unnamed(name: string, named: string | undefined): string | null {
    const manager = this.live.get(name)?.manager;
    if (!manager || named === manager.name) return null;
    return `app "${name}" is managed by ${manager.name}${manager.url ? ` (${manager.url})` : ""}; acting here goes around it. Act through ${manager.name}, or name it to act anyway: X-Pneuma-Space-Manager: ${manager.name} (appctl --manager ${manager.name})`;
  }

  async app(name: string): Promise<SpaceApp | null> {
    if (this.unreachable) throw new Error("PneumaSpace admin answered 502 to GET /api/apps");
    const app = this.live.get(name);
    return app ? { name, status: app.status, expiresAt: app.expiresAt, manager: app.manager ? { ...app.manager } : null } : null;
  }

  async publish(name: string, dir: string, options: PublishOptions = {}): Promise<PublishResult> {
    this.onPublish?.(name, dir);
    const existing = this.live.get(name);
    const release = `PUT /api/apps/${name}/release`;
    if (existing?.status === "purging") {
      this.log.push(`publish ${name} refused (purging)`);
      return { code: 1, output: `appctl: ${release}: 409 app "${name}" is being purged; publish again once purge finishes` };
    }
    const unnamed = this.unnamed(name, options.manager?.name);
    if (unnamed) {
      this.log.push(`publish ${name} refused (managed)`);
      return { code: 1, output: `appctl: ${release}: 409 ${unnamed}` };
    }
    if (existing && (existing.expiresAt === null) === (options.ephemeral !== undefined)) {
      this.log.push(`publish ${name} refused (ephemeral marker)`);
      return {
        code: 1,
        output:
          existing.expiresAt === null
            ? `appctl: ${release}: 409 app "${name}" is durable and never becomes ephemeral; publish the ephemeral copy under another name`
            : `appctl: ${release}: 409 app "${name}" is ephemeral until ${new Date(existing.expiresAt).toISOString()} and never becomes durable; publish it as ephemeral, or the durable app under another name`,
      };
    }
    const ttl = options.ephemeral?.ttlSeconds;
    if (!existing && ttl !== undefined && !(Number.isInteger(ttl) && ttl > 0 && ttl <= this.maxTtlSeconds)) {
      this.log.push(`publish ${name} refused (ttl)`);
      return { code: 1, output: `appctl: ${release}: 400 ephemeral ttl_seconds must be a whole number from 1 to ${this.maxTtlSeconds} (ephemeral_max_ttl_seconds), got ${ttl}` };
    }
    const used = [...this.live.values()].filter((app) => app.expiresAt !== null && app.status !== "purging").length;
    if (!existing && ttl !== undefined && this.ephemeralQuota !== null && used + 1 > this.ephemeralQuota) {
      this.log.push(`publish ${name} refused (ephemeral quota)`);
      const refusal = { resource: "ephemeral", used, limit: this.ephemeralQuota, ask: 1 };
      return { code: 1, output: `appctl: ${release}: 409 tenant "team" is at its ephemeral quota: ${used} used + 1 asked > ${this.ephemeralQuota}\nquota ${JSON.stringify({ tenant: "team", ...refusal })}` };
    }
    if (existsSync(join(dir, "src", "PUBLISH_FAILS")) || this.refuse?.(name, dir)) {
      this.log.push(`publish ${name} refused`);
      return { code: 3, output: "appctl: 409 quota exceeded" };
    }
    const given = options.manager;
    const manager = given ? { name: given.name, url: given.url !== undefined ? given.url : existing?.manager?.name === given.name ? existing.manager.url : null } : (existing?.manager ?? null);
    const app: FakeApp = {
      id: existing?.id ?? newAppId(),
      // A publish onto a removed app registers it again.
      status: "registered",
      files: listFiles(dir),
      boots: !existsSync(join(dir, "src", "BOOT_FAILS")) && !this.unhealthy?.(name, dir),
      // Fixed at the first publish; a later one does not extend it, even once it has passed.
      expiresAt: existing ? existing.expiresAt : ttl !== undefined ? this.now() + ttl * 1000 : null,
      manager,
      releases: (existing?.releases ?? 0) + 1,
    };
    this.live.set(name, app);
    this.log.push(`publish ${name}`);
    // As appctl prints it: an ephemeral app's line ends with its end and its id.
    const ends = app.expiresAt !== null ? `  expires ${new Date(app.expiresAt).toISOString()}  app ${app.id}` : "";
    return { code: 0, output: `${name}  ${this.address(name)}  release ${app.releases}${ends}`, ...(app.expiresAt !== null ? { app: app.id } : {}) };
  }

  async probe(name: string): Promise<ProbeResult> {
    const app = this.live.get(name);
    if (!app || app.status !== "registered") return { ok: false, status: 404, detail: "not found" };
    return app.boots ? { ok: true, status: 200, detail: "" } : { ok: false, status: 502, detail: "did not start" };
  }

  async discard(name: string, manager?: string, id?: string): Promise<boolean> {
    if (this.failDiscard?.(name)) {
      this.log.push(`discard ${name} failed`);
      return false;
    }
    const app = this.live.get(name);
    if (!app) {
      this.log.push(`discard ${name} (gone)`);
      return true;
    }
    if (id && app.id !== id) {
      // PneumaSpace: "the name belongs to a later app; nothing was discarded".
      this.log.push(`discard ${name} refused (another app)`);
      return false;
    }
    if (this.unnamed(name, manager)) {
      this.log.push(`discard ${name} refused (managed)`);
      return false;
    }
    if (app.expiresAt === null) {
      // PneumaSpace: "discard ends only an ephemeral app, remove and purge end this one".
      this.log.push(`discard ${name} refused (durable)`);
      return false;
    }
    this.live.delete(name);
    this.log.push(`discard ${name}`);
    return true;
  }

  async takeDown(name: string, manager?: string): Promise<boolean> {
    if (this.failDiscard?.(name)) {
      this.log.push(`take down ${name} failed`);
      return false;
    }
    if (!this.live.has(name)) return true;
    if (this.unnamed(name, manager)) {
      this.log.push(`take down ${name} refused (managed)`);
      return false;
    }
    this.live.delete(name);
    this.log.push(`take down ${name}`);
    return true;
  }

  async state(name: string): Promise<SpaceState> {
    if (!this.live.has(name) && !this.bindings.has(name)) throw new Error(`PneumaSpace has no app named ${name}`);
    return { app: name, release: null, bundle: null, bindings: this.bindings.get(name) ?? [] };
  }

  async stop(name: string): Promise<void> {
    if (this.failStop?.(name)) throw new Error(`PneumaSpace admin answered 500 to POST /api/apps/${name}/stop`);
    this.log.push(`stop ${name}`);
  }

  address(name: string): string {
    return `http://space.test/apps/${name}/`;
  }

  /** The ephemeral apps PneumaSpace lists now, in any status. */
  previews(): string[] {
    return [...this.live].filter(([, app]) => app.expiresAt !== null).map(([name]) => name);
  }

  /** What someone at the console or with appctl would do: clear an app's manager, or set another one. */
  setManager(name: string, manager: { name: string; url?: string | null } | null): void {
    const app = this.live.get(name);
    if (!app) throw new Error(`no app ${name}`);
    app.manager = manager ? { name: manager.name, url: manager.url ?? null } : null;
  }

  /** An app's status, as `appctl remove` leaves it (`removed`), or an end that failed (`purging`, until it is retried). */
  setStatus(name: string, status: FakeStatus): void {
    const app = this.live.get(name);
    if (!app) throw new Error(`no app ${name}`);
    app.status = status;
  }
}

/**
 * Stands in for `npm ci && npm test` in an app made from the PneumaSpace template, on Node 24 (`node --test
 * '**\/*.test.ts'`): the SDK's two test files always run, and so does every *.test.ts under src/ of the copy it is run in. Its output and
 * report have the shape Node's test runner gives them (one test per file here).
 */
export async function templateTests(root: string): Promise<{ ok: true; output: string; report: string }> {
  const files = ["sdk/serve.test.ts", "sdk/db.test.ts", ...listFiles(root).filter((file) => file.startsWith("src/") && file.endsWith(".test.ts"))];
  return {
    ok: true,
    output: `> node --test '**/*.test.ts'\n\nℹ tests ${files.length}\nℹ pass ${files.length}\nℹ fail 0\nℹ skipped 0\nℹ todo 0`,
    report: `<testsuites>\n${files.map((file, i) => `\t<testcase name="t${i}" classname="test" file="${join(root, file)}"/>`).join("\n")}\n</testsuites>\n`,
  };
}
