export { createPneumaFramework } from "./create.js";
export type { PneumaFramework, PneumaFrameworkOptions } from "./create.js";
export {
  DefinitionApplyError,
  DefinitionRollbackPrepareError,
  DefinitionRollbackExecuteError,
  LifecycleOrchestrator,
} from "./lifecycle.js";
export type {
  OrchestratorOptions,
  BuildResult,
  DeployResult,
  AddTableDefinitionApply,
  AddTableColumnDefinitionApply,
  DefinitionApplyChange,
  DefinitionApplyMode,
  DefinitionApplyOptions,
  RuntimeConfigDiscovery,
  DefinitionApplyResult,
  DefinitionRollbackPrepareInput,
  DefinitionRollbackPrepareOptions,
  DefinitionRollbackPrepareResult,
  DefinitionRollbackExecuteOptions,
  DefinitionRollbackExecuteResult,
  FrameworkPromptEnvelope,
  FrameworkEventEnvelope,
} from "./lifecycle.js";
export { parseTemplateManifest, resolveScriptPath } from "./manifest.js";
export { parseMarker } from "./markers.js";
export { buildLifecycleEnv } from "./env.js";
export { readBuildManifest, writeBuildManifest } from "./artifact.js";
export {
  initShadowGit,
  createCheckpoint,
  listCheckpoints,
  rewindTo,
} from "./shadow-git.js";
export type { Checkpoint } from "./shadow-git.js";
export { LogBuffer } from "./logs.js";
export type { LogLine, GetLinesOpts } from "./logs.js";
export { createToolRegistry, buildToolRegistry } from "./tools/registry.js";
export { registerObservationTools } from "./tools/observation.js";
export { registerActionTools } from "./tools/action.js";
export { registerCheckpointTools } from "./tools/checkpoint.js";
export type {
  ToolContext,
  ToolDescriptor,
  ToolHandler,
  ToolRegistry,
  ToolResult,
} from "./tools/types.js";
export { createMcpServer } from "./mcp-server.js";
export type { McpServerHandle } from "./mcp-server.js";
export { OperationToolBridge } from "./operation-tool-bridge.js";
export type { OperationToolBridgeDeps, DiscoveredOperationLike } from "./operation-tool-bridge.js";
export { FakeAgentBackend } from "./agent-backend/fake.js";
export { initWorkspace, stateDir, buildDir } from "./workspace.js";
export type {
  LifecycleVerb,
  TemplateManifest,
  MarkerMessage,
  VerbExecution,
  VerbState,
  ServiceStatus,
  BuildManifest,
  LifecycleState,
  BackendType,
  DiscoveredOperation,
  DiscoveredView,
  DiscoveredViewPresentation,
  DiscoveredViewPresentationColumn,
  DiscoveredViewPresentationColumnRole,
  DiscoveredTable,
  DiscoveredTableColumn,
  DefinitionApplyFailureCategory,
  DefinitionApplyPhase,
  DefinitionApplyState,
  DefinitionApplyStatus,
  DefinitionApplyTimelineEntry,
  DefinitionRollbackPrepareFailureCategory,
  DefinitionRollbackPreparePhase,
  DefinitionRollbackPrepareState,
  DefinitionRollbackPrepareStatus,
  DefinitionRollbackPrepareTimelineEntry,
  DefinitionRollbackExecuteFailureCategory,
  DefinitionRollbackExecutePhase,
  DefinitionRollbackExecuteState,
  DefinitionRollbackExecuteStatus,
  DefinitionRollbackExecuteTimelineEntry,
} from "./types.js";
export {
  registerAgentBackend,
  clearAgentBackendRegistry,
  getAgentBackendDescriptor,
  getAgentBackendFactory,
  listAgentBackends,
  detectBackendAvailability,
} from "./agent-backend/registry.js";
export type {
  AgentBackend,
  AgentBackendFactory,
  AgentBackendType,
  AgentCapabilities,
  AgentEvent,
  AgentEventHandler,
  AgentLaunchOptions,
  AgentSession,
  AgentSessionState,
  AgentBackendDescriptor,
  BackendAvailability,
  PermissionResponse,
} from "./agent-backend/types.js";
export {
  loadSessionIndex,
  saveSessionIndex,
  recordSession,
  touchSession,
  findLatestSession,
  listSessions,
} from "./session-index.js";
export type { SessionRecord } from "./session-index.js";
export { createSessionRegistry } from "./wire-protocol/session-registry.js";
export type { Session, SessionRegistry } from "./wire-protocol/session-registry.js";
export { createWireServer } from "./wire-protocol/server.js";
export type { WireServer, WireServerOptions } from "./wire-protocol/server.js";
export { attachBackendBridge, handleViewerEnvelope } from "./wire-protocol/bridge.js";
export type { BridgeOptions } from "./wire-protocol/bridge.js";
export type {
  Focus,
  FocusElement,
  Action,
  ViewerRequest,
  PermissionPrompt,
  // Renamed at export to avoid collision with agent-backend's PermissionResponse
  // (different shape: wire-protocol uses `id`, agent-backend uses `requestId`).
  PermissionResponse as WirePermissionResponse,
  FrameworkEvent,
  WireEnvelope,
  WorkspaceStateUpdate,
  SessionId,
} from "./wire-protocol/types.js";
