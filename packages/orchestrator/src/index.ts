// Core exports

// Agent registry and discovery
export { AgentRegistry } from './agents/registry.js';
// Context isolation and resource locking
export { type ContextFrame, ContextManager, type LockToken } from './context/index.js';
export { OrchestrationEngine } from './core/engine.js';
// Governance policies and enforcement
export type {
  ApprovalRule,
  AuditConfig,
  AuditEvent,
  AuditSink,
  BudgetProfile,
  EscalationRule,
  GovernancePolicy,
  Role,
  ToolAccessRule
} from './governance/policy.js';
export { evaluateCondition, PolicyEnforcer } from './governance/policy.js';
export { BUILTIN_HELPER_ROLES } from './helpers/builtins.js';
export { evaluateHelperPolicy } from './helpers/policy.js';
export { createHelperRoleRegistry, type HelperRoleRegistry } from './helpers/registry.js';
// Helper-role ownership
export type {
  HelperPolicyDecision,
  HelperPolicyInput,
  HelperRoleDefinition,
  HelperTrigger,
  HelperVisibility
} from './helpers/types.js';
export type {
  ConflictStrategy,
  ConflictWarning,
  HookConflict,
  HookDefinition,
  HookExecutionPlan,
  HookPhase
} from './hooks/index.js';
// Hook system
export {
  compileHooks,
  createGovernanceGate,
  createObservabilityHook,
  createRecoveryHook,
  createToolCallTracingHook,
  HookPriority,
  HookRegistry
} from './hooks/index.js';
// Intelligence: task decomposition and cost estimation
export {
  type CostEstimateResult,
  CostEstimator,
  TIER_COST_MODELS,
  type TierCostModel
} from './intelligence/cost-estimator.js';
export {
  type DecomposedTask,
  type DecomposedTaskTier,
  type DecomposerHeuristics,
  TaskDecomposer
} from './intelligence/decomposer.js';
// Model-tier routing (delegates to gateway)
export {
  DEFAULT_ESCALATION_POLICY,
  type EscalationPolicy,
  GatewayBackedModelRouter,
  NO_ESCALATION_POLICY,
  type SelectionRecord,
  type TaskTier,
  type TierAwareModelRouter,
  type TierAwareModelRouterOptions
} from './intelligence/model-router.js';
// Tier routing with budget escalation
export { TIER_ORDER, TierRouter } from './intelligence/tier-router.js';
export { createOrchestratorLoop } from './orchestrator-loop.js';
// Circuit-breaker state tracking per replica
export {
  type CircuitBreakerConfig,
  type CircuitBreakerEntry,
  CircuitBreakerSet,
  type CircuitState,
  createCircuitBreakerSet
} from './recovery/circuit-breaker-set.js';
export {
  createReplicaHealthProbe,
  type HealthProbeResult,
  ReplicaHealthProbe,
  type ReplicaHealthProbeConfig
} from './recovery/health-probe.js';
// Recovery / multi-replica failover chain
export {
  createFailoverChain,
  ExhaustedError,
  type FailoverChain,
  type FailoverStep,
  type FailoverStepType,
  getNextStep
} from './recovery/model-failover.js';
export type {
  BackoffStrategy,
  EscalationAction as EscalationActionType,
  Fallback,
  RecoveryPolicy,
  RecoveryResult,
  RetryConfig
} from './recovery/policy.js';
// Recovery / structured error recovery framework
export { EscalationAction, RecoveryExecutor } from './recovery/policy.js';
// Recovery / rate-limit escalation
export {
  allReplicasRateLimited,
  buildRateLimitMap,
  getUnlimitedReplicas,
  RateLimitExceededError,
  type RateLimitStatus
} from './recovery/rate-limit-escalation.js';
// Scheduler exports (consolidated from @agentsy/orchestrator/scheduler)
export * from './scheduler/index.js';
// Task board with DAG validation and idempotency
export {
  CircularDependencyError,
  createInMemoryTaskBoard,
  DependencyNotFoundError,
  InMemoryTaskBoard,
  InvalidStatusTransitionError,
  TaskNotFoundError
} from './task-board/in-memory.js';
export type { ITaskBoard, Task, TaskAttempt, TaskStatus, ToolCallRecord } from './task-board/types.js';
// Type definitions
export * from './types/index.js';
// Routing types (TaskTier, RoutingIntent, FailoverPolicy)
export type { FailoverPolicy, RoutingIntent } from './types/routing.js';
// Utilities
export * from './utils/matching.js';
export * from './utils/timing.js';
