import { existsSync } from 'node:fs';

import type { IsolationBackend, IsolationProbeResult } from '../trait.js';
import { cleanupDir, computeDiff, createHandle, ensureDir, generateTargetDir, rcopyRecursive } from './shared.js';
import type { IsolationDiff, IsolationHandle, IsolationOptions } from './types.js';

/**
 * Rcopy fallback backend — always available recursive copy.
 * Lowest priority, used as final fallback.
 */
export function createRcopyBackend(): IsolationBackend {
  return {
    capability: {
      cow: false,
      crossPlatform: true,
      diff: true,
      snapshot: false
    },
    displayName: 'Recursive Copy (fallback)',
    kind: 'rcopy',
    priority: 0,

    probe(): Promise<IsolationProbeResult> {
      return Promise.resolve({
        available: true,
        backend: 'rcopy',
        reason: 'Always available — recursive copy fallback',
        score: 0
      });
    },

    start(options: IsolationOptions): Promise<IsolationHandle> {
      if (!options.sourceDir) {
        throw new Error('rcopy: sourceDir is required');
      }
      if (!existsSync(options.sourceDir)) {
        throw new Error(`rcopy: sourceDir does not exist: ${options.sourceDir}`);
      }
      const targetDir = generateTargetDir(options.sourceDir, options.targetDir);
      ensureDir(targetDir);
      rcopyRecursive(options.sourceDir, targetDir);
      return Promise.resolve(
        createHandle('rcopy', {
          sessionId: options.sessionId,
          sourceDir: options.sourceDir,
          targetDir
        })
      );
    },

    stop(handle: IsolationHandle): Promise<void> {
      cleanupDir(handle.targetDir);
      return Promise.resolve();
    },

    diff(handle: IsolationHandle): Promise<IsolationDiff> {
      return Promise.resolve(computeDiff(handle.sourceDir, handle.targetDir));
    }
  };
}
