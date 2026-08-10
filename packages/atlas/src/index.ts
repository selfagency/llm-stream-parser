/**
 * @agentsy/atlas — AI Interaction Atlas integration for Agentsy.
 *
 * Build-time-only dependency on @quietloudlab/ai-interaction-atlas.
 * The snapshot is the single source of truth; generated/ is produced
 * by codegen.ts and committed.
 *
 * The Atlas is the vocabulary. GuardrailsConfig is the enforcement.
 * EthicsRegistry is the provenance. Three layers, one source of truth.
 */

export * from './bridge.js';
export { type AtlasManifest, AtlasManifestSchema } from './manifest.js';
export { type ManifestValidationResult, validateAgentManifest } from './validate.js';
