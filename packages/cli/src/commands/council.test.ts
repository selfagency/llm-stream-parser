import { COUNCIL_PRESETS, type CouncilDefinition, type CouncilResult } from '@agentsy/orchestrator/council';
import { describe, expect, it, vi } from 'vitest';

import {
  buildCustomDefinition,
  parseChairman,
  parseMembers,
  parseTimeout,
  resolvePreset,
  runCouncilCommand
} from './council.js';

function makeIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (msg: string) => {
        stdout.push(msg);
      },
      stderr: (msg: string) => {
        stderr.push(msg);
      }
    },
    stdout,
    stderr,
    combined: () => [...stdout, ...stderr].join('\n'),
    out: () => stdout.join('\n'),
    err: () => stderr.join('\n')
  };
}

function mockCouncilResult(overrides?: Partial<CouncilResult>): CouncilResult {
  return {
    chairman: { model: 'claude-sonnet-4-5', provider: 'anthropic' },
    dissentingOpinions: [],
    finalAnswer: 'This is the final synthesized answer from the chairman.',
    opinions: [],
    rankings: [
      {
        member: { model: 'claude-sonnet-4-5', provider: 'anthropic', role: 'architect' },
        avgScore: 18.5
      },
      { member: { model: 'gpt-4o', provider: 'openai', role: 'implementer' }, avgScore: 17.2 }
    ],
    reviews: [],
    totalDurationMs: 250,
    totalTokenUsage: { input: 900, output: 800 },
    ...overrides
  };
}

describe('council command - parsing helpers', () => {
  describe('parseMembers', () => {
    it('parses comma-separated model names', () => {
      const members = parseMembers('claude-4,gemini-2.5-pro,gpt-4o');
      expect(members).toHaveLength(3);
      expect(members[0]?.model).toBe('claude-4');
      expect(members[1]?.model).toBe('gemini-2.5-pro');
      expect(members[2]?.model).toBe('gpt-4o');
      expect(members[0]?.provider).toBe('auto');
    });

    it('parses model:provider syntax', () => {
      const members = parseMembers('claude-sonnet-4-5:anthropic,gpt-4o:openai');
      expect(members[0]).toMatchObject({ model: 'claude-sonnet-4-5', provider: 'anthropic' });
      expect(members[1]).toMatchObject({ model: 'gpt-4o', provider: 'openai' });
    });

    it('parses model@provider syntax', () => {
      const members = parseMembers('claude-4@anthropic,gemini@google');
      expect(members[0]).toMatchObject({ model: 'claude-4', provider: 'anthropic' });
      expect(members[1]).toMatchObject({ model: 'gemini', provider: 'google' });
    });

    it('throws on empty string', () => {
      expect(() => parseMembers('')).toThrow();
    });

    it('trims whitespace', () => {
      const members = parseMembers('  claude-4 , gpt-4o  ');
      expect(members).toHaveLength(2);
    });
  });

  describe('parseChairman', () => {
    it('parses single chairman', () => {
      const chairman = parseChairman('claude-4-opus');
      expect(chairman.model).toBe('claude-4-opus');
      expect(chairman.provider).toBe('auto');
    });

    it('parses chairman with provider', () => {
      const chairman = parseChairman('claude-4-opus:anthropic');
      expect(chairman.model).toBe('claude-4-opus');
      expect(chairman.provider).toBe('anthropic');
    });
  });

  describe('parseTimeout', () => {
    it('parses valid timeout', () => {
      expect(parseTimeout('120000')).toBe(120 * 1000);
      expect(parseTimeout('5000')).toBe(5 * 1000);
    });

    it('returns undefined for null', () => {
      expect(parseTimeout(null)).toBeUndefined();
    });

    it('throws on invalid values', () => {
      expect(() => parseTimeout('-100')).toThrow();
      expect(() => parseTimeout('0')).toThrow();
      expect(() => parseTimeout('abc')).toThrow();
    });
  });

  describe('resolvePreset', () => {
    it('resolves known presets', () => {
      const preset = resolvePreset('coding');
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('Coding Council');
      expect(preset?.members.length).toBeGreaterThan(0);
    });

    it('returns undefined for unknown preset', () => {
      expect(resolvePreset('nonexistent')).toBeUndefined();
    });
  });

  describe('buildCustomDefinition', () => {
    it('builds custom definition from members and chairman', () => {
      const def = buildCustomDefinition({
        chairmanStr: 'claude-4-opus',
        membersStr: 'claude-4,gemini-2.5-pro'
      });
      expect(def.members).toHaveLength(2);
      expect(def.chairman.model).toBe('claude-4-opus');
      expect(def.domain).toBe('general');
      expect(def.name).toBe('Ad-hoc Council');
    });

    it('includes timeout when provided', () => {
      const def = buildCustomDefinition({
        chairmanStr: 'claude-4-opus',
        membersStr: 'claude-4,gpt-4o',
        timeoutMs: 60 * 1000
      });
      expect(def.timeoutMs).toBe(60 * 1000);
    });
  });
});

describe('runCouncilCommand', () => {
  it('list shows presets with description and member count', async () => {
    const { io, out } = makeIo();
    const code = await runCouncilCommand(['list'], io);
    expect(code).toBe(0);
    const output = out();
    expect(output).toContain('Available council presets');
    expect(output).toContain('coding');
    expect(output).toContain('research');
    expect(output).toContain('review');
    expect(output).toContain('architecture');
    expect(output).toContain('general');
    expect(output).toContain('members');
  });

  it('list via ls alias also works', async () => {
    const { io, out } = makeIo();
    const code = await runCouncilCommand(['ls'], io);
    expect(code).toBe(0);
    expect(out()).toContain('coding');
  });

  it('status shows no active sessions by default', async () => {
    const { io, out } = makeIo();
    const code = await runCouncilCommand(['status'], io);
    expect(code).toBe(0);
    expect(out()).toContain('No active council sessions');
  });

  it('status shows active sessions when provided', async () => {
    const { io, out } = makeIo();
    const fakeSessions = [
      {
        id: 'sess-1',
        preset: 'coding',
        prompt: 'Build a feature',
        startedAt: new Date(Date.now() - 5 * 1000),
        members: [{ model: 'claude-4', provider: 'auto' }]
      }
    ];
    const code = await runCouncilCommand(['status'], io, {
      getActiveSessions: () => fakeSessions
    });
    expect(code).toBe(0);
    const output = out();
    expect(output).toContain('sess-1');
    expect(output).toContain('coding');
    expect(output).toContain('Build a feature');
  });

  it('run with preset executes council via orchestrator', async () => {
    const { io, out } = makeIo();
    const mockExecute = vi.fn(() =>
      Promise.resolve({
        text: 'Opinion from model',
        usage: { input: 10, output: 20 }
      })
    );

    const mockExecuteCouncil = vi.fn((_: CouncilDefinition, query: string) => {
      expect(query).toBe('Explain quantum computing');
      return Promise.resolve(mockCouncilResult());
    });

    const code = await runCouncilCommand(['run', 'coding', 'Explain quantum computing'], io, {
      executeModel: mockExecute,
      executeCouncil: mockExecuteCouncil as never
    });

    expect(code).toBe(0);
    expect(mockExecuteCouncil).toHaveBeenCalled();
    const output = out();
    expect(output).toContain('Chairman Synthesis');
    expect(output).toContain('final synthesized answer');
  });

  it('run ad-hoc with members and chairman creates custom definition', async () => {
    const { io, out } = makeIo();

    let capturedDef: CouncilDefinition | undefined;
    const mockExecuteCouncil = vi.fn((def: CouncilDefinition, _query: string) => {
      capturedDef = def;
      return Promise.resolve(mockCouncilResult());
    });

    const code = await runCouncilCommand(
      ['run', '--members', 'claude-4,gemini-2.5-pro', '--chairman', 'claude-4-opus', 'What is the meaning of life?'],
      io,
      {
        executeCouncil: mockExecuteCouncil as never
      }
    );

    expect(code).toBe(0);
    expect(capturedDef).toBeDefined();
    expect(capturedDef?.members).toHaveLength(2);
    expect(capturedDef?.members[0]?.model).toBe('claude-4');
    expect(capturedDef?.members[1]?.model).toBe('gemini-2.5-pro');
    expect(capturedDef?.chairman.model).toBe('claude-4-opus');
    expect(out()).toContain('Ad-hoc Council');
  });

  it('run ad-hoc requires chairman', async () => {
    const { io, err } = makeIo();
    const code = await runCouncilCommand(['run', '--members', 'claude-4,gpt-4o', 'prompt without chairman'], io);
    expect(code).toBe(1);
    expect(err()).toContain('--chairman is required');
  });

  it('run with timeout option respected', async () => {
    const { io } = makeIo();

    let capturedTimeout: number | undefined;
    const mockExecuteCouncil = vi.fn((def: CouncilDefinition) => {
      capturedTimeout = def.timeoutMs;
      return Promise.resolve(mockCouncilResult());
    });

    const code = await runCouncilCommand(['run', 'coding', '--timeout', '60000', 'Test prompt'], io, {
      executeCouncil: mockExecuteCouncil as never
    });

    expect(code).toBe(0);
    expect(capturedTimeout).toBe(60 * 1000);
  });

  it('run prints chairman synthesis and dissenting opinions', async () => {
    const { io, out } = makeIo();

    const resultWithDissent = mockCouncilResult({
      dissentingOpinions: [
        {
          member: { model: 'gpt-4o', provider: 'openai', role: 'critic' },
          opinion: 'I disagree because of X'
        }
      ]
    });

    const mockExecuteCouncil = vi.fn(() => Promise.resolve(resultWithDissent));

    const code = await runCouncilCommand(['run', 'general', 'Some prompt'], io, {
      executeCouncil: mockExecuteCouncil as never
    });

    expect(code).toBe(0);
    const output = out();
    expect(output).toContain('Chairman Synthesis');
    expect(output).toContain('final synthesized answer');
    expect(output).toContain('Dissenting Opinions');
    expect(output).toContain('I disagree');
  });

  it('run with unknown preset returns error', async () => {
    const { io, err } = makeIo();
    const code = await runCouncilCommand(['run', 'nonexistent', 'prompt'], io);
    expect(code).toBe(1);
    expect(err()).toContain('unknown preset');
  });

  it('run without prompt returns error', async () => {
    const { io, err } = makeIo();
    const code = await runCouncilCommand(['run', 'coding'], io);
    expect(code).toBe(1);
    expect(err()).toContain('prompt is required');
  });

  it('help shows usage', async () => {
    const { io, out } = makeIo();
    const code = await runCouncilCommand(['help'], io);
    expect(code).toBe(0);
    expect(out()).toContain('agentsy council');
    expect(out()).toContain('Presets');
  });

  it('unknown subcommand returns error', async () => {
    const { io, err } = makeIo();
    const code = await runCouncilCommand(['unknown'], io);
    expect(code).toBe(1);
    expect(err()).toContain('Unknown council subcommand');
  });

  it('json flag outputs raw JSON result', async () => {
    const { io, out } = makeIo();
    const mockResult = mockCouncilResult({ finalAnswer: 'JSON answer' });
    const mockExecuteCouncil = vi.fn(() => Promise.resolve(mockResult));

    const code = await runCouncilCommand(['run', 'coding', '--json', 'Test'], io, {
      executeCouncil: mockExecuteCouncil as never
    });

    expect(code).toBe(0);
    const output = out();
    expect(output).toContain('"finalAnswer"');
    expect(output).toContain('JSON answer');
  });

  it('uses injected presets for testing', async () => {
    const { io } = makeIo();
    const customPresets: Record<string, CouncilDefinition> = {
      custom: {
        name: 'Custom Preset',
        description: 'My custom preset',
        domain: 'general',
        members: [{ model: 'test-model', provider: 'test' }],
        chairman: { model: 'chair-model', provider: 'test' }
      }
    };

    const mockExecuteCouncil = vi.fn(() => Promise.resolve(mockCouncilResult()));

    const code = await runCouncilCommand(['run', 'custom', 'Hello'], io, {
      presets: customPresets,
      executeCouncil: mockExecuteCouncil as never
    });

    expect(code).toBe(0);
    expect(mockExecuteCouncil).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Custom Preset' }),
      expect.any(String),
      expect.any(Object)
    );
  });

  it('integration: council command works via runCli', async () => {
    const { runCli } = await import('../index.js');
    const stdout: string[] = [];
    const code = await runCli(['council', 'list'], {
      stdout: (msg: string) => {
        stdout.push(msg);
      },
      stderr: () => undefined
    });
    expect(code).toBe(0);
    const output = stdout.join('\n');
    expect(output).toContain('coding');
    expect(output).toContain('general');
  });

  it('integration: council status works via runCli', async () => {
    const { runCli } = await import('../index.js');
    const stdout: string[] = [];
    const code = await runCli(['council', 'status'], {
      stdout: (msg: string) => {
        stdout.push(msg);
      },
      stderr: () => undefined
    });
    expect(code).toBe(0);
    expect(stdout.join('\n')).toContain('No active council sessions');
  });

  it('lists all 5 required presets', () => {
    const presetNames = Object.keys(COUNCIL_PRESETS);
    expect(presetNames).toContain('coding');
    expect(presetNames).toContain('research');
    expect(presetNames).toContain('review');
    expect(presetNames).toContain('architecture');
    expect(presetNames).toContain('general');
  });
});
