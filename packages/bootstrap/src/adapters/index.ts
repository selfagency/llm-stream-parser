// fallow-ignore-file unused-file — barrel, consumed transitively

/**
 * Registry Adapters — barrel exports
 *
 * @module
 */

export {
  createEccToolsAdapter,
  type EccToolsAdapterOptions
} from './ecc-tools.js';
export {
  createGuardrailsHubAdapter,
  type GuardrailValidator,
  getValidatorDetails,
  listValidatorsByStatus,
  listValidatorsByStrategy,
  type PortStrategy
} from './guardrails-hub.js';

export {
  createMcpRegistryAdapter,
  type McpRegistryAdapterOptions
} from './mcp-registry.js';
export {
  audit,
  createSkillsShAdapter,
  curated,
  type SkillsShAdapterOptions,
  type SkillsShAuditResult,
  type SkillsShCuratedSection
} from './skills-sh.js';

export type { RegistryAdapter, RegistryEntry } from './types.js';
