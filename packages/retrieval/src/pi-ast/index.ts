/**
 * pi-ast — tree-sitter-inspired structural summaries for context compression
 *
 * @module @agentsy/retrieval/pi-ast
 */

export {
  compressFileContent,
  createSummarizer,
  detectLanguage,
  type ExportInfo,
  estimateTokens,
  type FileSummary,
  fitsTokenBudget,
  type ImportInfo,
  type Summarizer,
  type SummarizerOptions,
  type SupportedLanguage,
  type SymbolInfo,
  type SymbolKind,
  shouldSummarizeFile,
  summarizeFile
} from './summarizer.js';
