/**
 * Guardrails Hub Adapter
 *
 * Curated mirror catalog of Guardrails AI @register_validator decorators
 * ported to native TypeScript for @agentsy/guardrails.
 *
 * 3-tier port strategy:
 * - Rule → direct TypeScript port (logic validated with tests)
 * - LLM → native LLM call via @agentsy/core processor
 * - ML → JS-equivalent implementation or deferred
 *
 * @module
 */

import type { RegistryAdapter, RegistryEntry } from './types.js';

// ── Types ─────────────────────────────────────────────────

export type PortStrategy = 'rule' | 'llm' | 'ml';

export interface GuardrailValidator {
  readonly description: string;
  readonly id: string;
  readonly name: string;
  readonly portStatus: 'ported' | 'in-progress' | 'planned' | 'deferred';
  readonly pythonModule: string;
  readonly pythonValidator: string;
  readonly strategy: PortStrategy;
  readonly targetPackage?: string;
}

// ── Built-in catalog ──────────────────────────────────────
// Mirrors the most common @register_validator decorators from
// the Guardrails AI GitHub organization (guardrailsai/guardrails).
// Sourced from guardrails-api Python package.

const BUILTIN_CATALOG: GuardrailValidator[] = [
  // ── Rule-based (direct port) ──
  {
    id: 'builtin:valid-length',
    name: 'ValidLength',
    description: 'Validates that generated output is within a specified length range',
    strategy: 'rule',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'valid_length',
    portStatus: 'ported',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:valid-range',
    name: 'ValidRange',
    description: 'Validates that a numeric output falls within a specified range',
    strategy: 'rule',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'valid_range',
    portStatus: 'ported',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:valid-url',
    name: 'ValidURL',
    description: 'Validates that output contains well-formed URLs',
    strategy: 'rule',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'valid_url',
    portStatus: 'ported',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:valid-email',
    name: 'ValidEmail',
    description: 'Validates that output contains valid email addresses',
    strategy: 'rule',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'valid_email',
    portStatus: 'ported',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:regex-match',
    name: 'RegexMatch',
    description: 'Validates output matches a regular expression pattern',
    strategy: 'rule',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'regex_match',
    portStatus: 'ported',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:regex-no-match',
    name: 'RegexNoMatch',
    description: 'Validates output does not match a regular expression pattern',
    strategy: 'rule',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'regex_no_match',
    portStatus: 'in-progress',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:provenance',
    name: 'Provenance',
    description: 'Validates that output is grounded in provided source documents',
    strategy: 'rule',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'provenance',
    portStatus: 'planned',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:reading-time',
    name: 'ReadingTime',
    description: 'Validates estimated reading time of generated text',
    strategy: 'rule',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'reading_time',
    portStatus: 'ported',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:starts-with',
    name: 'StartsWith',
    description: 'Validates output starts with expected text',
    strategy: 'rule',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'starts_with',
    portStatus: 'ported',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:ends-with',
    name: 'EndsWith',
    description: 'Validates output ends with expected text',
    strategy: 'rule',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'ends_with',
    portStatus: 'ported',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:similar-to-document',
    name: 'SimilarToDocument',
    description: 'Validates semantic similarity between output and reference document',
    strategy: 'rule',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'similar_to_document',
    portStatus: 'ported',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:sentiment',
    name: 'Sentiment',
    description: 'Validates output sentiment against a threshold',
    strategy: 'rule',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'sentiment',
    portStatus: 'in-progress',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:no-toxic-language',
    name: 'NoToxicLanguage',
    description: 'Detects and blocks toxic or abusive language in output',
    strategy: 'rule',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'detoxify',
    portStatus: 'ported',
    targetPackage: '@agentsy/guardrails/scanners'
  },

  // ── LLM-based (native LLM call) ──
  {
    id: 'builtin:factually-consistent',
    name: 'FactuallyConsistent',
    description: 'Validates factual consistency between output and source using LLM',
    strategy: 'llm',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'factually_consistent',
    portStatus: 'in-progress',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:relevant-to-context',
    name: 'RelevantToContext',
    description: 'Validates output relevance to the provided context using LLM',
    strategy: 'llm',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'relevant_to_context',
    portStatus: 'planned',
    targetPackage: '@agentsy/guardrails/validators'
  },
  {
    id: 'builtin:extracted-summary',
    name: 'ExtractedSummary',
    description: 'Validates that a summary accurately captures key points using LLM evaluation',
    strategy: 'llm',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'extracted_summary',
    portStatus: 'planned',
    targetPackage: '@agentsy/guardrails/validators'
  },

  // ── ML-based (JS-equivalent or deferred) ──
  {
    id: 'builtin:toxic-language',
    name: 'ToxicLanguage',
    description: 'ML-based toxicity detection with ONNX-runtime JS equivalent',
    strategy: 'ml',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'toxic_language',
    portStatus: 'deferred'
  },
  {
    id: 'builtin:nsfw-text',
    name: 'NSFWText',
    description: 'ML-based NSFW content detection for text output',
    strategy: 'ml',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'nsfw_text',
    portStatus: 'deferred'
  },
  {
    id: 'builtin:secrets-detection',
    name: 'SecretsDetection',
    description: 'ML-based detection of secrets and credentials in output',
    strategy: 'ml',
    pythonModule: 'guardrails_api.validators',
    pythonValidator: 'secrets_detection',
    portStatus: 'deferred'
  }
];

// ── Helpers ───────────────────────────────────────────────

function guardrailToEntry(validator: GuardrailValidator): RegistryEntry {
  return {
    id: validator.id,
    name: validator.name,
    description: `${validator.description} [${validator.strategy.toUpperCase()} — ${validator.portStatus}]`,
    source: 'guardrails-hub',
    version: undefined
  };
}

// ── Adapter factory ───────────────────────────────────────

export function createGuardrailsHubAdapter(): RegistryAdapter {
  return {
    name: 'guardrails-hub',

    list(): Promise<RegistryEntry[]> {
      return Promise.resolve(BUILTIN_CATALOG.map(guardrailToEntry));
    },

    search(query: string): Promise<RegistryEntry[]> {
      const term = query.toLowerCase();
      const results = BUILTIN_CATALOG.filter(
        v =>
          v.name.toLowerCase().includes(term) ||
          v.description.toLowerCase().includes(term) ||
          v.id.toLowerCase().includes(term) ||
          v.strategy.includes(term as PortStrategy) ||
          v.portStatus.includes(term)
      ).map(guardrailToEntry);
      return Promise.resolve(results);
    },

    get(id: string): Promise<RegistryEntry | null> {
      const validator = BUILTIN_CATALOG.find(v => v.id === id);
      if (validator === undefined) {
        return Promise.resolve(null);
      }
      return Promise.resolve(guardrailToEntry(validator));
    }
  };
}

// ── Extended access for consumers ─────────────────────────

export function getValidatorDetails(id: string): GuardrailValidator | null {
  return BUILTIN_CATALOG.find(v => v.id === id) ?? null;
}

export function listValidatorsByStrategy(strategy: PortStrategy): GuardrailValidator[] {
  return BUILTIN_CATALOG.filter(v => v.strategy === strategy);
}

export function listValidatorsByStatus(status: GuardrailValidator['portStatus']): GuardrailValidator[] {
  return BUILTIN_CATALOG.filter(v => v.portStatus === status);
}
