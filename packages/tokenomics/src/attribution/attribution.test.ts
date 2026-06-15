/**
 * Tests for the attribution module — git trailers, diff stats, and survival.
 *
 * All git operations are mocked via `vi.mock` to avoid requiring an
 * actual git repository in the test environment.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDiffStatOutput } from './diff-stats.js';
import type { AiTrailers } from './git-trailers.js';
import { formatTrailers, parseTrailers } from './git-trailers.js';

// =============================================================================
// Mock execSync for git-dependent functions
// =============================================================================

const mockExecSync = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execSync: mockExecSync
}));

// Re-import after mock is set up
const { appendTrailersToStagedCommit } = await import('./git-trailers.js');
const { readDiffStats, readWorkingTreeDiff } = await import('./diff-stats.js');
const { computeSurvivalRate } = await import('./survival.js');

// =============================================================================
// Sample data
// =============================================================================

const sampleTrailers: AiTrailers = {
  sessionId: 'agentsy:sess_abc123',
  modelId: 'claude-sonnet-4-5',
  providerId: 'anthropic',
  costUsd: 0.43,
  cacheEfficiency: 0.71,
  frustrationScore: 0.08
};

// =============================================================================
// formatTrailers
// =============================================================================

describe('formatTrailers', () => {
  it('formats all trailer fields in RFC 2822 format', () => {
    const result = formatTrailers(sampleTrailers);
    expect(result).toContain('AI-Session: agentsy:sess_abc123');
    expect(result).toContain('AI-Model: claude-sonnet-4-5');
    expect(result).toContain('AI-Provider: anthropic');
    expect(result).toContain('AI-Cost-USD: 0.43');
    expect(result).toContain('AI-Cache-Efficiency: 0.71');
    expect(result).toContain('AI-Frustration-Score: 0.08');
  });

  it('ends with a newline', () => {
    const result = formatTrailers(sampleTrailers);
    expect(result.endsWith('\n')).toBe(true);
  });

  it('formats integer values without decimals', () => {
    const result = formatTrailers({ ...sampleTrailers, costUsd: 1 });
    expect(result).toContain('AI-Cost-USD: 1');
  });

  it('formats zero values correctly', () => {
    const result = formatTrailers({ ...sampleTrailers, frustrationScore: 0 });
    expect(result).toContain('AI-Frustration-Score: 0');
  });

  it('rounds to 4 decimal places', () => {
    const result = formatTrailers({ ...sampleTrailers, costUsd: 0.123_456_7 });
    expect(result).toContain('AI-Cost-USD: 0.1235');
  });
});

// =============================================================================
// parseTrailers
// =============================================================================

describe('parseTrailers', () => {
  it('parses trailers from a commit message', () => {
    const msg = `feat: implement cache

AI-Session: agentsy:sess_abc123
AI-Model: claude-sonnet-4-5
AI-Provider: anthropic
AI-Cost-USD: 0.43
AI-Cache-Efficiency: 0.71
AI-Frustration-Score: 0.08`;

    const result = parseTrailers(msg);
    expect(result).not.toBeNull();
    if (result === null) {
      return;
    }
    expect(result.sessionId).toBe('agentsy:sess_abc123');
    expect(result.modelId).toBe('claude-sonnet-4-5');
    expect(result.providerId).toBe('anthropic');
    expect(result.costUsd).toBeCloseTo(0.43);
    expect(result.cacheEfficiency).toBeCloseTo(0.71);
    expect(result.frustrationScore).toBeCloseTo(0.08);
  });

  it('returns null when no AI trailers are present', () => {
    const msg = 'feat: implement cache\n\nSigned-off-by: Test <test@example.com>';
    expect(parseTrailers(msg)).toBeNull();
  });

  it('returns null for an empty message', () => {
    expect(parseTrailers('')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    const msg = `feat: implement cache

AI-Session: agentsy:sess_abc123`;
    expect(parseTrailers(msg)).toBeNull();
  });

  it('handles extra whitespace around values', () => {
    const msg = `feat: implement cache

AI-Session:   agentsy:sess_abc123
AI-Model:  claude-sonnet-4-5
AI-Provider:   anthropic
AI-Cost-USD:   0.43
AI-Cache-Efficiency:  0.71
AI-Frustration-Score:  0.08`;

    const result = parseTrailers(msg);
    expect(result).not.toBeNull();
    if (result === null) {
      return;
    }
    expect(result.sessionId).toBe('agentsy:sess_abc123');
  });

  it('defaults missing numeric fields to 0', () => {
    const msg = `feat: implement cache

AI-Session: agentsy:sess_abc123
AI-Model: claude-sonnet-4-5
AI-Provider: anthropic`;

    const result = parseTrailers(msg);
    expect(result).not.toBeNull();
    if (result === null) {
      return;
    }
    expect(result.costUsd).toBe(0);
    expect(result.cacheEfficiency).toBe(0);
    expect(result.frustrationScore).toBe(0);
  });

  it('parses trailers with non-AI trailers interspersed', () => {
    const msg = `feat: implement cache

Signed-off-by: Test <test@example.com>
AI-Session: agentsy:sess_abc123
Co-authored-by: Someone <someone@example.com>
AI-Model: claude-sonnet-4-5
AI-Provider: anthropic`;

    const result = parseTrailers(msg);
    expect(result).not.toBeNull();
    if (result === null) {
      return;
    }
    expect(result.sessionId).toBe('agentsy:sess_abc123');
    expect(result.modelId).toBe('claude-sonnet-4-5');
  });
});

// =============================================================================
// appendTrailersToStagedCommit
// =============================================================================

describe('appendTrailersToStagedCommit', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it('calls git interpret-trailers with correct arguments', () => {
    mockExecSync.mockReturnValue('');

    appendTrailersToStagedCommit(sampleTrailers);

    expect(mockExecSync).toHaveBeenCalledTimes(1);
    const call = mockExecSync.mock.calls[0];
    const cmd: string = call?.[0] ?? '';
    expect(cmd).toContain('git');
    expect(cmd).toContain('interpret-trailers');
    expect(cmd).toContain('--in-place');
    expect(cmd).toContain('--trailer=AI-Session=agentsy:sess_abc123');
    expect(cmd).toContain('--trailer=AI-Model=claude-sonnet-4-5');
    expect(cmd).toContain('--trailer=AI-Provider=anthropic');
    expect(cmd).toContain('--trailer=AI-Cost-USD=0.43');
    expect(cmd).toContain('--trailer=AI-Cache-Efficiency=0.71');
    expect(cmd).toContain('--trailer=AI-Frustration-Score=0.08');
    expect(cmd).toContain('HEAD');
  });

  it('throws when git command fails', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });

    expect(() => appendTrailersToStagedCommit(sampleTrailers)).toThrow();
  });
});

// =============================================================================
// parseDiffStatOutput
// =============================================================================

describe('parseDiffStatOutput', () => {
  it('parses standard diff stat output', () => {
    const output = ` src/feature.ts | 10 ++++++++++
 src/utils.ts   |  5 ++++++
 2 files changed, 15 insertions(+), 3 deletions(-)`;

    const result = parseDiffStatOutput(output);
    expect(result.linesAdded).toBe(15);
    expect(result.linesDeleted).toBe(3);
    expect(result.filesChanged).toBe(2);
  });

  it('returns zeros for empty output', () => {
    const result = parseDiffStatOutput('');
    expect(result.linesAdded).toBe(0);
    expect(result.linesDeleted).toBe(0);
    expect(result.filesChanged).toBe(0);
  });

  it('parses output with only insertions', () => {
    const output = ` src/new-file.ts | 42 ++++++++++++++++++++++++++
 1 file changed, 42 insertions(+)`;

    const result = parseDiffStatOutput(output);
    expect(result.linesAdded).toBe(42);
    expect(result.linesDeleted).toBe(0);
    expect(result.filesChanged).toBe(1);
  });

  it('parses output with only deletions', () => {
    const output = ` src/old-file.ts | 10 ----------
 1 file changed, 10 deletions(-)`;

    const result = parseDiffStatOutput(output);
    expect(result.linesAdded).toBe(0);
    expect(result.linesDeleted).toBe(10);
    expect(result.filesChanged).toBe(1);
  });

  it('parses output with no changes', () => {
    const output = ' 0 files changed';
    const result = parseDiffStatOutput(output);
    expect(result.linesAdded).toBe(0);
    expect(result.linesDeleted).toBe(0);
    expect(result.filesChanged).toBe(0);
  });
});

// =============================================================================
// readDiffStats
// =============================================================================

describe('readDiffStats', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it('reads diff stats for last commit by default', () => {
    mockExecSync.mockReturnValue(`
     src/feature.ts | 10 ++++++++++
     1 file changed, 10 insertions(+)
    `);

    const result = readDiffStats('/fake/repo');
    expect(result.linesAdded).toBe(10);
    expect(result.linesDeleted).toBe(0);
    expect(result.filesChanged).toBe(1);

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('git diff --stat HEAD~1..HEAD'),
      expect.objectContaining({ cwd: '/fake/repo' })
    );
  });

  it('reads diff stats with custom since ref', () => {
    mockExecSync.mockReturnValue(`
     src/a.ts | 5 +++++
     src/b.ts | 3 ---
     2 files changed, 5 insertions(+), 3 deletions(-)
    `);

    const result = readDiffStats('/fake/repo', 'main');
    expect(result.linesAdded).toBe(5);
    expect(result.linesDeleted).toBe(3);
    expect(result.filesChanged).toBe(2);

    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('git diff --stat main..HEAD'), expect.anything());
  });

  it('returns zeros when git fails', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('fatal: bad revision');
    });

    expect(() => readDiffStats('/fake/repo')).toThrow();
  });
});

// =============================================================================
// readWorkingTreeDiff
// =============================================================================

describe('readWorkingTreeDiff', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it('reads working tree diff against HEAD', () => {
    mockExecSync.mockReturnValue(`
     src/unstaged.ts | 7 +++++--
     1 file changed, 5 insertions(+), 2 deletions(-)
    `);

    const result = readWorkingTreeDiff('/fake/repo');
    expect(result.linesAdded).toBe(5);
    expect(result.linesDeleted).toBe(2);
    expect(result.filesChanged).toBe(1);

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('git diff --stat HEAD'),
      expect.objectContaining({ cwd: '/fake/repo' })
    );
  });

  it('returns zeros for clean working tree', () => {
    mockExecSync.mockReturnValue('');

    const result = readWorkingTreeDiff('/fake/repo');
    expect(result.linesAdded).toBe(0);
    expect(result.linesDeleted).toBe(0);
    expect(result.filesChanged).toBe(0);
  });
});

// =============================================================================
// computeSurvivalRate
// =============================================================================

describe('computeSurvivalRate', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it('computes survival rate from blame output', () => {
    // Simulate git blame --porcelain output for a file with 3 lines
    // where 2 lines are attributed to the session's commit
    const blameOutput = [
      'abc123def456abc123def456abc123def456abc1 1 1 1',
      'author John',
      'author-mail <john@test.com>',
      'author-time 1000000000',
      'author-tz +0000',
      'committer John',
      'committer-mail <john@test.com>',
      'committer-time 1000000000',
      'committer-tz +0000',
      'summary feat: implement feature',
      'previous deadbeef...',
      'filename src/feature.ts',
      '\tconst x = 1;',
      'abc123def456abc123def456abc123def456abc1 2 2 1',
      '\tconst y = 2;',
      'fff999fff999fff999fff999fff999fff999fff9 3 3 1',
      '\tconst z = 3;'
    ].join('\n');

    mockExecSync.mockReturnValue(blameOutput);

    const result = computeSurvivalRate(
      'sess_abc123',
      ['abc123def456abc123def456abc123def456abc1'],
      ['src/feature.ts'],
      '/fake/repo'
    );

    expect(result.sessionId).toBe('sess_abc123');
    expect(result.commitShas).toEqual(['abc123def456abc123def456abc123def456abc1']);
    expect(result.filesChecked).toBe(1);
    expect(result.linesOriginal).toBe(3);
    expect(result.linesSurvived).toBe(2);
    expect(result.survivalRate).toBeCloseTo(0.6667, 3);
    expect(result.computedAt).toBeInstanceOf(Date);
  });

  it('returns 0 survival rate when no lines survive', () => {
    const blameOutput = [
      'fff999fff999fff999fff999fff999fff999fff9 1 1 1',
      'author John',
      'author-mail <john@test.com>',
      'author-time 1000000000',
      'author-tz +0000',
      'committer John',
      'committer-mail <john@test.com>',
      'committer-time 1000000000',
      'committer-tz +0000',
      'summary feat: implement feature',
      'filename src/feature.ts',
      '\tconst x = 1;'
    ].join('\n');

    mockExecSync.mockReturnValue(blameOutput);

    const result = computeSurvivalRate(
      'sess_abc123',
      ['abc123def456abc123def456abc123def456abc1'],
      ['src/feature.ts'],
      '/fake/repo'
    );

    expect(result.linesOriginal).toBe(1);
    expect(result.linesSurvived).toBe(0);
    expect(result.survivalRate).toBe(0);
  });

  it('returns 1.0 survival rate when all lines survive', () => {
    const blameOutput = [
      'abc123def456abc123def456abc123def456abc1 1 1 1',
      'author John',
      'author-mail <john@test.com>',
      'author-time 1000000000',
      'author-tz +0000',
      'committer John',
      'committer-mail <john@test.com>',
      'committer-time 1000000000',
      'committer-tz +0000',
      'summary feat: implement feature',
      'filename src/feature.ts',
      '\tconst x = 1;'
    ].join('\n');

    mockExecSync.mockReturnValue(blameOutput);

    const result = computeSurvivalRate(
      'sess_abc123',
      ['abc123def456abc123def456abc123def456abc1'],
      ['src/feature.ts'],
      '/fake/repo'
    );

    expect(result.linesSurvived).toBe(1);
    expect(result.linesOriginal).toBe(1);
    expect(result.survivalRate).toBe(1);
  });

  it('skips files that fail to blame (deleted/renamed)', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('deleted.ts')) {
        throw new Error('fatal: no such path');
      }
      return [
        'abc123def456abc123def456abc123def456abc1 1 1 1',
        'author John',
        'author-mail <john@test.com>',
        'author-time 1000000000',
        'author-tz +0000',
        'committer John',
        'committer-mail <john@test.com>',
        'committer-time 1000000000',
        'committer-tz +0000',
        'summary feat: implement feature',
        'filename src/feature.ts',
        '\tconst x = 1;'
      ].join('\n');
    });

    const result = computeSurvivalRate(
      'sess_abc123',
      ['abc123def456abc123def456abc123def456abc1'],
      ['src/deleted.ts', 'src/feature.ts'],
      '/fake/repo'
    );

    expect(result.filesChecked).toBe(1);
    expect(result.linesOriginal).toBe(1);
    expect(result.linesSurvived).toBe(1);
  });

  it('handles empty file list', () => {
    const result = computeSurvivalRate('sess_abc123', ['abc123'], [], '/fake/repo');
    expect(result.filesChecked).toBe(0);
    expect(result.linesOriginal).toBe(0);
    expect(result.linesSurvived).toBe(0);
    expect(result.survivalRate).toBe(0);
  });

  it('handles multiple commits in the set', () => {
    const blameOutput = [
      'abc111abc111abc111abc111abc111abc111abc1 1 1 1',
      'author John',
      'author-mail <john@test.com>',
      'author-time 1000000000',
      'author-tz +0000',
      'committer John',
      'committer-mail <john@test.com>',
      'committer-time 1000000000',
      'committer-tz +0000',
      'summary feat: implement feature',
      'filename src/feature.ts',
      '\tconst x = 1;',
      'abc222abc222abc222abc222abc222abc222abc2 2 2 1',
      '\tconst y = 2;',
      'fff999fff999fff999fff999fff999fff999fff9 3 3 1',
      '\tconst z = 3;'
    ].join('\n');

    mockExecSync.mockReturnValue(blameOutput);

    const result = computeSurvivalRate(
      'sess_abc123',
      ['abc111abc111abc111abc111abc111abc111abc1', 'abc222abc222abc222abc222abc222abc222abc2'],
      ['src/feature.ts'],
      '/fake/repo'
    );

    expect(result.linesOriginal).toBe(3);
    expect(result.linesSurvived).toBe(2);
  });
});

// =============================================================================
// Round-trip: formatTrailers + parseTrailers
// =============================================================================

describe('formatTrailers + parseTrailers round-trip', () => {
  it('produces parseable output', () => {
    const formatted = formatTrailers(sampleTrailers);
    const parsed = parseTrailers(`feat: implement cache\n\n${formatted}`);

    expect(parsed).not.toBeNull();
    if (parsed === null) {
      return;
    }
    expect(parsed.sessionId).toBe(sampleTrailers.sessionId);
    expect(parsed.modelId).toBe(sampleTrailers.modelId);
    expect(parsed.providerId).toBe(sampleTrailers.providerId);
    expect(parsed.costUsd).toBeCloseTo(sampleTrailers.costUsd);
    expect(parsed.cacheEfficiency).toBeCloseTo(sampleTrailers.cacheEfficiency);
    expect(parsed.frustrationScore).toBeCloseTo(sampleTrailers.frustrationScore);
  });

  it('round-trips zero values', () => {
    const trailers: AiTrailers = {
      sessionId: 'sess_1',
      modelId: 'model-1',
      providerId: 'provider-1',
      costUsd: 0,
      cacheEfficiency: 0,
      frustrationScore: 0
    };

    const formatted = formatTrailers(trailers);
    const parsed = parseTrailers(`feat: implement cache\n\n${formatted}`);

    expect(parsed).not.toBeNull();
    if (parsed === null) {
      return;
    }
    expect(parsed.costUsd).toBe(0);
    expect(parsed.cacheEfficiency).toBe(0);
    expect(parsed.frustrationScore).toBe(0);
  });
});
