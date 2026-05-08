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
  type DefaultPosture,
  type EventSink,
  type LLMProvider,
  type Operation,
  type PolicyRule,
  type Repository,
  type Row,
  type Table,
  type View,
  openPneumaSqliteDatabase,
  openRowDatabase,
} from "@pneuma-framework/core-domain";
import type {
  AppConfig,
  RuntimeAuditSinkDiagnostic,
  RuntimeBootOptions,
  RuntimeDatabaseDiagnostic,
  RuntimeDiagnostics,
  RuntimeMode,
} from "./types.js";
import { EventBroadcaster } from "./event-broadcaster.js";
import { applyFrameworkInjections } from "./framework-operations.js";
import { applyDefinitionOverlay, type DefinitionOverlayWarning } from "./definition-loader.js";

export class AppRuntime {
  readonly app_id: string;
  readonly mode: RuntimeMode;
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
  readonly views: Repository<View>;
  readonly queryExec: QueryExecutor;
  readonly handlerRegistry: HandlerRegistry;
  readonly executor: OperationExecutor;
  readonly history: AppHistoryStore;
  readonly llm: LLMProvider;
  readonly broadcaster: EventBroadcaster;
  private readonly _overlayWarnings: DefinitionOverlayWarning[] = [];

  private readonly rowDb: Database;
  private readonly historyDb: Database;
  private readonly opIndex: Map<string, Operation>;
  private readonly viewIndex: Map<string, View>;
  /** Original executor.invoke before wrapping — kept to avoid infinite wrapping on re-use. */
  private readonly _rawInvoke: OperationExecutor["invoke"];

  constructor(public readonly config: AppConfig, options: Pick<RuntimeBootOptions, "mode"> = {}) {
    this.app_id = config.app_id;
    this.mode = options.mode ?? "preview";

  // --- persistence
    const unifiedDb = config.persistence?.kind === "sqlite"
      ? openPneumaSqliteDatabase(config.persistence.path)
      : undefined;
    this.rowDb = unifiedDb ?? openRowDatabase(config.storage?.sqlite_path ?? ":memory:");
    this.historyDb = unifiedDb ?? openPneumaSqliteDatabase(config.history?.sqlite_path ?? ":memory:");

    // --- repositories
    this.tables = new InMemoryRepository<Table>((t) => t.id);
    this.rows = new BunSqliteRowRepository(this.rowDb);
    this.views = new InMemoryRepository<View>((v) => v.id);
    this.adapters = new InMemoryRepository<Adapter>((a) => a.id);

    // --- pre-seed repositories from config
    // (Table/Adapter are declarations — kept in memory. Row repo starts empty;
    //  persistence comes from SQLite file.)
    for (const t of config.tables) void this.tables.save(t);
    for (const v of config.views ?? []) void this.views.save(v);
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

    // --- view index
    this.viewIndex = new Map((config.views ?? []).map((view) => [view.id, view]));

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

    // 通过 HandlerServices 把 queryExec / transformRunner / adapterInvoker / history 送进 handler
    this.executor = new OperationExecutor(
      this.policyEvaluator,
      this.events,
      this.storage,
      this.handlerRegistry,
      {
        queryExec: this.queryExec,
        transformRunner: this.transformRunner,
        adapterInvoker: this.adapterInvoker,
        history: this.history,
        policyEvaluator: this.policyEvaluator,
        operations: {
          get: (id: string) => this.getOperation(id),
          list: () => this.listOperations(),
        },
        views: {
          get: (id: string) => this.getView(id),
          list: () => this.listViews(),
        },
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

  registerOperation(operation: Operation): void {
    this.opIndex.set(operation.id, operation);
  }

  listOperations(): Operation[] {
    return Array.from(this.opIndex.values());
  }

  getView(id: string): View | undefined {
    return this.viewIndex.get(id);
  }

  async registerView(view: View): Promise<void> {
    this.viewIndex.set(view.id, view);
    await this.views.save(view);
  }

  listViews(): View[] {
    return Array.from(this.viewIndex.values());
  }

  registerPolicyRule(rule: PolicyRule): void {
    this.policyEvaluator.registerRule(rule);
  }

  setPolicyDefaultPosture(default_posture: DefaultPosture): void {
    this.policyEvaluator.setDefaultPosture(default_posture);
  }

  listPolicyRules(): PolicyRule[] {
    return [...this.policyEvaluator.snapshot().rules];
  }

  getPolicyDefaultPosture(): DefaultPosture {
    return this.policyEvaluator.snapshot().default_posture;
  }

  get overlayWarnings(): readonly DefinitionOverlayWarning[] {
    return this._overlayWarnings;
  }

  diagnostics(): RuntimeDiagnostics {
    return {
      runtime_mode: this.mode,
      persistence: {
        app_database: appDatabaseDiagnostic(this.config),
        history_database: historyDatabaseDiagnostic(this.config),
        audit_sink: auditSinkDiagnostic(this.config),
      },
      internal_http: {
        configured: typeof this.config.internal_http?.token === "string" &&
          this.config.internal_http.token.length > 0,
      },
      definition: {
        overlay_warning_count: this._overlayWarnings.length,
        overlay_warnings: this._overlayWarnings,
      },
      surface: {
        framework_api_prefix: "/api",
      },
    };
  }

  recordOverlayWarning(warning: DefinitionOverlayWarning): void {
    this._overlayWarnings.push(warning);
    if (this._overlayWarnings.length > 100) {
      this._overlayWarnings.splice(0, this._overlayWarnings.length - 100);
    }
  }

  /** 关闭持久化连接. HTTP server 由 caller 控制生命周期, 不在这里管. */
  async close(): Promise<void> {
    this.rowDb.close();
    if (this.historyDb !== this.rowDb) {
      this.historyDb.close();
    }
  }
}

/** 便利: 一步构造 + 返回 runtime. 同步签名 (底层都是同步/异步混合), promise 便于未来加 async 初始化 */
export async function bootAppRuntime(
  config: AppConfig,
  options: RuntimeBootOptions = {},
): Promise<AppRuntime> {
  const configured = applyRuntimeBootOptions(config, options);
  const merged = applyFrameworkInjections(configured);
  const runtime = new AppRuntime(merged, { mode: options.mode });
  await applyDefinitionOverlay(runtime);
  return runtime;
}

export function applyRuntimeBootOptions(
  config: AppConfig,
  options: RuntimeBootOptions = {},
): AppConfig {
  return {
    ...config,
    ...(options.sqlite_path !== undefined
      ? { persistence: { kind: "sqlite" as const, path: options.sqlite_path } }
      : {}),
    ...(options.audit_ndjson_path !== undefined
      ? { audit: { ...(config.audit ?? {}), ndjson_path: options.audit_ndjson_path } }
      : {}),
    ...(options.internal_http_token !== undefined
      ? {
          internal_http: {
            ...(config.internal_http ?? {}),
            token: options.internal_http_token,
          },
        }
      : {}),
  };
}

function appDatabaseDiagnostic(config: AppConfig): RuntimeDatabaseDiagnostic {
  if (config.persistence?.kind === "sqlite") {
    return { kind: "sqlite", path: config.persistence.path };
  }
  if (config.storage?.sqlite_path !== undefined) {
    return { kind: "sqlite", path: config.storage.sqlite_path };
  }
  return { kind: "memory" };
}

function historyDatabaseDiagnostic(config: AppConfig): RuntimeDatabaseDiagnostic {
  if (config.persistence?.kind === "sqlite") {
    return { kind: "sqlite", path: config.persistence.path };
  }
  if (config.history?.sqlite_path !== undefined) {
    return { kind: "sqlite", path: config.history.sqlite_path };
  }
  return { kind: "memory" };
}

function auditSinkDiagnostic(config: AppConfig): RuntimeAuditSinkDiagnostic {
  if (config.audit?.ndjson_path !== undefined) {
    return { kind: "ndjson", path: config.audit.ndjson_path };
  }
  return { kind: "memory" };
}
