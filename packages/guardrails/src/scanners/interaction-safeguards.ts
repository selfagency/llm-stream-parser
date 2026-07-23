import type { Detection, GuardrailResult, GuardrailScanner, SessionState } from '../types.js';

/**
 * Configuration for InteractionSafeguardsScanner.
 */
export interface InteractionSafeguardsConfig {
  /**
   * Whether to enforce hard limits (escalate) or soft limits (detect).
   * Default false (detect only, no escalate).
   */
  enforceHardLimits?: boolean;
  /**
   * Maximum emotional intensity score before flagging.
   * Range 0–1. Default 0.8.
   */
  maxEmotionalIntensity?: number;
  /**
   * Maximum allowed reassurance-seeking utterances before flagging.
   * Default 5.
   */
  maxReassuranceSeeking?: number;
  /**
   * Maximum turns before flagging.
   * Default 100.
   */
  maxTurns?: number;
}

const DEFAULT_CONFIG: Required<InteractionSafeguardsConfig> = {
  maxEmotionalIntensity: 0.8,
  maxReassuranceSeeking: 5,
  maxTurns: 100,
  enforceHardLimits: false
} as const;

/**
 * InteractionSafeguardsScanner — Phase 10 §15.2
 *
 * Monitors session-level interaction patterns:
 * - Emotional intensity (sentiment/affect escalation across turns)
 * - Reassurance-seeking behavior (e.g. "do you think I should?")
 * - Turn limits (session length caps)
 *
 * Requires `sessionState` in the context to function.
 * Without session state, the scanner returns `pass`.
 */
export class InteractionSafeguardsScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/interaction-safeguards',
    name: 'Interaction Safeguards Scanner',
    description: 'Monitors emotional intensity, reassurance-seeking, and turn limits across sessions',
    priority: 36,
    version: '1.0.0',
    tags: ['interaction', 'session', 'safety', 'reassurance', 'turn-limit'] as const,
    owaspCategories: ['asi-01'] as const
  };

  readonly #config: Required<InteractionSafeguardsConfig>;

  constructor(config?: InteractionSafeguardsConfig) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }

  evaluate(_input: string, context?: Record<string, unknown>): GuardrailResult {
    const sessionState = context?.sessionState as SessionState | undefined;
    if (!sessionState) {
      return { status: 'pass', phase: 'input' };
    }

    const detections: Detection[] = [];
    let riskScore = 0;

    // 1. Check emotional intensity
    if (sessionState.emotionalIntensityScore >= this.#config.maxEmotionalIntensity) {
      const isExtreme = sessionState.emotionalIntensityScore >= 0.95;
      detections.push({
        id: isExtreme ? 'ia-extreme-emotional-intensity' : 'ia-high-emotional-intensity',
        severity: isExtreme ? 'critical' : 'high',
        description: isExtreme
          ? `Extreme emotional intensity: ${(sessionState.emotionalIntensityScore * 100).toFixed(0)}%`
          : `High emotional intensity: ${(sessionState.emotionalIntensityScore * 100).toFixed(0)}%`,
        confidence: 0.85
      });
      riskScore = Math.max(riskScore, isExtreme ? 0.9 : 0.7);
    }

    // 2. Check reassurance-seeking pattern
    if (sessionState.reassuranceSeekingCount >= this.#config.maxReassuranceSeeking) {
      detections.push({
        id: 'ia-excessive-reassurance-seeking',
        severity: 'high',
        description: `Excessive reassurance-seeking detected (${sessionState.reassuranceSeekingCount} instances)`,
        confidence: 0.8
      });
      riskScore = Math.max(riskScore, 0.7);
    }

    // 3. Check turn limits
    if (sessionState.turnCount >= this.#config.maxTurns) {
      detections.push({
        id: 'ia-turn-limit-reached',
        severity: 'medium',
        description: `Session turn limit reached (${sessionState.turnCount} turns)`,
        confidence: 1.0
      });
      riskScore = Math.max(riskScore, 0.5);
    }

    if (detections.length === 0) {
      return { status: 'pass', phase: 'input' };
    }

    // Escalate if hard limits enabled and risk is high enough
    if (this.#config.enforceHardLimits && riskScore >= 0.9) {
      return {
        status: 'escalate',
        phase: 'input',
        reason: 'Interaction safeguard triggered: critical session-level violation',
        detections,
        riskScore
      };
    }

    return {
      status: 'pass',
      phase: 'input',
      detections
    };
  }
}
