import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { InstructionsDiscoverer } from './discoverer.js';

/**
 * Create a temporary project directory with instruction files for testing.
 */
async function createFixtureDir(files: Record<string, string>): Promise<string> {
  const dir = resolve(import.meta.dirname, '__fixtures__', `disc-${Date.now()}`);

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = resolve(dir, relativePath);

    await mkdir(resolve(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }

  return dir;
}

/**
 * Remove a fixture directory and its contents.
 */
async function removeFixtureDir(dir: string): Promise<void> {
  // Use dynamic import to avoid a direct dependency on `rm`.
  const { rm } = await import('node:fs/promises');
  await rm(dir, { recursive: true, force: true });
}

const fixtureDirs: string[] = [];

afterEach(async () => {
  for (const dir of fixtureDirs) {
    await removeFixtureDir(dir);
  }
  fixtureDirs.length = 0;
});

describe('InstructionsDiscoverer', () => {
  describe('constructor', () => {
    it('defaults projectDir to process.cwd()', () => {
      const d = new InstructionsDiscoverer();
      expect(d.projectDir).toBe(process.cwd());
    });

    it('accepts an explicit projectDir', () => {
      const d = new InstructionsDiscoverer(resolve(import.meta.dirname, '__fixtures__', 'test-instructions'));
      expect(d.projectDir).toBe(resolve(import.meta.dirname, '__fixtures__', 'test-instructions'));
    });

    it('initialises 7 roots with descending priority', () => {
      const d = new InstructionsDiscoverer('/project');
      const rootSpecs = [
        {
          idx: 0,
          path: '/project/.agentsy/handoffs',
          priority: 95,
          scope: 'workspace',
          alwaysInject: true,
          isGlob: true
        },
        { idx: 1, path: '/project/AGENTS.md', priority: 90, scope: 'workspace', alwaysInject: true, isGlob: undefined },
        {
          idx: 2,
          path: '/project/CLAUDE.md',
          priority: 80,
          scope: undefined,
          alwaysInject: undefined,
          isGlob: undefined
        },
        {
          idx: 3,
          path: '/project/copilot-instructions.md',
          priority: 70,
          scope: undefined,
          alwaysInject: undefined,
          isGlob: undefined
        },
        {
          idx: 4,
          path: '/project/.cursor/rules',
          priority: 60,
          scope: undefined,
          alwaysInject: undefined,
          isGlob: true
        },
        {
          idx: 5,
          path: '.agentsy/instructions.md',
          priority: 50,
          scope: 'user',
          alwaysInject: undefined,
          isGlob: undefined
        },
        {
          idx: 6,
          path: '.config/agentsy/instructions.md',
          priority: 40,
          scope: 'user',
          alwaysInject: undefined,
          isGlob: undefined
        }
      ] as const;

      expect(d.roots).toHaveLength(rootSpecs.length);
      for (const spec of rootSpecs) {
        // nosemgrep: detect-object-injection -- spec.idx is a hardcoded test constant
        const root = d.roots[spec.idx];
        expect(root).toBeDefined();
        expect(root?.path).toContain(spec.path);
        expect(root?.priority).toBe(spec.priority);
        if (spec.scope !== undefined) {
          expect(root?.scope).toBe(spec.scope);
        }
        if (spec.alwaysInject !== undefined) {
          expect(root?.alwaysInject).toBe(spec.alwaysInject);
        }
        if (spec.isGlob !== undefined) {
          expect(root?.isGlob).toBe(spec.isGlob);
        }
      }
    });
  });

  describe('discover', () => {
    it('returns empty array when no files exist', async () => {
      const emptyDir = resolve(import.meta.dirname, '__fixtures__', `empty-${Date.now()}`);
      await mkdir(emptyDir, { recursive: true });
      fixtureDirs.push(emptyDir);

      const d = new InstructionsDiscoverer(emptyDir);
      const results = await d.discover();

      expect(results).toHaveLength(0);
    });

    it('discovers project-level instruction files', async () => {
      const dir = await createFixtureDir({
        'AGENTS.md': '# Agents',
        'CLAUDE.md': '# Claude'
      });
      fixtureDirs.push(dir);

      const d = new InstructionsDiscoverer(dir);
      const results = await d.discover();

      // Only the files that exist in the project dir (2) — user roots won't exist
      expect(results.length).toBeGreaterThanOrEqual(2);

      const agents = results.find(r => r.path.endsWith('AGENTS.md'));
      expect(agents).toBeDefined();
      expect(agents?.content).toBe('# Agents');
      expect(agents?.priority).toBe(90);
      expect(agents?.scope).toBe('workspace');
      expect(agents?.alwaysInject).toBe(true);

      const claude = results.find(r => r.path.endsWith('CLAUDE.md'));
      expect(claude).toBeDefined();
      expect(claude?.content).toBe('# Claude');
      expect(claude?.priority).toBe(80);
    });

    it('discovers .cursor/rules/*.md glob files', async () => {
      const dir = await createFixtureDir({
        '.cursor/rules/typescript.md': 'strict mode',
        '.cursor/rules/testing.md': 'vitest'
      });
      fixtureDirs.push(dir);

      const d = new InstructionsDiscoverer(dir);
      const results = await d.discover();

      const rules = results.filter(r => r.path.includes('.cursor/rules'));
      expect(rules).toHaveLength(2);

      const tsRule = rules.find(r => r.path.endsWith('typescript.md'));
      expect(tsRule).toBeDefined();
      expect(tsRule?.content).toBe('strict mode');
      expect(tsRule?.priority).toBe(60);
      expect(tsRule?.scope).toBe('workspace');
      expect(tsRule?.alwaysInject).toBe(false);
    });

    it('filters non-.md files from glob roots', async () => {
      const dir = await createFixtureDir({
        '.cursor/rules/config.json': '{}',
        '.cursor/rules/style.md': 'clean code'
      });
      fixtureDirs.push(dir);

      const d = new InstructionsDiscoverer(dir);
      const results = await d.discover();

      const rules = results.filter(r => r.path.includes('.cursor/rules'));
      expect(rules).toHaveLength(1);
      expect(rules[0]?.path).toContain('style.md');
    });

    it('returns results sorted by priority descending', async () => {
      const dir = await createFixtureDir({
        'AGENTS.md': '# top',
        'CLAUDE.md': '# mid',
        'not-copilot-instructions.md': '' // This one won't be discovered — need the actual filename
      });
      fixtureDirs.push(dir);

      // Also create .cursor/rules
      await mkdir(resolve(dir, '.cursor', 'rules'), { recursive: true });
      await writeFile(resolve(dir, '.cursor', 'rules', 'test.md'), '# low', 'utf-8');

      const d = new InstructionsDiscoverer(dir);
      const results = await d.discover();

      for (let i = 1; i < results.length; i++) {
        const current = results[i];
        const prev = results[i - 1];
        if (current === undefined || prev === undefined) {
          throw new Error('unexpected undefined');
        }
        expect(current.priority).toBeLessThanOrEqual(prev.priority);
      }
    });

    it('skips non-existent files silently', async () => {
      const dir = await createFixtureDir({
        'AGENTS.md': '# only this'
      });
      fixtureDirs.push(dir);

      const d = new InstructionsDiscoverer(dir);
      const results = await d.discover();

      expect(results).toHaveLength(1);
      expect(results[0]?.path).toContain('AGENTS.md');
    });

    it('handles unreadable files gracefully', async () => {
      const dir = await createFixtureDir({
        'AGENTS.md': '# ok',
        'CLAUDE.md': '# claude'
      });
      fixtureDirs.push(dir);

      await mkdir(resolve(dir, '.cursor', 'rules'), { recursive: true });

      const claudePath = resolve(dir, 'CLAUDE.md');
      await import('node:fs/promises').then(fs => fs.chmod(claudePath, 0o000));

      const d = new InstructionsDiscoverer(dir);
      const results = await d.discover();

      const hasClaude = results.some(r => r.path.endsWith('CLAUDE.md'));
      expect(hasClaude).toBe(false);

      const hasAgents = results.some(r => r.path.endsWith('AGENTS.md'));
      expect(hasAgents).toBe(true);

      // Restore permissions for cleanup
      await import('node:fs/promises').then(fs => fs.chmod(claudePath, 0o644)); // NOSONAR — safe permission
    });

    it('deduplicates content across roots when discovered', async () => {
      const dir = await createFixtureDir({
        'AGENTS.md': '# agent content',
        'CLAUDE.md': '# claude content'
      });
      fixtureDirs.push(dir);

      const d = new InstructionsDiscoverer(dir);
      const results = await d.discover();

      const contents = results.map(r => r.content);
      const unique = new Set(contents);

      expect(unique.size).toBe(contents.length); // No duplicates
    });

    it('includes absolute paths in results', async () => {
      const dir = await createFixtureDir({
        'AGENTS.md': '# agents'
      });
      fixtureDirs.push(dir);

      const d = new InstructionsDiscoverer(dir);
      const results = await d.discover();

      expect(results[0]?.path.startsWith('/')).toBe(true);
      expect(results[0]?.path).toBe(resolve(dir, 'AGENTS.md'));
    });

    it('discovers HANDOFF_*.md files at highest priority', async () => {
      const dir = await createFixtureDir({
        'AGENTS.md': '# agents',
        '.agentsy/handoffs/HANDOFF_agent-1.md': '# Handoff — Agent agent-1\n\n## Goal\n\nTest goal'
      });
      fixtureDirs.push(dir);

      const d = new InstructionsDiscoverer(dir);
      const results = await d.discover();

      // Handoff should be first (priority 95 > AGENTS.md priority 90)
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results[0]?.path).toContain('HANDOFF_agent-1.md');
      expect(results[0]?.priority).toBe(95);
      expect(results[0]?.alwaysInject).toBe(true);
      expect(results[1]?.path).toContain('AGENTS.md');
      expect(results[1]?.priority).toBe(90);
    });

    it('discovers multiple handoff files', async () => {
      const dir = await createFixtureDir({
        '.agentsy/handoffs/HANDOFF_agent-1.md': '# Handoff 1',
        '.agentsy/handoffs/HANDOFF_agent-2.md': '# Handoff 2'
      });
      fixtureDirs.push(dir);

      const d = new InstructionsDiscoverer(dir);
      const results = await d.discover();

      const handoffResults = results.filter(r => r.path.includes('HANDOFF_'));
      expect(handoffResults).toHaveLength(2);
      for (const r of handoffResults) {
        expect(r.priority).toBe(95);
        expect(r.alwaysInject).toBe(true);
      }
    });
  });
});
