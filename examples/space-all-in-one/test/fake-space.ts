import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "@pneuma-framework/host-kit/workspace";
import type { CommandResult, ProbeResult, SpaceBinding, SpaceRuntime, SpaceState } from "../src/space";

export const FIXTURE_TEMPLATE = join(import.meta.dir, "fixture-template");

/**
 * An in-memory PneumaSpace. It keeps what the real platform would keep that the
 * loop depends on: which source is live under each name, and whether it boots.
 * A published tree containing src/BOOT_FAILS answers 502, like an app that
 * crashes on start. A tree containing src/PUBLISH_FAILS is refused at publish.
 */
export class FakeSpace implements SpaceRuntime {
  readonly live = new Map<string, { files: string[]; boots: boolean }>();
  readonly log: string[] = [];
  /** When set, a publish it returns true for is refused, whatever the tree holds. */
  refuse: ((name: string, dir: string) => boolean) | null = null;
  /** When set, a publish it returns true for goes up but does not boot. */
  unhealthy: ((name: string, dir: string) => boolean) | null = null;
  /** When set, a discard it returns true for fails and the app stays live. */
  failDiscard: ((name: string) => boolean) | null = null;
  /** Called at the start of every publish: stands in for whatever else happens while a publish is under way. */
  onPublish: ((name: string, dir: string) => void) | null = null;
  /** What `state` lists for an app, by name. An app with none set answers with no bindings. */
  readonly bindings = new Map<string, SpaceBinding[]>();
  /** When set, `stop` throws for the names it returns true for. */
  failStop: ((name: string) => boolean) | null = null;

  async init(dir: string): Promise<CommandResult> {
    cpSync(FIXTURE_TEMPLATE, dir, { recursive: true });
    return { code: 0, output: `created ${dir}` };
  }

  async exists(name: string): Promise<boolean> {
    return this.live.has(name);
  }

  async publish(name: string, dir: string): Promise<CommandResult> {
    this.onPublish?.(name, dir);
    if (existsSync(join(dir, "src", "PUBLISH_FAILS")) || this.refuse?.(name, dir)) {
      this.log.push(`publish ${name} refused`);
      return { code: 3, output: "appctl: 409 quota exceeded" };
    }
    this.live.set(name, { files: listFiles(dir), boots: !existsSync(join(dir, "src", "BOOT_FAILS")) && !this.unhealthy?.(name, dir) });
    this.log.push(`publish ${name}`);
    return { code: 0, output: `published ${name}` };
  }

  async probe(name: string): Promise<ProbeResult> {
    const app = this.live.get(name);
    if (!app) return { ok: false, status: 404, detail: "not found" };
    return app.boots ? { ok: true, status: 200, detail: "" } : { ok: false, status: 502, detail: "did not start" };
  }

  async discard(name: string): Promise<boolean> {
    if (this.failDiscard?.(name)) {
      this.log.push(`discard ${name} failed`);
      return false;
    }
    this.live.delete(name);
    this.log.push(`discard ${name}`);
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

  previews(): string[] {
    return [...this.live.keys()].filter((name) => name.includes("-pv"));
  }
}
