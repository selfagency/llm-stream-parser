/**
 * Tests for BootstrapService.
 *
 * @module
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { BootstrapService } from './bootstrap-service.js';

// ── Helpers ─────────────────────────────────────────────

function makePackageJson(dir: string, content?: Record<string, unknown>): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(content ?? { name: 'test', version: '1.0.0' }));
}

function makeLockfile(dir: string, name: string): void {
  writeFileSync(join(dir, name), '');
}

async function makeExistingConfig(dir: string): Promise<void> {
  const configDir = join(dir, '.agentsy');
  await mkdir(configDir, { recursive: true });
  await writeFile(
    join(configDir, 'config.yml'),
    `schemaVersion: 1
project:
  rootPath: ${dir}
  profile:
    rootPath: ${dir}
    languages:
      - typescript
      - javascript
    frameworks:
      - next.js
    packageManager: pnpm
    buildSystem: next
    monorepo: false
  detectedAt: 2026-01-01T00:00:00.000Z
installed:
  connectors: []
  mcpServers: []
  skills: []
  guardrails: []
  hooks: []
recommendations: []
artifacts:
  agentsMd: false
  aft: false
  magicContext: false
`,
    'utf-8'
  );
}

// ── Tests ───────────────────────────────────────────────

describe('BootstrapService lifecycle', () => {
  const logger = createMockLogger();

  it('starts with correct name', () => {
    const service = new BootstrapService({ logger });
    expect(service.name).toBe('bootstrap');
  });

  it('start/sleep/wakeup/stop do not throw', async () => {
    const service = new BootstrapService({ logger });
    await expect(service.start()).resolves.toBeUndefined();
    await expect(service.sleep()).resolves.toBeUndefined();
    await expect(service.wakeup()).resolves.toBeUndefined();
    await expect(service.stop()).resolves.toBeUndefined();
  });
});

describe('BootstrapService.bootstrap', () => {
  const logger = createMockLogger();

  it('throws for non-existent directory', async () => {
    const service = new BootstrapService({ logger });
    await expect(service.bootstrap('/non-existent-path-12345')).rejects.toThrow();
  });

  it('scans a new project and creates config + returns profile', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bootstrap-svc-'));

    try {
      makePackageJson(tmpDir, {
        dependencies: { next: '14.0.0', react: '18.0.0', 'react-dom': '18.0.0' }
      });
      makeLockfile(tmpDir, 'pnpm-lock.yaml');

      const service = new BootstrapService({ logger });
      const result = await service.bootstrap(tmpDir);

      expect(result.profile).toBeDefined();
      expect(result.profile.languages).toContain('typescript');
      expect(result.profile.frameworks).toContain('next.js');
      expect(result.profile.rootPath).toBe(tmpDir);
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);

      // Verify config was written
      const { access } = await import('node:fs/promises');
      await expect(access(join(tmpDir, '.agentsy', 'config.yml'))).resolves.toBeUndefined();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('reads an existing config without re-scanning', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bootstrap-svc-existing-'));

    try {
      // Create an existing config
      await makeExistingConfig(tmpDir);

      const service = new BootstrapService({ logger });
      const result = await service.bootstrap(tmpDir);

      expect(result.profile).toBeDefined();
      expect(result.profile.languages).toContain('typescript');
      expect(result.profile.frameworks).toContain('next.js');
      expect(result.profile.packageManager).toBe('pnpm');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('seeds Magic Context when dbQuery is provided', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bootstrap-svc-mc-'));

    try {
      makePackageJson(tmpDir);
      makeLockfile(tmpDir, 'pnpm-lock.yaml');

      const dbQuery = vi.fn();
      const service = new BootstrapService({ logger, dbQuery });
      const result = await service.bootstrap(tmpDir);

      expect(result.profile).toBeDefined();
      // DbQueryFn is called for each Magic Context compartment
      expect(dbQuery).toHaveBeenCalled();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('does not fail when dbQuery throws', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bootstrap-svc-mc-fail-'));

    try {
      makePackageJson(tmpDir);
      makeLockfile(tmpDir, 'pnpm-lock.yaml');

      const dbQuery = vi.fn().mockImplementation(() => {
        throw new Error('DB unavailable');
      });
      const service = new BootstrapService({ logger, dbQuery });
      const result = await service.bootstrap(tmpDir);

      // Should still return profile + recommendations despite DB error
      expect(result.profile).toBeDefined();
      expect(result.recommendations).toBeDefined();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns recommendations matching the project profile', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bootstrap-svc-recs-'));

    try {
      makePackageJson(tmpDir, {
        dependencies: { react: '18.0.0', 'react-dom': '18.0.0' }
      });
      makeLockfile(tmpDir, 'pnpm-lock.yaml');

      const service = new BootstrapService({ logger });
      const result = await service.bootstrap(tmpDir);

      expect(result.recommendations.length).toBeGreaterThan(0);

      // React project should get react-patterns recommendation
      const reactRec = result.recommendations.find(r => r.componentId === 'react-patterns');
      expect(reactRec).toBeDefined();
      // biome-ignore lint/style/noNonNullAssertion: co-located with toBeDefined assertion
      expect(reactRec!.componentType).toBe('skill');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns Next.js skill recommendation for Next.js project', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bootstrap-svc-nextjs-'));

    try {
      makePackageJson(tmpDir, {
        dependencies: { next: '14.0.0', react: '18.0.0', 'react-dom': '18.0.0' }
      });
      makeLockfile(tmpDir, 'pnpm-lock.yaml');

      const service = new BootstrapService({ logger });
      const result = await service.bootstrap(tmpDir);

      const nextRec = result.recommendations.find(r => r.componentId === 'nextjs-app-router');
      expect(nextRec).toBeDefined();
      // biome-ignore lint/style/noNonNullAssertion: co-located with toBeDefined assertion
      expect(nextRec!.componentType).toBe('skill');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
