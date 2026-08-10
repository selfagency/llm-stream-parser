import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, type Stats, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';

import type { IsolationBackendKind } from '../trait.js';
import type { BackendStartContext, IsolationDiff, IsolationHandle } from './types.js';

const execFileAsync = promisify(execFile);

// ─── Helpers ────────────────────────────────────────────────────────────

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function generateTargetDir(sourceDir: string, explicitTarget?: string): string {
  if (explicitTarget) {
    return explicitTarget;
  }
  // Target as SIBLING of sourceDir, not child — macOS cp -cR (and Node.js cpSync)
  // refuse to copy a directory into a subdirectory of itself.
  const parent = dirname(sourceDir);
  return join(parent, `__pi_iso_${randomUUID().slice(0, 8)}`);
}

export function createHandle(
  backend: IsolationBackendKind,
  ctx: BackendStartContext,
  meta?: Record<string, unknown>
): IsolationHandle {
  if (meta !== undefined) {
    return {
      backend,
      createdAt: Date.now(),
      id: `${backend}_${ctx.sessionId}_${randomUUID().slice(0, 8)}`,
      meta,
      sourceDir: ctx.sourceDir,
      targetDir: ctx.targetDir
    };
  }
  return {
    backend,
    createdAt: Date.now(),
    id: `${backend}_${ctx.sessionId}_${randomUUID().slice(0, 8)}`,
    sourceDir: ctx.sourceDir,
    targetDir: ctx.targetDir
  };
}

export function safeStat(path: string): Stats | null {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

export function collectFiles(dir: string, baseDir = dir): Map<string, { mtime: number; size: number }> {
  const result = new Map<string, { mtime: number; size: number }>();
  if (!existsSync(dir)) {
    return result;
  }
  const walk = (current: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry);
      const rel = relative(baseDir, full);
      if (rel.startsWith('__pi_iso_')) {
        continue;
      }
      const st = safeStat(full);
      if (!st) {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else {
        result.set(rel, { mtime: st.mtimeMs, size: st.size });
      }
    }
  };
  walk(dir);
  return result;
}

export function computeDiff(sourceDir: string, targetDir: string): IsolationDiff {
  const sourceFiles = collectFiles(sourceDir, sourceDir);
  const targetFiles = collectFiles(targetDir, targetDir);

  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const [rel, targetMeta] of targetFiles) {
    const sourceMeta = sourceFiles.get(rel);
    if (!sourceMeta) {
      added.push(rel);
    } else if (sourceMeta.mtime !== targetMeta.mtime || sourceMeta.size !== targetMeta.size) {
      modified.push(rel);
    }
  }

  for (const rel of sourceFiles.keys()) {
    if (!targetFiles.has(rel)) {
      deleted.push(rel);
    }
  }

  return { added, deleted, modified };
}

export function rcopyRecursive(source: string, target: string): void {
  ensureDir(target);
  cpSync(source, target, {
    dereference: false,
    errorOnExist: false,
    filter: src => !src.includes('__pi_iso_'),
    force: false,
    recursive: true
  });
}

export function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { force: true, recursive: true });
  } catch {
    // best-effort cleanup
  }
}

export async function execExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('which', [cmd]);
    return true;
  } catch {
    try {
      await execFileAsync('command', ['-v', cmd]);
      return true;
    } catch {
      return false;
    }
  }
}

export async function tryExec(
  cmd: string,
  args: readonly string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, [...args], {
      timeout: 5000
    });
    return { code: 0, stderr: stderr as string, stdout: stdout as string };
  } catch (error) {
    const execError = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: execError.code ?? 1,
      stderr: (execError.stderr as string) ?? '',
      stdout: (execError.stdout as string) ?? ''
    };
  }
}
