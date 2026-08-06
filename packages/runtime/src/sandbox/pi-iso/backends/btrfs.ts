import { existsSync } from 'node:fs';

import type { IsolationBackend, IsolationProbeResult } from '../trait.js';
import {
  cleanupDir,
  computeDiff,
  createHandle,
  ensureDir,
  generateTargetDir,
  rcopyRecursive,
  tryExec
} from './shared.js';
import type { IsolationDiff, IsolationHandle, IsolationOptions } from './types.js';

/**
 * Btrfs subvolume snapshot backend (Linux).
 * Uses `btrfs subvolume snapshot` for COW isolation.
 */
export function createBtrfsBackend(): IsolationBackend {
  return {
    capability: {
      cow: true,
      crossPlatform: false,
      diff: true,
      snapshot: true
    },
    displayName: 'Btrfs subvolume snapshot',
    kind: 'btrfs',
    priority: 85,

    async probe(): Promise<IsolationProbeResult> {
      if (process.platform !== 'linux') {
        return {
          available: false,
          backend: 'btrfs',
          reason: 'Btrfs requires Linux',
          score: 0
        };
      }
      const result = await tryExec('btrfs', ['--version']);
      if (result.code !== 0) {
        return {
          available: false,
          backend: 'btrfs',
          reason: 'btrfs command not found',
          score: 0
        };
      }
      return {
        available: true,
        backend: 'btrfs',
        reason: `Btrfs available: ${result.stdout.trim()}`,
        score: 85
      };
    },

    async start(options: IsolationOptions): Promise<IsolationHandle> {
      if (!options.sourceDir) {
        throw new Error('btrfs: sourceDir is required');
      }
      if (!existsSync(options.sourceDir)) {
        throw new Error(`btrfs: sourceDir does not exist: ${options.sourceDir}`);
      }
      const targetDir = generateTargetDir(options.sourceDir, options.targetDir);
      ensureDir(targetDir);

      if (process.platform === 'linux') {
        const snap = await tryExec('btrfs', ['subvolume', 'snapshot', options.sourceDir, targetDir]);
        if (snap.code !== 0) {
          rcopyRecursive(options.sourceDir, targetDir);
        }
      } else {
        rcopyRecursive(options.sourceDir, targetDir);
      }

      return createHandle(
        'btrfs',
        {
          sessionId: options.sessionId,
          sourceDir: options.sourceDir,
          targetDir
        },
        { attemptedSnapshot: true }
      );
    },

    async stop(handle: IsolationHandle): Promise<void> {
      if (process.platform === 'linux') {
        const del = await tryExec('btrfs', ['subvolume', 'delete', handle.targetDir]);
        if (del.code !== 0) {
          cleanupDir(handle.targetDir);
        }
      } else {
        cleanupDir(handle.targetDir);
      }
    },

    diff(handle: IsolationHandle): Promise<IsolationDiff> {
      return Promise.resolve(computeDiff(handle.sourceDir, handle.targetDir));
    }
  };
}
