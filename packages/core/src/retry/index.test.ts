import { describe, expect, it, vi } from 'vitest';

import { retry } from './index.js';

describe('retry', () => {
  it('returns the operation result when it succeeds on the first attempt', async () => {
    await expect(retry(async () => 'ok')).resolves.toBe('ok');
  });

  it('retries after a failure and eventually resolves', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce('ok');
    const operation = retry(fn, {
      backoffFactor: 2,
      initialDelay: 0,
      maxAttempts: 3,
      maxDelay: 0
    });

    await expect(operation).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rejects after max attempts are exhausted', async () => {
    const error = new Error('failed');
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(error);
    const operation = retry(fn, {
      backoffFactor: 2,
      initialDelay: 0,
      maxAttempts: 2,
      maxDelay: 0
    });

    await expect(operation).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rejects with a standard AbortError when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(retry(async () => 'ok', { signal: controller.signal })).rejects.toMatchObject({
      message: 'Retry aborted',
      name: 'AbortError'
    });
  });

  it('stops waiting immediately when aborted during the retry delay', async () => {
    vi.useFakeTimers();

    try {
      const controller = new AbortController();
      const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('temporary'));
      const operation = retry(fn, {
        backoffFactor: 2,
        initialDelay: 1000,
        maxAttempts: 3,
        maxDelay: 1000,
        signal: controller.signal
      });

      await Promise.resolve();
      expect(fn).toHaveBeenCalledOnce();

      controller.abort();

      await expect(operation).rejects.toMatchObject({
        message: 'Retry aborted',
        name: 'AbortError'
      });

      vi.advanceTimersByTime(1000);
      expect(fn).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not double-settle when abort fires during fn execution', async () => {
    const controller = new AbortController();

    const fn = vi.fn<() => Promise<string>>().mockImplementation(() => {
      controller.abort();
      throw new Error('fail');
    });

    const operation = retry(fn, {
      backoffFactor: 2,
      initialDelay: 0,
      maxAttempts: 3,
      maxDelay: 0,
      signal: controller.signal
    });

    await expect(operation).rejects.toMatchObject({
      message: 'Retry aborted',
      name: 'AbortError'
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('falls back to plain Error when DOMException is unavailable', async () => {
    const originalDOMException = globalThis.DOMException;
    // biome-ignore lint: xss/no-mixed-html -- test-only DOM exception removal
    delete (globalThis as Partial<typeof globalThis>).DOMException;

    try {
      const controller = new AbortController();
      controller.abort();

      await expect(retry(async () => 'ok', { signal: controller.signal })).rejects.toMatchObject({
        message: 'Retry aborted',
        name: 'AbortError'
      });
    } finally {
      (globalThis as Record<string, unknown>).DOMException = originalDOMException;
    }
  });

  it('caps exponential backoff at maxDelay (with jitter)', async () => {
    vi.useFakeTimers();

    try {
      const fn = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error('temporary-1'))
        .mockRejectedValueOnce(new Error('temporary-2'))
        .mockResolvedValueOnce('ok');

      const operation = retry(fn, {
        backoffFactor: 3,
        initialDelay: 100,
        maxAttempts: 4,
        maxDelay: 150
      });

      // First call fires immediately
      await Promise.resolve();
      expect(fn).toHaveBeenCalledOnce();

      // With full jitter, delays are random between 0 and cappedDelay.
      // Use runAllTimersAsync to flush nested async timer chains.
      await vi.runAllTimersAsync();

      await expect(operation).resolves.toBe('ok');
    } finally {
      vi.useRealTimers();
    }
  });
});
