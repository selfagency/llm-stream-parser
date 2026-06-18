import { describe, expect, it, vi } from 'vitest';
import { GuardrailPipeline } from './pipeline.js';
import type { GuardrailResult, GuardrailScanner } from './types.js';

function makePassScanner(id: string, priority = 100): GuardrailScanner {
  return {
    metadata: { id, name: id, version: '1.0.0', description: '', priority, owaspCategories: [], tags: [] },
    evaluate: vi.fn(async () => ({ status: 'pass' as const, phase: 'input' as const }))
  };
}

function makeBlockScanner(id: string, reason: string, priority = 100): GuardrailScanner {
  return {
    metadata: { id, name: id, version: '1.0.0', description: '', priority, owaspCategories: [], tags: [] },
    evaluate: vi.fn(async () => ({ status: 'block' as const, phase: 'input' as const, reason }))
  };
}

function makeTransformScanner(id: string, sanitized: string, priority = 100): GuardrailScanner {
  return {
    metadata: { id, name: id, version: '1.0.0', description: '', priority, owaspCategories: [], tags: [] },
    evaluate: vi.fn(async () => ({ status: 'transform' as const, phase: 'input' as const, sanitized }))
  };
}

function makeEscalateScanner(id: string, reason: string, score: number, priority = 100): GuardrailScanner {
  return {
    metadata: { id, name: id, version: '1.0.0', description: '', priority, owaspCategories: [], tags: [] },
    evaluate: vi.fn(async () => ({ status: 'escalate' as const, phase: 'approval' as const, reason, riskScore: score }))
  };
}

describe('GuardrailPipeline', () => {
  it('returns pass when no scanners registered', async () => {
    const pipeline = new GuardrailPipeline();
    const { result } = await pipeline.evaluate('test', 'input');
    expect(result.status).toBe('pass');
  });

  it('short-circuits on first block by default', async () => {
    const pipeline = new GuardrailPipeline();
    pipeline.add(
      makeBlockScanner('block-1', 'First block'),
      makePassScanner('pass-1'),
      makeBlockScanner('block-2', 'Should not run')
    );
    const { result } = await pipeline.evaluate('test', 'input');
    expect(result.status).toBe('block');
    expect((result as Extract<GuardrailResult, { status: 'block' }>).reason).toBe('First block');
    // Only first scanner should have been called
    const scanners = pipeline.listScanners();
    expect(scanners[0]?.evaluate as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
    // The 3rd scanner should NOT have been called since block-1 short-circuits
  });

  it('returns pass when all scanners pass', async () => {
    const pipeline = new GuardrailPipeline();
    pipeline.add(makePassScanner('pass-1'), makePassScanner('pass-2'));
    const { result } = await pipeline.evaluate('test', 'input');
    expect(result.status).toBe('pass');
  });

  it('respects priority ordering', async () => {
    const pipeline = new GuardrailPipeline();
    const calls: string[] = [];
    const scanner = (id: string, prio: number) => ({
      metadata: {
        id,
        name: id,
        version: '1.0.0',
        description: '',
        priority: prio,
        owaspCategories: [],
        tags: []
      },
      // biome-ignore lint/suspicious/useAwait: required by GuardrailScanner interface
      evaluate: async () => {
        calls.push(id);
        return { status: 'pass' as const, phase: 'input' as const };
      }
    });
    pipeline.add(scanner('low', 300), scanner('high', 10), scanner('mid', 100));
    await pipeline.evaluate('test', 'input');
    expect(calls).toEqual(['high', 'mid', 'low']);
  });

  it('transform is returned when no block occurs', async () => {
    const pipeline = new GuardrailPipeline();
    pipeline.add(
      makePassScanner('pass-1'),
      makeTransformScanner('transform-1', 'sanitized_output'),
      makePassScanner('pass-2')
    );
    const { result } = await pipeline.evaluate('raw input', 'input');
    expect(result.status).toBe('transform');
    expect((result as Extract<GuardrailResult, { status: 'transform' }>).sanitized).toBe('sanitized_output');
  });

  it('escalate is returned when no block or transform', async () => {
    const pipeline = new GuardrailPipeline();
    pipeline.add(makePassScanner('pass-1'), makeEscalateScanner('esc-1', 'Suspicious activity', 0.75));
    const { result } = await pipeline.evaluate('test', 'input');
    expect(result.status).toBe('escalate');
    expect((result as Extract<GuardrailResult, { status: 'escalate' }>).riskScore).toBe(0.75);
  });

  it('block overrides transform when both fire', async () => {
    const pipeline = new GuardrailPipeline();
    pipeline.add(
      makePassScanner('pass-1'),
      makeTransformScanner('transform-1', 'cleaned'),
      makeBlockScanner('block-1', 'Policy violation')
    );
    const { result } = await pipeline.evaluate('test', 'input');
    expect(result.status).toBe('block');
  });

  it('remove() unregisters a scanner', () => {
    const pipeline = new GuardrailPipeline();
    pipeline.add(makeBlockScanner('block-1', 'Should be removed'));
    pipeline.remove('block-1');
    expect(pipeline.size).toBe(0);
  });

  it('configure() updates pipeline settings', async () => {
    const pipeline = new GuardrailPipeline();
    pipeline.configure({ shortCircuitOnBlock: false });
    const s1 = makeBlockScanner('block-1', 'First block');
    const s2 = makeBlockScanner('block-2', 'Second block');
    pipeline.add(s1, s2);
    const { result } = await pipeline.evaluate('test', 'input');
    // Both scanners run, but only first block is returned (no short-circuit after block-1)
    // Actually without short-circuit, both run and the first block is returned
    expect(result.status).toBe('block');
    expect((result as Extract<GuardrailResult, { status: 'block' }>).reason).toBe('First block');
  });

  it('chains transform output as input for subsequent scanners', async () => {
    const detectionAfterRedact: string[] = [];
    const redactThenCheck = [
      {
        metadata: {
          id: 'redact-x',
          name: 'Redact X',
          version: '1.0.0',
          description: 'Replaces X with [REDACTED]',
          priority: 10,
          owaspCategories: [],
          tags: []
        },
        // biome-ignore lint/suspicious/useAwait: must satisfy GuardrailScanner interface
        evaluate: async (inp: string) => {
          if (inp.includes('x') || inp.includes('X')) {
            return {
              status: 'transform' as const,
              phase: 'input' as const,
              sanitized: inp.replace(/x/gi, '[REDACTED]')
            };
          }
          return { status: 'pass' as const, phase: 'input' as const };
        }
      },
      {
        metadata: {
          id: 'detect-secret',
          name: 'Detect secret',
          version: '1.0.0',
          description: 'Flags lines containing SECRET',
          priority: 20,
          owaspCategories: [],
          tags: []
        },
        // biome-ignore lint/suspicious/useAwait: must satisfy GuardrailScanner interface
        evaluate: async (inp: string) => {
          if (inp.toUpperCase().includes('SECRET')) {
            detectionAfterRedact.push(inp);
            return { status: 'block' as const, phase: 'input' as const, reason: 'Secret found' };
          }
          return { status: 'pass' as const, phase: 'input' as const };
        }
      }
    ];

    const pipeline = new GuardrailPipeline();
    pipeline.add(...redactThenCheck);

    // Input contains both 'secret' and 'x' — transform should fire first,
    // then the block scanner sees the REDACTED version (which still contains 'secret')
    const input = 'The x secret is xyz';
    const { result } = await pipeline.evaluate(input, 'input');

    // The detection scanner should have been called with the REDACTED input
    // (NOT the original which contained 'secret' multiple times)
    expect(detectionAfterRedact.length).toBe(1);
    expect(detectionAfterRedact[0]).toBe('The [REDACTED] secret is [REDACTED]yz');
    expect(result.status).toBe('block');
  });

  it('clear() removes all scanners', () => {
    const pipeline = new GuardrailPipeline();
    pipeline.add(makePassScanner('pass-1'));
    pipeline.clear();
    expect(pipeline.size).toBe(0);
  });

  it('size reflects registration count', () => {
    const pipeline = new GuardrailPipeline();
    expect(pipeline.size).toBe(0);
    pipeline.add(makePassScanner('a'), makePassScanner('b'));
    expect(pipeline.size).toBe(2);
  });

  it('evaluateInput and evaluateOutput are shortcuts', async () => {
    const pipeline = new GuardrailPipeline();
    pipeline.add(makePassScanner('pass-1'));
    const { result: inputResult } = await pipeline.evaluateInput('test');
    expect(inputResult.status).toBe('pass');
    const { result: outputResult } = await pipeline.evaluateOutput('test');
    expect(outputResult.status).toBe('pass');
  });
});
