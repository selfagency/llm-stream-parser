import { describe, expect, it, vi } from 'vitest';
import { GuardianScanner } from './guardian.js';

// =============================================================================
// Helpers
// =============================================================================

const _deny = vi.fn<(_input: string) => Promise<'allow' | 'deny'>>().mockResolvedValue('deny');
const _allow = vi.fn<(_input: string) => Promise<'allow' | 'deny'>>().mockResolvedValue('allow');

async function collectDenials(scanner: GuardianScanner, count: number, toolPrefix = 'tool'): Promise<void> {
  for (let i = 0; i < count; i++) {
    await scanner.evaluate(`${toolPrefix}${i}`);
  }
}

// =============================================================================
// Circuit breaker
// =============================================================================

describe('circuit breaker', () => {
  it('blocks after maxConsecutive consecutive denials', async () => {
    const judge = vi.fn().mockResolvedValue('deny' as const);
    const scanner = new GuardianScanner({ llmJudge: judge, maxConsecutive: 3 });

    // First 3 denials produce normal blocks (consecutive=1,2,3)
    const r1 = await scanner.evaluate('call-1');
    expect(r1.status).toBe('block');

    const r2 = await scanner.evaluate('call-2');
    expect(r2.status).toBe('block');

    const r3 = await scanner.evaluate('call-3');
    expect(r3.status).toBe('block');

    // 4th call: circuit breaker opens — judge should NOT be called
    const r4 = await scanner.evaluate('call-4');
    expect(r4.status).toBe('block');
    expect((r4 as { reason: string }).reason).toContain('Circuit breaker');
    expect(scanner.consecutiveDenials).toBe(3);
    // Judge was only called 3 times (not on circuit-breaker block)
    expect(judge).toHaveBeenCalledTimes(3);
  });

  it('does not block when consecutive denials are below threshold', async () => {
    const judge = vi.fn().mockResolvedValue('deny' as const);
    const scanner = new GuardianScanner({ llmJudge: judge, maxConsecutive: 5 });

    // 3 denials with threshold 5 should not trip the breaker
    await collectDenials(scanner, 3);

    const result = await scanner.evaluate('tool-4');
    expect(result.status).toBe('block');
    expect((result as { reason: string }).reason).not.toContain('Circuit breaker');
    expect(judge).toHaveBeenCalledTimes(4);
    expect(scanner.consecutiveDenials).toBe(4);
  });

  it('allows custom maxConsecutive threshold', async () => {
    const judge = vi.fn().mockResolvedValue('deny' as const);
    const scanner = new GuardianScanner({ llmJudge: judge, maxConsecutive: 1 });

    // First deny should still work normally
    const r1 = await scanner.evaluate('tool-1');
    expect(r1.status).toBe('block');
    expect((r1 as { reason: string }).reason).not.toContain('Circuit breaker');

    // Second call: circuit breaker triggers
    const r2 = await scanner.evaluate('tool-2');
    expect(r2.status).toBe('block');
    expect((r2 as { reason: string }).reason).toContain('Circuit breaker');
    expect(judge).toHaveBeenCalledTimes(1); // only called on the first
  });

  it('resets consecutive counter on allow, preventing false circuit break', async () => {
    const judge = vi
      .fn()
      .mockResolvedValueOnce('deny' as const)
      .mockResolvedValueOnce('deny' as const)
      .mockResolvedValueOnce('allow' as const)
      .mockResolvedValueOnce('deny' as const);
    const scanner = new GuardianScanner({ llmJudge: judge, maxConsecutive: 3 });

    // deny, deny, allow → consecutive: 1, 2, 0
    await scanner.evaluate('tool-1'); // deny → block
    await scanner.evaluate('tool-2'); // deny → block
    await scanner.evaluate('tool-3'); // allow → pass

    expect(scanner.consecutiveDenials).toBe(0);

    // Next deny should work normally (not circuit breaker)
    const r4 = await scanner.evaluate('tool-4'); // deny → block
    expect(r4.status).toBe('block');
    expect((r4 as { reason: string }).reason).not.toContain('Circuit breaker');
    expect(scanner.consecutiveDenials).toBe(1);
  });
});

// =============================================================================
// Sliding window
// =============================================================================

describe('sliding window', () => {
  it('escalates when sliding window threshold is exceeded', async () => {
    const judge = vi.fn().mockResolvedValue('deny' as const);
    // Keep maxConsecutive high to avoid circuit breaker interference
    const scanner = new GuardianScanner({
      llmJudge: judge,
      maxConsecutive: 20,
      slidingWindowThreshold: 5
    });

    // Trigger 5 denials
    await collectDenials(scanner, 5);

    // 6th denial: sliding window (5 >= 5) triggers escalation
    const result = await scanner.evaluate('tool-6');
    expect(result.status).toBe('escalate');
    expect((result as { reason: string }).reason).toContain('Sliding window threshold exceeded');
    expect((result as { riskScore: number }).riskScore).toBe(0.8);
  });

  it('does not escalate when below sliding window threshold', async () => {
    const judge = vi.fn().mockResolvedValue('deny' as const);
    const scanner = new GuardianScanner({
      llmJudge: judge,
      maxConsecutive: 20,
      slidingWindowThreshold: 10
    });

    // Only 5 denials — well below threshold of 10
    await collectDenials(scanner, 5);

    const result = await scanner.evaluate('tool-6');
    expect(result.status).toBe('block');
    expect((result as { reason: string }).reason).not.toContain('Sliding window');
  });

  it('ages out denials outside the window', async () => {
    const judge = vi.fn().mockResolvedValue('deny' as const);
    const scanner = new GuardianScanner({
      llmJudge: judge,
      maxConsecutive: 60,
      slidingWindowThreshold: 5
    });

    // Push 5 denials, then 50 passes to age them out of the window
    await collectDenials(scanner, 5);

    // Now 50 allows — each increments totalEvaluations, aging out the denials
    judge.mockResolvedValue('allow');
    for (let i = 0; i < 50; i++) {
      await scanner.evaluate(`fill-${i}`);
    }

    // Window should be empty: cutoff = 56 - 50 = 6, denials at 1-5 are ≤ 6
    expect(scanner.recentDenials.length).toBe(0);
    expect(scanner.totalEvaluations).toBe(55);

    // Next denial should block normally, not escalate
    judge.mockResolvedValue('deny');
    const result = await scanner.evaluate('tool-last');
    expect(result.status).toBe('block');
    expect((result as { reason: string }).reason).not.toContain('Sliding window');
  });

  it('accepts custom slidingWindowThreshold', async () => {
    const judge = vi.fn().mockResolvedValue('deny' as const);
    const scanner = new GuardianScanner({
      llmJudge: judge,
      maxConsecutive: 20,
      slidingWindowThreshold: 2
    });

    // 2 denials trigger the smaller threshold
    await collectDenials(scanner, 2);

    const result = await scanner.evaluate('tool-3');
    expect(result.status).toBe('escalate');
    expect((result as { reason: string }).reason).toContain('Sliding window threshold exceeded');
  });
});

// =============================================================================
// Default judge (safe fallback)
// =============================================================================

describe('default judge', () => {
  it('defaults to allow when no judge is provided', async () => {
    const scanner = new GuardianScanner();
    const result = await scanner.evaluate('any-tool-call');
    expect(result.status).toBe('pass');
  });
});

// =============================================================================
// GuardrailScanner interface compliance
// =============================================================================

describe('GuardrailScanner interface compliance', () => {
  it('has correct metadata shape', () => {
    const judge = vi.fn().mockResolvedValue('allow' as const);
    const scanner = new GuardianScanner({ llmJudge: judge });

    expect(scanner.metadata.id).toBe('hub://guardrails/guardian');
    expect(scanner.metadata.name).toBe('Guardian LLM-as-Judge Scanner');
    expect(scanner.metadata.priority).toBe(60);
    expect(scanner.metadata.version).toBe('1.0.0');
    expect(scanner.metadata.tags).toContain('llm-judge');
    expect(scanner.metadata.tags).toContain('circuit-breaker');
    expect(scanner.metadata.tags).toContain('tool-input');
    expect(scanner.metadata.owaspCategories).toContain('asi-03');
  });

  it('evaluate is async and returns GuardrailResult', async () => {
    const judge = vi.fn().mockResolvedValue('allow' as const);
    const scanner = new GuardianScanner({ llmJudge: judge });
    const result = await scanner.evaluate('tool-call');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('phase');
  });

  it('returns tool-input phase in results', async () => {
    const judge = vi.fn().mockResolvedValue('allow' as const);
    const scanner = new GuardianScanner({ llmJudge: judge });
    const pass = await scanner.evaluate('tool');
    expect(pass.phase).toBe('tool-input');

    judge.mockResolvedValue('deny');
    const block = await scanner.evaluate('tool');
    expect((block as { phase: string }).phase).toBe('tool-input');
  });

  it('registers in the guardrail pipeline at tool-input phase', () => {
    // Demonstration: the scanner can be registered in a GuardrailPipeline
    // for the tool-input phase evaluation:
    //
    //   import { GuardrailPipeline } from '../pipeline.js';
    //   import { GuardianScanner } from './guardian.js';
    //
    //   const pipeline = new GuardrailPipeline();
    //   pipeline.add(new GuardianScanner({ llmJudge: myJudge }));
    //
    //   // During tool execution phase:
    //   const { result } = await pipeline.evaluate(toolCallJson, 'tool-input');
    //
    // This test simply verifies the scanner instantiates correctly
    // for registration — the pipeline integration is tested end-to-end
    // in the existing pipeline test suite.
    const scanner = new GuardianScanner();
    expect(scanner).toBeInstanceOf(GuardianScanner);
    expect(scanner.metadata.id).toBe('hub://guardrails/guardian');
  });
});

// =============================================================================
// Injected judge function integration
// =============================================================================

describe('injected judge function', () => {
  it('calls the injected judge with tool call input', async () => {
    const judge = vi.fn().mockResolvedValue('allow' as const);
    const scanner = new GuardianScanner({ llmJudge: judge });

    await scanner.evaluate('my-tool-call-json');
    expect(judge).toHaveBeenCalledWith('my-tool-call-json');
  });

  it('honors deny verdict from injected judge', async () => {
    const judge = vi.fn().mockResolvedValue('deny' as const);
    const scanner = new GuardianScanner({ llmJudge: judge });

    const result = await scanner.evaluate('risky-tool-call');
    expect(result.status).toBe('block');
  });

  it('honors allow verdict from injected judge', async () => {
    const judge = vi.fn().mockResolvedValue('allow' as const);
    const scanner = new GuardianScanner({ llmJudge: judge });

    const result = await scanner.evaluate('safe-tool-call');
    expect(result.status).toBe('pass');
  });

  it('does not call judge when circuit breaker is open', async () => {
    const judge = vi.fn().mockResolvedValue('deny' as const);
    const scanner = new GuardianScanner({ llmJudge: judge, maxConsecutive: 1 });

    // Trip the breaker on first call
    await scanner.evaluate('tool-1');

    // Second call — circuit breaker should block without calling judge
    judge.mockClear();
    await scanner.evaluate('tool-2');
    expect(judge).not.toHaveBeenCalled();
  });
});
