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
 * Linux reflink backend.
 * Uses FICLONE / FICLONERANGE ioctl or `cp --reflink=always` for COW copies.
 */
export function createReflinkBackend(): IsolationBackend {
  return {
    capability: {
      cow: true,
      crossPlatform: false,
      diff: true,
      snapshot: false
    },
    displayName: 'Reflink (Linux COW)',
    kind: 'reflink',
    priority: 60,

    async probe(): Promise<IsolationProbeResult> {
      if (process.platform !== 'linux') {
        return {
          available: false,
          backend: 'reflink',
          reason: 'Reflink requires Linux',
          score: 0
        };
      }
      const cpCheck = await tryExec('cp', ['--help']);
      const hasReflink = cpCheck.stdout.includes('reflink') || cpCheck.stderr.includes('reflink');
      if (!hasReflink) {
        return {
          available: false,
          backend: 'reflink',
          reason: 'cp --reflink not supported',
          score: 0
        };
      }
      return {
        available: true,
        backend: 'reflink',
        reason: 'cp --reflink supported',
        score: 60
      };
    },

    async start(options: IsolationOptions): Promise<IsolationHandle> {
      if (!options.sourceDir) {
        throw new Error('reflink: sourceDir is required');
      }
      if (!existsSync(options.sourceDir)) {
        throw new Error(`reflink: sourceDir does not exist: ${options.sourceDir}`);
      }
      const targetDir = generateTargetDir(options.sourceDir, options.targetDir);
      ensureDir(targetDir);

      let usedReflink = false;

      if (process.platform === 'linux') {
        const res = await tryExec('cp', ['--reflink=always', '-a', `${options.sourceDir}/.`, targetDir]);
        if (res.code === 0) {
          usedReflink = true;
        } else {
          const resAuto = await tryExec('cp', ['--reflink=auto', '-a', `${options.sourceDir}/.`, targetDir]);
          if (resAuto.code === 0) {
            usedReflink = true;
          } else {
            rcopyRecursive(options.sourceDir, targetDir);
          }
        }
      } else {
        rcopyRecursive(options.sourceDir, targetDir);
      }

      return createHandle(
        'reflink',
        {
          sessionId: options.sessionId,
          sourceDir: options.sourceDir,
          targetDir
        },
        { usedReflink }
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
