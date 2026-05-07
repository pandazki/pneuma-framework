import type { MarkerMessage } from "./types.js";

const PREFIX = "##pneuma:";

export interface MarkerWriter {
  write(chunk: string): unknown;
}

export function formatReadyMarker(): string {
  return `${PREFIX}ready`;
}

export function formatStoppingMarker(): string {
  return `${PREFIX}stopping`;
}

export function formatServiceReadyMarker(name: string, url: string): string {
  assertMarkerAtom(name, "service name");
  assertMarkerAtom(url, "service url");
  return `${PREFIX}service-ready ${name} ${url}`;
}

export function printReadyMarker(writer: MarkerWriter = process.stdout): void {
  writeMarker(writer, formatReadyMarker());
}

export function printStoppingMarker(writer: MarkerWriter = process.stdout): void {
  writeMarker(writer, formatStoppingMarker());
}

export function printServiceReadyMarker(
  name: string,
  url: string,
  writer: MarkerWriter = process.stdout,
): void {
  writeMarker(writer, formatServiceReadyMarker(name, url));
}

export function parseMarker(line: string): MarkerMessage | null {
  if (!line.startsWith(PREFIX)) return null;
  const body = line.slice(PREFIX.length);
  const spaceIdx = body.indexOf(" ");
  const kind = spaceIdx === -1 ? body : body.slice(0, spaceIdx);
  const rest = spaceIdx === -1 ? "" : body.slice(spaceIdx + 1);

  switch (kind) {
    case "ready":
      return { kind: "ready" };
    case "stopping":
      return { kind: "stopping" };
    case "service-ready": {
      const parts = rest.split(/\s+/);
      if (parts.length < 2 || !parts[0] || !parts[1]) return null;
      return { kind: "service-ready", name: parts[0]!, url: parts[1]! };
    }
    case "needs-confirm": {
      const label = parseOptionallyQuoted(rest);
      if (!label) return null;
      return { kind: "needs-confirm", label };
    }
    case "progress": {
      const parts = rest.split(/\s+/);
      const pct = Number(parts[0]);
      if (!Number.isFinite(pct)) return null;
      const label = parts.slice(1).join(" ");
      return { kind: "progress", pct, label };
    }
    case "artifact":
      if (!rest) return null;
      return { kind: "artifact", path: rest };
    default:
      return null;
  }
}

function assertMarkerAtom(value: string, label: string): void {
  if (!value || /\s/.test(value)) {
    throw new Error(`${label} must be non-empty and contain no whitespace`);
  }
}

function writeMarker(writer: MarkerWriter, marker: string): void {
  writer.write(`${marker}\n`);
}

function parseOptionallyQuoted(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
