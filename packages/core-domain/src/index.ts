// @pneuma-framework/core-domain
// Pure domain primitives per docs/architecture/spec/domain-model.md.
// In-memory + local-fs only — no IO, no LLM, no adapter side-effects.
//
// Public surface is enumerated explicitly (no `export *`) so the barrel is
// auditable and frozen for 0.5.x. See CHANGELOG.md (0.5.0).

// Value Objects
export { type CellType, equalsCellType, isCellType, PRIMITIVE_CELL_TYPES, type PrimitiveCellType } from "./value-objects/cell-type.js";
export { equalsRef, isRef, type Ref } from "./value-objects/ref.js";
export { assertCellValue, CellValueMismatch, isValidCellValue } from "./value-objects/cell.js";
export {
  buildRootContext,
  type BuildRootContextInput,
  deriveSpan,
  type InvokedVia,
  type PermissionContext,
} from "./value-objects/permission-context.js";
export {
  type ComparisonOp,
  type DateSubOp,
  type EvalContext,
  evaluate,
  evaluateLeaf,
  explain,
  getSubjects,
  isUniversallyFalse,
  isUniversallyTrue,
  isWhereClause,
  type Namespace,
  requiresUserContext,
  simplify,
  type SubjectPath,
  type ValueRef,
  type WhereBranch,
  type WhereClause,
  type WhereLeaf,
  type WhereValue,
} from "./value-objects/where-clause.js";
export {
  type ApprovalToken,
  type AuthorizationContext,
  type AuthorizationDecision,
  type AuthorizationReasonCode,
  type AuthorizationTarget,
  type AuthorizationTargetKind,
  type Capability,
  type Principal,
} from "./value-objects/authorization.js";

// Aggregates
export {
  type EventCategory,
  type EventSink,
  EventStream,
  EventStreamError,
  InMemoryEventSink,
  type PneumaEvent,
  type PneumaEventInput,
} from "./aggregates/event-stream.js";
export {
  type Column,
  columnTypesEqual,
  type Relation,
  type RelationKind,
  RESERVED_COLUMN_NAMES,
  Table,
  type TableInit,
  TableInvariantViolation,
  type TableSource,
} from "./aggregates/table.js";
export { Row, type RowInit, RowInvariantViolation } from "./aggregates/row.js";
export {
  type AffectDeclaration,
  type AgentToolConfig,
  defaultOperationSurface,
  type HandlerRef,
  type ImpactDescriptor,
  type InputSchema,
  type InputSchemaField,
  normalizeOperationSurface,
  Operation,
  operationCanBackView,
  type OperationInit,
  OperationInvariantViolation,
  type OperationOutput,
  type OperationSurfaceDeclaration,
  type OperationSurfaceInit,
  type QueryBody,
  type QueryWith,
  type UIBinding,
} from "./aggregates/operation.js";
export {
  isViewKind,
  isViewSource,
  normalizeViewPresentation,
  View,
  type ViewInit,
  ViewInvariantViolation,
  type ViewKind,
  type ViewOperationSource,
  type ViewPresentation,
  type ViewPresentationColumn,
  type ViewPresentationColumnRole,
  type ViewPresentationInput,
  type ViewSource,
} from "./aggregates/view.js";
export {
  type Action,
  type AnalysisReport,
  type CompiledPolicy,
  type DefaultPosture,
  type PolicyEffect,
  type PolicyRule,
  type PolicyRuleUpdate,
  PolicySet,
  type PolicySetInit,
  PolicySetInvariantViolation,
  type Resource,
  Resources,
  type Subject,
  Subjects,
} from "./aggregates/policy-set.js";
export {
  Adapter,
  type AdapterInit,
  AdapterInvariantViolation,
  type AttributionConfig,
  type AuthStrategy,
  type Capabilities,
  type CredentialMode,
  type ExternalColumn,
  type ExternalTypeDef,
  type FilterPushdown,
  type IdentityBinding,
  type IdentityBindingStrategy,
} from "./aggregates/adapter.js";
export {
  type CodeImpl,
  type PromptImpl,
  type Purity,
  Transform,
  type TransformImpl,
  type TransformInit,
  type TransformInputShape,
  TransformInvariantViolation,
} from "./aggregates/transform.js";

// Repositories
export { type IdOf, InMemoryRepository, type Repository } from "./repositories/types.js";
export { decodeCellValue, encodeCellValue } from "./repositories/cell-codec.js";
export { BunSqliteRowRepository, openRowDatabase } from "./repositories/bun-sqlite.js";
export { BunSqliteSemanticIndexStore, ensureSemanticIndexSchema } from "./repositories/bun-sqlite-semantic-index.js";
export { openPneumaSqliteDatabase } from "./persistence/sqlite/database.js";
export { runPneumaSqliteMigrations } from "./persistence/sqlite/migrations.js";
export { appHistory, permissionLedgerEvents, pneumaMigrations, rows } from "./persistence/sqlite/schema.js";

// Sinks
export { NdjsonAuditReader, NdjsonAuditSink } from "./sinks/ndjson-audit.js";

// Lifecycle
export {
  type ActorKind,
  type AppHistoryEntry,
  AppHistoryError,
  type AppHistoryStore,
  type HistoryType,
  type NewAppHistoryEntry,
  newHistoryId,
  RETENTION_BUFFER_LIMIT,
  SNAPSHOT_FREQUENCY,
} from "./lifecycle/app-history.js";
export { BunSqliteAppHistoryStore } from "./lifecycle/bun-sqlite-app-history.js";
export {
  createPneumaTablesTable,
  isColumn,
  isTableSource,
  PNEUMA_TABLES_TABLE_ID,
  type PneumaTableEntry,
  pneumaTableEntryToRow,
  rowToPneumaTableEntry,
} from "./lifecycle/pneuma-tables.js";
export {
  createPneumaTableColumnsTable,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
  type PneumaTableColumnEntry,
  pneumaTableColumnEntryToRow,
  rowToPneumaTableColumnEntry,
} from "./lifecycle/pneuma-table-columns.js";
export {
  createPneumaOperationsTable,
  operationFromPneumaOperationEntry,
  PNEUMA_OPERATIONS_TABLE_ID,
  type PneumaOperationEntry,
  pneumaOperationEntryToRow,
  rowToPneumaOperationEntry,
} from "./lifecycle/pneuma-operations.js";
export {
  createPneumaViewsTable,
  PNEUMA_VIEWS_TABLE_ID,
  type PneumaViewEntry,
  pneumaViewEntryToRow,
  rowToPneumaViewEntry,
  viewFromPneumaViewEntry,
} from "./lifecycle/pneuma-views.js";
export {
  createPneumaPolicyRulesTable,
  PNEUMA_POLICY_RULES_TABLE_ID,
  type PneumaPolicyRuleEntry,
  pneumaPolicyRuleEntryToRow,
  policyRuleFromPneumaPolicyRuleEntry,
  rowToPneumaPolicyRuleEntry,
} from "./lifecycle/pneuma-policy-rules.js";
export {
  createPneumaPolicySettingsTable,
  PNEUMA_POLICY_SETTINGS_TABLE_ID,
  type PneumaPolicySettingEntry,
  pneumaPolicySettingEntryToRow,
  policyDefaultPostureFromSettingEntry,
  type PolicySettingId,
  rowToPneumaPolicySettingEntry,
} from "./lifecycle/pneuma-policy-settings.js";

// Reference Adapters
export { type FileAdapterConfig, FileAdapterError, FileAdapterImpl } from "./adapters/file-adapter.js";

// Services
export { type DeleteRowResult, type SaveRowOptions, StorageError, StorageService } from "./services/storage-service.js";
export {
  type CheckOptions,
  type PolicyDecision,
  PolicyEvaluator,
  type PolicyExplanation,
  type PolicyExplanationReason,
  type PolicyReason,
} from "./services/policy-evaluator.js";
export {
  ConfirmationRequiredError,
  type HandlerContext,
  type HandlerFn,
  HandlerRegistry,
  type HandlerServices,
  type ImpactComputeFn,
  type ImpactReport,
  type InvokeOptions,
  type InvokeResult,
  OperationExecutionError,
  OperationExecutor,
  type OperationHandlerStorage,
  PolicyDeniedError,
} from "./services/operation-executor.js";
export {
  type AdapterImpl,
  type AdapterInvocationContext,
  AdapterInvocationError,
  AdapterInvoker,
  applyLocalFilter,
  type CredentialStore,
  type ExternalRow,
  type FilterSplit,
  InMemoryCredentialStore,
  type ListOptions,
  type ListResult,
  type PushableLeaf,
  type PushableQuery,
} from "./services/adapter-invoker.js";
export {
  InMemoryTransformCache,
  type LLMPromptInput,
  type LLMProvider,
  MockLLMProvider,
  type TransformCacheEntry,
  TransformExecutionError,
  type TransformFn,
  TransformRegistry,
  type TransformRunContext,
  TransformRunner,
  type TransformRunnerOptions,
} from "./services/transform-runner.js";
export {
  DeterministicEmbeddingProvider,
  type DeterministicEmbeddingProviderConfig,
  type EmbeddingProvider,
  EmbeddingProviderError,
  type EmbedInput,
  MockEmbeddingProvider,
} from "./services/embedding-provider.js";
export {
  cosineSimilarity,
  InMemorySemanticIndexStore,
  searchDocuments,
  semanticDocumentMetadata,
  semanticDocumentText,
  type SemanticIndexDocument,
  type SemanticIndexSearchResult,
  SemanticIndexService,
  semanticIndexStats,
  type SemanticIndexStats,
  type SemanticIndexStatus,
  type SemanticIndexStore,
  type SemanticProjection,
  semanticSourceFingerprint,
} from "./services/semantic-index.js";
// Note: query-executor also re-exports `type Row`, which is the same symbol as
// aggregates/row.js `Row` (the class) and is already exported above.
export { QueryExecutionError, QueryExecutor, type QueryResult } from "./services/query-executor.js";
export {
  createIdentitySystemTables,
  hydrateUserContext,
  IdentityRegistry,
  type IdentityTables,
  roleRef,
  userRef,
} from "./services/identity-registry.js";
export {
  type AuthorizationExtensionRule,
  AuthorizationKernel,
  type AuthorizationKernelOptions,
} from "./services/authorization-kernel.js";
