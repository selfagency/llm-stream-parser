import { existsSync } from 'node:fs';
import { join } from 'node:path';

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
 * OverlayFS backend (Linux).
 * Uses overlay mount with lowerdir=source, upperdir=target/upper, workdir=target/work.
 */
export function createOverlayFsBackend(): IsolationBackend {
  return {
    capability: {
      cow: true,
      crossPlatform: false,
      diff: true,
      snapshot: false
    },
    displayName: 'OverlayFS (Linux)',
    kind: 'overlayfs',
    priority: 70,

    async probe(): Promise<IsolationProbeResult> {
      if (process.platform !== 'linux') {
        return {
          available: false,
          backend: 'overlayfs',
          reason: 'OverlayFS requires Linux',
          score: 0
        };
      }
      try {
        const { readFileSync } = await import('node:fs');
        const filesystems = readFileSync('/proc/filesystems', 'utf-8');
        if (filesystems.includes('overlay')) {
          return {
            available: true,
            backend: 'overlayfs',
            reason: 'overlay filesystem available in /proc/filesystems',
            score: 70
          };
        }
      } catch {
        // fall through
      }
      const mountCheck = await tryExec('mount', [
        '-t',
        'overlay',
        'test',
        '/tmp',
        '-o',
        'lowerdir=/tmp,upperdir=/tmp,workdir=/tmp'
      ]);
      return {
        available: true,
        backend: 'overlayfs',
        reason:
          mountCheck.stderr.includes('overlay') || mountCheck.stdout.includes('overlay')
            ? 'OverlayFS probed via mount'
            : 'Linux detected — OverlayFS likely available (reduced confidence)',
        score: 50
      };
    },

    async start(options: IsolationOptions): Promise<IsolationHandle> {
      if (!options.sourceDir) {
        throw new Error('overlayfs: sourceDir is required');
      }
      if (!existsSync(options.sourceDir)) {
        throw new Error(`overlayfs: sourceDir does not exist: ${options.sourceDir}`);
      }
      const baseTarget = generateTargetDir(options.sourceDir, options.targetDir);
      ensureDir(baseTarget);

      const upperDir = join(baseTarget, 'upper');
      const workDir = join(baseTarget, 'work');
      const mergedDir = join(baseTarget, 'merged');
      ensureDir(upperDir);
      ensureDir(workDir);
      ensureDir(mergedDir);

      let usedOverlay = false;

      if (process.platform === 'linux') {
        const mountRes = await tryExec('mount', [
          '-t',
          'overlay',
          'overlay',
          '-o',
          `lowerdir=${options.sourceDir},upperdir=${upperDir},workdir=${workDir}`,
          mergedDir
        ]);
        if (mountRes.code === 0) {
          usedOverlay = true;
          return createHandle(
            'overlayfs',
            {
              sessionId: options.sessionId,
              sourceDir: options.sourceDir,
              targetDir: mergedDir
            },
            { baseTarget, mergedDir, upperDir, usedOverlay, workDir }
          );
        }
      }

      cleanupDir(upperDir);
      cleanupDir(workDir);
      cleanupDir(mergedDir);
      ensureDir(baseTarget);
      rcopyRecursive(options.sourceDir, baseTarget);

      return createHandle(
        'overlayfs',
        {
          sessionId: options.sessionId,
          sourceDir: options.sourceDir,
          targetDir: baseTarget
        },
        { baseTarget, usedOverlay: false }
      );
    },

    async stop(handle: IsolationHandle): Promise<void> {
      const meta = handle.meta as
        | {
            baseTarget?: string;
            mergedDir?: string;
            usedOverlay?: boolean;
          }
        | undefined;

      if (meta?.usedOverlay && meta.mergedDir && process.platform === 'linux') {
        await tryExec('umount', [meta.mergedDir]);
        if (meta.baseTarget) {
          cleanupDir(meta.baseTarget);
        } else {
          cleanupDir(handle.targetDir);
        }
      } else {
        const dirToClean = meta?.baseTarget ?? handle.targetDir;
        cleanupDir(dirToClean);
      }
    },

    diff(handle: IsolationHandle): Promise<IsolationDiff> {
      const meta = handle.meta as
        | {
            baseTarget?: string;
            mergedDir?: string;
            upperDir?: string;
            usedOverlay?: boolean;
          }
        | undefined;

      if (meta?.usedOverlay && meta.upperDir) {
        return Promise.resolve(computeDiff(handle.sourceDir, meta.upperDir));
      }

      return Promise.resolve(computeDiff(handle.sourceDir, handle.targetDir));
    }
  };
}
