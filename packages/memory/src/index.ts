export type { MemoryDiagnosticCheck, MemoryDiagnosticsReport } from './diagnostics/index.js';
export { getMemorySetupGuide, runMemoryDiagnostics } from './diagnostics/index.js';

// @agentsy/memory — Three-layer memory engine (raw event log, synthesized wiki, vector retrieval)
// Phase 1 foundation: coordination contracts + three-tier wiki primitives.

// Phase 8 — AgentFS schema adapters
export {
  type AgentFsInitOptions,
  type AgentFsRestoreResult,
  type AgentFsSnapshotResult,
  type AgentFsStatus,
  createRagFsAdapter,
  createSnapshot,
  createTierFsAdapter,
  createToolAuditor,
  createWikiFsAdapter,
  detectAgentFs,
  initAgentFs,
  type RagFsAdapterOptions,
  type RestoreOptions,
  restoreSnapshot,
  type SnapshotOptions,
  type TierFsAdapterOptions,
  type ToolAuditorOptions,
  type WikiFsAdapterOptions
} from './agentfs/index.js';

export {
  type AtomicWorkflowContext,
  type AtomicWorkflowCoordinator,
  type AtomicWorkflowResult,
  type AtomicWorkflowStep,
  createAtomicWorkflowCoordinator
} from './coordination/atomic-workflows.js';
export {
  type HonkerLoadFeatures,
  type HonkerLoadOptions,
  type HonkerLoadResult,
  loadHonkerExtension
} from './coordination/honker/loader.js';
export {
  type ChannelListener,
  createInMemoryPubSubManager,
  type PubSubManager
} from './coordination/pub-sub-manager.js';
export { createInMemoryScheduler, type Scheduler } from './coordination/scheduler.js';
export {
  type CoordinationTask,
  createInMemoryTaskQueue,
  type TaskQueue
} from './coordination/task-queue.js';
export {
  type AgentFsEntry,
  type AgentFsManager,
  type AgentFsOptions,
  createAgentFsManager
} from './filesystem/agentfs/manager.js';
export {
  type CoordinationLatencyStats,
  createMemoryMetrics,
  type InjectionMetricsInput,
  type MemoryMetrics,
  type MemoryMetricsSnapshot,
  type RetrievalMetricsInput,
  redactSecretLikeValues
} from './observability/metrics.js';
export {
  type FormatMemoryContextOptions,
  formatMemoryContextXml,
  injectMemoryContext,
  type MemoryContextCandidate,
  type XmlContextContracts
} from './retrieval/injection.js';
export {
  type BootstrapSummary,
  type ContextPackedEvidence,
  type ContextPackerOptions,
  type ContextPackResult,
  type CreateRAGConfigInput,
  createDocumentIngestor,
  createHybridRetriever,
  createIndexManager,
  createKnowledgeBaseManager,
  createQueryPlanner,
  createRAGBootstrapper,
  createRAGConfig,
  createRAGMetrics,
  createRAGServerClient,
  createReindexScheduler,
  createSourceConnectors,
  type DocumentIngestor,
  type HybridRetriever,
  type IndexedDocumentRecord,
  type IndexManager,
  type IngestOutput,
  type IngestSource,
  type IngestSummary,
  type KnowledgeBaseManager,
  type PlannedQuery,
  packEvidenceForContext,
  type QueryPlanner,
  type RAGConfig,
  type RAGDeleteResult,
  type RAGEvidence,
  type RAGEvidenceCitation,
  type RAGHealthResult,
  type RAGMetrics,
  type RAGMetricsQueryInput,
  type RAGMetricsSnapshot,
  type RAGScoreBreakdown,
  type RAGSearchRequest,
  type RAGSearchResult,
  type RAGServerClient,
  type RAGServerClientOptions,
  type RAGServerDocument,
  type RAGSourceType,
  type RAGWebConfig,
  type RAGWeightConfig,
  type ReindexScheduler,
  type ReindexSchedulerOptions,
  rerankResults,
  type SourceConnectorOptions,
  type SourceConnectors,
  sanitizeIngestSource
} from './retrieval/rag/index.js';
export {
  createMemoryRetriever,
  type MemoryRetriever,
  type MemoryRetrieverOptions,
  type MemorySearchHit,
  type MemorySearchInput,
  type MemorySearchRecord
} from './retrieval/retriever.js';
export { type ReusableMemoryBlock, rankReusableMemoryBlocks } from './reuse.js';
export {
  createScopeManager,
  type MemoryScope,
  type ScopeAccessRequest,
  type ScopeAction,
  type ScopeGrant,
  type ScopeManager,
  type ScopePolicy
} from './scope/scope-manager.js';
export {
  type BackupManager,
  type BackupManagerOptions,
  type BackupManifest,
  type BackupSnapshot,
  type ConflictRecord,
  type ConflictResolutionResult,
  type ConflictStore,
  type CredentialSource,
  collectConflicts,
  computeSyncChecksum,
  createBackupManager,
  createBackupManifest,
  createConflictStore,
  createDefaultTursoClient,
  createFileConflictStore,
  createMemoryStateAdapter,
  createNoopTursoClient,
  createSecureSyncErrorEnvelope,
  createSyncMetricsRegistry,
  createSyncScheduler,
  createTursoHttpClient,
  createTursoManager,
  createTursoSyncClient,
  createTursoSyncEngine,
  deserializeMemoryState,
  type FileConflictStoreOptions,
  type MemoryState,
  type MemoryStateAdapter,
  type MemoryStateAdapterOptions,
  type MemorySyncTier,
  type MergePolicy,
  type RemoteValidationResult,
  type RestoreResult,
  type RestoreSnapshotOptions,
  redactSyncSecrets,
  resolveConflict,
  type SecureSyncErrorEnvelope,
  type SecureSyncErrorOptions,
  type SyncError,
  type SyncManagerLike,
  type SyncMetrics,
  type SyncMetricsRegistry,
  type SyncMetricsRegistrySnapshot,
  type SyncMode,
  type SyncRecord,
  type SyncRunResult,
  type SyncScheduler,
  type SyncSchedulerOptions,
  type SyncSnapshot,
  type SyncStatus,
  serializeMemoryState,
  type TursoClient,
  type TursoHttpClientConfig,
  TursoManager,
  type TursoSyncClientConfig,
  type TursoSyncConfig,
  type TursoSyncEngine,
  type TursoSyncEngineConfig,
  type TursoUploadResult,
  validateCredentialSource,
  validateRemoteSnapshot,
  verifyBackupManifest,
  verifySyncChecksum
} from './sync/index.js';
export {
  type CapturedMemoryRecord,
  createMemoryCaptureTool,
  type MemoryCaptureInput,
  type MemoryCaptureResult,
  type MemoryCaptureTool,
  type MemoryCaptureToolDeps
} from './tools/memory-capture.js';
export {
  createMemoryLintTool,
  type MemoryLintInput,
  type MemoryLintIssue,
  type MemoryLintResult,
  type MemoryLintTool,
  type MemoryLintToolDeps
} from './tools/memory-lint.js';
export {
  createMemoryListTool,
  type MemoryListInput,
  type MemoryListResult,
  type MemoryListTool,
  type MemoryListToolDeps
} from './tools/memory-list.js';
export {
  createMemorySearchTool,
  type MemorySearchTool,
  type MemorySearchToolDeps,
  type MemorySearchToolInput,
  type MemorySearchToolResult
} from './tools/memory-search.js';
export {
  createMemoryStatsTool,
  type MemoryStats,
  type MemoryStatsTool,
  type MemoryStatsToolDeps
} from './tools/memory-stats.js';
export {
  type ContextFingerprint,
  type CreateContextFingerprintInput,
  type CreateMemoryReuseHintInput,
  createContextFingerprint,
  createMemoryReuseHint,
  type MemoryReuseHint
} from './types.js';
export { type ContentProcessor, createContentProcessor } from './wiki/content-processor.js';
export {
  createEntityExtractor,
  type EntityExtractionResult,
  type EntityExtractor,
  type EntityKind,
  type EntityRelationship,
  type ExtractedEntity
} from './wiki/entity-extractor.js';
export {
  createLocalEmbeddingEngine,
  type LocalEmbeddingEngine,
  type LocalEmbeddingEngineOptions
} from './wiki/local-embedding-engine.js';
export { createNavigationSystem, type NavigationSystem } from './wiki/navigation-system.js';
export { createVersionTracker, type VersionTracker } from './wiki/version-tracker.js';
export { type PageDiff } from './wiki/wiki-utils.js';
export {
  type ConceptRelation,
  createWikiManager,
  type RawCapture,
  type RawCaptureInput,
  type RawSourceType,
  type VectorEntry,
  type VectorSearchResult,
  type WikiManager,
  type WikiManagerDependencies,
  type WikiPage,
  type WikiPageHistoryEntry,
  type WikiPageInput
} from './wiki/wiki-manager.js';

export interface MemoryRecord {
  content: string;
  id: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryStore {
  get(id: string): MemoryRecord | undefined;
  list(): MemoryRecord[];
  put(record: MemoryRecord): void;
}

export function createMemoryStore(): MemoryStore {
  const records = new Map<string, MemoryRecord>();

  return {
    get(id) {
      return records.get(id);
    },
    list() {
      return [...records.values()];
    },
    put(record) {
      records.set(record.id, record);
    }
  };
}

// Phase 1 v2 — Cognitive tier engine
export * from './cognitive/index.js';
// Phase 7 — Configuration & initialization
export { DEFAULT_TIER_CONFIGS, loadConfig, type MemoryConfig } from './config.js';
// Phase 4 — AgentFS, content-addressing
export * from './content-addressing/index.js';
export * from './filesystem/agentfs/audit-trail.js';
export * from './filesystem/agentfs/kv-store.js';
export * from './filesystem/agentfs/manager.js';
export * from './filesystem/agentfs/snapshots.js';

// Phase 7 — Lifecycle hooks
export {
  type OnResponseInput,
  type OnResponseOutput,
  type OnSessionEndInput,
  type OnSessionEndOutput,
  type OnSessionStartInput,
  type OnSessionStartOutput,
  type OnToolCallInput,
  type OnToolCallOutput,
  onResponse,
  onSessionEnd,
  onSessionStart,
  onToolCall
} from './hooks/index.js';
export {
  type InitOptions,
  type InitResult,
  type InitResultWithoutServer,
  type InitResultWithServer,
  initMemory
} from './init.js';
// Phase 6 — MCP server surface
export * from './mcp/index.js';
