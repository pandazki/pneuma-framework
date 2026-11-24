import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "@pneuma-framework/host-kit/workspace";
import type { CommandResult, ProbeResult, PublishOptions, SpaceApp, SpaceBinding, SpaceRuntime, SpaceState } from "../src/space";

export const FIXTURE_TEMPLATE = join(import.meta.dir, "fixture-template");

interface FakeApp {
  files: string[];
  boots: boolean;
  /** When an ephemeral app ends itself (ms since the epoch); null for a durable app. */
  expiresAt: number | null;
  manager: { name: string; url: string | null } | null;
}

/**
 * An in-memory PneumaSpace. It keeps what the real platform would keep that the
 * loop depends on: which source is live under each name, and whether it boots.
 * A published tree containing src/BOOT_FAILS answers 502, like an app that
 * crashes on start. A tree containing src/PUBLISH_FAILS is refused at publish.
 *
 * It enforces what PneumaSpace enforces on the writes the Host makes, with the
 * same answers (ADRs 0038 and 0039 in PneumaSpace): a write to a managed app
 * that does not name its manager is refused with 409; a publish whose ephemeral
 * marker does not match the app is refused with 409; discard ends only an
 * ephemeral app; an ephemeral app's ttl is fixed at its first publish, may not
 * exceed `maxTtlSeconds`, and once it is reached the app is gone. `now` is the
 * clock the expiry reads, so a test can move past it.
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
  /** The clock expiry reads. */
  now: () => number = () => Date.now();

  async init(dir: string): Promise<CommandResult> {
    cpSync(FIXTURE_TEMPLATE, dir, { recursive: true });
    return { code: 0, output: `created ${dir}` };
  }

  /** The expiry sweep: an ephemeral app whose end has come is gone, with its data. */
  private sweep(): void {
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
    this.sweep();
    const app = this.live.get(name);
    return app ? { name, expiresAt: app.expiresAt, manager: app.manager ? { ...app.manager } : null } : null;
  }

  async publish(name: string, dir: string, options: PublishOptions = {}): Promise<CommandResult> {
    this.sweep();
    this.onPublish?.(name, dir);
    const existing = this.live.get(name);
    const unnamed = this.unnamed(name, options.manager?.name);
    if (unnamed) {
      this.log.push(`publish ${name} refused (managed)`);
      return { code: 1, output: `appctl: 409 ${unnamed}` };
    }
    if (existing && (existing.expiresAt === null) === (options.ephemeral !== undefined)) {
      this.log.push(`publish ${name} refused (ephemeral marker)`);
      return {
        code: 1,
        output:
          existing.expiresAt === null
            ? `appctl: 409 app "${name}" is durable and never becomes ephemeral; publish the ephemeral copy under another name`
            : `appctl: 409 app "${name}" is ephemeral until ${new Date(existing.expiresAt).toISOString()} and never becomes durable; publish it as ephemeral, or the durable app under another name`,
      };
    }
    const ttl = options.ephemeral?.ttlSeconds;
    if (!existing && ttl !== undefined && !(Number.isInteger(ttl) && ttl > 0 && ttl <= this.maxTtlSeconds)) {
      this.log.push(`publish ${name} refused (ttl)`);
      return { code: 1, output: `appctl: 400 ephemeral ttl_seconds must be a whole number from 1 to ${this.maxTtlSeconds} (ephemeral_max_ttl_seconds), got ${ttl}` };
    }
    if (existsSync(join(dir, "src", "PUBLISH_FAILS")) || this.refuse?.(name, dir)) {
      this.log.push(`publish ${name} refused`);
      return { code: 3, output: "appctl: 409 quota exceeded" };
    }
    const given = options.manager;
    const manager = given ? { name: given.name, url: given.url !== undefined ? given.url : existing?.manager?.name === given.name ? existing.manager.url : null } : (existing?.manager ?? null);
    this.live.set(name, {
      files: listFiles(dir),
      boots: !existsSync(join(dir, "src", "BOOT_FAILS")) && !this.unhealthy?.(name, dir),
      // Fixed at the first publish; a later one does not extend it.
      expiresAt: existing ? existing.expiresAt : ttl !== undefined ? this.now() + ttl * 1000 : null,
      manager,
    });
    this.log.push(`publish ${name}`);
    return { code: 0, output: `published ${name}` };
  }

  async probe(name: string): Promise<ProbeResult> {
    this.sweep();
    const app = this.live.get(name);
    if (!app) return { ok: false, status: 404, detail: "not found" };
    return app.boots ? { ok: true, status: 200, detail: "" } : { ok: false, status: 502, detail: "did not start" };
  }

  async discard(name: string, manager?: string): Promise<boolean> {
    this.sweep();
    if (this.failDiscard?.(name)) {
      this.log.push(`discard ${name} failed`);
      return false;
    }
    const app = this.live.get(name);
    if (!app) {
      this.log.push(`discard ${name} (gone)`);
      return true;
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
    this.sweep();
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

  /** The previews standing now: the ephemeral apps. */
  previews(): string[] {
    this.sweep();
    return [...this.live].filter(([, app]) => app.expiresAt !== null).map(([name]) => name);
  }

  /** What someone at the console or with appctl would do: clear an app's manager, or set another one. */
  setManager(name: string, manager: { name: string; url?: string | null } | null): void {
    const app = this.live.get(name);
    if (!app) throw new Error(`no app ${name}`);
    app.manager = manager ? { name: manager.name, url: manager.url ?? null } : null;
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
