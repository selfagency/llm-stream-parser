/**
 * validateAgentManifest — fail-fast validation for Atlas manifests.
 *
 * Returns invalid IDs so the caller can surface a useful error.
 * Does not throw; the caller decides what to do with the result.
 */

import {
  isValidAiTaskId,
  isValidArtifactId,
  isValidConstraintId,
  isValidHumanTaskId,
  isValidSystemTaskId,
  isValidTouchpointId
} from './bridge.js';
import type { AtlasConstraintId } from './generated/ids.js';
import type { AtlasManifest } from './manifest.js';

export interface ManifestValidationResult {
  /** Atlas constraints that have no GuardrailsConfig mapping (enforcement gaps). */
  configGaps: AtlasConstraintId[];
  invalidIds: string[];
  valid: boolean;
}

/**
 * Validate an Atlas manifest against the frozen snapshot.
 *
 * @param manifest - The Atlas manifest block from an AgentSpec.
 * @param constraintToConfig - Optional mapping from AtlasConstraintId to
 *   GuardrailsConfig field name. Pass `null` to skip gap detection.
 * @returns Validation result with invalid IDs and config gaps.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 6 repetitive for-loops, not deeply nested.
export function validateAgentManifest(
  manifest: AtlasManifest,
  constraintToConfig?: ReadonlyMap<AtlasConstraintId, string | null>
): ManifestValidationResult {
  const invalidIds: string[] = [];

  for (const id of manifest.aiTasks) {
    if (!isValidAiTaskId(id)) {
      invalidIds.push(id);
    }
  }
  for (const id of manifest.humanTasks) {
    if (!isValidHumanTaskId(id)) {
      invalidIds.push(id);
    }
  }
  for (const id of manifest.systemTasks) {
    if (!isValidSystemTaskId(id)) {
      invalidIds.push(id);
    }
  }
  for (const id of manifest.dataArtifacts) {
    if (!isValidArtifactId(id)) {
      invalidIds.push(id);
    }
  }
  for (const id of manifest.constraints) {
    if (!isValidConstraintId(id)) {
      invalidIds.push(id);
    }
  }
  for (const id of manifest.touchpoints) {
    if (!isValidTouchpointId(id)) {
      invalidIds.push(id);
    }
  }

  const configGaps: AtlasConstraintId[] = [];
  if (constraintToConfig) {
    for (const id of manifest.constraints) {
      if (isValidConstraintId(id)) {
        const mapped = constraintToConfig.get(id);
        if (mapped === null || mapped === undefined) {
          configGaps.push(id);
        }
      }
    }
  }

  return {
    valid: invalidIds.length === 0,
    invalidIds,
    configGaps
  };
}
