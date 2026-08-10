import { existsSync } from 'node:fs';

import type { IsolationBackend, IsolationProbeResult } from '../trait.js';
import { cleanupDir, computeDiff, createHandle, ensureDir, generateTargetDir, rcopyRecursive } from './shared.js';
import type { IsolationDiff, IsolationHandle, IsolationOptions } from './types.js';

/**
 * ProjFS backend (Windows Projected File System).
 * Provides virtualized file system projection for isolation.
 */
export function createProjFsBackend(): IsolationBackend {
  return {
    capability: {
      cow: false,
      crossPlatform: false,
      diff: true,
      snapshot: false
    },
    displayName: 'ProjFS (Windows Projected FS)',
    kind: 'projfs',
    priority: 65,

    async probe(): Promise<IsolationProbeResult> {
      if (process.platform !== 'win32') {
        return {
          available: false,
          backend: 'projfs',
          reason: 'ProjFS requires Windows (win32)',
          score: 0
        };
      }
      try {
        const { execSync } = await import('node:child_process');
        const result = execSync(
          'powershell -Command "Get-WindowsOptionalFeature -Online -FeatureName *Proj* 2>$null | Select-Object State" ',
          {
            encoding: 'utf-8',
            timeout: 5000
          }
        );
        if (result.toLowerCase().includes('enable')) {
          return {
            available: true,
            backend: 'projfs',
            reason: 'ProjFS optional feature enabled',
            score: 65
          };
        }
        return {
          available: true,
          backend: 'projfs',
          reason: 'Windows 10+ detected — ProjFS may be available',
          score: 40
        };
      } catch {
        return {
          available: true,
          backend: 'projfs',
          reason: 'Windows detected — ProjFS probed with reduced confidence',
          score: 30
        };
      }
    },

    start(options: IsolationOptions): Promise<IsolationHandle> {
      if (!options.sourceDir) {
        throw new Error('projfs: sourceDir is required');
      }
      if (!existsSync(options.sourceDir)) {
        throw new Error(`projfs: sourceDir does not exist: ${options.sourceDir}`);
      }
      const targetDir = generateTargetDir(options.sourceDir, options.targetDir);
      ensureDir(targetDir);

      rcopyRecursive(options.sourceDir, targetDir);

      return Promise.resolve(
        createHandle(
          'projfs',
          {
            sessionId: options.sessionId,
            sourceDir: options.sourceDir,
            targetDir
          },
          { projected: false, reason: 'Native ProjFS provider not loaded — using copy fallback' }
        )
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
