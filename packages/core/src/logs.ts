import type { LifecycleVerb } from "./types.js";

export interface LogLine {
  stream: "stdout" | "stderr";
  line: string;
  ts: number;
}

export interface GetLinesOpts {
  verb: LifecycleVerb;
  since?: number;
  limit?: number;
}

export interface LogBufferOptions {
  perVerbCap: number;
}

export class LogBuffer {
  private readonly cap: number;
  private readonly byVerb = new Map<LifecycleVerb, LogLine[]>();

  constructor(opts: LogBufferOptions) {
    this.cap = opts.perVerbCap;
  }

  push(verb: LifecycleVerb, line: LogLine): void {
    let arr = this.byVerb.get(verb);
    if (!arr) { arr = []; this.byVerb.set(verb, arr); }
    arr.push(line);
    if (arr.length > this.cap) arr.splice(0, arr.length - this.cap);
  }

  getLines(opts: GetLinesOpts): LogLine[] {
    const arr = this.byVerb.get(opts.verb) ?? [];
    let out = opts.since !== undefined ? arr.filter((l) => l.ts >= opts.since!) : arr.slice();
    if (opts.limit !== undefined && out.length > opts.limit) out = out.slice(out.length - opts.limit);
    return out;
  }
}
