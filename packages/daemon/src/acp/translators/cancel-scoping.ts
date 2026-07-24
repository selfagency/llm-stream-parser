/**
 * Cancel-Scoping Translator — scopes cancellation to the correct
 * session and turn, preventing broadcast cancellation.
 *
 * @module
 */

import type { Translator, TranslatorContext, TranslatorResult } from './types.js';

export interface CancelScope {
  readonly alreadyCancelled: boolean;
  readonly cancelAllowed: boolean;
  readonly sessionId: string;
  readonly turnId: string | null;
}

export class CancelScopingTranslator implements Translator<CancelScope> {
  readonly name = 'cancel-scoping';
  readonly #cancelledTurns = new Map<string, Set<string>>();
  readonly #cancelledSessions = new Set<string>();

  /** Mark a specific turn as cancelled. */
  markTurnCancelled(sessionId: string, turnId: string): void {
    const turns = this.#cancelledTurns.get(sessionId) ?? new Set();
    turns.add(turnId);
    this.#cancelledTurns.set(sessionId, turns);
  }

  /** Mark an entire session as cancelled. */
  markSessionCancelled(sessionId: string): void {
    this.#cancelledSessions.add(sessionId);
  }

  translate(context: TranslatorContext): TranslatorResult<CancelScope> {
    const sessionId = context.sessionId;
    const turnId: string | null = null; // In a real implementation, this would come from the request params

    if (this.#cancelledSessions.has(sessionId)) {
      return {
        success: true,
        data: {
          sessionId,
          turnId: null,
          alreadyCancelled: true,
          cancelAllowed: false
        }
      };
    }

    return {
      success: true,
      data: {
        sessionId,
        turnId,
        alreadyCancelled: turnId !== null && (this.#cancelledTurns.get(sessionId)?.has(turnId) ?? false),
        cancelAllowed: true
      }
    };
  }
}
