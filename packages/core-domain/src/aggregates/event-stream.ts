// EventStream — append-only aggregate (ADR-0013 / ADR-0014).
// 不变量:
//   1. sequence_number 严格单调（从 1 起）
//   2. append 不可回溯；无 update/delete/truncate 方法
//   3. event.ctx.app_id 必须 === stream.app_id
//   4. audit=true 事件必须写 audit sink；audit sink 失败 → 抛错（阻断 caller mutation）
//      - audit 失败时 debug sink 不写，保持 "全有或全无"

import type { PermissionContext } from "../value-objects/permission-context.js";

// ---------- event model (ADR-0013 §5 类事件) ----------

export type EventCategory =
  | "lifecycle"
  | "access"
  | "mutation"
  | "agent"
  | "request";

export interface PneumaEvent {
  readonly id: string;
  readonly ts: number; // unix ms
  readonly sequence: number; // 每 stream 单调递增，从 1 起
  readonly category: EventCategory;
  readonly ctx: PermissionContext;
  readonly trace_id: string;
  readonly span_id?: string;
  readonly parent_span_id?: string;
  readonly payload: unknown; // 按 category 分形状，细节留给 caller
  readonly audit?: boolean;
  readonly tags?: readonly string[];
}

export type PneumaEventInput = Omit<PneumaEvent, "sequence">;

// ---------- sinks ----------

export interface EventSink {
  write(event: PneumaEvent): Promise<void>;
  // 接口层禁止 update/delete/truncate (ADR-0014)
}

export class EventStreamError extends Error {
  constructor(message: string, public readonly kind: "app_id_mismatch" | "audit_sink_failure") {
    super(message);
    this.name = "EventStreamError";
  }
}

// ---------- aggregate ----------

export class EventStream {
  private seq = 0;

  constructor(
    public readonly app_id: string,
    private readonly debugSink: EventSink,
    private readonly auditSink: EventSink
  ) {}

  /** 当前 sequence 计数（测试 / 恢复用） */
  get currentSequence(): number {
    return this.seq;
  }

  /**
   * 写一个事件。audit=true 时先写 audit sink，成功后再写 debug sink。
   * audit sink 失败 → 抛 EventStreamError(audit_sink_failure)，debug sink 不写。
   */
  async append(event: PneumaEventInput): Promise<PneumaEvent> {
    if (event.ctx.app_id !== this.app_id) {
      throw new EventStreamError(
        `event ctx.app_id (${event.ctx.app_id}) does not match stream app_id (${this.app_id})`,
        "app_id_mismatch"
      );
    }
    const full: PneumaEvent = { ...event, sequence: ++this.seq };

    if (full.audit === true) {
      try {
        await this.auditSink.write(full);
      } catch (err) {
        // 回退 seq 以保持调用语义：append 未成功发生
        this.seq--;
        throw new EventStreamError(
          `audit sink failed: ${err instanceof Error ? err.message : String(err)}`,
          "audit_sink_failure"
        );
      }
    }
    await this.debugSink.write(full);
    return full;
  }
}

// ---------- in-memory sinks for testing / MVP ----------

export class InMemoryEventSink implements EventSink {
  readonly events: PneumaEvent[] = [];
  private _fail = false;

  async write(event: PneumaEvent): Promise<void> {
    if (this._fail) throw new Error("sink failure (test-induced)");
    this.events.push(event);
  }

  /** 测试辅助：让下一次 write 抛错 */
  setFail(v: boolean): void {
    this._fail = v;
  }

  clear(): void {
    this.events.length = 0;
  }
}
