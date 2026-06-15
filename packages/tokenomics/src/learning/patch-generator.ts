/**
 * Patch generator — LLM-powered generation of corrective patches
 * from failure mode evidence.
 *
 * Each failure mode produces one LLM call to generate a PromptPatch.
 * The generation prompt is built from structured evidence (session
 * counts, frustration signals, model/agent IDs) — no raw session
 * content is included.
 *
 * @module learning/patch-generator
 */

import type { SessionLedgerEntry } from '../ledger/types.js';
import type { FailureMode, PatchGenerationOptions, PromptPatch } from './types.js';

// =============================================================================
// Default options
// =============================================================================

const DEFAULT_OPTIONS: Required<PatchGenerationOptions> = {
  autoApplyThreshold: 0.9,
  model: 'gpt-4o'
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a PromptPatch for a single failure mode using an LLM call.
 *
 * @param failureMode    - The detected failure mode to patch.
 * @param exampleSessions - Ledger entries for sessions in the failure mode.
 * @param llm            - An LLM completion function: receives a prompt string,
 *                          returns a generated content string.
 * @param options        - Patch generation options.
 * @returns The generated PromptPatch.
 */
export async function generatePatch(
  failureMode: FailureMode,
  exampleSessions: SessionLedgerEntry[],
  llm: (prompt: string) => Promise<string>,
  options?: PatchGenerationOptions
): Promise<PromptPatch> {
  const opts: Required<PatchGenerationOptions> = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  const prompt = buildPatchGenerationPrompt(failureMode, exampleSessions);
  const generated = await llm(prompt);

  return buildPatch(failureMode, generated, opts.autoApplyThreshold);
}

/**
 * Build the structured prompt for patch generation.
 *
 * The prompt contains only structured evidence — no raw session content,
 * user messages, or file contents. This ensures privacy and focuses the
 * LLM on the statistical pattern rather than individual examples.
 *
 * @param failureMode    - The failure mode to patch.
 * @param exampleSessions - Sessions that exhibit the failure mode.
 * @returns The generation prompt string.
 */
export function buildPatchGenerationPrompt(failureMode: FailureMode, exampleSessions: SessionLedgerEntry[]): string {
  // Build session evidence summary
  const sessionEvidence = exampleSessions
    .map((s, i) => {
      const tags = s.tags.length > 0 ? s.tags.join(', ') : '(none)';
      return `[Session ${i + 1}]
  model: ${s.modelId}
  agent: ${s.agentId}
  tags: ${tags}
  duration: ${s.durationMs}ms
  frustration: ${s.frustration.count} events (${s.frustration.reasons.join(', ') || 'none'})
  quality: ${s.quality.score} / ${s.quality.feedbackCount} feedback
  survivalRate30d: ${s.survivalRate30d ?? 'N/A'}
  spend: $${s.spend.totalCost.toFixed(4)} / ${s.spend.totalTokens} tokens`;
    })
    .join('\n\n');

  const target = inferPatchTarget(failureMode);
  const targetPath = inferTargetPath(failureMode, target);

  return `You are analyzing a recurring failure pattern in an AI coding agent system.

## Failure Mode Context
- ID: ${failureMode.id}
- Category: ${failureMode.category}
- Dominant Signal: ${failureMode.dominantSignalKind}
- Sessions detected: ${failureMode.sessionCount}
- Confidence: ${(failureMode.confidence * 100).toFixed(0)}%
- Average frustration score: ${failureMode.avgFrustrationScore.toFixed(3)}
- Models involved: ${failureMode.modelIds.join(', ')}
- Agents involved: ${failureMode.agentIds.join(', ')}
- Context fingerprint: ${failureMode.contextFingerprint}

## Session Evidence Summary
${sessionEvidence}

## Task
Generate a corrective patch that would prevent or mitigate this failure pattern.

The patch target should be: ${target}
The target path should be: ${targetPath}

Your response must include:
1. A brief diagnosis (2-3 sentences)
2. The specific instructions, policy, or routing change needed
3. The section within the target that should be modified
4. A confidence score (0.0 to 1.0) that this patch would resolve the issue

Format your response as:

DIAGNOSIS: <brief diagnosis>
TARGET: <instructions|skill|tool-policy|model-routing>
TARGET_PATH: <path>
SECTION: <section>
CONTENT:
<patch content — the exact text to add/replace>
CONFIDENCE: <0.0-1.0>`;
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Build a PromptPatch from an LLM generation response.
 *
 * Parses the LLM output to extract structured fields and wraps
 * them in a PromptPatch.
 */
function buildPatch(failureMode: FailureMode, generated: string, autoApplyThreshold: number): PromptPatch {
  const parsed = parseGenerationOutput(generated);

  const confidence = parsed.confidence ?? Math.min(0.7, failureMode.confidence + 0.15);

  const now = new Date();

  return {
    id: `pp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    failureModeId: failureMode.id,
    target: parsed.target ?? 'instructions',
    targetPath: parsed.targetPath ?? `agentsy/${failureMode.category}.md`,
    section: parsed.section ?? failureMode.category,
    content: parsed.content ?? generated,
    confidence,
    status: confidence >= autoApplyThreshold ? 'approved' : 'pending',
    createdAt: now,
    appliedAt: null
  };
}

/**
 * Parsed generation output.
 */
interface ParsedGeneration {
  confidence?: number;
  content?: string;
  section?: string;
  target?: 'instructions' | 'skill' | 'tool-policy' | 'model-routing';
  targetPath?: string;
}

/**
 * Parse an LLM generation response into structured fields.
 *
 * Uses simple line-by-line extraction of the marker-prefixed fields
 * defined in the generation prompt.
 */
function parseGenerationOutput(output: string): ParsedGeneration {
  const result: ParsedGeneration = {};

  const targetMatch = output.match(/^TARGET:\s*(.+)$/m);
  if (targetMatch?.[1]) {
    const val = targetMatch[1].trim().toLowerCase();
    if (['instructions', 'skill', 'tool-policy', 'model-routing'].includes(val)) {
      result.target = val as 'instructions' | 'skill' | 'tool-policy' | 'model-routing';
    }
  }

  const targetPathMatch = output.match(/^TARGET_PATH:\s*(.+)$/m);
  if (targetPathMatch?.[1]) {
    result.targetPath = targetPathMatch[1].trim();
  }

  const sectionMatch = output.match(/^SECTION:\s*(.+)$/m);
  if (sectionMatch?.[1]) {
    result.section = sectionMatch[1].trim();
  }

  const confidenceMatch = output.match(/^CONFIDENCE:\s*([\d.]+)/m);
  if (confidenceMatch?.[1]) {
    const parsed = Number(confidenceMatch[1]);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      result.confidence = parsed;
    }
  }

  // Extract content between CONTENT: and the next marker or end
  const contentMatch = output.match(/^CONTENT:\n([\s\S]*?)(?=\nCONFIDENCE:|$)/m);
  if (contentMatch?.[1]) {
    result.content = contentMatch[1].trim();
  }

  return result;
}

/**
 * Infer the best patch target type from a failure mode's properties.
 */
function inferPatchTarget(failureMode: FailureMode): 'instructions' | 'skill' | 'tool-policy' | 'model-routing' {
  const kind = failureMode.dominantSignalKind;

  if (kind === 'tool_rejection') {
    return 'tool-policy';
  }
  if (kind === 'model_switch' || kind === 'context_explosion') {
    return 'model-routing';
  }
  if (kind === 'immediate_rewrite' || kind === 'repair_loop') {
    return 'skill';
  }

  return 'instructions';
}

/**
 * Infer the target path for a patch based on failure mode and target type.
 */
function inferTargetPath(failureMode: FailureMode, target: string): string {
  const safeCategory = failureMode.category.replace(/[^a-zA-Z0-9_-]/g, '_');

  switch (target) {
    case 'instructions':
      return `agentsy/instructions/${safeCategory}.md`;
    case 'skill':
      return `agentsy/skills/${safeCategory}`;
    case 'tool-policy':
      return `agentsy/policies/tools/${safeCategory}.md`;
    case 'model-routing':
      return `agentsy/routing/${safeCategory}-override.json`;
    default:
      return `agentsy/${safeCategory}.md`;
  }
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type { PatchGenerationOptions, PromptPatch };
