import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectStack } from './stack-detector.js';

describe('StackDetector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'stack-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects Node/TS project from package.json and tsconfig', async () => {
    writeFileSync(join(tmpDir, 'package.json'), '{}');
    writeFileSync(join(tmpDir, 'tsconfig.json'), '{}');
    const profile = await detectStack(tmpDir);
    expect(profile.framework).toBe('node');
    expect(profile.languages).toContain('typescript');
    expect(profile.recommendedSkills).toContain('typescript');
  });

  it('detects pnpm + turborepo monorepo', async () => {
    writeFileSync(join(tmpDir, 'pnpm-workspace.yaml'), 'packages: ["packages/*"]');
    writeFileSync(join(tmpDir, 'turbo.json'), '{}');
    const profile = await detectStack(tmpDir);
    expect(profile.packageManager).toBe('pnpm');
    expect(profile.recommendedSkills).toContain('pnpm');
    expect(profile.recommendedSkills).toContain('turborepo');
  });

  it('detects SvelteKit project', async () => {
    writeFileSync(join(tmpDir, 'package.json'), '{}');
    writeFileSync(join(tmpDir, 'svelte.config.js'), '{}');
    const profile = await detectStack(tmpDir);
    expect(profile.framework).toBe('sveltekit');
    expect(profile.recommendedSkills).toContain('sveltekit');
  });

  it('detects Go project', async () => {
    writeFileSync(join(tmpDir, 'go.mod'), 'module test');
    const profile = await detectStack(tmpDir);
    expect(profile.framework).toBe('go');
    expect(profile.languages).toContain('go');
  });

  it('returns unknown for empty project', async () => {
    const profile = await detectStack(tmpDir);
    expect(profile.framework).toBe('unknown');
    expect(profile.languages).toHaveLength(0);
  });
});
