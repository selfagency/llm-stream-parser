import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceManager } from './multi-root.js';
import type { PackageManager, ProjectProfile } from './scanner.js';

let tmpDir = '';

function makePackageJson(dir: string, content: Record<string, unknown>): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(content));
}

function makeLockfile(dir: string, name: string): void {
  writeFileSync(join(dir, name), '');
}

function makeRoot(name: string): string {
  const dir = join(tmpDir, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('WorkspaceManager', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'multi-root-test-'));
  });

  afterEach(() => {
    // cleanup handled by OS temp dir policy
  });

  // ── Root management ─────────────────────────────────

  it('should add a root path', () => {
    const wm = new WorkspaceManager();
    wm.addRoot('/some/path');
    expect(wm.listRoots()).toEqual(['/some/path']);
  });

  it('should deduplicate identical root paths', () => {
    const wm = new WorkspaceManager();
    wm.addRoot('/some/path');
    wm.addRoot('/some/path');
    expect(wm.listRoots()).toEqual(['/some/path']);
  });

  it('should normalize trailing slashes on roots', () => {
    const wm = new WorkspaceManager();
    wm.addRoot('/some/path/');
    expect(wm.listRoots()).toEqual(['/some/path']);
  });

  it('should remove a root path', () => {
    const wm = new WorkspaceManager();
    wm.addRoot('/a');
    wm.addRoot('/b');
    wm.removeRoot('/a');
    expect(wm.listRoots()).toEqual(['/b']);
  });

  it('should remove a root path with normalized trailing slash', () => {
    const wm = new WorkspaceManager();
    wm.addRoot('/a');
    wm.removeRoot('/a/');
    expect(wm.listRoots()).toEqual([]);
  });

  it('should return a copy of roots from listRoots', () => {
    const wm = new WorkspaceManager();
    wm.addRoot('/a');
    const roots = wm.listRoots();
    roots.push('/b');
    expect(wm.listRoots()).toEqual(['/a']);
  });

  it('should start with an empty root list', () => {
    const wm = new WorkspaceManager();
    expect(wm.listRoots()).toEqual([]);
  });

  // ── mergeProfiles with real scan ────────────────────

  it('should scan and merge profiles from multiple roots', async () => {
    const a = makeRoot('a');
    const b = makeRoot('b');

    // Root A: Next.js, pnpm, biome
    makePackageJson(a, {
      name: 'app-a',
      dependencies: { next: '14.0.0', react: '18.0.0', 'react-dom': '18.0.0' },
      devDependencies: { biome: '1.0.0', vitest: '1.0.0' }
    });
    makeLockfile(a, 'pnpm-lock.yaml');

    // Root B: Express, npm, eslint
    makePackageJson(b, {
      name: 'app-b',
      dependencies: { express: '4.0.0' },
      devDependencies: { eslint: '8.0.0', jest: '29.0.0' }
    });
    makeLockfile(b, 'package-lock.json');

    const wm = new WorkspaceManager();
    wm.addRoot(a);
    wm.addRoot(b);

    const merged = await wm.mergeProfiles();

    // languages: deduplicated union
    expect(merged.languages).toContain('typescript');
    expect(merged.languages).toContain('javascript');

    // frameworks: deduplicated union
    expect(merged.frameworks).toContain('next.js');
    expect(merged.frameworks).toContain('react');
    expect(merged.frameworks).toContain('express');

    // linters: deduplicated union
    expect(merged.linter).toContain('biome');
    expect(merged.linter).toContain('eslint');

    // test runners: deduplicated union
    expect(merged.testRunner).toContain('vitest');
    expect(merged.testRunner).toContain('jest');

    // packageManager: majority vote (pnpm = 1, npm = 1, ties use first encountered)
    expect(['pnpm', 'npm']).toContain(merged.packageManager);

    // monorepo: false by default
    expect(merged.monorepo).toBe(false);
  });

  it('should set monorepo true if any root is monorepo', async () => {
    const a = makeRoot('a');
    const b = makeRoot('b');

    makePackageJson(a, { name: 'monorepo' });
    writeFileSync(join(a, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"');
    makeLockfile(a, 'pnpm-lock.yaml');

    makePackageJson(b, {
      name: 'single',
      dependencies: { express: '4.0.0' }
    });
    makeLockfile(b, 'package-lock.json');

    const wm = new WorkspaceManager();
    wm.addRoot(a);
    wm.addRoot(b);

    const merged = await wm.mergeProfiles();
    expect(merged.monorepo).toBe(true);
    expect(merged.monorepoTool).toBe('pnpm');
  });

  it('should throw when merging with no roots', async () => {
    const wm = new WorkspaceManager();
    await expect(wm.mergeProfiles()).rejects.toThrow('No roots configured');
  });

  // ── mergeProfileArray (unit merge logic) ────────────

  it('should return a single profile unchanged', () => {
    const wm = new WorkspaceManager();
    const profile: ProjectProfile = {
      rootPath: '/a',
      languages: ['typescript'],
      frameworks: ['react'],
      packageManager: 'pnpm',
      buildSystem: 'vite',
      linter: ['biome'],
      testRunner: ['vitest'],
      monorepo: false,
      ci: ['github-actions'],
      deploymentTarget: [],
      detectedAt: '2026-01-01T00:00:00.000Z'
    };
    const result = wm.mergeProfileArray([profile]);
    expect(result).toEqual(profile);
  });

  it('should deduplicate overlapping languages across profiles', () => {
    const wm = new WorkspaceManager();
    const profiles: ProjectProfile[] = [
      makeProfile({ languages: ['typescript', 'javascript'] }),
      makeProfile({ languages: ['typescript', 'python'] })
    ];
    const merged = wm.mergeProfileArray(profiles);
    expect(merged.languages).toEqual(['typescript', 'javascript', 'python']);
  });

  it('should deduplicate overlapping frameworks', () => {
    const wm = new WorkspaceManager();
    const profiles: ProjectProfile[] = [
      makeProfile({ frameworks: ['react', 'next.js'] }),
      makeProfile({ frameworks: ['react', 'express'] })
    ];
    const merged = wm.mergeProfileArray(profiles);
    expect(merged.frameworks).toEqual(['react', 'next.js', 'express']);
  });

  it('should deduplicate overlapped linters', () => {
    const wm = new WorkspaceManager();
    const profiles: ProjectProfile[] = [
      makeProfile({ linter: ['biome', 'eslint'] }),
      makeProfile({ linter: ['biome'] })
    ];
    const merged = wm.mergeProfileArray(profiles);
    expect(merged.linter).toEqual(['biome', 'eslint']);
  });

  it('should deduplicate overlapped testRunners', () => {
    const wm = new WorkspaceManager();
    const profiles: ProjectProfile[] = [
      makeProfile({ testRunner: ['vitest', 'playwright'] }),
      makeProfile({ testRunner: ['vitest', 'jest'] })
    ];
    const merged = wm.mergeProfileArray(profiles);
    expect(merged.testRunner).toEqual(['vitest', 'playwright', 'jest']);
  });

  it('should deduplicate CI arrays', () => {
    const wm = new WorkspaceManager();
    const profiles: ProjectProfile[] = [
      makeProfile({ ci: ['github-actions'] }),
      makeProfile({ ci: ['github-actions', 'circleci'] })
    ];
    const merged = wm.mergeProfileArray(profiles);
    expect(merged.ci).toEqual(['github-actions', 'circleci']);
  });

  it('should deduplicate deploymentTargets', () => {
    const wm = new WorkspaceManager();
    const profiles: ProjectProfile[] = [
      makeProfile({ deploymentTarget: ['vercel'] }),
      makeProfile({ deploymentTarget: ['vercel', 'aws'] })
    ];
    const merged = wm.mergeProfileArray(profiles);
    expect(merged.deploymentTarget).toEqual(['vercel', 'aws']);
  });

  it('should use majority vote for packageManager', () => {
    const wm = new WorkspaceManager();
    const profiles: ProjectProfile[] = [
      makeProfile({ packageManager: 'pnpm' }),
      makeProfile({ packageManager: 'pnpm' }),
      makeProfile({ packageManager: 'npm' })
    ];
    const merged = wm.mergeProfileArray(profiles);
    expect(merged.packageManager).toBe('pnpm');
  });

  it('should use majority vote for buildSystem', () => {
    const wm = new WorkspaceManager();
    const profiles: ProjectProfile[] = [
      makeProfile({ buildSystem: 'vite' }),
      makeProfile({ buildSystem: 'vite' }),
      makeProfile({ buildSystem: 'webpack' })
    ];
    const merged = wm.mergeProfileArray(profiles);
    expect(merged.buildSystem).toBe('vite');
  });

  it('should set monorepo true if any profile is monorepo', () => {
    const wm = new WorkspaceManager();
    const profiles: ProjectProfile[] = [
      makeProfile({ monorepo: false }),
      makeProfile({ monorepo: true, monorepoTool: 'pnpm' })
    ];
    const merged = wm.mergeProfileArray(profiles);
    expect(merged.monorepo).toBe(true);
    expect(merged.monorepoTool).toBe('pnpm');
  });

  it('should set monorepoTool via majority vote among monorepo roots', () => {
    const wm = new WorkspaceManager();
    const profiles: ProjectProfile[] = [
      makeProfile({ monorepo: true, monorepoTool: 'turbo' }),
      makeProfile({ monorepo: true, monorepoTool: 'turbo' }),
      makeProfile({ monorepo: true, monorepoTool: 'nx' })
    ];
    const merged = wm.mergeProfileArray(profiles);
    expect(merged.monorepo).toBe(true);
    expect(merged.monorepoTool).toBe('turbo');
  });

  it('should throw mergeProfileArray with an empty array', () => {
    const wm = new WorkspaceManager();
    expect(() => wm.mergeProfileArray([])).toThrow('At least one profile');
  });

  it('should handle real scan with no package.json gracefully', async () => {
    const empty = makeRoot('empty');
    const wm = new WorkspaceManager();
    wm.addRoot(empty);
    const profile = await wm.mergeProfiles();
    expect(profile.languages).toEqual([]);
    expect(profile.packageManager).toBe('other');
  });

  it('should handle three roots with diverse setups', async () => {
    const r1 = makeRoot('r1');
    const r2 = makeRoot('r2');
    const r3 = makeRoot('r3');

    // r1: Svelte, pnpm
    makePackageJson(r1, {
      name: 'r1',
      dependencies: { svelte: '4.0.0' },
      devDependencies: { vitest: '1.0.0' }
    });
    makeLockfile(r1, 'pnpm-lock.yaml');

    // r2: Vue, pnpm
    makePackageJson(r2, {
      name: 'r2',
      dependencies: { vue: '3.0.0' },
      devDependencies: { vitest: '1.0.0' }
    });
    makeLockfile(r2, 'pnpm-lock.yaml');

    // r3: Hono, npm
    makePackageJson(r3, {
      name: 'r3',
      dependencies: { hono: '4.0.0' },
      devDependencies: { playwright: '1.0.0' }
    });
    makeLockfile(r3, 'package-lock.json');

    const wm = new WorkspaceManager();
    wm.addRoot(r1);
    wm.addRoot(r2);
    wm.addRoot(r3);

    const merged = await wm.mergeProfiles();

    // packageManager majority: pnpm (2) > npm (1)
    expect(merged.packageManager).toBe('pnpm');

    // frameworks: union
    expect(merged.frameworks).toContain('svelte');
    expect(merged.frameworks).toContain('vue');
    expect(merged.frameworks).toContain('hono');

    // test runners: deduplicated union
    expect(merged.testRunner).toContain('vitest');
    expect(merged.testRunner).toContain('playwright');
  });
});

// ── Factory helper ──────────────────────────────────────

function makeProfile(overrides: Partial<ProjectProfile>): ProjectProfile {
  const defaults: ProjectProfile = {
    rootPath: '/tmp/test',
    languages: ['typescript'],
    frameworks: [],
    packageManager: 'pnpm' as PackageManager,
    buildSystem: 'node',
    linter: [],
    testRunner: [],
    monorepo: false,
    ci: [],
    deploymentTarget: [],
    detectedAt: '2026-01-01T00:00:00.000Z'
  };
  return { ...defaults, ...overrides };
}
