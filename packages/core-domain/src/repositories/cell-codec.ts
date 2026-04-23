// Cell value JSON 编解码 — 保证 round-trip 保型.
// 大多数值天然 JSON-safe (Ref, string, number, array-of-primitive, plain object).
// 唯一需要特殊处理: Uint8Array (JSON 不支持 → 标记化为 base64 + 类型 tag).

const BYTES_TAG = "__pneuma_bytes__" as const;

/** Encode a cell value to a JSON-serializable form */
export function encodeCellValue(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Uint8Array) {
    return { [BYTES_TAG]: true, base64: bytesToBase64(v) };
  }
  if (Array.isArray(v)) {
    return v.map(encodeCellValue);
  }
  // 其它 object (Ref, json CellType value, nested record)
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    out[k] = encodeCellValue(val);
  }
  return out;
}

/** Decode a previously encoded cell value back */
export function decodeCellValue(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(decodeCellValue);
  const o = v as Record<string, unknown>;
  if (o[BYTES_TAG] === true && typeof o.base64 === "string") {
    return base64ToBytes(o.base64);
  }
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(o)) {
    out[k] = decodeCellValue(val);
  }
  return out;
}

function bytesToBase64(u: Uint8Array): string {
  let bin = "";
  for (const b of u) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
