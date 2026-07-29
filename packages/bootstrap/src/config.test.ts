/**
 * Configuration I/O tests — writeConfig/readConfig round-trip.
 *
 * @module
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type AgentsyConfig, configExists, createDefaultConfig, readConfig, writeConfig } from './config.js';
import type { ProjectProfile } from './scanner.js';

function makeProfile(overrides?: Partial<ProjectProfile>): ProjectProfile {
  return {
    rootPath: '/tmp/fake',
    languages: ['typescript'],
    frameworks: ['next.js'],
    packageManager: 'pnpm',
    buildSystem: 'tsup',
    linter: ['biome'],
    testRunner: ['vitest'],
    monorepo: false,
    ci: ['github-actions'],
    deploymentTarget: ['vercel'],
    detectedAt: '2026-07-28T00:00:00.000Z',
    ...overrides
  };
}

function makeConfig(overrides?: Partial<AgentsyConfig>): AgentsyConfig {
  const rootPath = '/tmp/fake';
  return {
    schemaVersion: 1,
    project: {
      rootPath,
      profile: makeProfile({ rootPath }),
      detectedAt: '2026-07-28T00:00:00.000Z'
    },
    installed: {
      connectors: [],
      mcpServers: [],
      skills: [],
      guardrails: [],
      hooks: []
    },
    recommendations: [],
    artifacts: {
      agentsMd: false,
      aft: false,
      magicContext: false
    },
    ...overrides
  };
}

describe('config I/O', () => {
  async function withTempDir(test: (rootPath: string) => Promise<void>): Promise<void> {
    const rootPath = await mkdtemp(join(tmpdir(), 'agentsy-config-'));
    try {
      await test(rootPath);
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  }

  it('writes and reads a default config', async () => {
    await withTempDir(async rootPath => {
      const original = createDefaultConfig(rootPath, makeProfile({ rootPath }));
      await writeConfig(rootPath, original);
      expect(await configExists(rootPath)).toBe(true);

      const parsed = await readConfig(rootPath);
      expect(parsed).not.toBeNull();
      expect(parsed?.schemaVersion).toBe(1);
      expect(parsed?.project.rootPath).toBe(rootPath);
      expect(parsed?.project.profile.rootPath).toBe(rootPath);
      expect(parsed?.project.profile.languages).toEqual(['typescript']);
      expect(parsed?.installed.connectors).toEqual([]);
      expect(parsed?.artifacts.aft).toBe(false);
    });
  });

  it('round-trips populated arrays and monorepoTool', async () => {
    await withTempDir(async rootPath => {
      const original = makeConfig({
        project: {
          rootPath,
          detectedAt: '2026-07-28T00:00:00.000Z',
          profile: makeProfile({
            rootPath,
            languages: ['typescript', 'javascript'],
            frameworks: ['next.js', 'react'],
            linter: ['biome', 'prettier'],
            testRunner: ['vitest', 'playwright'],
            monorepo: true,
            monorepoTool: 'pnpm',
            ci: ['github-actions', 'gitlab-ci'],
            deploymentTarget: ['vercel', 'aws']
          })
        },
        installed: {
          connectors: ['slack'],
          mcpServers: ['filesystem'],
          skills: ['shell'],
          guardrails: ['pii'],
          hooks: ['audit']
        },
        recommendations: [
          {
            componentId: 'mcp-filesystem',
            componentType: 'mcp-server',
            confidence: 0.9,
            installCommand: 'pnpm add @agentsy/mcp-filesystem',
            reason: 'file access needed'
          }
        ]
      });

      await writeConfig(rootPath, original);
      const parsed = await readConfig(rootPath);

      expect(parsed).toStrictEqual(original);
    });
  });

  it('returns null when the config file is missing', async () => {
    await withTempDir(async rootPath => {
      expect(await readConfig(rootPath)).toBeNull();
    });
  });

  it('returns null on malformed YAML', async () => {
    await withTempDir(async rootPath => {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { dirname } = await import('node:path');
      const ymlPath = join(rootPath, '.agentsy', 'config.yml');
      await mkdir(dirname(ymlPath), { recursive: true });
      await writeFile(ymlPath, 'project: [unclosed', 'utf-8');

      expect(await readConfig(rootPath)).toBeNull();
    });
  });
});
