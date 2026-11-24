import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshot, sourceSignature } from "./artifact";
import type { SpaceManager, SpaceRuntime } from "./space";

// ---------------------------------------------------------------------------
// Previews on PneumaSpace.
//
// A preview is an ephemeral app (PneumaSpace ADR 0038) under its own name,
// marked as managed by this Host. It ends itself with its data after the
// preview ttl, and one call discards it. Whether it still stands and when it
// ends are PneumaSpace's facts: they are asked when someone needs them, and
// the Host keeps no note of them.
// ---------------------------------------------------------------------------

/** PneumaSpace's default `ephemeral_max_ttl_seconds`: the longest a preview may stand unless its global policy allows more. */
export const DEFAULT_PREVIEW_TTL_SECONDS = 3600;

/** A preview as PneumaSpace answers for it at the moment it is asked. */
export type PreviewState =
  | { readonly state: "standing"; readonly app: string; readonly address: string; readonly expires_at: string | null }
  /** `gone`: ended itself, discarded, or never published. `unknown`: PneumaSpace did not answer. */
  | { readonly state: "gone" | "unknown"; readonly app: string; readonly note: string };

export type StandingPreview = Extract<PreviewState, { state: "standing" }>;

export type Booted = { readonly ok: true; readonly output: string; readonly preview: StandingPreview } | { readonly ok: false; readonly output: string };

/** The name a change's preview goes by on PneumaSpace: at most 37 characters for an app name of at most 30. */
export function previewName(app: string, changeId: string): string {
  return `${app}-pv${changeId.slice(-4)}`;
}

export class Previews {
  constructor(
    private readonly opts: {
      readonly space: SpaceRuntime;
      readonly manager: SpaceManager;
      readonly ttlSeconds: number;
      readonly log: (line: string) => void;
    },
  ) {}

  /**
   * Publish `root` as the ephemeral app `app` and see that it answers; one that does not is discarded
   * again. A PneumaSpace from before ephemeral apps ignores the marker and keeps a durable app, which
   * would never end: that one is taken down again and the preview fails, saying why.
   */
  async boot(app: string, root: string): Promise<Booted> {
    const { space, manager } = this.opts;
    const published = await space.publish(app, root, { ephemeral: { ttlSeconds: this.opts.ttlSeconds }, manager });
    let output = `[preview ${app}] ${published.output}`;
    const probe = published.code === 0 ? await space.probe(app) : undefined;
    if (probe) output += `\n[preview ${app}] GET / -> ${probe.status} ${probe.detail}`;
    if (!probe?.ok) {
      await this.drop([app]);
      return { ok: false, output };
    }
    const preview = await this.state(app);
    if (preview.state === "standing" && preview.expires_at === null) {
      await space.takeDown(app, manager.name);
      return { ok: false, output: `${output}\n[preview ${app}] PneumaSpace kept the preview as a durable app, so it does not know ephemeral apps (its ADR 0038, from c7ba4c4) and the preview would never end; it was taken down again. Use that PneumaSpace, or PNEUMA_PREVIEW=off.` };
    }
    // PneumaSpace did not say when it ends: it answered a moment ago, so it stands.
    return { ok: true, output, preview: preview.state === "standing" ? preview : { state: "standing", app, address: space.address(app), expires_at: null } };
  }

  /**
   * The preview stands, or a new one goes up under the same name, from a private copy of `draft` that has
   * to match `signature`, the draft as it was checked. The old one is discarded first: a publish onto one
   * that ended but was not swept yet would land in it and keep its end. Never throws.
   */
  async ensure(app: string, draft: string, signature: string): Promise<{ ok: true; preview: StandingPreview; republished: boolean } | { ok: false; reason: string; detail: string }> {
    const now = await this.state(app);
    if (now.state === "standing") return { ok: true, preview: now, republished: false };
    const copy = mkdtempSync(join(tmpdir(), "pneuma-preview-"));
    try {
      snapshot(draft, copy);
      if (sourceSignature(copy) !== signature) return { ok: false, reason: "draft_changed_after_check", detail: "the change's draft is not what was checked, so a preview would not show it; nothing was published. Deny the change and submit it again" };
      if (!(await this.opts.space.discard(app, this.opts.manager.name))) return { ok: false, reason: "preview_failed", detail: `the earlier preview ${app} could not be discarded from PneumaSpace, so a new one cannot take its name; try again in a minute` };
      const booted = await this.boot(app, copy);
      return booted.ok ? { ok: true, preview: booted.preview, republished: true } : { ok: false, reason: "preview_failed", detail: `the preview did not come up, so nobody can look at it; the change still waits.\n${booted.output.slice(-600)}` };
    } catch (err) {
      return { ok: false, reason: "preview_failed", detail: `the change's draft could not be copied (${err instanceof Error ? err.message : String(err)}); nothing was published` };
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  }

  /** Whether the preview stands and when it ends, as PneumaSpace says now. Never throws. */
  async state(app: string): Promise<PreviewState> {
    try {
      const listed = await this.opts.space.app(app);
      if (listed) return { state: "standing", app, address: this.opts.space.address(app), expires_at: listed.expiresAt === null ? null : new Date(listed.expiresAt).toISOString() };
      return { state: "gone", app, note: `the preview ${app} is no longer on PneumaSpace: it ended itself (previews stand for ${this.opts.ttlSeconds} s), or it was discarded` };
    } catch (err) {
      return { state: "unknown", app, note: `PneumaSpace did not say whether the preview ${app} still stands (${err instanceof Error ? err.message : String(err)})` };
    }
  }

  /** Discard previews. Never throws: a leftover one serves a throwaway name, blocks nothing and ends itself, so it is only logged. */
  async drop(apps: readonly string[]): Promise<void> {
    for (const app of apps) {
      if (!(await this.opts.space.discard(app, this.opts.manager.name))) {
        this.opts.log(`preview ${app} could not be discarded from PneumaSpace; it ends itself within ${this.opts.ttlSeconds} s of its publish, or run \`appctl discard ${app} --manager ${this.opts.manager.name}\``);
      }
    }
  }
}
