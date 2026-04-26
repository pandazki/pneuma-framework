// @pneuma-framework/runtime
// 把 core-domain 的声明变成 live HTTP app.

export * from "./types.js";
export * from "./runtime.js";
export * from "./http.js";
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
  type DefinitionApplyResult,
  type DefinitionApplyDiff,
  type RuntimeConfigSnapshot,
  type RuntimeConfigTable,
  type RuntimeConfigColumn,
} from "./definition-apply.js";
