// WhereClause — 跨 Policy / Query / Trigger 共享的表达式 AST (ADR-0019).
// 纯函数 + 无副作用 + 静态分析友好.
//
// 五个公开能力：
//   - evaluate / evaluateLeaf  — 对给定 ctx 求 boolean
//   - getSubjects              — 列出所有被读的 subject path (包含 subject + value.ref)
//   - requiresUserContext      — clause 是否依赖 user.*
//   - simplify                 — 基本 AST 化简
//   - explain                  — NL 翻译 (MVP: zh only)

// ---------- types ----------

export type Namespace = "row" | "user" | "input" | "target";

export interface SubjectPath {
  readonly ns: Namespace;
  readonly path: readonly string[];
}

export type ComparisonOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "nin"
  | "like"
  | "nlike"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "between"
  | "nbetween"
  | "null"
  | "not_null"
  | "empty"
  | "not_empty"
  | "date";

export type DateSubOp =
  | "today"
  | "yesterday"
  | "tomorrow"
  | "this_week"
  | "last_week"
  | "next_week"
  | "this_month"
  | "last_month"
  | "next_month"
  | "this_year"
  | "last_year"
  | "last_n_days"
  | "next_n_days"
  | "before"
  | "after"
  | "on";

export type ValueRef =
  | { readonly ref: "user"; readonly path: readonly string[] }
  | { readonly ref: "row"; readonly path: readonly string[] }
  | { readonly ref: "input"; readonly path: readonly string[] };

export type WhereValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<string | number>
  | ValueRef;

export interface WhereLeaf {
  readonly kind: "leaf";
  readonly subject: SubjectPath;
  readonly op: ComparisonOp;
  readonly value?: WhereValue;
  readonly sub_op?: DateSubOp;
}

export interface WhereBranch {
  readonly kind: "branch";
  readonly logical_op: "and" | "or" | "not";
  readonly children: readonly WhereClause[];
}

export type WhereClause = WhereLeaf | WhereBranch;

export interface EvalContext {
  readonly row?: Readonly<Record<string, unknown>>;
  readonly user?: {
    readonly id: string;
    readonly attrs: Readonly<Record<string, unknown>>;
    readonly roles: readonly string[];
  };
  readonly input?: Readonly<Record<string, unknown>>;
  readonly target?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly now?: number; // unix-ms
}

// ---------- guard ----------

const COMPARISON_OPS: ReadonlySet<string> = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "nin",
  "like",
  "nlike",
  "contains",
  "starts_with",
  "ends_with",
  "between",
  "nbetween",
  "null",
  "not_null",
  "empty",
  "not_empty",
  "date",
]);

const NAMESPACES: ReadonlySet<string> = new Set([
  "row",
  "user",
  "input",
  "target",
]);

export function isWhereClause(x: unknown): x is WhereClause {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.kind === "leaf") {
    const subj = o.subject as Record<string, unknown> | undefined;
    if (!subj || typeof subj !== "object") return false;
    if (typeof subj.ns !== "string" || !NAMESPACES.has(subj.ns)) return false;
    if (!Array.isArray(subj.path) || subj.path.length === 0) return false;
    if (!subj.path.every((s: unknown) => typeof s === "string" && s.length > 0))
      return false;
    if (typeof o.op !== "string" || !COMPARISON_OPS.has(o.op)) return false;
    return true;
  }
  if (o.kind === "branch") {
    if (o.logical_op !== "and" && o.logical_op !== "or" && o.logical_op !== "not")
      return false;
    if (!Array.isArray(o.children)) return false;
    if (o.logical_op === "not" && o.children.length !== 1) return false;
    return o.children.every(isWhereClause);
  }
  return false;
}

// ---------- path resolution ----------

function resolvePath(
  root: Readonly<Record<string, unknown>> | undefined,
  path: readonly string[]
): unknown {
  if (!root) return undefined;
  let cur: unknown = root;
  for (const seg of path) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function resolveSubject(
  subject: SubjectPath,
  ctx: EvalContext
): unknown {
  switch (subject.ns) {
    case "row":
      return resolvePath(ctx.row, subject.path);
    case "user":
      return resolvePath(ctx.user as Readonly<Record<string, unknown>> | undefined, subject.path);
    case "input":
      return resolvePath(ctx.input, subject.path);
    case "target":
      return resolvePath(ctx.target, subject.path);
  }
}

function resolveValue(v: WhereValue | undefined, ctx: EvalContext): unknown {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "object" && "ref" in v) {
    switch (v.ref) {
      case "user":
        return resolvePath(
          ctx.user as Readonly<Record<string, unknown>> | undefined,
          v.path
        );
      case "input":
        return resolvePath(ctx.input, v.path);
      case "row":
        return resolvePath(ctx.row, v.path);
    }
  }
  return v;
}

// ---------- evaluate ----------

export function evaluate(clause: WhereClause, ctx: EvalContext): boolean {
  if (clause.kind === "branch") return evaluateBranch(clause, ctx);
  return evaluateLeaf(clause, ctx);
}

function evaluateBranch(b: WhereBranch, ctx: EvalContext): boolean {
  switch (b.logical_op) {
    case "and":
      // 空 and = 恒真 (vacuous truth)
      if (b.children.length === 0) return true;
      for (const c of b.children) if (!evaluate(c, ctx)) return false;
      return true;
    case "or":
      // 空 or = 恒假
      if (b.children.length === 0) return false;
      for (const c of b.children) if (evaluate(c, ctx)) return true;
      return false;
    case "not": {
      const only = b.children[0];
      if (!only) return true; // 退化：not([]) → true
      return !evaluate(only, ctx);
    }
  }
}

export function evaluateLeaf(leaf: WhereLeaf, ctx: EvalContext): boolean {
  const left = resolveSubject(leaf.subject, ctx);
  const right = resolveValue(leaf.value, ctx);
  switch (leaf.op) {
    case "eq":
      return scalarEq(left, right);
    case "neq":
      return !scalarEq(left, right);
    case "gt":
      return numCompare(left, right, (a, b) => a > b);
    case "gte":
      return numCompare(left, right, (a, b) => a >= b);
    case "lt":
      return numCompare(left, right, (a, b) => a < b);
    case "lte":
      return numCompare(left, right, (a, b) => a <= b);
    case "in":
      return arrayIncludes(right, left);
    case "nin":
      return !arrayIncludes(right, left);
    case "like":
      return strPattern(left, right, "like");
    case "nlike":
      return !strPattern(left, right, "like");
    case "contains":
      return containsCheck(left, right);
    case "starts_with":
      return strPattern(left, right, "starts");
    case "ends_with":
      return strPattern(left, right, "ends");
    case "between":
      return betweenCheck(left, right);
    case "nbetween":
      return !betweenCheck(left, right);
    case "null":
      return left === null || left === undefined;
    case "not_null":
      return left !== null && left !== undefined;
    case "empty":
      return isEmpty(left);
    case "not_empty":
      return !isEmpty(left);
    case "date":
      return dateCheck(left, leaf.sub_op, right, ctx.now ?? Date.now());
  }
}

function scalarEq(a: unknown, b: unknown): boolean {
  // JS strict equality; null/undefined treated as distinct
  return a === b;
}

function numCompare(
  a: unknown,
  b: unknown,
  cmp: (a: number, b: number) => boolean
): boolean {
  if (typeof a !== "number" || typeof b !== "number") return false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return cmp(a, b);
}

function arrayIncludes(arr: unknown, v: unknown): boolean {
  if (!Array.isArray(arr)) return false;
  return arr.some((x) => x === v);
}

function strPattern(
  a: unknown,
  b: unknown,
  mode: "like" | "starts" | "ends"
): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (mode === "starts") return a.startsWith(b);
  if (mode === "ends") return a.endsWith(b);
  return a.includes(b); // 'like' MVP = substring
}

function containsCheck(a: unknown, b: unknown): boolean {
  if (Array.isArray(a)) return a.some((x) => x === b);
  if (typeof a === "string" && typeof b === "string") return a.includes(b);
  return false;
}

function betweenCheck(a: unknown, range: unknown): boolean {
  if (
    typeof a !== "number" ||
    !Array.isArray(range) ||
    range.length !== 2 ||
    typeof range[0] !== "number" ||
    typeof range[1] !== "number"
  )
    return false;
  const [lo, hi] = range;
  return a >= lo && a <= hi;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function dateCheck(
  left: unknown,
  subOp: DateSubOp | undefined,
  right: unknown,
  now: number
): boolean {
  if (!subOp) return false;
  if (typeof left !== "number" || !Number.isFinite(left)) return false;
  const { start, end } = dateRange(subOp, right, now);
  if (start === null || end === null) return false;
  return left >= start && left < end;
}

const DAY_MS = 86400000;

function dateRange(
  subOp: DateSubOp,
  value: unknown,
  now: number
): { start: number | null; end: number | null } {
  const today = startOfDay(now);
  switch (subOp) {
    case "today":
      return { start: today, end: today + DAY_MS };
    case "yesterday":
      return { start: today - DAY_MS, end: today };
    case "tomorrow":
      return { start: today + DAY_MS, end: today + 2 * DAY_MS };
    case "this_week":
      return weekRange(now, 0);
    case "last_week":
      return weekRange(now, -1);
    case "next_week":
      return weekRange(now, 1);
    case "this_month":
      return monthRange(now, 0);
    case "last_month":
      return monthRange(now, -1);
    case "next_month":
      return monthRange(now, 1);
    case "this_year":
      return yearRange(now, 0);
    case "last_year":
      return yearRange(now, -1);
    case "last_n_days":
      if (typeof value !== "number") return { start: null, end: null };
      return { start: today - value * DAY_MS, end: today + DAY_MS };
    case "next_n_days":
      if (typeof value !== "number") return { start: null, end: null };
      return { start: today, end: today + (value + 1) * DAY_MS };
    case "before":
      return typeof value === "number"
        ? { start: -Infinity, end: value }
        : { start: null, end: null };
    case "after":
      return typeof value === "number"
        ? { start: value, end: Infinity }
        : { start: null, end: null };
    case "on":
      if (typeof value !== "number") return { start: null, end: null };
      {
        const day = startOfDay(value);
        return { start: day, end: day + DAY_MS };
      }
  }
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function weekRange(ts: number, offset: number): { start: number; end: number } {
  const d = new Date(ts);
  const day = d.getDay(); // 0=Sun..6=Sat; use Mon=start
  const monOffset = (day + 6) % 7;
  const monStart = startOfDay(ts) - monOffset * DAY_MS + offset * 7 * DAY_MS;
  return { start: monStart, end: monStart + 7 * DAY_MS };
}

function monthRange(ts: number, offset: number): { start: number; end: number } {
  const d = new Date(ts);
  const start = new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime();
  const end = new Date(d.getFullYear(), d.getMonth() + offset + 1, 1).getTime();
  return { start, end };
}

function yearRange(ts: number, offset: number): { start: number; end: number } {
  const d = new Date(ts);
  const start = new Date(d.getFullYear() + offset, 0, 1).getTime();
  const end = new Date(d.getFullYear() + offset + 1, 0, 1).getTime();
  return { start, end };
}

// ---------- static analysis ----------

export function getSubjects(clause: WhereClause): SubjectPath[] {
  const seen = new Set<string>();
  const out: SubjectPath[] = [];
  const push = (s: SubjectPath): void => {
    const k = `${s.ns}.${s.path.join(".")}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ ns: s.ns, path: [...s.path] });
  };
  const walk = (c: WhereClause): void => {
    if (c.kind === "branch") {
      for (const ch of c.children) walk(ch);
      return;
    }
    push(c.subject);
    const v = c.value;
    if (v && typeof v === "object" && !Array.isArray(v) && "ref" in v) {
      push({ ns: v.ref, path: v.path });
    }
  };
  walk(clause);
  return out;
}

export function requiresUserContext(clause: WhereClause): boolean {
  return getSubjects(clause).some((s) => s.ns === "user");
}

export function simplify(clause: WhereClause): WhereClause {
  if (clause.kind === "leaf") return clause;
  const kids = clause.children.map(simplify);
  if (clause.logical_op === "not") {
    const inner = kids[0];
    // not(not(X)) → X
    if (inner && inner.kind === "branch" && inner.logical_op === "not") {
      const nested = inner.children[0];
      if (nested) return nested;
    }
    return { kind: "branch", logical_op: "not", children: kids };
  }
  // and/or: flatten same-op children; drop branches that collapse
  const flat: WhereClause[] = [];
  for (const k of kids) {
    if (k.kind === "branch" && k.logical_op === clause.logical_op) {
      flat.push(...k.children);
    } else {
      flat.push(k);
    }
  }
  // and(X) / or(X) → X (single child unwrap)
  if (flat.length === 1) return flat[0]!;
  return { kind: "branch", logical_op: clause.logical_op, children: flat };
}

export function isUniversallyTrue(clause: WhereClause): boolean {
  // 只识别"结构上恒真"的平凡情形：and([]) 或 and() with 0 children.
  return (
    clause.kind === "branch" &&
    clause.logical_op === "and" &&
    clause.children.length === 0
  );
}

export function isUniversallyFalse(clause: WhereClause): boolean {
  return (
    clause.kind === "branch" &&
    clause.logical_op === "or" &&
    clause.children.length === 0
  );
}

// ---------- explain (zh) ----------

export function explain(clause: WhereClause, lang: "zh" | "en" = "zh"): string {
  if (clause.kind === "branch") {
    if (clause.children.length === 0) {
      return clause.logical_op === "and" ? allString(lang) : noneString(lang);
    }
    if (clause.logical_op === "not") {
      const inner = clause.children[0];
      if (!inner) return "";
      return lang === "zh" ? `非(${explain(inner, lang)})` : `not(${explain(inner, lang)})`;
    }
    const joiner = lang === "zh"
      ? clause.logical_op === "and"
        ? " 且 "
        : " 或 "
      : ` ${clause.logical_op.toUpperCase()} `;
    return clause.children.map((c) => explain(c, lang)).join(joiner);
  }
  return explainLeaf(clause, lang);
}

function explainLeaf(leaf: WhereLeaf, lang: "zh" | "en"): string {
  const subj = `${leaf.subject.ns}.${leaf.subject.path.join(".")}`;
  const val = explainValue(leaf.value, lang);
  const opStr = explainOp(leaf.op, leaf.sub_op, lang);
  return `${subj} ${opStr} ${val}`.trim();
}

function explainValue(v: WhereValue | undefined, lang: "zh" | "en"): string {
  if (v === undefined) return "";
  if (v === null) return lang === "zh" ? "空值" : "null";
  if (typeof v === "object" && "ref" in v) {
    return `${v.ref}.${v.path.join(".")}`;
  }
  if (Array.isArray(v)) return `[${v.join(", ")}]`;
  return typeof v === "string" ? `"${v}"` : String(v);
}

function explainOp(op: ComparisonOp, subOp: DateSubOp | undefined, lang: "zh" | "en"): string {
  if (lang === "zh") {
    switch (op) {
      case "eq": return "等于";
      case "neq": return "不等于";
      case "gt": return "大于";
      case "gte": return "不小于";
      case "lt": return "小于";
      case "lte": return "不大于";
      case "in": return "属于";
      case "nin": return "不属于";
      case "like": return "包含";
      case "nlike": return "不包含";
      case "contains": return "含";
      case "starts_with": return "以...开头";
      case "ends_with": return "以...结尾";
      case "between": return "在区间";
      case "nbetween": return "不在区间";
      case "null": return "为空";
      case "not_null": return "非空";
      case "empty": return "空值或空串";
      case "not_empty": return "有值";
      case "date": return subOp ? `日期(${subOp})` : "日期";
    }
  }
  return subOp ? `${op}(${subOp})` : op;
}

function allString(lang: "zh" | "en"): string {
  return lang === "zh" ? "始终成立" : "always true";
}

function noneString(lang: "zh" | "en"): string {
  return lang === "zh" ? "始终不成立" : "always false";
}
