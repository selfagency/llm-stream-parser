import { describe, expect, it } from 'vitest';
import { VerificationGate } from './verification-gate.js';

describe('VerificationGate', () => {
  it('passes when verify returns passed: true', async () => {
    const gate = new VerificationGate({
      maxRetries: 2,
      verify: async () => ({ passed: true })
    });
    const result = await gate.verify({});
    expect(result.allowStop).toBe(true);
    expect(result.result.passed).toBe(true);
  });

  it('blocks on first failure and allows retry', async () => {
    let verifyCalls = 0;
    const gate = new VerificationGate({
      maxRetries: 2,
      // biome-ignore lint/suspicious/useAwait: interface requires Promise return
      verify: async () => {
        verifyCalls++;
        return verifyCalls === 1 ? { passed: false, feedback: 'Fix the bug' } : { passed: true };
      }
    });
    const first = await gate.verify({});
    expect(first.allowStop).toBe(false);
    expect(first.feedback).toBe('Fix the bug');

    const second = await gate.verify({});
    expect(second.allowStop).toBe(true);
    expect(second.result.passed).toBe(true);
  });

  it('soft-passes after max retries', async () => {
    const gate = new VerificationGate({
      maxRetries: 2,
      verify: async () => ({ passed: false, feedback: 'Still broken' })
    });

    // First failure — blocked
    const r1 = await gate.verify({});
    expect(r1.allowStop).toBe(false);

    // Second failure — blocked
    const r2 = await gate.verify({});
    expect(r2.allowStop).toBe(false);

    // Third attempt — max retries exhausted, soft-pass
    const r3 = await gate.verify({});
    expect(r3.allowStop).toBe(true);
    expect(r3.result.passed).toBe(false);
    expect(r3.feedback).toContain('Proceeding with caution');
  });

  it('resets retry count on pass', async () => {
    let verifyCalls = 0;
    const gate = new VerificationGate({
      maxRetries: 3,
      // biome-ignore lint/suspicious/useAwait: interface requires Promise return
      verify: async () => {
        verifyCalls++;
        return verifyCalls <= 1 ? { passed: false } : { passed: true };
      }
    });

    await gate.verify({}); // fail
    await gate.verify({}); // pass
    expect(gate.retryCount).toBe(0);
  });

  it('stores last result for audit', async () => {
    const table = [{ claim: 'tests pass', verified: true, evidence: '4/4 passed' }];
    const gate = new VerificationGate({
      maxRetries: 1,
      verify: async () => ({ passed: true, verificationTable: table })
    });
    await gate.verify({});
    expect(gate.lastResult?.verificationTable).toEqual(table);
  });

  it('reset clears state', async () => {
    const gate = new VerificationGate({
      maxRetries: 2,
      verify: async () => ({ passed: false })
    });
    await gate.verify({});
    expect(gate.retryCount).toBe(1);
    gate.reset();
    expect(gate.retryCount).toBe(0);
    expect(gate.lastResult).toBeNull();
  });
});
