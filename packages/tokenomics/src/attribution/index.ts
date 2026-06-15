/**
 * Attribution module — git intelligence for AI session attribution.
 *
 * Phase 3 of the tokenomics plan: track AI-assisted commits via git
 * trailers, read diff statistics, compute code survival rates, and
 * read git-ai attribution notes.
 *
 * @module attribution
 */

// Diff statistics reader
export type { DiffStats } from './diff-stats.js';
export { parseDiffStatOutput, readDiffStats, readWorkingTreeDiff } from './diff-stats.js';
// Git-ai compatibility adapter
export type { GitAiAgentMetadata } from './git-ai-adapter.js';
export { emitGitAiCheckpoint } from './git-ai-adapter.js';
// Git-ai attribution notes reader
export type { GitAiCommitStats, GitAiPeriodStats } from './git-ai-notes.js';
export { aggregateGitAiStats, readGitAiCommitStats } from './git-ai-notes.js';
// Git commit trailer management
export type { AiTrailers } from './git-trailers.js';
export { appendTrailersToStagedCommit, formatTrailers, parseTrailers } from './git-trailers.js';
// Code survival tracker
export type { SurvivalResult } from './survival.js';
export { computeSurvivalRate } from './survival.js';
