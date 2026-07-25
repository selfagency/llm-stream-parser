/**
 * Session Lineage Translator — tracks parent/child session relationships
 * for subagent forks.
 *
 * @module
 */

import type { Translator, TranslatorContext, TranslatorResult } from './types.js';

export interface LineageInfo {
  readonly forkCount: number;
  readonly forkedSessions: string[];
  readonly parentSessionId: string | null;
  readonly sessionId: string;
}

export class SessionLineageTranslator implements Translator<LineageInfo> {
  readonly name = 'session-lineage';
  readonly #parentMap = new Map<string, string | null>();
  readonly #childrenMap = new Map<string, string[]>();

  /** Record a fork: parentSession forks off childSession. */
  recordFork(parentSessionId: string, childSessionId: string): void {
    this.#parentMap.set(childSessionId, parentSessionId);

    const existing = this.#childrenMap.get(parentSessionId) ?? [];
    existing.push(childSessionId);
    this.#childrenMap.set(parentSessionId, existing);
  }

  translate(context: TranslatorContext): TranslatorResult<LineageInfo> {
    const sessionId = context.sessionId;
    const parentSessionId = this.#parentMap.get(sessionId) ?? null;
    const forkedSessions = this.#childrenMap.get(sessionId) ?? [];

    return {
      success: true,
      data: {
        sessionId,
        parentSessionId,
        forkCount: forkedSessions.length,
        forkedSessions
      }
    };
  }
}
