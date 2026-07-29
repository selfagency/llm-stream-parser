import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IsolationHandle, IsolationOptions } from './backends/types.js';
import { createPiIso, createPiIsoWithBackends, createRcopyBackend } from './index.js';
import type { IsolationBackend, IsolationBackendKind } from './trait.js';

// ─── Helpers ────────────────────────────────────────────────────────────

function makeTempDir(prefix = 'pi-iso-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { force: true, recursive: true });
  } catch {
    // ignore
  }
}

// ─── Trait Interface Tests ──────────────────────────────────────────────

describe('PiIsoTrait interface', () => {
  it('exposes 8 backends', () => {
    const piIso = createPiIso();
    expect(piIso.backends.length).toBe(8);

    const kinds = piIso.backends.map(b => b.kind);
    expect(kinds).toContain('apfs-clonefile');
    expect(kinds).toContain('btrfs');
    expect(kinds).toContain('zfs');
    expect(kinds).toContain('overlayfs');
    expect(kinds).toContain('reflink');
    expect(kinds).toContain('win-clone');
    expect(kinds).toContain('projfs');
    expect(kinds).toContain('rcopy');
  });

  it('backends are sorted by priority descending', () => {
    const piIso = createPiIso();
    const priorities = piIso.backends.map(b => b.priority);
    const sorted = [...priorities].sort((a, b) => b - a);
    expect(priorities).toEqual(sorted);
  });

  it('rcopy is always lowest priority fallback', () => {
    const piIso = createPiIso();
    const last = piIso.backends.at(-1);
    expect(last?.kind).toBe('rcopy');
  });

  it('getBackend returns backend by kind', () => {
    const piIso = createPiIso();
    const rcopy = piIso.getBackend('rcopy');
    expect(rcopy).toBeDefined();
    expect(rcopy?.kind).toBe('rcopy');
    expect(piIso.getBackend('apfs-clonefile')).toBeDefined();
  });
});

// ─── Probe Detection Tests ──────────────────────────────────────────────

describe('probe detection', () => {
  it('probe returns results for all backends', async () => {
    const piIso = createPiIso();
    const results = await piIso.probe();
    expect(results.length).toBe(8);
    for (const r of results) {
      expect(typeof r.available).toBe('boolean');
      expect(typeof r.score).toBe('number');
      expect(typeof r.backend).toBe('string');
    }
  });

  it('rcopy is always available in probe', async () => {
    const piIso = createPiIso();
    const results = await piIso.probe();
    const rcopyResult = results.find(r => r.backend === 'rcopy');
    expect(rcopyResult).toBeDefined();
    expect(rcopyResult?.available).toBe(true);
  });

  it('probeBest returns available backend or null', async () => {
    const piIso = createPiIso();
    const best = await piIso.probeBest();
    expect(best).not.toBeNull();
    expect(best?.available).toBe(true);
  });

  it('probe with mocked backends respects mocked availability', async () => {
    const unavailableBackend: IsolationBackend = {
      capability: { cow: true, crossPlatform: false, diff: true, snapshot: true },
      displayName: 'Mock unavailable',
      kind: 'btrfs',
      priority: 85,
      probe: () =>
        Promise.resolve({
          available: false,
          backend: 'btrfs' as IsolationBackendKind,
          reason: 'mock unavailable',
          score: 0
        }),
      start: () => Promise.reject(new Error('unavailable')),
      stop: () => Promise.resolve(),
      diff: () => Promise.resolve({ added: [], deleted: [], modified: [] })
    };

    const piIso = createPiIso([unavailableBackend, createRcopyBackend()]);
    const results = await piIso.probe();
    expect(results.length).toBe(2);
    const btrfsResult = results.find(r => r.backend === 'btrfs');
    expect(btrfsResult?.available).toBe(false);
  });
});

// ─── Fallback Chain Tests ───────────────────────────────────────────────

describe('fallback chain', () => {
  let sourceDir: string;

  beforeEach(() => {
    sourceDir = makeTempDir('pi-iso-src-');
    writeFileSync(join(sourceDir, 'file.txt'), 'hello');
  });

  afterEach(() => {
    cleanup(sourceDir);
  });

  it('falls back when primary backend fails', async () => {
    const failingBackend: IsolationBackend = {
      capability: { cow: true, crossPlatform: false, diff: true, snapshot: true },
      displayName: 'Failing mock',
      kind: 'btrfs',
      priority: 99,
      probe: () => Promise.resolve({ available: true, backend: 'btrfs' as IsolationBackendKind, score: 99 }),
      start: () => Promise.reject(new Error('simulated failure')),
      stop: () => Promise.resolve(),
      diff: () => Promise.resolve({ added: [], deleted: [], modified: [] })
    };

    const piIso = createPiIso([failingBackend, createRcopyBackend()]);
    const handle = await piIso.start({ sourceDir, sessionId: 'test-fallback' });

    expect(handle.backend).toBe('rcopy');
    expect(existsSync(handle.targetDir)).toBe(true);

    await piIso.stop(handle);
    expect(existsSync(handle.targetDir)).toBe(false);
  });

  it('respects backendPreference ordering', async () => {
    const piIso = createPiIso();
    const handle = await piIso.start({
      sourceDir,
      sessionId: 'test-pref',
      backendPreference: ['rcopy', 'btrfs', 'zfs']
    });

    expect(handle.backend).toBe('rcopy');
    await piIso.stop(handle);
  });

  it('tries backends in priority order when no preference', async () => {
    const executionOrder: string[] = [];

    const makeTrackingBackend = (
      kind: IsolationBackendKind,
      priority: number,
      shouldFail: boolean
    ): IsolationBackend => ({
      capability: { cow: false, crossPlatform: true, diff: true, snapshot: false },
      displayName: `Tracking ${kind}`,
      kind,
      priority,
      probe: () => {
        executionOrder.push(`probe:${kind}`);
        return Promise.resolve({ available: true, backend: kind, score: priority });
      },
      start: (opts: IsolationOptions) => {
        executionOrder.push(`start:${kind}`);
        if (shouldFail) {
          return Promise.reject(new Error(`${kind} failed`));
        }
        const targetDir =
          opts.targetDir ?? join(dirname(opts.sourceDir), `__pi_iso_${kind}_${randomUUID().slice(0, 6)}`);
        mkdirSync(targetDir, { recursive: true });
        cpSync(opts.sourceDir, targetDir, {
          recursive: true,
          filter: (src: string) => !src.includes('__pi_iso_')
        });
        return Promise.resolve({
          backend: kind,
          createdAt: Date.now(),
          id: `${kind}_${opts.sessionId}_track`,
          sourceDir: opts.sourceDir,
          targetDir
        });
      },
      stop: (handle: IsolationHandle) => {
        executionOrder.push(`stop:${kind}`);
        rmSync(handle.targetDir, { force: true, recursive: true });
        return Promise.resolve();
      },
      diff: () => Promise.resolve({ added: [], deleted: [], modified: [] })
    });

    const piIso = createPiIso([
      makeTrackingBackend('btrfs', 85, true),
      makeTrackingBackend('zfs', 80, true),
      makeTrackingBackend('rcopy', 0, false)
    ]);

    const handle = await piIso.start({ sourceDir, sessionId: 'test-order' });
    expect(handle.backend).toBe('rcopy');
    expect(executionOrder).toContain('start:btrfs');
    expect(executionOrder).toContain('start:zfs');
    expect(executionOrder).toContain('start:rcopy');

    await piIso.stop(handle);
  });

  it('createPiIsoWithBackends filters to selected kinds plus rcopy fallback', () => {
    const piIso = createPiIsoWithBackends(['btrfs', 'zfs']);
    const kinds = piIso.backends.map(b => b.kind);
    expect(kinds).toContain('btrfs');
    expect(kinds).toContain('zfs');
    expect(kinds).toContain('rcopy');
  });
});

// ─── Lifecycle Tests ────────────────────────────────────────────────────

describe('start/stop/diff lifecycle', () => {
  let sourceDir: string;

  beforeEach(() => {
    sourceDir = makeTempDir('pi-iso-lifecycle-src-');
    writeFileSync(join(sourceDir, 'original.txt'), 'original content');
    writeFileSync(join(sourceDir, 'to-modify.txt'), 'before');
  });

  afterEach(() => {
    cleanup(sourceDir);
  });

  it('start creates isolated copy', async () => {
    const piIso = createPiIso();
    const handle = await piIso.start({ sourceDir, sessionId: 'lc-1' });

    expect(existsSync(handle.targetDir)).toBe(true);
    expect(existsSync(join(handle.targetDir, 'original.txt'))).toBe(true);
    expect(readFileSync(join(handle.targetDir, 'original.txt'), 'utf-8')).toBe('original content');

    await piIso.stop(handle);
  });

  it('diff detects added files', async () => {
    const piIso = createPiIso();
    const handle = await piIso.start({ sourceDir, sessionId: 'lc-added' });

    writeFileSync(join(handle.targetDir, 'new-file.txt'), 'new');

    const diff = await piIso.diff(handle);
    expect(diff.added).toContain('new-file.txt');
    expect(diff.deleted).toHaveLength(0);

    await piIso.stop(handle);
  });

  it('diff detects modified files', async () => {
    const piIso = createPiIso();
    const handle = await piIso.start({ sourceDir, sessionId: 'lc-mod' });

    writeFileSync(join(handle.targetDir, 'to-modify.txt'), 'after');

    const diff = await piIso.diff(handle);
    expect(diff.modified).toContain('to-modify.txt');

    await piIso.stop(handle);
  });

  it('diff detects deleted files', async () => {
    const piIso = createPiIso();
    const handle = await piIso.start({ sourceDir, sessionId: 'lc-del' });

    rmSync(join(handle.targetDir, 'original.txt'), { force: true });

    const diff = await piIso.diff(handle);
    expect(diff.deleted).toContain('original.txt');

    await piIso.stop(handle);
  });

  it('stop cleans up target directory', async () => {
    const piIso = createPiIso();
    const handle = await piIso.start({ sourceDir, sessionId: 'lc-cleanup' });

    const targetDir = handle.targetDir;
    expect(existsSync(targetDir)).toBe(true);

    await piIso.stop(handle);
    expect(existsSync(targetDir)).toBe(false);
  });

  it('rcopy backend specific lifecycle works', async () => {
    const piIso = createPiIsoWithBackends(['rcopy']);
    const handle = await piIso.start({ sourceDir, sessionId: 'rcopy-only' });

    expect(handle.backend).toBe('rcopy');
    expect(existsSync(handle.targetDir)).toBe(true);

    writeFileSync(join(handle.targetDir, 'extra.txt'), 'extra');
    const diff = await piIso.diff(handle);
    expect(diff.added).toContain('extra.txt');

    await piIso.stop(handle);
    expect(existsSync(handle.targetDir)).toBe(false);
  });
});

// ─── Integration Test ───────────────────────────────────────────────────

describe('integration: isolation create -> write -> diff -> cleanup', () => {
  let sourceDir: string;

  beforeEach(() => {
    sourceDir = makeTempDir('pi-iso-int-src-');
    writeFileSync(join(sourceDir, 'app.ts'), 'console.log("v1")');
    writeFileSync(join(sourceDir, 'config.json'), '{"version":1}');
  });

  afterEach(() => {
    cleanup(sourceDir);
  });

  it('full isolation lifecycle on current platform', async () => {
    const piIso = createPiIso();

    const probeResults = await piIso.probe();
    expect(probeResults.length).toBeGreaterThanOrEqual(1);
    const best = await piIso.probeBest();
    expect(best).not.toBeNull();

    const handle = await piIso.start({
      sourceDir,
      sessionId: 'integration-1'
    });

    expect(handle.id).toBeTruthy();
    expect(handle.backend).toBeTruthy();
    expect(existsSync(handle.targetDir)).toBe(true);
    expect(existsSync(join(handle.targetDir, 'app.ts'))).toBe(true);

    writeFileSync(join(handle.targetDir, 'app.ts'), 'console.log("v2")');
    writeFileSync(join(handle.targetDir, 'new-feature.ts'), 'export const x = 1;');
    rmSync(join(handle.targetDir, 'config.json'), { force: true });

    const diff = await piIso.diff(handle);
    expect(diff.added).toContain('new-feature.ts');
    expect(diff.modified).toContain('app.ts');
    expect(diff.deleted).toContain('config.json');

    expect(readFileSync(join(sourceDir, 'app.ts'), 'utf-8')).toBe('console.log("v1")');
    expect(existsSync(join(sourceDir, 'config.json'))).toBe(true);
    expect(existsSync(join(sourceDir, 'new-feature.ts'))).toBe(false);

    await piIso.stop(handle);
    expect(existsSync(handle.targetDir)).toBe(false);
    expect(existsSync(join(sourceDir, 'app.ts'))).toBe(true);
  });

  it('isolation works across explicit target dir', async () => {
    const piIso = createPiIso();
    const customTarget = makeTempDir('pi-iso-custom-target-');

    cleanup(customTarget);

    const handle = await piIso.start({
      sourceDir,
      sessionId: 'integration-custom',
      targetDir: customTarget
    });

    expect(handle.targetDir).toBe(customTarget);
    expect(existsSync(join(customTarget, 'app.ts'))).toBe(true);

    await piIso.stop(handle);
    expect(existsSync(customTarget)).toBe(false);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('throws when sourceDir missing', async () => {
    const piIso = createPiIso();
    await expect(piIso.start({ sourceDir: '', sessionId: 'edge' })).rejects.toThrow();
  });

  it('throws when sessionId missing', async () => {
    const sourceDir = makeTempDir('pi-iso-edge-');
    try {
      const piIso = createPiIso();
      await expect(piIso.start({ sourceDir, sessionId: '' } as IsolationOptions)).rejects.toThrow();
    } finally {
      cleanup(sourceDir);
    }
  });

  it('throws when sourceDir does not exist', async () => {
    const piIso = createPiIso();
    await expect(piIso.start({ sourceDir: '/non/existent/path/xyz', sessionId: 'noexist' })).rejects.toThrow();
  });
});
