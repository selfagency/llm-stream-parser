/**
 * Service host subsystem.
 *
 * Generic service host with lifecycle management (start, stop, sleep, wake).
 *
 * @module
 */

export {
  type BootstrapResult,
  BootstrapService,
  type BootstrapServiceDeps
} from './bootstrap-service.js';
export {
  type AgentCheckpoint,
  type CheckpointAgentHost,
  type CheckpointDB,
  type CheckpointManager,
  type CheckpointManagerDeps,
  type CheckpointManagerOptions,
  CheckpointManagerService,
  type CheckpointMemory,
  type CheckpointMessage,
  type CheckpointMetadata,
  type CheckpointTokenBudget,
  type CreateCheckpointInput,
  createCheckpointManager,
  type RestoreCheckpointResult
} from './checkpoint-manager.js';
export {
  CircuitBreaker,
  CircuitBreakerOpenError,
  type CircuitBreakerOptions,
  type CircuitBreakerSnapshot,
  type CircuitBreakerState,
  createCircuitBreaker
} from './circuit-breaker.js';
export {
  type CrossSessionInsight,
  type CrossSessionMemory,
  type CrossSessionMemoryDeps,
  type CrossSessionMemoryOptions,
  type CrossSessionMemoryProvider,
  CrossSessionMemoryService,
  calculateConfidence,
  createCrossSessionMemory,
  groupByTopic,
  type MemoryItem,
  type RecallParams,
  summarize,
  type TopicGroup
} from './cross-session-memory.js';
export {
  type AcpHealth,
  type AcpServerLike,
  type AcpSessionsLike,
  type AgentHealthEntry,
  type AgentHostLike as DiagnosticsAgentHostLike,
  type AgentListEntry,
  createDiagnosticsService,
  type DaemonHealthReport,
  type DaemonInfo,
  type DaemonLike,
  type DaemonState,
  type DiagnosticsService,
  DiagnosticsService as DiagnosticsServiceClass,
  type DiagnosticsServiceDeps,
  DiagnosticsServiceImpl,
  type DiagnosticsServiceOptions,
  type GatewayLike,
  type JobSchedulerLike as DiagnosticsJobSchedulerLike,
  type JobsHealth,
  type MemoryEngineLike as DiagnosticsMemoryEngineLike,
  type MemoryHealth,
  type RoutingHealth,
  type RoutingServiceLike as DiagnosticsRoutingServiceLike,
  type ScheduleEntry,
  type ServiceHostLike as DiagnosticsServiceHostLike,
  type ServiceStateEntry,
  type StreamManagerLike as DiagnosticsStreamManagerLike,
  type StreamsHealth,
  type SubprocessEntry,
  type SubprocessHealthEntry,
  type SubprocessManagerLike as DiagnosticsSubprocessManagerLike
} from './diagnostics-service.js';
export {
  createOutputValidator,
  type JsonSchema,
  OutputValidator,
  type OutputValidatorConfig,
  OutputValidatorService,
  type StructuredOutputRequest,
  type ValidateOptions,
  type ValidationResult,
  validateStructuredOutput,
  validateStructuredOutputAsync
} from './output-validator.js';
export {
  AllProvidersExhaustedError,
  type CacheProvider,
  createResilienceService,
  type ModelCallRequest,
  type ModelCallResult,
  type ModelTier,
  type ResilienceLogger,
  ResilienceService,
  type ResilienceServiceDeps,
  ResilienceServiceImpl,
  type ResilienceServiceOptions,
  type RoutingDecision,
  type RoutingServiceLike,
  type StreamExecutor
} from './resilience-service.js';
export {
  RetrievalService,
  type RetrievalServiceDeps,
  type RetrievedChunk,
  type RetrieveOptions
} from './retrieval-service.js';
export { RoutingService, type RoutingServiceDeps } from './routing-service.js';
export {
  type AgentBudget,
  type AgentHostLike,
  type AgentRecord,
  type AgentSpec,
  type AuditEvent,
  type AuditSink,
  createSandboxService,
  type SandboxExecutionStatus,
  type SandboxInput,
  type SandboxOutput,
  type SandboxService,
  SandboxService as SandboxServiceClass,
  type SandboxServiceDeps,
  SandboxServiceImpl,
  type SandboxServiceOptions,
  type SandboxTool,
  type SecretsGuardLike,
  type ToolExecutionRequest,
  type ToolExecutionResult,
  type ToolFilterConfig as SandboxToolFilterConfig,
  type ToolRegistryLike,
  type VirtualSandboxLike
} from './sandbox-service.js';
export { ServiceHost, type ServiceHostDeps, type ServiceState } from './service-host.js';
export { UnifiedDBPersistenceAdapter } from './unified-db-persistence-adapter.js';
export {
  type ConnectionFactory,
  type ConnectionFactoryResult,
  type CreateWebSocketResponsesOptions,
  createWebSocketResponsesService,
  type PooledConnection,
  type PoolStats,
  type PrewarmResult,
  type ResponseCreateRequest,
  type ResponseCreateResult,
  TURN_STATE_HEADER,
  WebSocketConnectionPool,
  WebSocketResponsesService
} from './websocket-responses.js';
