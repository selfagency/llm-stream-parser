/**
 * ACP Translator Types — common interface for all translators.
 *
 * @module
 */

export interface TranslatorContext {
  readonly eventLedger?: { getSessionEvents(sessionId: string): Array<{ eventType: string; eventData: string }> };
  readonly sessionId: string;
}

export interface TranslatorResult<T = unknown> {
  readonly data?: T;
  readonly error?: string;
  readonly success: boolean;
}

export interface Translator<T = unknown> {
  readonly name: string;
  translate(context: TranslatorContext): Promise<TranslatorResult<T>> | TranslatorResult<T>;
}
