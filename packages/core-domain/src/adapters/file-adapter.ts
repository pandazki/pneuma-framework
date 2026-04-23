// File Reference Adapter — 参考实现.
// 把一个目录当 "adapter-backed 表"; 每个 row = 一个 JSON 文件 (<id>.json),
// 内容是一个 plain object, 键是 column 名.
//
// 用途:
//   1. 作为 pneuma Adapter 协议的第一个 "真 IO" 实现, 证明 Adapter 抽象能落地
//   2. 给模板开发者 / 测试 / 小规模 app 一个零依赖后端 (filesystem 即数据库)
//   3. ADR-0004 "reference adapter" 里提到的 `file` 类型的第一版
//
// MVP 范围:
//   - CRUD 全支持 (list / get / insert / update / delete)
//   - filter pushdown: column 级 eq / in (其它 op 由 AdapterInvoker 留给本地过滤)
//   - 没有 schema 迁移 / 锁 / 事务 — 并发写需要外层加锁

import {
  readdir,
  readFile,
  writeFile,
  unlink,
  mkdir,
  access,
} from "node:fs/promises";
import { join, extname, basename } from "node:path";
import type {
  AdapterImpl,
  AdapterInvocationContext,
  ExternalRow,
  PushableQuery,
} from "../services/adapter-invoker.js";

export interface FileAdapterConfig {
  /** 绝对 / 相对路径的目录; list 从这儿读 */
  readonly directory: string;
  /** Row 里充当主键的列名; 也是文件名 stem. 默认 "id" */
  readonly idColumn?: string;
}

export class FileAdapterError extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "FileAdapterError";
  }
}

/**
 * 创建一个 file-based AdapterImpl. 和 Adapter aggregate (capability 声明) 是两回事 —
 * 这里只负责 IO, capability 由 caller 构造 Adapter 实例时声明.
 */
export class FileAdapterImpl implements AdapterImpl {
  private readonly dir: string;
  private readonly idCol: string;
  private dirReady = false;

  constructor(config: FileAdapterConfig) {
    if (!config.directory) {
      throw new FileAdapterError("directory required", "empty_directory");
    }
    this.dir = config.directory;
    this.idCol = config.idColumn ?? "id";
  }

  async list(query: PushableQuery, _ctx: AdapterInvocationContext): Promise<readonly ExternalRow[]> {
    await this.ensureDir();
    const files = await readdir(this.dir);
    const jsonFiles = files.filter((f) => extname(f) === ".json");
    const rows: ExternalRow[] = [];
    for (const f of jsonFiles) {
      const content = await readFile(join(this.dir, f), "utf8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      // 保证 id 字段存在 (缺失则用 filename stem)
      if (parsed[this.idCol] === undefined) {
        parsed[this.idCol] = basename(f, ".json");
      }
      if (this.matchesFilter(parsed, query)) {
        rows.push(applyProjection(parsed, query.fields));
      }
    }
    // 本地 sort (invoker 也会再 sort 一遍, 幂等)
    if (query.sort && query.sort.length > 0) {
      rows.sort((a, b) => {
        for (const s of query.sort!) {
          const av = a[s.column];
          const bv = b[s.column];
          const cmp = compareValues(av, bv);
          if (cmp !== 0) return s.dir === "asc" ? cmp : -cmp;
        }
        return 0;
      });
    }
    // 本地 limit
    if (query.limit !== undefined) return rows.slice(0, query.limit);
    return rows;
  }

  async get(id: string, _ctx: AdapterInvocationContext): Promise<ExternalRow> {
    await this.ensureDir();
    const path = join(this.dir, `${id}.json`);
    try {
      const content = await readFile(path, "utf8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (parsed[this.idCol] === undefined) parsed[this.idCol] = id;
      return parsed;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new FileAdapterError(
          `row "${id}" not found in ${this.dir}`,
          "row_not_found"
        );
      }
      throw err;
    }
  }

  async insert(row: ExternalRow, _ctx: AdapterInvocationContext): Promise<string> {
    await this.ensureDir();
    const id = String(row[this.idCol] ?? "");
    if (!id) {
      throw new FileAdapterError(
        `insert requires "${this.idCol}" field`,
        "missing_id"
      );
    }
    const path = join(this.dir, `${id}.json`);
    // 防重复: 存在则报错 (update 专职覆盖)
    if (await exists(path)) {
      throw new FileAdapterError(
        `row "${id}" already exists (use update)`,
        "duplicate_id"
      );
    }
    await writeFile(path, JSON.stringify(row, null, 2), "utf8");
    return id;
  }

  async update(
    id: string,
    patch: Readonly<Record<string, unknown>>,
    _ctx: AdapterInvocationContext
  ): Promise<void> {
    await this.ensureDir();
    const path = join(this.dir, `${id}.json`);
    let current: Record<string, unknown>;
    try {
      const content = await readFile(path, "utf8");
      current = JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new FileAdapterError(
          `row "${id}" not found`,
          "row_not_found"
        );
      }
      throw err;
    }
    const merged = { ...current, ...patch, [this.idCol]: id };
    await writeFile(path, JSON.stringify(merged, null, 2), "utf8");
  }

  async delete(id: string, _ctx: AdapterInvocationContext): Promise<void> {
    const path = join(this.dir, `${id}.json`);
    try {
      await unlink(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new FileAdapterError(
          `row "${id}" not found`,
          "row_not_found"
        );
      }
      throw err;
    }
  }

  // ---------- internals ----------

  private async ensureDir(): Promise<void> {
    if (this.dirReady) return;
    try {
      await access(this.dir);
    } catch {
      await mkdir(this.dir, { recursive: true });
    }
    this.dirReady = true;
  }

  private matchesFilter(row: Record<string, unknown>, q: PushableQuery): boolean {
    for (const leaf of q.where) {
      const rv = row[leaf.column];
      switch (leaf.op) {
        case "eq":
          if (rv !== leaf.value) return false;
          break;
        case "neq":
          if (rv === leaf.value) return false;
          break;
        case "in":
          if (!Array.isArray(leaf.value) || !leaf.value.includes(rv as never))
            return false;
          break;
        case "nin":
          if (Array.isArray(leaf.value) && leaf.value.includes(rv as never))
            return false;
          break;
        case "null":
          if (rv !== null && rv !== undefined) return false;
          break;
        case "not_null":
          if (rv === null || rv === undefined) return false;
          break;
        default:
          // op 不下推 → adapter 不能解释, 当全量通过, 由 AdapterInvoker 本地过滤那一轮处理
          // (这条 leaf 不会出现在 pushable 里, 因为 AdapterInvoker 只推可下推的 op;
          // 万一真被推了, 这里保守行为 = 不过滤, 让后面本地 filter 接管)
          break;
      }
    }
    return true;
  }
}

function applyProjection(
  row: Record<string, unknown>,
  fields: readonly string[] | undefined
): ExternalRow {
  if (!fields || fields.length === 0) return row;
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in row) out[f] = row[f];
  return out;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return 0;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
