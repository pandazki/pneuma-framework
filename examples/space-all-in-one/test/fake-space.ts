import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "@pneuma-framework/host-kit/workspace";
import type { CommandResult, ProbeResult, SpaceRuntime } from "../src/space";

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

  async init(dir: string): Promise<CommandResult> {
    cpSync(FIXTURE_TEMPLATE, dir, { recursive: true });
    return { code: 0, output: `created ${dir}` };
  }

  async exists(name: string): Promise<boolean> {
    return this.live.has(name);
  }

  async publish(name: string, dir: string): Promise<CommandResult> {
    if (existsSync(join(dir, "src", "PUBLISH_FAILS")) || this.refuse?.(name, dir)) {
      this.log.push(`publish ${name} refused`);
      return { code: 3, output: "appctl: 409 quota exceeded" };
    }
    this.live.set(name, { files: listFiles(dir), boots: !existsSync(join(dir, "src", "BOOT_FAILS")) });
    this.log.push(`publish ${name}`);
    return { code: 0, output: `published ${name}` };
  }

  async probe(name: string): Promise<ProbeResult> {
    const app = this.live.get(name);
    if (!app) return { ok: false, status: 404, detail: "not found" };
    return app.boots ? { ok: true, status: 200, detail: "" } : { ok: false, status: 502, detail: "did not start" };
  }

  async discard(name: string): Promise<void> {
    this.live.delete(name);
    this.log.push(`discard ${name}`);
  }

  address(name: string): string {
    return `http://space.test/apps/${name}/`;
  }

  previews(): string[] {
    return [...this.live.keys()].filter((name) => name.includes("-pv"));
  }
}
