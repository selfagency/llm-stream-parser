/**
 * @module generators — AGENTS.md, AFT, and Magic Context artifact generators.
 */

export {
  type AftFileEntry,
  type AftJson,
  type AftStats,
  generateAftJson,
  generateAftMd
} from './aft.js';
export { type AtlasManifestData, generateAgentsMd } from './agents-md.js';
export {
  type ReviewFinding,
  type ReviewResult,
  type ReviewSeverity,
  reviewAgentsMd
} from './agents-md-review.js';
export {
  type DbQueryFn,
  type MagicContextSeed,
  seedMagicContext
} from './magic-context.js';
