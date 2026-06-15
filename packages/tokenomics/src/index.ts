// Phase 0 — Token counter & model-aware tokenizer resolution

// Analytics adapters — Plausible, PostHog, Vercel, Cloudflare, Sentry, generic HTTP
export type {
  DeployedAppAnalyticsAdapter,
  DeployedAppErrorMetrics,
  DeployedAppUsageMetrics,
  DeploymentEvent,
  MetricPeriod
} from './analytics/index.js';
export {
  createCloudflareAdapter,
  createHttpJsonAdapter,
  createPlausibleAdapter,
  createPostHogAdapter,
  createSentryAdapter,
  createVercelAdapter
} from './analytics/index.js';
// Git-ai compatibility adapter
export type { GitAiAgentMetadata } from './attribution/git-ai-adapter.js';
export { emitGitAiCheckpoint } from './attribution/git-ai-adapter.js';
// Git-ai attribution notes reader
export type { GitAiCommitStats, GitAiPeriodStats } from './attribution/git-ai-notes.js';
export { aggregateGitAiStats, readGitAiCommitStats } from './attribution/git-ai-notes.js';
// Git intelligence — AI session attribution via trailers, diff stats, and code survival
export type { AiTrailers, DiffStats, SurvivalResult } from './attribution/index.js';
export {
  appendTrailersToStagedCommit,
  computeSurvivalRate,
  formatTrailers,
  parseDiffStatOutput,
  parseTrailers,
  readDiffStats,
  readWorkingTreeDiff
} from './attribution/index.js';
// Prompt cache annotation & semantic cache middleware
export type {
  CacheAnnotatedContent,
  CacheAnnotatedMessage,
  CacheEfficiencySnapshot,
  CreateSemanticCacheEntryOptions,
  EmbeddingFunction,
  NextFunction,
  ProviderCacheHeaders,
  SemanticCacheEntry,
  SemanticCacheResult
} from './cache/index.js';
export {
  annotateCacheableSegments,
  computeCacheEfficiency,
  cosineSimilarity,
  parseProviderCacheHeaders,
  SemanticCacheMiddleware,
  stripCacheAnnotations
} from './cache/index.js';
export type {
  BudgetCategory,
  BudgetWarning,
  OutputCompressionLevel,
  OutputCompressionOptions,
  OutputCompressionResult
} from './context-moved/index.js';
// Inlined from @agentsy/context (Phase 22 — CortexKit integration)
export { BudgetEnforcer, BudgetExceededError, compressOutput, createTokenLedger } from './context-moved/index.js';
// Learning loop — frustration pattern detection, patch generation, and reinforcement
export type {
  ApplyPatchResult as LearningApplyPatchResult,
  FailureMode,
  PatchGenerationOptions,
  PatchStatus,
  PatchTarget,
  PatternRecognitionOptions,
  PromptPatch,
  ReinforcedPattern,
  ReinforcementOptions,
  SignalCluster
} from './learning/index.js';
export {
  applyPatch as learningApplyPatch,
  buildPatchGenerationPrompt,
  generatePatch as learningGeneratePatch,
  getRoutingWeights,
  recognizePatterns,
  reinforcePattern
} from './learning/index.js';
// Session ledger types, writer, store, and query API
export type {
  ArtifactRecord,
  CreateSessionLedgerEntryOptions,
  FrustrationRecord,
  LedgerAggregate,
  LedgerAggregateRow,
  LedgerFilter,
  LedgerQueryFilter,
  LedgerStore,
  QualityRecord,
  SessionLedgerEntry,
  SpendRecord
} from './ledger/index.js';
export {
  aggregateByDay,
  aggregateByMonth,
  aggregateByWeek,
  aggregateLedger,
  createSessionLedgerEntry,
  createSqliteLedgerStore,
  formatDay,
  formatMonth,
  formatWeek,
  queryLedger
} from './ledger/index.js';
export type {
  HeadroomConfidence,
  ReplicaAwareUsage,
  ReplicaBudget,
  ReplicaHeadroomSnapshot,
  ReplicaUsageFields
} from './quotas/headroom.js';
// Replica-level routing types
export {
  alignToHour,
  alignToMonth,
  alignToWeek,
  computeHeadroomPercentage,
  HOUR_MS,
  MONTH_MS,
  WEEK_MS
} from './quotas/headroom.js';
export { UsageAggregator } from './quotas/usage-aggregator.js';
// ROI calculator, MCP server, and transparency report
export type {
  AiAttributionBreakdown,
  ArtifactOutputSummary,
  CodeSurvivalSummary,
  CostPerUnitSummary,
  DeploymentCorrelation,
  FrustrationReport,
  McpToolName,
  RoiSnapshot,
  SpendSummary,
  TransparencyReport
} from './roi/index.js';
export {
  buildTransparencyReport,
  computeRoiSnapshot,
  getArtifactOutput,
  getCodeSurvival,
  getCostPerUnit,
  getDeploymentCorrelation,
  getFrustrationReport,
  getSpendSummary,
  mcpTools,
  tryReadAiAttribution
} from './roi/index.js';
export type { ReplicaHeadroomProvider } from './routing/headroom-provider.js';
export { createReplicaHeadroomProvider } from './routing/headroom-provider.js';
// Quota reconciliation
export type { HeaderSnapshotInput, ReconciledQuotaSnapshot } from './routing/quota-reconciliation.js';
export { reconcileQuotaConfidence } from './routing/quota-reconciliation.js';
// Replica skew signals
export type { ReplicaSkewSignal } from './routing/replica-skew.js';
export { computeReplicaSkew } from './routing/replica-skew.js';
// Routing diagnostics report
export type { ReplicaDiagnosticEntry, RoutingDiagnosticsReport } from './routing/routing-report.js';
export { buildRoutingReport } from './routing/routing-report.js';
// Frustration/satisfaction signal detection, collection, and scoring
export type {
  EmbeddingFunction as SignalsEmbeddingFunction,
  FrustrationCategory,
  FrustrationEvent,
  FrustrationEventKind,
  FrustrationScoreResult,
  HookRegistry,
  SatisfactionEvent,
  SatisfactionEventKind,
  SignalBreakdown,
  SignalWeights
} from './signals/index.js';
export {
  computeFrustrationScore,
  cosineSimilarity as signalsCosineSimilarity,
  DEFAULT_SIGNAL_WEIGHTS,
  detectAbandonment,
  MIN_REWRITE_LINES,
  MIN_SESSION_MS,
  RETRY_SIMILARITY_THRESHOLD,
  RETRY_TURN_WINDOW,
  REWRITE_WINDOW_MS,
  RetryDetector,
  RewriteDetector,
  SignalCollector
} from './signals/index.js';
export type {
  AllocationCondition,
  BudgetFilter,
  BudgetPriority,
  CostAnalysis,
  CostAnalysisBudgetSummary,
  OptimizationSuggestion,
  PacingFeedback,
  RateLimit,
  RateLimitStatus,
  RequestType,
  TokenAllocation,
  TokenBudget,
  TokenBudgetConfig,
  TokenLedger,
  TokenLedgerBudget,
  TokenManager,
  TokenRequest,
  TokenUsage,
  UsageFilter
} from './token-manager.js';
export { createInMemoryTokenManager, PacingController } from './token-manager.js';
export {
  defaultEstimators,
  EstimatorTokenizer,
  estimateTokenCount,
  TiktokenPool,
  TiktokenTokenizer,
  TokenizerRegistry
} from './tokenizers/index.js';
export type { CountResult, Tokenizer, TokenizerEntry } from './tokenizers/types.js';
// UI surfaces — status bar and dashboard formatters
export type { DailyDataPoint, DashboardData, FrustrationHeatmapEntry, StatusBarState } from './ui/index.js';
export { formatCacheEfficiency, formatDashboard, formatStatusBar, frustrationEmoji } from './ui/index.js';
