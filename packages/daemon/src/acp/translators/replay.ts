/**
 * Replay Translator — re-emits stored events from the event ledger in order.
 *
 * @module
 */

import type { Translator, TranslatorContext, TranslatorResult } from './types.js';

export class ReplayTranslator implements Translator<Array<{ type: string; data: string }>> {
  readonly name = 'replay';

  translate(context: TranslatorContext): TranslatorResult<Array<{ type: string; data: string }>> {
    if (!context.eventLedger) {
      return { success: false, error: 'Event ledger not available' };
    }

    const events = context.eventLedger.getSessionEvents(context.sessionId);
    if (events.length === 0) {
      return { success: false, error: `No events found for session ${context.sessionId}` };
    }

    const replayed = events.map(e => ({
      type: e.eventType,
      data: e.eventData
    }));

    return { success: true, data: replayed };
  }
}
