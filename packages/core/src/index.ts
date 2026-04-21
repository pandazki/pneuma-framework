export { createPneumaFramework } from "./create.js";
export type { PneumaFramework } from "./create.js";
export { LifecycleOrchestrator } from "./lifecycle.js";
export type {
  OrchestratorOptions,
  BuildResult,
  DeployResult,
} from "./lifecycle.js";
export { parseTemplateManifest, resolveScriptPath } from "./manifest.js";
export { parseMarker } from "./markers.js";
export { buildLifecycleEnv } from "./env.js";
export { readBuildManifest, writeBuildManifest } from "./artifact.js";
export {
  initShadowGit,
  createCheckpoint,
  listCheckpoints,
} from "./shadow-git.js";
export type { Checkpoint } from "./shadow-git.js";
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
  PermissionResponse,
} from "./agent-backend/types.js";
