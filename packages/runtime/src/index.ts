// @pneuma-framework/runtime
// 把 core-domain 的声明变成 live HTTP app.
//
// Public surface is enumerated explicitly (no `export *`) so the barrel is
// auditable and frozen for 0.5.x. See CHANGELOG.md (0.5.0).

export {
  type AppConfig,
  type RuntimeAuditSinkDiagnostic,
  type RuntimeBootOptions,
  type RuntimeDatabaseDiagnostic,
  type RuntimeDiagnostics,
  type RuntimeMode,
} from "./types.js";
export { applyRuntimeBootOptions, AppRuntime, bootAppRuntime } from "./runtime.js";
export {
  asBunFetch,
  handleHttp,
  type HttpRequestContext,
  type HttpResponse,
  isFrameworkRuntimePath,
  tryHandleBunRuntimeRequest,
} from "./http.js";
export {
  type RuntimeReadyResult,
  RuntimeReadyTimeoutError,
  waitForRuntimeReady,
  type WaitForRuntimeReadyOptions,
} from "./runtime-ready.js";
export {
  PNEUMA_INTERNAL_HTTP_TOKEN_ENV,
  PNEUMA_INTERNAL_HTTP_TOKEN_HEADER,
  PNEUMA_SQLITE_PATH_ENV,
} from "./constants.js";
export { EventBroadcaster } from "./event-broadcaster.js";
export type { RuntimeEvent } from "./event-broadcaster.js";
export { inputSchemaToJsonSchema, cellTypeToJsonSchema } from "./operation-to-jsonschema.js";
export { outputSchemaToJsonSchema } from "./output-schema-to-jsonschema.js";
export type { JsonSchema } from "./operation-to-jsonschema.js";
export {
  applyFrameworkInjections,
  createAddTableOp,
  createAddTableHandler,
  createAddTableColumnOp,
  createAddTableColumnHandler,
  createAddOperationOp,
  createAddOperationHandler,
  createAddViewOp,
  createAddViewHandler,
  createAddPolicyRuleOp,
  createAddPolicyRuleHandler,
  createUpdatePolicyRuleOp,
  createUpdatePolicyRuleHandler,
  createDeletePolicyRuleOp,
  createDeletePolicyRuleHandler,
  createPolicyExplainOp,
  createPolicyExplainHandler,
  createDefinitionRollbackValidateOp,
  createDefinitionRollbackValidateHandler,
  createDefinitionRollbackExecuteOp,
  createDefinitionRollbackExecuteHandler,
  createDefinitionRollbackExecuteImpact,
  ADD_TABLE_OP_ID,
  ADD_TABLE_HANDLER_REF,
  ADD_TABLE_COLUMN_OP_ID,
  ADD_TABLE_COLUMN_HANDLER_REF,
  ADD_OPERATION_OP_ID,
  ADD_OPERATION_HANDLER_REF,
  ADD_VIEW_OP_ID,
  ADD_VIEW_HANDLER_REF,
  ADD_POLICY_RULE_OP_ID,
  ADD_POLICY_RULE_HANDLER_REF,
  UPDATE_POLICY_RULE_OP_ID,
  UPDATE_POLICY_RULE_HANDLER_REF,
  DELETE_POLICY_RULE_OP_ID,
  DELETE_POLICY_RULE_HANDLER_REF,
  POLICY_EXPLAIN_OP_ID,
  POLICY_EXPLAIN_HANDLER_REF,
  DEFINITION_ROLLBACK_VALIDATE_OP_ID,
  DEFINITION_ROLLBACK_VALIDATE_HANDLER_REF,
  DEFINITION_ROLLBACK_EXECUTE_OP_ID,
  DEFINITION_ROLLBACK_EXECUTE_HANDLER_REF,
  DEFINITION_ROLLBACK_EXECUTE_IMPACT_REF,
} from "./framework-operations.js";
export { applyDefinitionOverlay } from "./definition-loader.js";
export type { DefinitionOverlayWarning, DefinitionOverlayWarningCode } from "./definition-loader.js";
export {
  applyDefinitionChange,
  type DefinitionChange,
  type AddTableDefinitionChange,
  type AddTableColumnDefinitionChange,
  type AddOperationDefinitionChange,
  type AddViewDefinitionChange,
  type AddPolicyRuleDefinitionChange,
  type UpdatePolicyRuleDefinitionChange,
  type DeletePolicyRuleDefinitionChange,
  type SetDefaultPostureDefinitionChange,
  type DefinitionApplyResult,
  type DefinitionApplyDiff,
  type RuntimeConfigSnapshot,
  type RuntimeConfigTable,
  type RuntimeConfigColumn,
} from "./definition-apply.js";
