// EventBroadcaster — tiny pub/sub hub for SSE fan-out.
//
// Lifecycle:
//   - AppRuntime holds one EventBroadcaster instance.
//   - OperationExecutor completions emit RuntimeEvents via broadcaster.emit().
//   - SSE endpoint subscribes each connected client; unsubscribes on disconnect.

export interface RuntimeEvent {
  readonly type: "operation-executed";
  readonly operation_id: string;
  readonly app_id: string;
  readonly ts: number;
  readonly success: boolean;
}

type Listener = (evt: RuntimeEvent) => void;

export class EventBroadcaster {
  private readonly listeners = new Set<Listener>();

  /** Subscribe a listener. Returns an unsubscribe function. */
  subscribe(onEvent: Listener): () => void {
    this.listeners.add(onEvent);
    return () => {
      this.listeners.delete(onEvent);
    };
  }

  /** Emit an event to all current subscribers. */
  emit(evt: RuntimeEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(evt);
      } catch {
        // Individual subscriber errors must not abort fan-out to others.
      }
    }
  }

  /** Current number of active subscribers (useful for testing). */
  subscriberCount(): number {
    return this.listeners.size;
  }
}
