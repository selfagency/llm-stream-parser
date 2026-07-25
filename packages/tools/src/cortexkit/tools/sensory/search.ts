/**
 * AFT Search Tool — hybrid semantic + lexical code search.
 *
 * Returns ranked matches with code context.
 *
 * @module
 */

import type { CallBridgeFn } from '../../bridge-helpers.js';

export function createAftSearchTool(callBridge: CallBridgeFn) {
  return {
    name: 'search',
    description: 'Search code with hybrid semantic + lexical matching. Returns ranked results with context.',
    parameters: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query (concept, identifier, regex, or literal)' },
        topK: { type: 'number', description: 'Max results (default 10)' },
        hint: { type: 'string', enum: ['regex', 'literal', 'semantic', 'auto'], description: 'Search mode hint' }
      },
      required: ['query']
    },
    annotations: {
      readOnlyHint: true
    },
    handler: async (input: { query: string; topK?: number; hint?: string }) => {
      const result = await callBridge('search', {
        query: input.query,
        topK: input.topK ?? 10,
        hint: input.hint ?? 'auto'
      });
      return { ok: result.success, data: result.data ?? [] };
    }
  };
}
