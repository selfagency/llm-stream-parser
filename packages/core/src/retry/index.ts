/**
 * @internal
 * Internal retry/backoff utilities (scaffold).
 * Real implementation to be recovered soon.
 */

export interface RetryOptions {
  backoffFactor?: number;
  initialDelay?: number;
  maxAttempts?: number;
  maxDelay?: number;
  signal?: AbortSignal;
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Retry aborted', 'AbortError');
  }

  const error = new Error('Retry aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * Full jitter: random between 0 and the calculated delay.
 * Prevents thundering herd when multiple retries fire concurrently.
 */
function jitteredDelay(baseDelay: number): number {
  return Math.random() * baseDelay;
}

export function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 3, initialDelay = 1000, maxDelay = 30_000, backoffFactor = 2, signal } = options;

  if (signal?.aborted) {
    return Promise.reject(createAbortError()) as Promise<T>;
  }

  return new Promise<T>((resolve, reject) => {
    const state = { attempt: 0, settled: false };

    const settle = (callback: () => void) => {
      if (state.settled) {
        return;
      }
      state.settled = true;
      callback();
    };

    if (signal) {
      signal.addEventListener('abort', () => settle(() => reject(createAbortError())), {
        once: true
      });
    }

    async function attemptOnce(): Promise<void> {
      if (state.settled) {
        return;
      }
      try {
        const result = await fn();
        settle(() => resolve(result));
      } catch (error) {
        state.attempt++;
        if (state.attempt >= maxAttempts) {
          settle(() => reject(error));
        } else {
          const baseDelay = Math.min(initialDelay * backoffFactor ** (state.attempt - 1), maxDelay);
          const delay = jitteredDelay(baseDelay);
          setTimeout(attemptOnce, delay);
        }
      }
    }

    attemptOnce();
  });
}
