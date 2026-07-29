/**
 * Tests for project tools (tools.ts).
 *
 * @module
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectToolResult } from './tools.js';
import { handleProjectProfile, handleProjectRecommend, handleProjectScan } from './tools.js';

// ── Test helpers ────────────────────────────────────────

let tmpDir = '';

function makePackageJson(dir: string, content?: Record<string, unknown>): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(content ?? { name: 'test', version: '1.0.0' }));
}

function makeLockfile(dir: string, name: string): void {
  writeFileSync(join(dir, name), '');
}

/** Assert the result is ok and return its data. */
function assertOk<T>(result: ProjectToolResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected ok, got error: ${result.error}`);
  }
  if (result.data === undefined) {
    throw new Error('Expected data to be defined');
  }
  return result.data;
}

// ── Tests ───────────────────────────────────────────────

describe('handleProjectScan', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bootstrap-tools-scan-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns error for missing rootPath', async () => {
    const result = await handleProjectScan({ rootPath: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('rootPath is required');
  });

  it('scans a Node.js project and writes config', async () => {
    makePackageJson(tmpDir);
    makeLockfile(tmpDir, 'pnpm-lock.yaml');

    const data = assertOk(await handleProjectScan({ rootPath: tmpDir }));
    expect(data.profile.packageManager).toBe('pnpm');
    expect(data.profile.languages).toContain('typescript');
    expect(data.config.schemaVersion).toBe(1);
    expect(data.config.project.rootPath).toBe(tmpDir);
  });

  it('scans a project with frameworks and returns them', async () => {
    makePackageJson(tmpDir, {
      dependencies: { next: '14.0.0', react: '18.0.0', 'react-dom': '18.0.0' }
    });
    makeLockfile(tmpDir, 'package-lock.json');

    const data = assertOk(await handleProjectScan({ rootPath: tmpDir }));
    expect(data.profile.frameworks).toContain('next.js');
    expect(data.profile.packageManager).toBe('npm');
  });

  it('writes a valid config file to disk', async () => {
    makePackageJson(tmpDir);
    makeLockfile(tmpDir, 'yarn.lock');

    assertOk(await handleProjectScan({ rootPath: tmpDir }));

    // Verify the file was written
    const { access } = await import('node:fs/promises');
    await expect(access(join(tmpDir, '.agentsy', 'config.yml'))).resolves.toBeUndefined();
  });
});

describe('handleProjectProfile', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bootstrap-tools-profile-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns error for missing rootPath', async () => {
    const result = await handleProjectProfile({ rootPath: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('rootPath is required');
  });

  it('returns error when no config exists', async () => {
    const result = await handleProjectProfile({ rootPath: tmpDir });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No .agentsy/config.yml found');
  });

  it('returns profile from existing config', async () => {
    makePackageJson(tmpDir);
    makeLockfile(tmpDir, 'pnpm-lock.yaml');

    // First scan to create the config
    assertOk(await handleProjectScan({ rootPath: tmpDir }));

    // Then read the profile
    const data = assertOk(await handleProjectProfile({ rootPath: tmpDir }));
    expect(data.profile.packageManager).toBe('pnpm');
    expect(data.profile.rootPath).toBe(tmpDir);
  });
});

describe('handleProjectRecommend', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bootstrap-tools-recommend-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns error for missing rootPath', async () => {
    const result = await handleProjectRecommend({ rootPath: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('rootPath is required');
  });

  it('returns error when no config exists', async () => {
    const result = await handleProjectRecommend({ rootPath: tmpDir });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No .agentsy/config.yml found');
  });

  it('returns recommendations for a project with Next.js', async () => {
    makePackageJson(tmpDir, {
      dependencies: { next: '14.0.0', react: '18.0.0', 'react-dom': '18.0.0' }
    });
    makeLockfile(tmpDir, 'pnpm-lock.yaml');

    // Create config via scan
    await handleProjectScan({ rootPath: tmpDir });

    // Get recommendations
    const data = assertOk(await handleProjectRecommend({ rootPath: tmpDir }));
    expect(data.recommendations.length).toBeGreaterThan(0);

    // Should recommend Next.js skill
    const nextRec = data.recommendations.find(r => r.componentId === 'nextjs-app-router');
    expect(nextRec).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: co-located with toBeDefined assertion
    expect(nextRec!.componentType).toBe('skill');
  });

  it('returns recommendations for a React project', async () => {
    makePackageJson(tmpDir, {
      dependencies: { react: '18.0.0', 'react-dom': '18.0.0' }
    });
    makeLockfile(tmpDir, 'pnpm-lock.yaml');

    await handleProjectScan({ rootPath: tmpDir });

    const data = assertOk(await handleProjectRecommend({ rootPath: tmpDir }));
    const reactRec = data.recommendations.find(r => r.componentId === 'react-patterns');
    expect(reactRec).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: co-located with toBeDefined assertion
    expect(reactRec!.componentType).toBe('skill');
  });
});
