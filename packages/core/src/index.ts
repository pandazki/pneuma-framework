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
  RELEASE_CANDIDATE_STATUSES,
  createReleaseCandidate,
  failReleaseCandidate,
  finalizeReleaseCandidate,
  markReleaseCandidateBuilding,
  markReleaseCandidateVerifying,
  recordReleaseCandidateCheck,
} from "./release-candidate.js";
export type {
  CreateReleaseCandidateInput,
  FailReleaseCandidateInput,
  FinalizeReleaseCandidateInput,
  MarkReleaseCandidateBuildingInput,
  MarkReleaseCandidateVerifyingInput,
  RecordReleaseCandidateCheckInput,
  ReleaseCandidate,
  ReleaseCandidateCheck,
  ReleaseCandidateCheckStatus,
  ReleaseCandidateFailure,
  ReleaseCandidateStatus,
} from "./release-candidate.js";
export {
  RELEASE_INSTANCE_STATUSES,
  RELEASE_ROLLOUT_CHECK_STATUSES,
  RELEASE_ROLLOUT_EVENT_TYPES,
  RELEASE_SLOT_NAMES,
  createReleaseInstance,
  createReleaseRolloutState,
  markReleaseInstanceHealthy,
  promoteReleaseCandidate,
  rollbackActiveRelease,
  stageReleaseCandidate,
  summarizeReleaseRollout,
} from "./release-rollout.js";
export type {
  CreateReleaseInstanceInput,
  CreateReleaseRolloutStateInput,
  MarkReleaseInstanceHealthyInput,
  ReleaseInstance,
  ReleaseInstanceStatus,
  ReleaseRolloutCheck,
  ReleaseRolloutCheckStatus,
  ReleaseRolloutEvent,
  ReleaseRolloutEventType,
  ReleaseRolloutState,
  ReleaseRolloutSummary,
  ReleaseRolloutTransitionInput,
  ReleaseRolloutTransitionResult,
  ReleaseSlotName,
} from "./release-rollout.js";
export {
  FileReleaseRolloutStore,
  releaseRolloutFilePath,
} from "./release-rollout-store.js";
export type {
  FileReleaseRolloutStoreOptions,
  ReleaseRolloutStore,
} from "./release-rollout-store.js";
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
export { registerReleaseTools } from "./tools/release.js";
export {
  DEFAULT_TOOL_AGENT_ID,
  DEFAULT_TOOL_APP_ID,
  DEFAULT_TOOL_BUILDER_ID,
  DEFAULT_TOOL_WORKSPACE_ID,
  buildToolAuthorizationContext,
  builderPrincipal,
  defaultToolPrincipal,
  definitionApplyTarget,
  definitionRollbackTarget,
  frameworkSystemPrincipal,
  targetFingerprint,
} from "./tools/authorization-context.js";
export { InMemoryApprovalTokenStore } from "./tools/approval-token-store.js";
export type { ApprovalTokenMintInput, ApprovalTokenStore } from "./tools/approval-token-store.js";
export {
  FilePermissionLedgerStore,
  InMemoryPermissionLedgerStore,
  approvalTokenLedgerHash,
  derivePermissionCenterState,
  derivePermissionLedgerRequests,
  filterPermissionLedgerRequests,
  permissionLedgerEventId,
  permissionLedgerFilePath,
  summarizePermissionLedgerRequests,
} from "./permission-ledger.js";
export { BunSqlitePermissionLedgerStore } from "./permission-ledger-sqlite.js";
export type {
  PermissionCenterState,
  PermissionCenterStateOptions,
  PermissionCenterSummary,
  PermissionLedgerBaseEvent,
  PermissionLedgerDecision,
  PermissionLedgerEvent,
  PermissionLedgerListOptions,
  PermissionLedgerRequestListOptions,
  PermissionLedgerRequestQuery,
  PermissionLedgerRequestRecord,
  PermissionLedgerRequestStatus,
  PermissionLedgerStore,
} from "./permission-ledger.js";
export type {
  ToolContext,
  ToolDescriptor,
  ToolHandler,
  ToolRegistry,
  ToolResult,
} from "./tools/types.js";
export { createMcpServer } from "./mcp-server.js";
export type { McpServerHandle } from "./mcp-server.js";
export { startFrameworkToolHttpProxy } from "./framework-tool-http.js";
export type {
  FrameworkToolHttpProxy,
  FrameworkToolHttpProxyOptions,
} from "./framework-tool-http.js";
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
  DefinitionRepairStatus,
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
export { createCreationHostStore } from "./creation-host.js";
export type {
  CreateCreationHostProjectInput,
  CreateCreationHostStoreOptions,
  CreationHostJsonRecord,
  CreationHostJsonValue,
  CreationHostProfile,
  CreationHostProject,
  CreationHostState,
  CreationHostStore,
  CreationHostVersion,
  ForkCreationHostVersionInput,
} from "./creation-host.js";
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
  PermissionLedgerState,
  WireEnvelope,
  WorkspaceStateUpdate,
  SessionId,
} from "./wire-protocol/types.js";
