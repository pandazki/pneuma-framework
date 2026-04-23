// NDJSON Audit Sink — 符合 ADR-0014 "audit subset append-only 独立 sink 通路" 的文件实现.
// 特点:
//   - 每条 event 一行 JSON (ndjson 标准格式, tooling 友好)
//   - append-only 语义: fs appendFile with "a" flag, 天然追加
//   - Uint8Array / 其它非 JSON-safe payload 通过 cell-codec 标记化保存
//   - 接口层无 update / delete / truncate (跟 ADR-0014 契约一致)
//   - MVP 单进程写; 跨进程并发需额外加锁 (推后, 真生产场景加 file-lock 库)
//
// 非持久化后端可选: NDJSON 文件 + rotate / S3 Object Lock / Vault audit 都可实现 EventSink,
// 接口层只承诺 append. 这个文件实现是参考 impl.

import {
  appendFile,
  mkdir,
  readFile,
  access,
} from "node:fs/promises";
import { dirname } from "node:path";
import type { EventSink, PneumaEvent } from "../aggregates/event-stream.js";
import { encodeCellValue, decodeCellValue } from "../repositories/cell-codec.js";

async function ensureDir(path: string): Promise<void> {
  const dir = dirname(path);
  try {
    await access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

export class NdjsonAuditSink implements EventSink {
  private dirReady = false;

  constructor(private readonly path: string) {}

  async write(event: PneumaEvent): Promise<void> {
    if (!this.dirReady) {
      await ensureDir(this.path);
      this.dirReady = true;
    }
    const encoded = encodeCellValue(event) as unknown;
    const line = JSON.stringify(encoded) + "\n";
    await appendFile(this.path, line, "utf8");
  }
}

/**
 * NDJSON audit reader — 从文件读出所有 event.
 * 不是 EventSink 的一部分; 提供给 auditQuery / 测试 / 外部审计工具.
 */
export class NdjsonAuditReader {
  constructor(private readonly path: string) {}

  async events(): Promise<PneumaEvent[]> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch (err) {
      // 文件不存在 → 空 stream
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const out: PneumaEvent[] = [];
    for (const line of lines) {
      const parsed = JSON.parse(line);
      out.push(decodeCellValue(parsed) as PneumaEvent);
    }
    return out;
  }

  /** 便利: 按 category / tags / user.id 过滤 */
  async queryEvents(filter: {
    category?: PneumaEvent["category"];
    user_id?: string;
    tag?: string;
  } = {}): Promise<PneumaEvent[]> {
    const all = await this.events();
    return all.filter((e) => {
      if (filter.category && e.category !== filter.category) return false;
      if (filter.user_id && e.ctx.user?.id !== filter.user_id) return false;
      if (filter.tag && !(e.tags ?? []).includes(filter.tag)) return false;
      return true;
    });
  }
}
