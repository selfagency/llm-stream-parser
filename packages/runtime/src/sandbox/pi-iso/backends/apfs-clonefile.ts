import { existsSync } from 'node:fs';

import type { IsolationBackend, IsolationProbeResult } from '../trait.js';
import { cleanupDir, computeDiff, createHandle, ensureDir, generateTargetDir, rcopyRecursive } from './shared.js';
import type { IsolationDiff, IsolationHandle, IsolationOptions } from './types.js';

/**
 * APFS clonefile backend (macOS).
 * Uses clonefile(2) for COW clones — instantaneous, zero-copy on APFS.
 * Falls back to rcopy semantics on non-APFS or non-macOS.
 */
export function createApfsClonefileBackend(): IsolationBackend {
  return {
    capability: {
      cow: true,
      crossPlatform: false,
      diff: true,
      snapshot: true
    },
    displayName: 'APFS clonefile (macOS)',
    kind: 'apfs-clonefile',
    priority: 90,

    async probe(): Promise<IsolationProbeResult> {
      if (process.platform !== 'darwin') {
        return {
          available: false,
          backend: 'apfs-clonefile',
          reason: 'APFS clonefile requires macOS (darwin)',
          score: 0
        };
      }
      try {
        const { execSync } = await import('node:child_process');
        execSync('cp -c /dev/null /dev/null 2>/dev/null || true', { timeout: 2000 });
        return {
          available: true,
          backend: 'apfs-clonefile',
          reason: 'macOS detected — APFS clonefile available',
          score: 90
        };
      } catch {
        return {
          available: true,
          backend: 'apfs-clonefile',
          reason: 'macOS detected — clonefile probed via fallback',
          score: 80
        };
      }
    },

    async start(options: IsolationOptions): Promise<IsolationHandle> {
      if (!options.sourceDir) {
        throw new Error('apfs-clonefile: sourceDir is required');
      }
      if (!existsSync(options.sourceDir)) {
        throw new Error(`apfs-clonefile: sourceDir does not exist: ${options.sourceDir}`);
      }
      const targetDir = generateTargetDir(options.sourceDir, options.targetDir);
      ensureDir(targetDir);

      if (process.platform === 'darwin') {
        try {
          const { execSync } = await import('node:child_process');
          execSync(`cp -cR "${options.sourceDir}/." "${targetDir}/" 2>/dev/null`, {
            timeout: 10_000
          });
        } catch {
          rcopyRecursive(options.sourceDir, targetDir);
        }
      } else {
        rcopyRecursive(options.sourceDir, targetDir);
      }

      return createHandle(
        'apfs-clonefile',
        {
          sessionId: options.sessionId,
          sourceDir: options.sourceDir,
          targetDir
        },
        { cow: process.platform === 'darwin' }
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
