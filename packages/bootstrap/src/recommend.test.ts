import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from './config.js';
import { recommend } from './recommend.js';
import type { ProjectProfile } from './scanner.js';

const _emptyInstalled = { connectors: [], mcpServers: [], skills: [], guardrails: [], hooks: [] };

function makeProfile(overrides: Partial<ProjectProfile>): ProjectProfile {
  return {
    rootPath: '/test',
    languages: ['typescript'],
    frameworks: [],
    packageManager: 'pnpm',
    buildSystem: 'node',
    linter: [],
    testRunner: [],
    monorepo: false,
    monorepoTool: undefined,
    ci: [],
    deploymentTarget: [],
    detectedAt: new Date().toISOString(),
    ...overrides
  };
}

describe('recommend', () => {
  it('should recommend postgres MCP for Prisma projects', () => {
    const profile = makeProfile({ frameworks: ['prisma'] });
    const config = createDefaultConfig('/test', profile);
    const recs = recommend(profile, config.installed);
    expect(recs.some(r => r.componentId.includes('postgres'))).toBe(true);
  });

  it('should recommend nextjs skill for Next.js projects', () => {
    const profile = makeProfile({ frameworks: ['next.js'] });
    const config = createDefaultConfig('/test', profile);
    const recs = recommend(profile, config.installed);
    expect(recs.some(r => r.componentId === 'nextjs-app-router')).toBe(true);
  });

  it('should recommend PII guardrail for Python projects', () => {
    const profile = makeProfile({ languages: ['python'] });
    const config = createDefaultConfig('/test', profile);
    const recs = recommend(profile, config.installed);
    expect(recs.some(r => r.componentId === 'builtin:pii')).toBe(true);
  });

  it('should return empty for unknown projects', () => {
    const profile = makeProfile({});
    const config = createDefaultConfig('/test', profile);
    const recs = recommend(profile, config.installed);
    expect(recs.length).toBe(0);
  });
});
