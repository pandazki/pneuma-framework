// AppConfig — runtime layer 里 pneuma-app 的"声明式"输入.
// 把 core-domain 里的 aggregate 实例 + code 函数 + 持久化路径 + 凭证打包成一个对象,
// 扔给 bootAppRuntime() 就可以得到一个可用的 app (HTTP server).

import type {
  Adapter,
  AdapterImpl,
  HandlerFn,
  ImpactComputeFn,
  LLMProvider,
  Operation,
  PolicySet,
  Table,
  Transform,
  TransformFn,
  View,
} from "@pneuma-framework/core-domain";

export type RuntimeMode = "preview" | "published";

export interface RuntimeBootOptions {
  readonly mode?: RuntimeMode;
  readonly sqlite_path?: string;
  readonly audit_ndjson_path?: string;
  readonly internal_http_token?: string;
}

export type RuntimeDatabaseDiagnostic =
  | { readonly kind: "memory" }
  | { readonly kind: "sqlite"; readonly path: string };

export type RuntimeAuditSinkDiagnostic =
  | { readonly kind: "memory" }
  | { readonly kind: "ndjson"; readonly path: string };

export interface RuntimeDiagnostics {
  readonly runtime_mode: RuntimeMode;
  readonly persistence: {
    readonly app_database: RuntimeDatabaseDiagnostic;
    readonly history_database: RuntimeDatabaseDiagnostic;
    readonly audit_sink: RuntimeAuditSinkDiagnostic;
  };
  readonly internal_http: {
    readonly configured: boolean;
  };
  readonly definition: {
    readonly overlay_warning_count: number;
    readonly overlay_warnings: readonly unknown[];
  };
  readonly surface: {
    readonly framework_api_prefix: "/api";
  };
}

export interface AppConfig {
  /** 应用逻辑 id; 用在 PermissionContext + EventStream + app_history 里 */
  readonly app_id: string;

  /**
   * M3 substrate persistence. When set, runtime rows and app_history share one
   * SQLite app database. `storage` / `history` remain supported for older
   * templates that still keep separate DB files.
   */
  readonly persistence?: {
    readonly kind: "sqlite";
    readonly path: string;
  };

  /** Legacy persistence paths (default都 :memory: / 不启用) */
  readonly storage?: {
    readonly sqlite_path?: string;
  };
  readonly audit?: {
    /** NDJSON 路径. 不填则 audit sink 使用 InMemoryEventSink (内存, 不持久) */
    readonly ndjson_path?: string;
  };
  readonly history?: {
    /** app_history 的 sqlite 路径. 不填则默认 :memory: (process 内, 不跨重启) */
    readonly sqlite_path?: string;
  };

  /** Runtime-private HTTP authority. Public clients must never know this. */
  readonly internal_http?: {
    readonly token?: string;
  };

  /** 域声明 (已构造好的 aggregate 实例) */
  readonly tables: readonly Table[];
  readonly operations: readonly Operation[];
  readonly views?: readonly View[];
  readonly policy: PolicySet;
  readonly transforms?: readonly Transform[];
  readonly adapters?: readonly Adapter[];

  /** code handler 函数, key = Operation.handler.ref */
  readonly handlers: Readonly<Record<string, HandlerFn>>;
  /** impact compute 函数, key = Operation.impact.compute.ref */
  readonly impacts?: Readonly<Record<string, ImpactComputeFn>>;
  /** transform code impl, key = Transform.impl.ref (只对 CodeImpl) */
  readonly transformImpls?: Readonly<Record<string, TransformFn>>;
  /** adapter impl, key = Adapter.id */
  readonly adapterImpls?: Readonly<Record<string, AdapterImpl>>;

  /** 凭证: shared/admin/per-user 三级 */
  readonly credentials?: {
    readonly shared?: Readonly<Record<string, unknown>>;
    readonly admin?: Readonly<Record<string, unknown>>;
    readonly per_user?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  };

  /** LLM provider — 供 Transform PromptImpl 使用. 不传则 prompt transform 报错 */
  readonly llmProvider?: LLMProvider;
}
