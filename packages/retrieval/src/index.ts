export type { BuiltContext, CitationEntry, ContextBuilderOptions, ContextOrdering } from './context/index.js';
export { ContextBuilder, lostInMiddleOrder } from './context/index.js';
export type { RagEngineOptions, RagResult } from './engine.js';
export { initRag, RagEngine } from './engine.js';
export { IndexingPipeline } from './indexing/index.js';
export type {
  ExportInfo,
  FileSummary,
  ImportInfo,
  Summarizer,
  SummarizerOptions,
  SupportedLanguage,
  SymbolInfo,
  SymbolKind
} from './pi-ast/index.js';
export {
  compressFileContent,
  createSummarizer,
  detectLanguage,
  estimateTokens,
  fitsTokenBudget,
  shouldSummarizeFile,
  summarizeFile
} from './pi-ast/index.js';
export type { ProcessedQuery, QueryClass, QueryLlm } from './query/index.js';
export { QueryProcessor } from './query/index.js';
export type { RerankedResult, Reranker, RerankerConfig, RerankerStrategy } from './reranking/index.js';
export { createReranker, PassthroughReranker } from './reranking/index.js';
export type { DenseIndex, HybridOptions, RetrievalResult, SparseIndex } from './retrieval/index.js';
export { hybridRetrieve } from './retrieval/index.js';
export { RetrievalEngine } from './search/index.js';
export type { AllowlistEntry, ProvenanceIngestResult, ProvenanceTag } from './security/index.js';
export {
  ingestWithProvenance,
  matchesPattern,
  redactUnverifiedSources,
  SourceNotAllowedError,
  verifySource
} from './security/index.js';
export type {
  Chunk,
  ChunkMetadata,
  DataSource,
  Document,
  DocumentMetadata,
  RetrievalQuery,
  SearchDocument,
  SearchResult
} from './types.js';
export {
  _Chunk,
  _ChunkMetadata,
  _DataSource,
  _Document,
  _DocumentMetadata,
  _RetrievalQuery,
  _SearchDocument,
  _SearchResult,
  ChunkingStrategy
} from './types.js';
