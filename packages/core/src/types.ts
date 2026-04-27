// packages/core/src/types.ts

export type LifecycleVerb =
  | "setup"
  | "dev"
  | "stop"
  | "build"
  | "deploy"
  | "migrate"
  | "fork";

export type BackendType = "claude-code" | "codex" | (string & {});

export interface TemplateManifest {
  schemaVersion: 1;
  name: string;
  version: string;
  displayName: string;
  description: string;
  backends: {
    supported: BackendType[];
    defaultConfig?: Record<string, unknown>;
  };
  runtimeAgent: "none" | "embedded" | "optional";
  scripts: Partial<Record<LifecycleVerb, string>>;
  skill?: {
    sourceDir: string;
    installName: string;
    envMapping?: Record<string, string>;
  };
  viewer?: {
    entry?: string;
    sdk?: "react" | "vanilla" | "custom";
    actions?: Array<{ id: string; label: string; params?: Record<string, unknown> }>;
    commands?: Array<{ id: string; label: string }>;
  };
  initParams?: Array<{
    name: string;
    type: "number" | "string" | "boolean";
    defaultValue: number | string | boolean;
    label: string;
    description?: string;
    sensitive?: boolean;
  }>;
  unattendedDeploy?: boolean;
}

export type MarkerMessage =
  | { kind: "service-ready"; name: string; url: string }
  | { kind: "ready" }
  | { kind: "stopping" }
  | { kind: "needs-confirm"; label: string }
  | { kind: "progress"; pct: number; label: string }
  | { kind: "artifact"; path: string };

export interface ServiceStatus {
  name: string;
  url: string;
  startedAt: number;
}

export type VerbState = "running" | "exited" | "crashed" | "stopped";

/**
 * Structural shape of a single operation as discovered from GET /api/config
 * (packages/runtime). This lives in @pneuma-framework/core so downstream
 * consumers (orchestrator, OperationToolBridge, any future framework-internal
 * consumer) have a shared public type that does NOT depend on
 * @pneuma-framework/core-domain.
 *
 * `output`, `input_schema`, and `output_schema` are optional for backward
 * compatibility with templates that predate P0 (pre-2026-04-24). P0 runtime
 * always emits all three; older templates may omit `output` and/or the
 * `*_schema` fields. This matches the structural `DiscoveredOperationLike`
 * type in `operation-tool-bridge.ts` so both surfaces accept pre-P0 shapes.
 */
export interface DiscoveredOperationSurface {
  readonly agent_callable: boolean;
  readonly public_surface: boolean;
  readonly view_mountable: boolean;
  readonly framework_internal: boolean;
}

export interface DiscoveredOperation {
  readonly id: string;
  readonly action: string;
  readonly resource: unknown;
  readonly input: unknown;
  readonly input_schema?: unknown;
  readonly output?: unknown;
  readonly output_schema?: unknown;
  readonly affects: unknown;
  readonly handler_kind: "code" | "query";
  readonly surface?: DiscoveredOperationSurface;
}

export type DiscoveredViewPresentationColumnRole = "title" | "subtitle" | "body" | "metadata" | "url";

export interface DiscoveredViewPresentationColumn {
  readonly field: string;
  readonly label?: string;
  readonly role?: DiscoveredViewPresentationColumnRole;
}

export interface DiscoveredViewPresentation {
  readonly title?: string;
  readonly columns?: readonly DiscoveredViewPresentationColumn[];
  readonly empty_state?: string;
}

export interface DiscoveredView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: "table" | "list" | "detail" | "custom" | (string & {});
  readonly source: unknown;
  readonly presentation?: DiscoveredViewPresentation;
}

export interface DiscoveredTableColumn {
  readonly name: string;
  readonly type: unknown;
  readonly nullable: boolean;
  readonly default_access?: "public" | "restricted";
  readonly cascade_on_target_delete?: boolean;
  readonly schema?: unknown;
}

export interface DiscoveredTable {
  readonly id: string;
  readonly source: unknown;
  readonly system_owned: boolean;
  readonly columns: readonly DiscoveredTableColumn[];
  readonly row_schema?: unknown;
}

export type DefinitionApplyPhase =
  | "validating"
  | "awaiting-approval"
  | "applying-definition"
  | "stopping-for-definition-apply"
  | "starting-after-definition-apply"
  | "refreshing-definition"
  | "running"
  | "failed"
  | "denied";

export type DefinitionApplyStatus =
  | "pending"
  | "validated"
  | "applied"
  | "denied"
  | "failed";

export type DefinitionApplyFailureCategory =
  | "validation_failed"
  | "approval_unavailable"
  | "approval_denied"
  | "operation_failed"
  | "restart_failed"
  | "schema_refresh_failed"
  | "diff_mismatch";

export interface DefinitionApplyTimelineEntry {
  /** Current lifecycle phase for this state snapshot. */
  readonly phase: DefinitionApplyPhase;
  /** Unix millis when this phase was recorded. */
  readonly at: number;
  /** Optional display/debug context. Consumers must not depend on detail shape. */
  readonly detail?: Record<string, unknown>;
}

export interface DefinitionApplyState {
  /** Correlates all state snapshots for one definition.apply run. */
  readonly change_id: string;
  /** Coarse terminal/progress status. Use this for product-level badges. */
  readonly status: DefinitionApplyStatus;
  /** Fine-grained current phase. Use this for progress rails. */
  readonly phase: DefinitionApplyPhase;
  readonly startedAt: number;
  readonly updatedAt: number;
  /** Ordered snapshots for the current run. Newer envelopes carry the full timeline. */
  readonly timeline: readonly DefinitionApplyTimelineEntry[];
  /** Present while a Builder approval prompt is outstanding. */
  readonly prompt_id?: string;
  readonly failure?: {
    readonly category: DefinitionApplyFailureCategory;
    readonly message: string;
  };
}

export type DefinitionRollbackPreparePhase =
  | "validating"
  | "awaiting-approval"
  | "ready-to-execute"
  | "failed"
  | "denied";

export type DefinitionRollbackPrepareStatus =
  | "pending"
  | "ready_to_execute"
  | "denied"
  | "failed";

export type DefinitionRollbackPrepareFailureCategory =
  | "validation_failed"
  | "approval_unavailable"
  | "operation_failed";

export interface DefinitionRollbackPrepareTimelineEntry {
  /** Current lifecycle phase for this state snapshot. */
  readonly phase: DefinitionRollbackPreparePhase;
  /** Unix millis when this phase was recorded. */
  readonly at: number;
  /** Optional display/debug context. Consumers must not depend on detail shape. */
  readonly detail?: Record<string, unknown>;
}

export interface DefinitionRollbackPrepareState {
  /** Correlates all prepare snapshots for one rollback review. */
  readonly rollback_id: string;
  readonly target_history_version: number;
  /** Coarse terminal/progress status. Use this for product-level badges. */
  readonly status: DefinitionRollbackPrepareStatus;
  /** Fine-grained current phase. Use this for progress rails. */
  readonly phase: DefinitionRollbackPreparePhase;
  readonly startedAt: number;
  readonly updatedAt: number;
  /** Ordered snapshots for the current run. Newer envelopes carry the full timeline. */
  readonly timeline: readonly DefinitionRollbackPrepareTimelineEntry[];
  /** Present while a Builder approval prompt is outstanding. */
  readonly prompt_id?: string;
  readonly failure?: {
    readonly category: DefinitionRollbackPrepareFailureCategory;
    readonly message: string;
  };
}

export type DefinitionRollbackExecutePhase =
  | "preparing"
  | "executing-rollback"
  | "stopping-after-rollback"
  | "starting-after-rollback"
  | "refreshing-definition"
  | "running"
  | "failed"
  | "denied";

export type DefinitionRollbackExecuteStatus =
  | "pending"
  | "rolled_back"
  | "noop"
  | "denied"
  | "failed";

export type DefinitionRollbackExecuteFailureCategory =
  | "prepare_failed"
  | "approval_denied"
  | "operation_failed"
  | "restart_failed"
  | "schema_refresh_failed"
  | "verification_failed";

export interface DefinitionRollbackExecuteTimelineEntry {
  /** Current lifecycle phase for this state snapshot. */
  readonly phase: DefinitionRollbackExecutePhase;
  /** Unix millis when this phase was recorded. */
  readonly at: number;
  /** Optional display/debug context. Consumers must not depend on detail shape. */
  readonly detail?: Record<string, unknown>;
}

export interface DefinitionRollbackExecuteState {
  /** Correlates execute snapshots with the rollback prepare run. */
  readonly rollback_id: string;
  readonly target_history_version: number;
  /** Coarse terminal/progress status. Use this for product-level badges. */
  readonly status: DefinitionRollbackExecuteStatus;
  /** Fine-grained current phase. Use this for progress rails. */
  readonly phase: DefinitionRollbackExecutePhase;
  readonly startedAt: number;
  readonly updatedAt: number;
  /** Ordered snapshots for the current run. Newer envelopes carry the full timeline. */
  readonly timeline: readonly DefinitionRollbackExecuteTimelineEntry[];
  readonly failure?: {
    readonly category: DefinitionRollbackExecuteFailureCategory;
    readonly message: string;
  };
}

export interface VerbExecution {
  verb: LifecycleVerb;
  pid: number;
  startedAt: number;
  exitedAt?: number;
  exitCode?: number | null;
  state: VerbState;
  services: ServiceStatus[];
  pendingConfirm?: { label: string; at: number };
  /**
   * Operations fetched from `GET /api/config` after the first HTTP-app service
   * becomes ready. Populated once per dev start; undefined if the template does
   * not expose an HTTP-app service or if no service has become ready yet.
   */
  operations?: readonly DiscoveredOperation[];
  /** Tables fetched from `GET /api/config` after service-ready. */
  tables?: readonly DiscoveredTable[];
  /** Views fetched from `GET /api/config` after service-ready. */
  views?: readonly DiscoveredView[];
  /**
   * Set when the `/api/config` fetch attempt fails (network error or non-2xx
   * response). Dev mode continues normally — this is informational only.
   */
  operations_fetch_error?: string;
}

export interface BuildManifest {
  schemaVersion: 1;
  kind: string;
  entrypoint: string;
  produced: string[];
  env?: Record<string, string>;
  notes?: string;
  deployHints?: {
    requiresMigration?: boolean;
    runtimeAgent?: "embedded" | "none";
  };
}

export interface LifecycleState {
  workspace: { root: string; stateDir: string };
  dev?: VerbExecution;
  lastBuild?: VerbExecution & { manifestPath?: string };
  lastDeploy?: VerbExecution;
  definitionApply?: DefinitionApplyState;
  definitionRollbackPrepare?: DefinitionRollbackPrepareState;
  definitionRollbackExecute?: DefinitionRollbackExecuteState;
}
