/**
 * AFT Zoom Tool — symbol inspection with optional callgraph annotations.
 *
 * @module
 */

import type { CallBridgeFn } from '../../bridge-helpers.js';

export function createAftZoomTool(callBridge: CallBridgeFn) {
  return {
    name: 'zoom',
    description: 'Inspect a symbol (function, class, type) — returns full source with optional callgraph.',
    parameters: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path' },
        symbol: { type: 'string', description: 'Symbol name to zoom into' },
        callgraph: { type: 'boolean', description: 'Include call-graph annotations' }
      },
      required: ['path', 'symbol']
    },
    annotations: {
      readOnlyHint: true
    },
    handler: async (input: { path: string; symbol: string; callgraph?: boolean }) => {
      const result = await callBridge('zoom', {
        path: input.path,
        symbol: input.symbol,
        callgraph: input.callgraph ?? false
      });
      return { ok: result.success, data: result.data ?? null };
    }
  };
}
