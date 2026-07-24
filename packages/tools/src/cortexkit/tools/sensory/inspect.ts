/**
 * AFT Inspect Tool — codebase health snapshot.
 *
 * Returns errors, warnings, dead code, unused exports, duplicates, TODOs.
 *
 * @module
 */

import type { CallBridgeFn } from '../../bridge-helpers.js';

export function createAftInspectTool(callBridge: CallBridgeFn) {
  return {
    name: 'inspect',
    description: 'Get a codebase health snapshot — errors, warnings, dead code, unused exports, duplicates, and TODOs.',
    parameters: {
      type: 'object' as const,
      properties: {
        sections: {
          type: 'string',
          description: 'Comma-separated sections to include (e.g. "todos,metrics")'
        },
        path: {
          type: 'string',
          description: 'Scope path (directory or file)'
        }
      }
    },
    annotations: {
      readOnlyHint: true
    },
    handler: async (input: { sections?: string; path?: string }) => {
      const result = await callBridge('inspect', {
        sections: input.sections,
        scope: input.path
      });
      return { ok: result.success, data: result.data ?? {} };
    }
  };
}
