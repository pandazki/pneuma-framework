// Ref — 单元格级引用值（ADR-0002）.
// ref-row: 指向 pneuma-app 内同 namespace 的 Row.
// ref-external: 指向 Adapter 背后外部系统的资源.

export type Ref =
  | { kind: "row"; table: string; id: string }
  | {
      kind: "external";
      adapter: string;
      externalType: string;
      external_id: string;
    };

export function isRef(x: unknown): x is Ref {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  switch (o.kind) {
    case "row":
      return (
        typeof o.table === "string" &&
        o.table.length > 0 &&
        typeof o.id === "string" &&
        o.id.length > 0
      );
    case "external":
      return (
        typeof o.adapter === "string" &&
        o.adapter.length > 0 &&
        typeof o.externalType === "string" &&
        o.externalType.length > 0 &&
        typeof o.external_id === "string" &&
        o.external_id.length > 0
      );
    default:
      return false;
  }
}

export function equalsRef(a: Ref, b: Ref): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "row") {
    const bb = b as typeof a;
    return a.table === bb.table && a.id === bb.id;
  }
  const bb = b as typeof a;
  return (
    a.adapter === bb.adapter &&
    a.externalType === bb.externalType &&
    a.external_id === bb.external_id
  );
}
