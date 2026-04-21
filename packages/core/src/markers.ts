import type { MarkerMessage } from "./types.js";

const PREFIX = "##pneuma:";

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

function parseOptionallyQuoted(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
