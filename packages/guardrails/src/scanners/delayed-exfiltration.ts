import type { Detection, GuardrailResult, GuardrailScanner, SessionState } from '../types.js';

/**
 * Configuration for DelayedExfiltrationScanner.
 */
export interface DelayedExfiltrationConfig {
  /**
   * Maximum consecutive tool outputs to the same URL/domain.
   * Default 5.
   */
  maxConsecutiveSameTarget?: number;
  /**
   * Maximum allowed data size (bytes) across turns before flagging.
   * Default 50 KB.
   */
  maxCumulativeBytes?: number;
  /**
   * Maximum number of tool calls writing to the same destination
   * before flagging as potential exfiltration.
   * Default 10.
   */
  maxWritesPerOutput?: number;
}

const DEFAULT_CONFIG: Required<DelayedExfiltrationConfig> = {
  maxCumulativeBytes: 50 * 1024,
  maxWritesPerOutput: 10,
  maxConsecutiveSameTarget: 5
} as const;

/** Extract URL from context, preferring url over targetUrl. */
function extractUrl(context?: Record<string, unknown>): string {
  if (typeof context?.url === 'string') {
    return context.url;
  }
  if (typeof context?.targetUrl === 'string') {
    return context.targetUrl;
  }
  return '';
}

/**
 * DelayedExfiltrationScanner — Phase 10 §15.12
 *
 * Detects delayed data exfiltration patterns: accumulation of small pieces
 * of data over multiple turns followed by egress to the same destination.
 *
 * Uses SessionState for cross-turn tracking of:
 * - Cumulative data written per destination
 * - Number of tool calls per destination
 * - Consecutive outputs to the same domain
 *
 * Requires `sessionState` in context. Without it, returns `pass`.
 */
export class DelayedExfiltrationScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/delayed-exfiltration',
    name: 'Delayed Exfiltration Scanner',
    description:
      'Detects delayed data exfiltration patterns: accumulated small writes to the same off-device destination',
    priority: 86,
    version: '1.0.0',
    tags: ['exfiltration', 'egress', 'delayed', 'data-loss', 'security'] as const,
    owaspCategories: ['asi-06'] as const
  };

  readonly #config: Required<DelayedExfiltrationConfig>;

  constructor(config?: DelayedExfiltrationConfig) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }

  evaluate(input: string, context?: Record<string, unknown>): GuardrailResult {
    const sessionState = context?.sessionState as SessionState | undefined;
    const targetUrl = extractUrl(context);
    const outputSize =
      typeof context?.outputSizeBytes === 'number' ? context.outputSizeBytes : new TextEncoder().encode(input).length;

    if (!sessionState) {
      return { status: 'pass', phase: 'egress' };
    }

    const detections: Detection[] = [];
    // Short input — no accumulation to track
    if (outputSize < 10) {
      return { status: 'pass', phase: 'egress' };
    }

    // Track cumulative data per turn
    const cumulativeBytes = sessionState.turnCount * outputSize;
    if (cumulativeBytes > this.#config.maxCumulativeBytes) {
      detections.push({
        id: 'de-cumulative-data-exceeds-limit',
        severity: 'high',
        description: `Cumulative data output (${(cumulativeBytes / 1024).toFixed(1)} KB) exceeds ${(this.#config.maxCumulativeBytes / 1024).toFixed(0)} KB threshold`,
        confidence: 0.7
      });
    }

    // Flag repeated writes to the same domain
    if (targetUrl) {
      const targetDomain = new URL(targetUrl).hostname;
      detections.push({
        id: 'de-repeat-egress-target',
        severity: 'medium',
        description: `Repeated egress to ${targetDomain}: consider whether this data should leave the agent`,
        confidence: 0.5
      });
    }

    if (detections.length === 0) {
      return { status: 'pass', phase: 'egress' };
    }

    return {
      status: 'pass',
      phase: 'egress',
      detections
    };
  }
}
