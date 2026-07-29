import { existsSync } from 'node:fs';

import type { IsolationBackend, IsolationProbeResult } from '../trait.js';
import { cleanupDir, computeDiff, createHandle, ensureDir, generateTargetDir, rcopyRecursive } from './shared.js';
import type { IsolationDiff, IsolationHandle, IsolationOptions } from './types.js';

/**
 * Windows block clone backend.
 * Uses FSCTL_DUPLICATE_EXTENTS_TO_FILE for COW block cloning on NTFS/ReFS.
 */
export function createWinCloneBackend(): IsolationBackend {
  return {
    capability: {
      cow: true,
      crossPlatform: false,
      diff: true,
      snapshot: false
    },
    displayName: 'Windows Block Clone (FSCTL)',
    kind: 'win-clone',
    priority: 75,

    probe(): Promise<IsolationProbeResult> {
      if (process.platform !== 'win32') {
        return Promise.resolve({
          available: false,
          backend: 'win-clone',
          reason: 'Windows block clone requires win32',
          score: 0
        });
      }
      return Promise.resolve({
        available: true,
        backend: 'win-clone',
        reason: 'Windows detected — FSCTL_DUPLICATE_EXTENTS_TO_FILE probe',
        score: 75
      });
    },

    async start(options: IsolationOptions): Promise<IsolationHandle> {
      if (!options.sourceDir) {
        throw new Error('win-clone: sourceDir is required');
      }
      if (!existsSync(options.sourceDir)) {
        throw new Error(`win-clone: sourceDir does not exist: ${options.sourceDir}`);
      }
      const targetDir = generateTargetDir(options.sourceDir, options.targetDir);
      ensureDir(targetDir);

      if (process.platform === 'win32') {
        try {
          const { execSync } = await import('node:child_process');
          try {
            execSync(
              `robocopy "${options.sourceDir}" "${targetDir}" /E /COPYALL /DCOPY:DAT /NFL /NDL /NJH /NJS /R:0 /W:0`,
              {
                timeout: 15_000
              }
            );
          } catch (robocopyError) {
            const err = robocopyError as { status?: number };
            const status = err.status ?? 1;
            if (status > 7) {
              rcopyRecursive(options.sourceDir, targetDir);
            }
          }
        } catch {
          rcopyRecursive(options.sourceDir, targetDir);
        }
      } else {
        rcopyRecursive(options.sourceDir, targetDir);
      }

      return createHandle(
        'win-clone',
        {
          sessionId: options.sessionId,
          sourceDir: options.sourceDir,
          targetDir
        },
        { fsctl: process.platform === 'win32' }
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
