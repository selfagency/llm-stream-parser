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
 * ZFS snapshot/clone backend.
 * Uses zfs snapshot + clone for COW isolation.
 */
export function createZfsBackend(): IsolationBackend {
  return {
    capability: {
      cow: true,
      crossPlatform: false,
      diff: true,
      snapshot: true
    },
    displayName: 'ZFS snapshot/clone',
    kind: 'zfs',
    priority: 80,

    async probe(): Promise<IsolationProbeResult> {
      const zfsCheck = await tryExec('zfs', ['--version']);
      const zpoolCheck = await tryExec('zpool', ['--version']);
      const zfsListCheck = zfsCheck.code === 0 ? zfsCheck : await tryExec('zfs', ['list']);
      const available = zfsCheck.code === 0 || zfsListCheck.code === 0 || zpoolCheck.code === 0;
      if (!available) {
        return {
          available: false,
          backend: 'zfs',
          reason: 'zfs/zpool commands not found',
          score: 0
        };
      }
      return {
        available: true,
        backend: 'zfs',
        reason: 'ZFS tools detected',
        score: 80
      };
    },

    async start(options: IsolationOptions): Promise<IsolationHandle> {
      if (!options.sourceDir) {
        throw new Error('zfs: sourceDir is required');
      }
      if (!existsSync(options.sourceDir)) {
        throw new Error(`zfs: sourceDir does not exist: ${options.sourceDir}`);
      }
      const targetDir = generateTargetDir(options.sourceDir, options.targetDir);
      ensureDir(targetDir);

      const snapshotName = `pi-iso-${options.sessionId}-${Date.now()}`;
      let usedZfs = false;

      try {
        const { execSync } = await import('node:child_process');
        const dfResult = execSync(`df -T "${options.sourceDir}" 2>/dev/null | tail -1`, {
          encoding: 'utf-8',
          timeout: 3000
        });
        if (dfResult.includes('zfs') || dfResult.toLowerCase().includes('zfs')) {
          const snap = await tryExec('zfs', ['snapshot', `${options.sourceDir}@${snapshotName}`]);
          if (snap.code === 0) {
            const clone = await tryExec('zfs', ['clone', `${options.sourceDir}@${snapshotName}`, targetDir]);
            if (clone.code === 0) {
              usedZfs = true;
            }
          }
        }
      } catch {
        // fall through
      }

      if (!usedZfs) {
        rcopyRecursive(options.sourceDir, targetDir);
      }

      return createHandle(
        'zfs',
        {
          sessionId: options.sessionId,
          sourceDir: options.sourceDir,
          targetDir
        },
        { snapshotName, usedZfs }
      );
    },

    async stop(handle: IsolationHandle): Promise<void> {
      const meta = handle.meta as { snapshotName?: string; usedZfs?: boolean } | undefined;
      if (meta?.usedZfs && meta.snapshotName) {
        await tryExec('zfs', ['destroy', `${handle.sourceDir}@${meta.snapshotName}`]);
        await tryExec('zfs', ['destroy', handle.targetDir]);
        cleanupDir(handle.targetDir);
      } else {
        cleanupDir(handle.targetDir);
      }
    },

    diff(handle: IsolationHandle): Promise<IsolationDiff> {
      return Promise.resolve(computeDiff(handle.sourceDir, handle.targetDir));
    }
  };
}
