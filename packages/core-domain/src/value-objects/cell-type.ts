// CellType — pneuma 封闭类型集 (ADR-0002).
// 新增 kind 必须走 framework release；adapter 可注册新 externalType 但不能扩 kind.

export const PRIMITIVE_CELL_TYPES = [
  "Text",
  "RichText",
  "Number",
  "Bool",
  "Date",
  "Duration",
  "URL",
] as const;

export type PrimitiveCellType = (typeof PRIMITIVE_CELL_TYPES)[number];

export type CellType =
  | { kind: "primitive"; of: PrimitiveCellType }
  | { kind: "vector"; dim: number }
  | { kind: "blob"; mime: string }
  | { kind: "json"; schema?: unknown } // ADR-0002 amend 2026-04-24: structured JSON blob (attrs / config / metadata)
  | { kind: "ref-row"; table: string }
  | { kind: "ref-row-list"; table: string }
  | { kind: "ref-external"; adapter: string; externalType: string }
  | { kind: "derived"; transform: string; output: CellType };

const PRIMITIVES: ReadonlySet<string> = new Set(PRIMITIVE_CELL_TYPES);

export function isCellType(x: unknown): x is CellType {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  switch (o.kind) {
    case "primitive":
      return typeof o.of === "string" && PRIMITIVES.has(o.of);
    case "vector":
      return typeof o.dim === "number" && Number.isFinite(o.dim) && o.dim > 0;
    case "blob":
      return typeof o.mime === "string" && o.mime.length > 0;
    case "json":
      // schema 可选; 结构由 framework 不强制, Adapter / Transform 可自行校验
      return true;
    case "ref-row":
    case "ref-row-list":
      return typeof o.table === "string" && o.table.length > 0;
    case "ref-external":
      return (
        typeof o.adapter === "string" &&
        o.adapter.length > 0 &&
        typeof o.externalType === "string" &&
        o.externalType.length > 0
      );
    case "derived":
      return (
        typeof o.transform === "string" &&
        o.transform.length > 0 &&
        isCellType(o.output)
      );
    default:
      return false;
  }
}

export function equalsCellType(a: CellType, b: CellType): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "primitive":
      return a.of === (b as typeof a).of;
    case "vector":
      return a.dim === (b as typeof a).dim;
    case "blob":
      return a.mime === (b as typeof a).mime;
    case "json": {
      // schema 为对象时按 JSON 稳定序列化比较; undefined 视为无 schema
      const bb = b as typeof a;
      if (a.schema === undefined && bb.schema === undefined) return true;
      if (a.schema === undefined || bb.schema === undefined) return false;
      return JSON.stringify(a.schema) === JSON.stringify(bb.schema);
    }
    case "ref-row":
    case "ref-row-list":
      return a.table === (b as typeof a).table;
    case "ref-external": {
      const bb = b as typeof a;
      return a.adapter === bb.adapter && a.externalType === bb.externalType;
    }
    case "derived": {
      const bb = b as typeof a;
      return a.transform === bb.transform && equalsCellType(a.output, bb.output);
    }
  }
}
