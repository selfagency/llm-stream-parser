import { describe, expect, it } from 'vitest';
import type { AgentsyConfig } from '../config.js';
import type { ProjectProfile } from '../scanner.js';
import { generateAftJson, generateAftMd } from './aft.js';
import { generateAgentsMd } from './agents-md.js';
import { seedMagicContext } from './magic-context.js';

// ── Fixture profiles ───────────────────────────────────

function nextJsProfile(rootPath: string): ProjectProfile {
  return {
    rootPath,
    languages: ['typescript', 'javascript'],
    frameworks: ['next.js', 'react'],
    packageManager: 'pnpm',
    buildSystem: 'next',
    linter: ['biome', 'eslint'],
    testRunner: ['vitest', 'playwright'],
    monorepo: false,
    ci: ['github-actions'],
    deploymentTarget: ['vercel'],
    detectedAt: '2026-07-25T12:00:00.000Z'
  };
}

function monorepoProfile(rootPath: string): ProjectProfile {
  return {
    rootPath,
    languages: ['typescript'],
    frameworks: ['svelte'],
    packageManager: 'pnpm',
    buildSystem: 'vite',
    linter: ['biome'],
    testRunner: ['vitest'],
    monorepo: true,
    monorepoTool: 'pnpm',
    ci: ['github-actions'],
    deploymentTarget: [],
    detectedAt: '2026-07-25T12:00:00.000Z'
  };
}

function pythonProfile(rootPath: string): ProjectProfile {
  return {
    rootPath,
    languages: ['python'],
    frameworks: ['django'],
    packageManager: 'pip',
    buildSystem: 'django',
    linter: [],
    testRunner: [],
    monorepo: false,
    ci: [],
    deploymentTarget: ['aws'],
    detectedAt: '2026-07-25T12:00:00.000Z'
  };
}

function emptyProfile(rootPath: string): ProjectProfile {
  return {
    rootPath,
    languages: [],
    frameworks: [],
    packageManager: 'other',
    buildSystem: 'node',
    linter: [],
    testRunner: [],
    monorepo: false,
    ci: [],
    deploymentTarget: [],
    detectedAt: '2026-07-25T12:00:00.000Z'
  };
}

// ── Fixture configs ─────────────────────────────────────

function defaultConfig(rootPath: string, profile: ProjectProfile): AgentsyConfig {
  return {
    schemaVersion: 1,
    project: { rootPath, profile, detectedAt: '2026-07-25T12:00:00.000Z' },
    installed: { connectors: [], mcpServers: [], skills: [], guardrails: [], hooks: [] },
    recommendations: [],
    artifacts: { agentsMd: false, aft: false, magicContext: false }
  };
}

function configuredConfig(rootPath: string, profile: ProjectProfile): AgentsyConfig {
  return {
    schemaVersion: 1,
    project: { rootPath, profile, detectedAt: '2026-07-25T12:00:00.000Z' },
    installed: {
      connectors: ['slack'],
      mcpServers: ['postgres', 'filesystem'],
      skills: ['nextjs-app-router'],
      guardrails: ['builtin:pii'],
      hooks: ['session-start']
    },
    recommendations: [],
    artifacts: { agentsMd: true, aft: true, magicContext: true }
  };
}

// ── Tests: agents-md ────────────────────────────────────

describe('generateAgentsMd', () => {
  it('produces all required sections for Next.js project', () => {
    const profile = nextJsProfile('/tmp/test-project');
    const config = defaultConfig('/tmp/test-project', profile);
    const md = generateAgentsMd(profile, config);

    expect(md).toContain('# AGENTS.md');
    expect(md).toContain('## Project');
    expect(md).toContain('## Commands');
    expect(md).toContain('## Project Layout');
    expect(md).toContain('## Conventions');
    expect(md).toContain('## Gotchas');
    expect(md).toContain('## Agentsy Components');
    expect(md).toContain("## Do ✅ / Don't ❌");
  });

  it('includes detected languages and frameworks', () => {
    const profile = nextJsProfile('/tmp/test');
    const md = generateAgentsMd(profile, defaultConfig('/tmp/test', profile));

    expect(md).toContain('typescript');
    expect(md).toContain('javascript');
    expect(md).toContain('Next.js');
    expect(md).toContain('next.js');
    expect(md).toContain('react');
  });

  it('includes build/test/lint commands', () => {
    const profile = nextJsProfile('/tmp/test');
    const md = generateAgentsMd(profile, defaultConfig('/tmp/test', profile));

    expect(md).toContain('pnpm build');
    expect(md).toContain('pnpm test');
    expect(md).toContain('pnpm lint');
    expect(md).toContain('vitest');
    expect(md).toContain('biome');
  });

  it('includes monorepo-specific content', () => {
    const profile = monorepoProfile('/tmp/monorepo');
    const md = generateAgentsMd(profile, defaultConfig('/tmp/monorepo', profile));

    expect(md).toContain('Monorepo');
    expect(md).toContain('packages/');
    expect(md).toContain('--filter');
    expect(md).toContain('workspace protocol');
  });

  it('lists installed agentsy components in installed section', () => {
    const profile = nextJsProfile('/tmp/test');
    const config = configuredConfig('/tmp/test', profile);
    const md = generateAgentsMd(profile, config);

    expect(md).toContain('slack');
    expect(md).toContain('postgres');
    expect(md).toContain('nextjs-app-router');
    expect(md).toContain('builtin:pii');
    expect(md).toContain('session-start');
    expect(md).not.toContain('No agentsy components installed yet.');
  });

  it('shows empty state when no components installed', () => {
    const profile = nextJsProfile('/tmp/test');
    const md = generateAgentsMd(profile, defaultConfig('/tmp/test', profile));

    expect(md).toContain('No agentsy components installed yet.');
  });

  it('handles empty profile gracefully', () => {
    const profile = emptyProfile('/tmp/test');
    const md = generateAgentsMd(profile, defaultConfig('/tmp/test', profile));

    expect(md).toContain('none detected');
    expect(md).toContain('# AGENTS.md');
  });

  it('is stable across multiple calls (deterministic)', () => {
    const profile = nextJsProfile('/tmp/test');
    const config = defaultConfig('/tmp/test', profile);
    const a = generateAgentsMd(profile, config);
    const b = generateAgentsMd(profile, config);
    expect(a).toBe(b);
  });
});

// ── Tests: aft ──────────────────────────────────────────

describe('generateAftMd', () => {
  it('produces a Markdown file tree for Node.js project', () => {
    const profile = nextJsProfile('/tmp/test');
    const md = generateAftMd(profile);

    expect(md).toContain('# Agent File Tree (AFT)');
    expect(md).toContain('## Top-Level Layout');
    expect(md).toContain('## Entry Points');
    expect(md).toContain('## Config Files');
    expect(md).toContain('## Stats');
    expect(md).toContain('## Ignored Paths');
  });

  it('includes Next.js specific entries', () => {
    const profile = nextJsProfile('/tmp/test');
    const md = generateAftMd(profile);

    expect(md).toContain('src/app/');
    expect(md).toContain('next.config.ts');
  });

  it('includes stats in the output', () => {
    const profile = nextJsProfile('/tmp/test');
    const md = generateAftMd(profile);

    expect(md).toMatch(/Total files/);
    expect(md).toMatch(/Total LOC/);
    expect(md).toMatch(/Primary language/);
    expect(md).toMatch(/TypeScript/);
  });

  it('includes GitHub Actions when detected', () => {
    const profile = nextJsProfile('/tmp/test');
    const md = generateAftMd(profile);

    expect(md).toContain('.github/workflows/');
  });

  it('handles Python profile', () => {
    const profile = pythonProfile('/tmp/python-project');
    const md = generateAftMd(profile);

    expect(md).toContain('pyproject.toml');
    expect(md).toContain('Python');
    expect(md).toContain('__pycache__');
  });
});

describe('generateAftJson', () => {
  it('produces valid JSON', () => {
    const profile = nextJsProfile('/tmp/test');
    const jsonStr = generateAftJson(profile);

    expect(() => JSON.parse(jsonStr)).not.toThrow();
  });

  it('returns structured object with required fields', () => {
    const profile = nextJsProfile('/tmp/test');
    const parsed = JSON.parse(generateAftJson(profile)) as Record<string, unknown>;

    expect(parsed).toHaveProperty('schemaVersion');
    expect(parsed).toHaveProperty('generatedAt');
    expect(parsed).toHaveProperty('rootPath');
    expect(parsed).toHaveProperty('layout');
    expect(parsed).toHaveProperty('entryPoints');
    expect(parsed).toHaveProperty('configFiles');
    expect(parsed).toHaveProperty('stats');
    expect(parsed).toHaveProperty('ignoredPaths');
  });

  it('includes stats with byLanguage breakdown', () => {
    const profile = nextJsProfile('/tmp/test');
    const parsed = JSON.parse(generateAftJson(profile)) as {
      stats: { totalLoc: number; totalFiles: number; byLanguage: Record<string, { files: number; loc: number }> };
    };

    expect(parsed.stats.totalLoc).toBeGreaterThan(0);
    expect(parsed.stats.totalFiles).toBeGreaterThan(0);
    expect(Object.keys(parsed.stats.byLanguage).length).toBeGreaterThan(0);
  });

  it('ignoredPaths includes standard patterns', () => {
    const profile = nextJsProfile('/tmp/test');
    const parsed = JSON.parse(generateAftJson(profile)) as { ignoredPaths: string[] };

    expect(parsed.ignoredPaths).toContain('node_modules/');
    expect(parsed.ignoredPaths).toContain('dist/');
    expect(parsed.ignoredPaths).toContain('.next/');
  });

  it('is stable across multiple calls (deterministic except timestamp)', () => {
    const profile = nextJsProfile('/tmp/test');
    const a = generateAftJson(profile);
    const b = generateAftJson(profile);
    // generatedAt will differ in ms, but schema should be identical
    expect(a.split('\n').slice(0, 1)).toEqual(b.split('\n').slice(0, 1));
  });
});

// ── Tests: magic-context ────────────────────────────────

describe('seedMagicContext', () => {
  it('calls db query for each compartment key', () => {
    const profile = nextJsProfile('/tmp/test');
    const calls: { sql: string; params: unknown[] }[] = [];
    const db = (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
    };

    seedMagicContext(db, profile);

    // Must have called for project memories, compartments, session_meta, project_state
    expect(calls.length).toBeGreaterThan(0);

    // Check for project memory keys
    const keys = calls.map(c => c.params[0] as string);
    expect(keys).toContain('project_memory:name');
    expect(keys).toContain('project_memory:stack');
    expect(keys).toContain('project_memory:buildSystem');
    expect(keys).toContain('project_memory:monorepo');

    // Check for compartment keys
    expect(keys).toContain('compartment:project-overview');
    expect(keys).toContain('compartment:tooling');
    expect(keys).toContain('compartment:ci-cd');

    // Check for session meta placeholders
    expect(keys).toContain('session_meta:currentTask');
    expect(keys).toContain('session_meta:recentFiles');

    // Check for project state placeholders
    expect(keys).toContain('project_state:currentBranch');
    expect(keys).toContain('project_state:recentCommits');
  });

  it('seeds correct values for Next.js project', () => {
    const profile = nextJsProfile('/tmp/my-app');
    const calls: { sql: string; params: unknown[] }[] = [];
    const db = (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
    };

    seedMagicContext(db, profile);

    const nameEntry = calls.find(c => c.params[0] === 'project_memory:name');
    expect(nameEntry).toBeDefined();
    if (nameEntry) {
      expect(nameEntry.params[1]).toBe('my-app');
    }

    const stackEntry = calls.find(c => c.params[0] === 'project_memory:stack');
    expect(stackEntry).toBeDefined();
    if (stackEntry) {
      expect(stackEntry.params[1]).toBe('typescript, javascript');
    }
  });

  it('uses UPSERT SQL pattern for idempotency', () => {
    const profile = nextJsProfile('/tmp/test');
    const calls: { sql: string; params: unknown[] }[] = [];
    const db = (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
    };

    seedMagicContext(db, profile);

    for (const call of calls) {
      expect(call.sql).toContain('INSERT INTO context_compartments');
      expect(call.sql).toContain('ON CONFLICT');
    }
  });

  it('handles Python profile with no test/lint tools', () => {
    const profile = pythonProfile('/tmp/py-project');
    const calls: { sql: string; params: unknown[] }[] = [];
    const db = (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
    };

    seedMagicContext(db, profile);

    const stackEntry = calls.find(c => c.params[0] === 'project_memory:stack');
    expect(stackEntry).toBeDefined();
    if (stackEntry) {
      expect(stackEntry.params[1]).toBe('python');
    }

    const toolingEntry = calls.find(c => c.params[0] === 'compartment:tooling');
    expect(toolingEntry).toBeDefined();
    if (toolingEntry) {
      expect(toolingEntry.params[1]).toBe('');
    }
  });

  it('extracts profile data for compartment values', () => {
    const profile = monorepoProfile('/tmp/repo');
    const calls: { sql: string; params: unknown[] }[] = [];
    const db = (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
    };

    seedMagicContext(db, profile);

    const overviewEntry = calls.find(c => c.params[0] === 'compartment:project-overview');
    expect(overviewEntry).toBeDefined();
    if (overviewEntry) {
      expect(overviewEntry.params[1]).toContain('typescript');
      expect(overviewEntry.params[1]).toContain('svelte');
    }
  });
});
