import { describe, expect, it } from 'vitest';
import { runVerifyLoop, type VerifyLoopConfig } from './verify-loop.js';

describe('runVerifyLoop', () => {
  const config: VerifyLoopConfig = {
    maxIterations: 3,
    verifyCommand: 'echo test',
    isSuccess: output => output.includes('PASS'),
    extractError: output => (output.includes('ERROR') ? 'Found error' : null)
  };

  it('passes on first try', async () => {
    let taskCalls = 0;
    const result = await runVerifyLoop(
      // biome-ignore lint/suspicious/useAwait: interface requires Promise return
      async () => {
        taskCalls++;
      },
      async () => 'PASS',
      config
    );
    expect(result.passed).toBe(true);
    expect(result.iterations).toBe(1);
    expect(taskCalls).toBe(1);
    expect(result.lastError).toBeNull();
  });

  it('retries on failure and passes on second try', async () => {
    let verifyCalls = 0;
    const result = await runVerifyLoop(
      async () => {
        /* noop */
      },
      // biome-ignore lint/suspicious/useAwait: interface requires Promise return
      async () => {
        verifyCalls++;
        return verifyCalls === 1 ? 'FAIL: ERROR here' : 'PASS';
      },
      config
    );
    expect(result.passed).toBe(true);
    expect(result.iterations).toBe(2);
    expect(result.history).toHaveLength(2);
    expect(result.history[0]?.passed).toBe(false);
    expect(result.history[1]?.passed).toBe(true);
  });

  it('fails after max iterations', async () => {
    const result = await runVerifyLoop(
      async () => {
        /* noop */
      },
      async () => 'FAIL: ERROR',
      config
    );
    expect(result.passed).toBe(false);
    expect(result.iterations).toBe(3);
    expect(result.lastError).toBe('Found error');
    expect(result.history).toHaveLength(3);
  });

  it('passes error to task function for fix attempts', async () => {
    const errorsReceived: (string | null)[] = [];
    await runVerifyLoop(
      // biome-ignore lint/suspicious/useAwait: interface requires Promise return
      async prevError => {
        errorsReceived.push(prevError);
      },
      async () => 'FAIL: ERROR',
      config
    );
    expect(errorsReceived[0]).toBeNull();
    expect(errorsReceived[1]).toBe('Found error');
    expect(errorsReceived[2]).toBe('Found error');
  });
});
