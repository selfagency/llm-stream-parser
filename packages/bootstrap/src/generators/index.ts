/**
 * @module generators — AGENTS.md, AFT, and Magic Context artifact generators.
 */

export { generateAftJson, generateAftMd } from './aft.js';
export { type AtlasManifestData, generateAgentsMd } from './agents-md.js';
export { type DbQueryFn, seedMagicContext } from './magic-context.js';
