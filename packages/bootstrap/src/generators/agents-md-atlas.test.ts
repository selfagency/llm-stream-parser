import { describe, expect, it } from 'vitest';
import type { AgentsyConfig } from '../config.js';
import type { ProjectProfile } from '../scanner.js';
import { type AtlasManifestData, generateAgentsMd } from './agents-md.js';
import { reviewAgentsMd } from './agents-md-review.js';

// ── Fixtures ─────────────────────────────────────────────

function profile(rootPath: string): ProjectProfile {
  return {
    rootPath,
    languages: ['typescript'],
    frameworks: ['next.js', 'react'],
    packageManager: 'pnpm',
    buildSystem: 'next',
    linter: ['biome'],
    testRunner: ['vitest'],
    monorepo: false,
    ci: ['github-actions'],
    deploymentTarget: ['vercel'],
    detectedAt: '2026-07-25T12:00:00.000Z'
  };
}

function config(): AgentsyConfig {
  return {
    schemaVersion: 1,
    project: {
      rootPath: '/test',
      profile: profile('/test'),
      detectedAt: '2026-07-25T12:00:00.000Z'
    },
    installed: {
      connectors: [],
      guardrails: [],
      hooks: [],
      mcpServers: [],
      skills: []
    },
    artifacts: { agentsMd: true, aft: false, magicContext: false },
    recommendations: []
  };
}

const atlasManifest: AtlasManifestData = {
  aiTasks: ['task_generate', 'task_verify'],
  humanTasks: ['human_review'],
  systemTasks: ['system_log_event'],
  constraints: ['const_privacy', 'const_human_loop'],
  touchpoints: ['tp_cli'],
  layer: 'layer_internal'
};

// ── Atlas-aware generation ───────────────────────────────

describe('generateAgentsMd with Atlas manifest', () => {
  it('includes Atlas manifest section when provided', () => {
    const content = generateAgentsMd(profile('/test'), config(), atlasManifest);
    expect(content).toContain('## Agent Atlas Manifest');
    expect(content).toContain('`task_generate`');
    expect(content).toContain('`const_privacy`');
    expect(content).toContain('`layer_internal`');
    expect(content).toContain('AI Interaction Atlas');
  });

  it('omits Atlas section when not provided', () => {
    const content = generateAgentsMd(profile('/test'), config());
    expect(content).not.toContain('## Agent Atlas Manifest');
  });

  it('includes all six dimension types', () => {
    const content = generateAgentsMd(profile('/test'), config(), atlasManifest);
    expect(content).toContain('**AI Tasks**');
    expect(content).toContain('**Human Tasks**');
    expect(content).toContain('**System Tasks**');
    expect(content).toContain('**Constraints**');
    expect(content).toContain('**Touchpoints**');
    expect(content).toContain('**Layer**');
  });
});

// ── AGENTS.md review ─────────────────────────────────────

describe('reviewAgentsMd', () => {
  it('passes for a well-formed file', () => {
    const content = generateAgentsMd(profile('/test'), config());
    const result = reviewAgentsMd(content, profile('/test'));
    expect(result.usable).toBe(true);
    expect(result.shouldRegenerate).toBe(false);
    expect(result.findings.filter(f => f.severity === 'error')).toHaveLength(0);
  });

  it('flags missing required sections', () => {
    const content = '# AGENTS.md\n\nSome content but no sections.';
    const result = reviewAgentsMd(content, profile('/test'));
    expect(result.usable).toBe(false);
    expect(result.findings.some(f => f.severity === 'error' && f.message.includes('Missing required section'))).toBe(
      true
    );
  });

  it('flags profile drift for missing frameworks', () => {
    const content = generateAgentsMd(profile('/test'), config());
    // Change profile to include a framework not in the content
    const driftedProfile: ProjectProfile = {
      ...profile('/test'),
      frameworks: ['svelte', 'next.js', 'react'] as ProjectProfile['frameworks']
    };
    const result = reviewAgentsMd(content, driftedProfile);
    expect(result.findings.some(f => f.severity === 'warning' && f.message.includes('svelte'))).toBe(true);
  });

  it('flags bloat when file is too long', () => {
    const longContent = `# AGENTS.md\n\n## Project\n\n${'- line\n'.repeat(250)}\n## Commands\n\n## Conventions\n`;
    const result = reviewAgentsMd(longContent, profile('/test'));
    expect(result.findings.some(f => f.severity === 'warning' && f.message.includes('lines'))).toBe(true);
  });

  it('flags stale timestamp', () => {
    const oldContent =
      '# AGENTS.md\n\n*Auto-generated at 2020-01-01T00:00:00.000Z*\n\n## Project\n\n## Commands\n\n## Conventions\n';
    const result = reviewAgentsMd(oldContent, profile('/test'));
    expect(result.findings.some(f => f.severity === 'info' && f.message.includes('days ago'))).toBe(true);
  });

  it('flags missing Atlas manifest when agent has one', () => {
    const content = generateAgentsMd(profile('/test'), config()); // no atlas
    const result = reviewAgentsMd(content, profile('/test'), { hasAtlasManifest: true });
    expect(result.findings.some(f => f.message.includes('Atlas manifest'))).toBe(true);
  });

  it('does not flag missing Atlas when agent does not have one', () => {
    const content = generateAgentsMd(profile('/test'), config());
    const result = reviewAgentsMd(content, profile('/test'), { hasAtlasManifest: false });
    expect(result.findings.some(f => f.message.includes('Atlas manifest'))).toBe(false);
  });

  it('recommends regeneration when many warnings', () => {
    const content = '# AGENTS.md\n\n## Project\n\n## Commands\n\n## Conventions\n';
    const driftedProfile: ProjectProfile = {
      ...profile('/test'),
      frameworks: ['svelte', 'astro', 'vue'] as ProjectProfile['frameworks'],
      languages: ['python', 'rust'] as ProjectProfile['languages'],
      packageManager: 'cargo'
    };
    const result = reviewAgentsMd(content, driftedProfile);
    expect(result.shouldRegenerate).toBe(true);
  });
});
