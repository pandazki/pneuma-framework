// AppRuntime — 读 AppConfig, 装配 core-domain 所有 service + B1 基础设施,
// 返回一个可 start / stop 的 runtime 对象.
//
// 默认持久化: in-memory (sqlite_path / ndjson_path 都可选).
// 带路径则用 Bun SQLite 文件 / NDJSON 文件.

import { Database } from "bun:sqlite";
import {
  AdapterInvoker,
  BunSqliteAppHistoryStore,
  BunSqliteRowRepository,
  EventStream,
  HandlerRegistry,
  InMemoryCredentialStore,
  InMemoryEventSink,
  InMemoryRepository,
  MockLLMProvider,
  NdjsonAuditSink,
  OperationExecutor,
  PolicyEvaluator,
  QueryExecutor,
  StorageService,
  TransformRegistry,
  TransformRunner,
  type Adapter,
  type AppHistoryStore,
  type EventSink,
  type LLMProvider,
  type Operation,
  type Repository,
  type Row,
  type Table,
  openRowDatabase,
} from "@pneuma-framework/core-domain";
import type { AppConfig } from "./types.js";
import { EventBroadcaster } from "./event-broadcaster.js";

export class AppRuntime {
  readonly app_id: string;
  readonly tables: Repository<Table>;
  readonly rows: Repository<Row>;
  readonly adapters: Repository<Adapter>;
  readonly storage: StorageService;
  readonly events: EventStream;
  readonly debugSink: InMemoryEventSink;
  readonly auditSink: EventSink;
  readonly policyEvaluator: PolicyEvaluator;
  readonly adapterInvoker: AdapterInvoker;
  readonly credentials: InMemoryCredentialStore;
  readonly transformRegistry: TransformRegistry;
  readonly transformRunner: TransformRunner;
  readonly queryExec: QueryExecutor;
  readonly handlerRegistry: HandlerRegistry;
  readonly executor: OperationExecutor;
  readonly history: AppHistoryStore;
  readonly llm: LLMProvider;
  readonly broadcaster: EventBroadcaster;

  private readonly rowDb: Database;
  private readonly historyDb: Database;
  private readonly opIndex: Map<string, Operation>;
  /** Original executor.invoke before wrapping — kept to avoid infinite wrapping on re-use. */
  private readonly _rawInvoke: OperationExecutor["invoke"];

  constructor(public readonly config: AppConfig) {
    this.app_id = config.app_id;

    // --- persistence
    this.rowDb = openRowDatabase(config.storage?.sqlite_path ?? ":memory:");
    this.historyDb = new Database(config.history?.sqlite_path ?? ":memory:");

    // --- repositories
    this.tables = new InMemoryRepository<Table>((t) => t.id);
    this.rows = new BunSqliteRowRepository(this.rowDb);
    this.adapters = new InMemoryRepository<Adapter>((a) => a.id);

    // --- pre-seed repositories from config
    // (Table/Adapter are declarations — kept in memory. Row repo starts empty;
    //  persistence comes from SQLite file.)
    for (const t of config.tables) void this.tables.save(t);
    for (const a of config.adapters ?? []) void this.adapters.save(a);

    // --- sinks
    this.debugSink = new InMemoryEventSink();
    this.auditSink = config.audit?.ndjson_path
      ? new NdjsonAuditSink(config.audit.ndjson_path)
      : new InMemoryEventSink();
    this.events = new EventStream(config.app_id, this.debugSink, this.auditSink);

    // --- history
    this.history = new BunSqliteAppHistoryStore(this.historyDb);

    // --- policy
    this.policyEvaluator = new PolicyEvaluator(config.policy.compile());

    // --- storage service
    this.storage = new StorageService(this.tables, this.rows);

    // --- credentials + adapters
    this.credentials = new InMemoryCredentialStore();
    this.seedCredentials(config);
    const adapterImplMap = new Map(Object.entries(config.adapterImpls ?? {}));
    this.adapterInvoker = new AdapterInvoker(this.credentials, adapterImplMap);

    // --- transform
    this.llm = config.llmProvider ?? new MockLLMProvider();
    this.transformRegistry = new TransformRegistry();
    for (const [ref, fn] of Object.entries(config.transformImpls ?? {})) {
      this.transformRegistry.register(ref, fn);
    }
    this.transformRunner = new TransformRunner(this.transformRegistry, this.llm);

    // --- query executor
    this.queryExec = new QueryExecutor(this.storage, this.adapterInvoker, this.adapters);

    // --- handlers + operation executor
    this.handlerRegistry = new HandlerRegistry();
    for (const [ref, fn] of Object.entries(config.handlers)) {
      this.handlerRegistry.registerHandler(ref, fn);
    }
    for (const [ref, fn] of Object.entries(config.impacts ?? {})) {
      this.handlerRegistry.registerImpact(ref, fn);
    }

    // 通过 HandlerServices 把 queryExec / transformRunner / adapterInvoker 送进 handler
    this.executor = new OperationExecutor(
      this.policyEvaluator,
      this.events,
      this.storage,
      this.handlerRegistry,
      {
        queryExec: this.queryExec,
        transformRunner: this.transformRunner,
        adapterInvoker: this.adapterInvoker,
      }
    );

    // --- operation index
    this.opIndex = new Map(config.operations.map((op) => [op.id, op]));

    // --- live event broadcaster
    this.broadcaster = new EventBroadcaster();
    // Wrap executor.invoke to emit an operation-executed event after each call.
    // We bind the original method once to avoid re-wrapping on repeated accesses.
    this._rawInvoke = this.executor.invoke.bind(this.executor);
    const broadcaster = this.broadcaster;
    const app_id = this.app_id;
    const rawInvoke = this._rawInvoke;
    this.executor.invoke = async function (op, input, ctx, opts) {
      let success = false;
      try {
        const result = await rawInvoke(op, input, ctx, opts);
        success = true;
        return result;
      } finally {
        broadcaster.emit({
          type: "operation-executed",
          operation_id: op.id,
          app_id,
          ts: Date.now(),
          success,
        });
      }
    };
  }

  private seedCredentials(config: AppConfig): void {
    const c = config.credentials;
    if (!c) return;
    for (const [aid, cred] of Object.entries(c.shared ?? {})) {
      this.credentials.setShared(aid, cred);
    }
    for (const [aid, cred] of Object.entries(c.admin ?? {})) {
      this.credentials.setAdmin(aid, cred);
    }
    for (const [aid, perUser] of Object.entries(c.per_user ?? {})) {
      for (const [uid, cred] of Object.entries(perUser)) {
        this.credentials.setPerUser(aid, uid, cred);
      }
    }
  }

  getOperation(id: string): Operation | undefined {
    return this.opIndex.get(id);
  }

  listOperations(): Operation[] {
    return Array.from(this.opIndex.values());
  }

  /** 关闭持久化连接. HTTP server 由 caller 控制生命周期, 不在这里管. */
  async close(): Promise<void> {
    this.rowDb.close();
    this.historyDb.close();
  }
}

/** 便利: 一步构造 + 返回 runtime. 同步签名 (底层都是同步/异步混合), promise 便于未来加 async 初始化 */
export async function bootAppRuntime(config: AppConfig): Promise<AppRuntime> {
  return new AppRuntime(config);
}
