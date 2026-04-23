// Cell value validation.
// 一个 Cell 是 { type, value } 的组合；本模块提供"value 是否符合 type"的判定 +
// throw 版本用于强制（aggregate 内部 invariant 校验用）.
//
// 注意：nullable 是 Column 级别的约束，不在 Cell 这层。
// 一个 null 值在 Row 里表现为"Map 里无此列"的缺席，Cell 本身不持 null.

import type { CellType } from "./cell-type.js";
import { isRef, type Ref } from "./ref.js";

export function isValidCellValue(type: CellType, value: unknown): boolean {
  switch (type.kind) {
    case "primitive":
      return isValidPrimitive(type.of, value);
    case "vector":
      return (
        Array.isArray(value) &&
        value.length === type.dim &&
        value.every((v) => typeof v === "number" && Number.isFinite(v))
      );
    case "blob":
      // in-memory: Uint8Array. serialization form: base64 string.
      return value instanceof Uint8Array || typeof value === "string";
    case "json":
      // 任何 JSON-serializable 值; undefined 除外 (MVP: caller 不该塞 undefined)
      return isJsonSerializable(value);
    case "ref-row":
      return isRef(value) && value.kind === "row" && value.table === type.table;
    case "ref-row-list":
      return (
        Array.isArray(value) &&
        value.every(
          (v): v is Ref =>
            isRef(v) && v.kind === "row" && v.table === type.table
        )
      );
    case "ref-external":
      return (
        isRef(value) &&
        value.kind === "external" &&
        value.adapter === type.adapter &&
        value.externalType === type.externalType
      );
    case "derived":
      return isValidCellValue(type.output, value);
  }
}

function isValidPrimitive(
  kind:
    | "Text"
    | "RichText"
    | "Number"
    | "Bool"
    | "Date"
    | "Duration"
    | "URL",
  value: unknown
): boolean {
  switch (kind) {
    case "Text":
    case "RichText":
    case "URL":
      return typeof value === "string";
    case "Number":
    case "Duration":
      return typeof value === "number" && Number.isFinite(value);
    case "Bool":
      return typeof value === "boolean";
    case "Date":
      // canonical form: unix-ms number
      return typeof value === "number" && Number.isFinite(value);
  }
}

export class CellValueMismatch extends Error {
  constructor(
    public readonly expected: CellType,
    public readonly got: unknown
  ) {
    super(
      `cell value does not match type ${JSON.stringify(expected)}; got ${typeSummary(got)}`
    );
    this.name = "CellValueMismatch";
  }
}

export function assertCellValue(type: CellType, value: unknown): void {
  if (!isValidCellValue(type, value)) {
    throw new CellValueMismatch(type, value);
  }
}

function isJsonSerializable(v: unknown): boolean {
  if (v === undefined) return false;
  if (v === null) return true;
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (t !== "object") return false;
  if (Array.isArray(v)) {
    return v.every((x) => isJsonSerializable(x));
  }
  // Reject built-ins (Date / Uint8Array / Map / Set) — 显式要 plain record
  if (
    v instanceof Date ||
    v instanceof Uint8Array ||
    v instanceof Map ||
    v instanceof Set ||
    v instanceof RegExp
  )
    return false;
  const rec = v as Record<string, unknown>;
  for (const k of Object.keys(rec)) {
    if (!isJsonSerializable(rec[k])) return false;
  }
  return true;
}

function typeSummary(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (Array.isArray(v)) return `array(len=${v.length})`;
  if (v instanceof Uint8Array) return `Uint8Array(len=${v.length})`;
  return typeof v;
}
