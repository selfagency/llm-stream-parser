/**
 * AFT Outline Tool — symbol listing for a file.
 *
 * Returns function/class/type symbols with line ranges.
 *
 * @module
 */

import type { CallBridgeFn } from '../../bridge-helpers.js';

export function createAftOutlineTool(callBridge: CallBridgeFn) {
  return {
    name: 'outline',
    description: 'List symbols (functions, classes, types) in a file with line ranges.',
    parameters: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path to outline' }
      },
      required: ['path']
    },
    annotations: {
      readOnlyHint: true
    },
    handler: async (input: { path: string }) => {
      const result = await callBridge('outline', { path: input.path });
      return { ok: result.success, data: result.data ?? [] };
    }
  };
}
