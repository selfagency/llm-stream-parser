/**
 * Signal collector — central coordinator for frustration and satisfaction
 * event accumulation.
 *
 * The `SignalCollector` registers hook handlers on detector instances
 * and provides a `drain()` method to retrieve and clear accumulated
 * events for downstream processing (scoring, ledger writing).
 */

import { detectAbandonment } from './abandonment-detector.js';
import { RetryDetector } from './retry-detector.js';
import { RewriteDetector } from './rewrite-detector.js';
import type { FrustrationEvent, SatisfactionEvent } from './types.js';

// =============================================================================
// Hook registry interface
// =============================================================================

/**
 * A registry of external hooks that the collector can wire into.
 *
 * Implementations provide the actual tool-call and file-change
 * observation mechanisms from the agent runtime.
 */
export interface HookRegistry {
  onFileChanged: (handler: (filePath: string, deltaLines: number) => void) => void;
  onSessionEnd: (
    handler: (sessionId: string, durationMs: number, commits: unknown[], filesWritten: unknown[]) => void
  ) => void;
  onUserMessage: (handler: (message: string, sessionId: string, turnIndex: number) => void) => void;
  onWriteToolCall: (
    handler: (filePath: string, sessionId: string, turnIndex: number, timestampMs: number) => void
  ) => void;
}

// =============================================================================
// Embedding function type
// =============================================================================

/**
 * Function that produces an embedding vector for a text input.
 */
export type EmbeddingFunction = (input: string) => Promise<number[]>;

// =============================================================================
// SignalCollector
// =============================================================================

/**
 * Central coordinator that accumulates frustration and satisfaction events.
 *
 * Creates and wires internal detectors, collects their emissions,
 * and provides a `drain()` method for downstream processing.
 */
export class SignalCollector {
  readonly #frustrationEvents: FrustrationEvent[] = [];
  readonly #satisfactionEvents: SatisfactionEvent[] = [];
  readonly #rewriteDetector: RewriteDetector;
  readonly #retryDetector: RetryDetector;

  constructor() {
    this.#rewriteDetector = new RewriteDetector(event => this.#frustrationEvents.push(event));
    this.#retryDetector = new RetryDetector(event => this.#frustrationEvents.push(event));
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Emit a frustration or satisfaction event directly.
   */
  emit(event: FrustrationEvent | SatisfactionEvent): void {
    if (this.#isFrustrationEvent(event)) {
      this.#frustrationEvents.push(event);
    } else {
      this.#satisfactionEvents.push(event);
    }
  }

  /**
   * Drain all accumulated events and clear the internal buffer.
   *
   * @returns Object containing all frustration and satisfaction events.
   */
  drain(): { frustration: FrustrationEvent[]; satisfaction: SatisfactionEvent[] } {
    const result = {
      frustration: [...this.#frustrationEvents],
      satisfaction: [...this.#satisfactionEvents]
    };
    this.#frustrationEvents.length = 0;
    this.#satisfactionEvents.length = 0;
    return result;
  }

  /**
   * Register all hook handlers on the given registry.
   *
   * Wires the rewrite detector, retry detector, and abandonment
   * detection into the external hook system.
   *
   * @param registry  The hook registry to wire into.
   * @param embed     Embedding function for retry detection.
   */
  registerHooks(registry: HookRegistry, embed: EmbeddingFunction): void {
    registry.onWriteToolCall((filePath, sessionId, turnIndex, timestampMs) => {
      this.#rewriteDetector.onWriteToolCall(filePath, sessionId, turnIndex, timestampMs);
    });

    registry.onFileChanged((filePath, deltaLines) => {
      this.#rewriteDetector.onFileChanged(filePath, deltaLines);
    });

    registry.onUserMessage((message, sessionId, turnIndex) => {
      // Fire-and-forget — embedding may be async
      this.#retryDetector.onUserMessage(message, sessionId, turnIndex, embed).catch(() => {
        // Silently ignore embedding failures
      });
    });

    registry.onSessionEnd((sessionId, durationMs, commits, filesWritten) => {
      const event = detectAbandonment(sessionId, durationMs, commits, filesWritten);
      if (event !== undefined) {
        this.#frustrationEvents.push(event);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  #isFrustrationEvent(event: FrustrationEvent | SatisfactionEvent): event is FrustrationEvent {
    return 'turnIndex' in event;
  }
}

// Re-export for convenience
export { detectAbandonment } from './abandonment-detector.js';
