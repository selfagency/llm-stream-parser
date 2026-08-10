import { describe, expect, it } from 'vitest';

import {
  COMPACTION_SECTIONS,
  type CompactionSection,
  compactToTemplate,
  createCompactionTemplate,
  createCompactionTemplateData,
  estimateTokenCount,
  parseCompactionTemplate,
  renderCompactionTemplate,
  truncateSectionContent,
  validateCompactionTemplate
} from './compaction-template.js';

describe('compaction-template – constants', () => {
  it('has exactly 8 stable sections in defined order', () => {
    expect(COMPACTION_SECTIONS).toHaveLength(8);
    expect([...COMPACTION_SECTIONS]).toEqual([
      'Goal',
      'Constraints',
      'Progress',
      'Decisions',
      'Next Steps',
      'Critical Context',
      'Relevant Files',
      'Session Meta'
    ]);
  });

  it('sections are grep-able strings (no special chars)', () => {
    for (const section of COMPACTION_SECTIONS) {
      expect(section).toMatch(/^[A-Za-z ]+$/);
    }
  });
});

describe('createCompactionTemplateData', () => {
  it('creates empty data with all keys', () => {
    const data = createCompactionTemplateData();
    expect(data.goal).toBe('');
    expect(data.constraints).toBe('');
    expect(data.progress).toBe('');
    expect(data.decisions).toBe('');
    expect(data.nextSteps).toBe('');
    expect(data.criticalContext).toBe('');
    expect(data.relevantFiles).toBe('');
    expect(data.sessionMeta).toBe('');
  });

  it('normalizes whitespace', () => {
    const data = createCompactionTemplateData({ goal: '  hello  \n' });
    expect(data.goal).toBe('hello');
  });
});

describe('renderCompactionTemplate', () => {
  it('renders all 8 sections', () => {
    const data = {
      goal: 'Implement compaction template',
      constraints: 'ESM-first, no any',
      progress: 'Template created',
      decisions: 'Use markdown headers',
      nextSteps: 'Add integration',
      criticalContext: 'Must be grep-able',
      relevantFiles: 'packages/core/src/compression/*',
      sessionMeta: 'session-123'
    };
    const md = renderCompactionTemplate(data);

    for (const section of COMPACTION_SECTIONS) {
      expect(md).toContain(`## ${section}`);
    }
  });

  it('uses placeholder for missing sections', () => {
    const md = renderCompactionTemplate({});
    expect(md).toContain('_No content recorded._');
    // Still contains all headers even when empty
    for (const section of COMPACTION_SECTIONS) {
      expect(md).toContain(`## ${section}`);
    }
  });

  it('handles partially filled data', () => {
    const md = renderCompactionTemplate({ goal: 'Only goal set' });
    expect(md).toContain('Only goal set');
    expect(md).toContain('## Constraints');
    expect(md).toContain('## Progress');
  });

  it('renders custom title and placeholder', () => {
    const md = renderCompactionTemplate({ goal: '' }, { title: '# Custom Title', placeholder: '_empty_' });
    expect(md.startsWith('# Custom Title')).toBe(true);
    expect(md).toContain('_empty_');
  });

  it('renders TOC when requested', () => {
    const md = renderCompactionTemplate({ goal: 'x' }, { includeToc: true });
    expect(md).toContain('## Table of Contents');
    expect(md).toContain('[Goal]');
  });

  it('output is valid Markdown file (starts with #)', () => {
    const md = renderCompactionTemplate({ goal: 'test' });
    expect(md.trimStart().startsWith('#')).toBe(true);
  });
});

describe('parseCompactionTemplate', () => {
  it('round-trips rendered template', () => {
    const original = {
      goal: 'Build feature X',
      constraints: 'Must be fast',
      progress: 'Done 50%',
      decisions: 'Use factory pattern',
      nextSteps: 'Write tests',
      criticalContext: 'Important context here',
      relevantFiles: 'src/foo.ts\nsrc/bar.ts',
      sessionMeta: 'id: abc-123\ncreated: 2026-07-29'
    };
    const md = renderCompactionTemplate(original);
    const parsed = parseCompactionTemplate(md);

    expect(parsed.goal).toBe(original.goal);
    expect(parsed.constraints).toBe(original.constraints);
    expect(parsed.progress).toBe(original.progress);
    expect(parsed.decisions).toBe(original.decisions);
    expect(parsed.nextSteps).toBe(original.nextSteps);
    expect(parsed.criticalContext).toBe(original.criticalContext);
    expect(parsed.relevantFiles).toBe(original.relevantFiles);
    expect(parsed.sessionMeta).toBe(original.sessionMeta);
  });

  it('handles missing sections → empty strings', () => {
    const md = '# Session\n\n## Goal\n\nOnly goal\n';
    const parsed = parseCompactionTemplate(md);
    expect(parsed.goal).toBe('Only goal');
    expect(parsed.constraints).toBe('');
    expect(parsed.progress).toBe('');
  });

  it('handles empty input', () => {
    const parsed = parseCompactionTemplate('');
    for (const key of Object.keys(parsed) as Array<keyof typeof parsed>) {
      expect(parsed[key]).toBe('');
    }
  });

  it('ignores unknown sections but keeps known ones', () => {
    const md = `
## Goal
my goal

## Unknown Section
should be ignored

## Progress
some progress
`;
    const parsed = parseCompactionTemplate(md);
    expect(parsed.goal).toBe('my goal');
    expect(parsed.progress).toBe('some progress');
  });

  it('is case-insensitive for header matching', () => {
    const md = `
## goal
lowercase

## CONSTRAINTS
uppercase
`;
    const parsed = parseCompactionTemplate(md);
    expect(parsed.goal).toBe('lowercase');
    expect(parsed.constraints).toBe('uppercase');
  });

  it('handles placeholder content as empty', () => {
    const md = `
## Goal
_No content recorded._

## Progress
Real content
`;
    const parsed = parseCompactionTemplate(md);
    expect(parsed.goal).toBe('');
    expect(parsed.progress).toBe('Real content');
  });
});

describe('validateCompactionTemplate', () => {
  it('validates complete template', () => {
    const md = renderCompactionTemplate({
      goal: 'g',
      constraints: 'c',
      progress: 'p',
      decisions: 'd',
      nextSteps: 'n',
      criticalContext: 'cc',
      relevantFiles: 'rf',
      sessionMeta: 'sm'
    });
    const { valid, missingSections } = validateCompactionTemplate(md);
    expect(valid).toBe(true);
    expect(missingSections).toHaveLength(0);
  });

  it('detects missing sections', () => {
    const md = '## Goal\ncontent\n## Progress\nmore';
    const { valid, missingSections } = validateCompactionTemplate(md);
    expect(valid).toBe(false);
    expect(missingSections.length).toBeGreaterThan(0);
    expect(missingSections).not.toContain('Goal' as CompactionSection);
    expect(missingSections).not.toContain('Progress' as CompactionSection);
    expect(missingSections).toContain('Constraints' as CompactionSection);
  });
});

describe('createCompactionTemplate factory', () => {
  it('creates renderer with custom defaults', () => {
    const template = createCompactionTemplate({
      defaultTitle: '# My Title',
      defaultPlaceholder: '_none_'
    });

    const md = template.render({});
    expect(md).toContain('# My Title');
    expect(md).toContain('_none_');

    const parsed = template.parse(md);
    expect(parsed.goal).toBe('');

    const data = template.createData({ goal: 'hi' });
    expect(data.goal).toBe('hi');

    const v = template.validate(md);
    expect(v.valid).toBe(true);
  });

  it('render options override factory defaults', () => {
    const template = createCompactionTemplate({
      defaultTitle: '# Factory Title'
    });
    const md = template.render({}, { title: '# Override' });
    expect(md).toContain('# Override');
    expect(md).not.toContain('# Factory Title');
  });
});

describe('truncateSectionContent', () => {
  it('does not truncate when within limit', () => {
    const content = 'short content';
    expect(truncateSectionContent(content, 100)).toBe(content);
  });

  it('truncates and adds indicator', () => {
    const content = 'a'.repeat(200);
    const truncated = truncateSectionContent(content, 100);
    expect(truncated.length).toBeLessThanOrEqual(100 + 50);
    expect(truncated).toContain('[truncated');
  });
});

describe('estimateTokenCount', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokenCount('abcd')).toBe(1);
    expect(estimateTokenCount('abcdefgh')).toBe(2);
  });
});

describe('compactToTemplate – budget enforcement', () => {
  it('renders without budget as normal', () => {
    const md = compactToTemplate({ goal: 'test goal' });
    expect(md).toContain('## Goal');
    expect(md).toContain('test goal');
  });

  it('truncates to fit maxChars while preserving 8 sections', () => {
    const largeContent = 'x'.repeat(5000);
    const data = {
      goal: largeContent,
      constraints: largeContent,
      progress: largeContent,
      decisions: largeContent,
      nextSteps: largeContent,
      criticalContext: largeContent,
      relevantFiles: largeContent,
      sessionMeta: largeContent
    };

    const md = compactToTemplate(data, { maxChars: 2000 });
    expect(md.length).toBeLessThanOrEqual(2000);
    for (const section of COMPACTION_SECTIONS) {
      expect(md).toContain(`## ${section}`);
    }
  });

  it('truncates via maxTokens', () => {
    const large = 'y'.repeat(4000);
    const md = compactToTemplate({ goal: large }, { maxTokens: 200 });
    expect(md.length).toBeLessThanOrEqual(200 * 4 + 100); // some slack for structure
    expect(md).toContain('## Goal');
  });
});

describe('integration – long session compaction produces valid Markdown with all 8 headers', () => {
  it('simulates long session → compacted markdown with 8 headers', () => {
    // Simulate a long session with lots of context
    const longSessionData = {
      goal: 'Implement Sprint 10 features including structured compaction, rollout, shell, etc.',
      constraints: `ESM-first .js extensions
Factory functions
No any types
TDD with colocated tests
Package boundaries: shared is base
pnpm check-types clean
ultracite check clean`.repeat(5),
      progress: `Completed items: repo-map, edit-formats, dirty-json, hooks, context, tree, guardian.
In progress: event rollout, websocket, epoch, compaction template.
Pending: persistent shell, deny filtering, slash args, pi-iso, etc.`.repeat(10),
      decisions: `
- Use Markdown template for compaction (grep-able)
- 8 sections fixed order
- Factory function createCompactionTemplate
- Placeholder for missing content
- Budget enforcement via truncation`.repeat(5),
      nextSteps: `
- Integrate template into transformContext
- Update session compaction pipeline
- Add tests
- Demo live`.repeat(5),
      criticalContext:
        'Must preserve essential context under token budget. Existing compression pipeline must not break.'.repeat(10),
      relevantFiles: `
packages/core/src/compression/compaction-template.ts
packages/core/src/context/compression/index.ts
packages/core/src/context/transform-context.ts
`.repeat(20),
      sessionMeta: `sessionId: 2026-07-29-sprint-10
created: 2026-07-29T10:00:00Z
tokens: 125000
model: claude-opus-4`.repeat(5)
    };

    const compacted = compactToTemplate(longSessionData, { maxChars: 8000 });

    // Must contain all 8 sections
    for (const section of COMPACTION_SECTIONS) {
      expect(compacted).toContain(`## ${section}`);
    }

    // Must be parsable
    const parsed = parseCompactionTemplate(compacted);
    expect(parsed.goal.length).toBeGreaterThan(0);

    // Must be valid
    const { valid } = validateCompactionTemplate(compacted);
    expect(valid).toBe(true);

    // Must be markdown (starts with #)
    expect(compacted.trimStart().startsWith('#')).toBe(true);

    // Must be under budget
    expect(compacted.length).toBeLessThanOrEqual(8000);
  });

  it('compaction preserves essential context (goal is not lost when truncating)', () => {
    const data = {
      goal: 'CRITICAL GOAL: Must not be lost',
      progress: 'x'.repeat(10_000),
      constraints: 'y'.repeat(10_000)
    };
    const md = compactToTemplate(data, { maxChars: 1500 });
    // Even under budget pressure, goal header exists (content may be truncated but header present)
    expect(md).toContain('## Goal');
    // Parsing should still yield something (even if truncated)
    const parsed = parseCompactionTemplate(md);
    expect(parsed.goal).toContain('CRITICAL GOAL');
  });
});
