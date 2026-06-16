/**
 * Guardrails and policy enforcement types.
 */

import type { ToolId } from './brands.js';

/**
 * Result from evaluating a guardrail.
 */
export interface GuardrailResult {
  /** Guardrail identifier. */
  guardrailId: string;

  /** Optional metadata. */
  metadata?: Record<string, unknown>;
  /** Whether the guardrail passed. */
  passed: boolean;

  /** Rejection reason if failed. */
  reason?: string;
}

/**
 * Configuration for guardrails. */
export interface GuardrailsConfig {
  /** Map of guardrail IDs to their configurations. */
  configs: Record<
    string,
    {
      enabled: boolean;
      severity: 'low' | 'medium' | 'high';
      options?: Record<string, unknown>;
    }
  >;
  /** List of enabled guardrail IDs. */
  enabledGuardrails: string[];

  /** Action on any guardrail failing. */
  failAction: 'block' | 'warn' | 'log';

  /** Action on all guardrails passing. */
  passAction: 'allow' | 'warn' | 'log';
}

/**
 * Interface for a guardrail provider.
 */
export interface GuardrailProvider {
  /** Evaluate input against guardrail. */
  evaluate(input: { content: string; toolId?: ToolId; context?: Record<string, unknown> }): Promise<GuardrailResult>;

  /** Get guardrail status. */
  getStatus(): { enabled: boolean; lastEvaluated?: number };
  /** Provider identifier. */
  id: string;

  /** Update guardrail configuration. */
  updateConfig(config: { severity?: 'low' | 'medium' | 'high'; options?: Record<string, unknown> }): void;
}
