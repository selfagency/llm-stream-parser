/**
 * Guardrails and policy enforcement types.
 *
 * The canonical GuardrailsConfig is now defined in @agentsy/guardrails.
 * This file re-exports it for backward compatibility.
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
 * Configuration for guardrails.
 *
 * @deprecated Use the canonical GuardrailsConfig from @agentsy/guardrails instead.
 */
export type { GuardrailsConfig } from '@agentsy/guardrails';

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
