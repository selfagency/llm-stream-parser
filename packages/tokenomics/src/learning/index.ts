/**
 * Learning loop — barrel export.
 *
 * The learning loop closes the feedback cycle by detecting recurring
 * frustration patterns, generating corrective patches, applying them,
 * and tracking positive reinforcement signals.
 *
 * @module learning/index
 */

export type { ApplyPatchResult } from './patch-applier.js';

export { applyPatch } from './patch-applier.js';
export { buildPatchGenerationPrompt, generatePatch } from './patch-generator.js';
export { recognizePatterns } from './pattern-recognizer.js';
export { getRoutingWeights, reinforcePattern } from './reinforcement.js';
export type {
  FailureMode,
  PatchGenerationOptions,
  PatchStatus,
  PatchTarget,
  PatternRecognitionOptions,
  PromptPatch,
  ReinforcedPattern,
  ReinforcementOptions,
  SignalCluster
} from './types.js';
