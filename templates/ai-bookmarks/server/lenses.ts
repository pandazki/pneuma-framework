import { readFileSync, existsSync, watchFile } from "node:fs";
import { join } from "node:path";

export interface Lens {
  name: string;
  displayName: string;
  prompt: string;
  model?: string;
}

export interface LensesFile {
  lenses: Lens[];
}

export class LensRegistry {
  private current: LensesFile = { lenses: [] };
  constructor(private readonly path: string) {
    this.reload();
    watchFile(path, { interval: 1000 }, () => this.reload());
  }
  reload(): void {
    if (!existsSync(this.path)) { this.current = { lenses: [] }; return; }
    try {
      this.current = JSON.parse(readFileSync(this.path, "utf8")) as LensesFile;
    } catch (err) {
      console.error(`[lenses] failed to parse ${this.path}:`, err);
    }
  }
  list(): Lens[] { return this.current.lenses; }
}

export function openLensRegistry(workspaceRoot: string): LensRegistry {
  return new LensRegistry(join(workspaceRoot, "lenses.json"));
}
