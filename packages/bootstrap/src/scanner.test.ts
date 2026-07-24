import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanProject } from './scanner.js';

let tmpDir = '';

function makePackageJson(dir: string, content: Record<string, unknown>): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(content));
}

function makeLockfile(dir: string, name: string): void {
  writeFileSync(join(dir, name), '');
}

describe('scanProject', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bootstrap-test-'));
  });

  afterEach(() => {
    // cleanup handled by OS temp dir policy
  });

  it('should detect Node.js project from package.json', async () => {
    makePackageJson(tmpDir, { name: 'test', version: '1.0.0' });
    makeLockfile(tmpDir, 'pnpm-lock.yaml');
    const profile = await scanProject(tmpDir);
    expect(profile.languages).toContain('typescript');
    expect(profile.languages).toContain('javascript');
    expect(profile.packageManager).toBe('pnpm');
  });

  it('should detect npm from package-lock.json', async () => {
    makePackageJson(tmpDir, { name: 'test' });
    makeLockfile(tmpDir, 'package-lock.json');
    const profile = await scanProject(tmpDir);
    expect(profile.packageManager).toBe('npm');
  });

  it('should detect Next.js framework', async () => {
    makePackageJson(tmpDir, {
      dependencies: { next: '14.0.0', react: '18.0.0', 'react-dom': '18.0.0' }
    });
    const profile = await scanProject(tmpDir);
    expect(profile.frameworks).toContain('next.js');
    expect(profile.frameworks).toContain('react');
  });

  it('should detect GitHub Actions CI', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(tmpDir, '.github', 'workflows'), { recursive: true });
    makePackageJson(tmpDir, { name: 'test' });
    const profile = await scanProject(tmpDir);
    expect(profile.ci).toContain('github-actions');
  });

  it('should detect monorepo from pnpm-workspace.yaml', async () => {
    writeFileSync(join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"');
    makePackageJson(tmpDir, { name: 'monorepo' });
    const profile = await scanProject(tmpDir);
    expect(profile.monorepo).toBe(true);
    expect(profile.monorepoTool).toBe('pnpm');
  });

  it('should detect linters and test runners', async () => {
    makePackageJson(tmpDir, {
      devDependencies: { vitest: '1.0.0', biome: '1.0.0', eslint: '8.0.0', playwright: '1.0.0' }
    });
    const profile = await scanProject(tmpDir);
    expect(profile.linter).toContain('eslint');
    expect(profile.linter).toContain('biome');
    expect(profile.testRunner).toContain('vitest');
    expect(profile.testRunner).toContain('playwright');
  });
});
