/**
 * Atlas → GuardrailsConfig mapping.
 *
 * This is the SINGLE FILE to edit when mapping an Atlas constraint to a
 * GuardrailsConfig field. Every AtlasConstraintId in the snapshot has an
 * entry here (enforced by an exhaustiveness test). `null` means "known
 * enforcement gap — no GuardrailsConfig field yet".
 *
 * The Atlas is the vocabulary. GuardrailsConfig is the enforcement.
 * This table connects them. EthicsRegistry is the provenance.
 */

import type { AtlasConstraintId } from '@agentsy/atlas';
import type { GuardrailsConfig } from './config.js';

/**
 * Maps each Atlas constraint to the GuardrailsConfig field that enforces it,
 * or `null` for a known enforcement gap.
 *
 * To add a mapping: find the constraint ID below, change `null` to the
 * GuardrailsConfig key. To add a new clause: add it to EthicsRegistry
 * with the matching atlasConstraintId.
 */
export const CONSTRAINT_TO_CONFIG: ReadonlyMap<AtlasConstraintId, keyof GuardrailsConfig | null> = new Map([
  // ── quality_safety ──────────────────────────────────────────────────
  ['const_privacy', 'piiRedaction'],
  ['const_human_loop', 'approvalRequiredFor'],
  ['const_authentication', null], // no auth config field yet
  ['const_authorization', null], // no RBAC config field yet
  ['const_encryption', null], // no encryption config field yet
  ['const_data_residency', 'localOnly'],
  ['const_data_retention', 'memoryPolicy'],
  ['const_content_safety', 'blockedTopics'],
  ['const_audit_log', null], // no audit config field yet
  ['const_user_consent', null], // no consent config field yet
  ['const_eval_coverage', null], // no eval config field yet

  // ── performance_resource ────────────────────────────────────────────
  ['const_latency', null], // no latency budget field yet
  ['const_rate_limit', 'tokenQuota'],
  ['const_cost_budget', 'tokenQuota'],
  ['const_compute_budget', null], // no compute budget field yet
  ['const_caching', null], // no caching config field yet

  // ── model_technical ─────────────────────────────────────────────────
  ['const_confidence', null], // no confidence threshold field yet
  ['const_context_window', null], // no context window field yet
  ['const_few_shot_examples', null], // no few-shot config field yet
  ['const_quality_threshold', null], // no quality threshold field yet
  ['const_model_portability', null], // no portability config field yet

  // ── ux_interaction ──────────────────────────────────────────────────
  ['const_tone', null], // no tone config field yet
  ['const_system_instruction', null], // no system instruction field yet
  ['const_error_handling', null], // no error handling config field yet
  ['const_streaming', null], // no streaming config field yet
  ['const_localization', null], // no localization config field yet

  // ── data_context ────────────────────────────────────────────────────
  ['const_format', null], // no output format field yet
  ['const_prompt_template', null], // no prompt template field yet

  // ── execution_behavior ──────────────────────────────────────────────
  ['const_autonomy', null], // no autonomy config field yet
  ['const_parallelism', null], // no parallelism config field yet
  ['const_timeout', null], // no timeout config field yet

  // ── code_philosophy ─────────────────────────────────────────────────
  ['const_minimalism', null], // no minimalism config field yet
  ['const_code_style', null], // no code style config field yet
  ['const_backward_compatibility', null], // no compat config field yet

  // ── attribution ────────────────────────────────────────────────────
  ['const_attribution', null], // no attribution config field yet
  ['const_provenance', null], // no provenance config field yet
  ['const_citation', null] // no citation config field yet
]);

/**
 * Atlas constraints that have no GuardrailsConfig mapping.
 * These are the known enforcement gaps to close over time.
 */
export function getConfigGaps(): AtlasConstraintId[] {
  return [...CONSTRAINT_TO_CONFIG.entries()].filter(([, v]) => v === null).map(([k]) => k);
}

/**
 * Atlas constraints that ARE mapped to a GuardrailsConfig field.
 */
export function getMappedConstraints(): AtlasConstraintId[] {
  return [...CONSTRAINT_TO_CONFIG.entries()].filter(([, v]) => v !== null).map(([k]) => k);
}

/**
 * Get the GuardrailsConfig field for an Atlas constraint.
 */
export function getConfigField(id: AtlasConstraintId): keyof GuardrailsConfig | null {
  return CONSTRAINT_TO_CONFIG.get(id) ?? null;
}
