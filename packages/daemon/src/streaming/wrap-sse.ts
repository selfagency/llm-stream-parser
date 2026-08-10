/**
 * SSE idle timeout wrapper.
 *
 * Wraps an `AsyncIterable<T>` with a per-read idle timeout. If no chunk
 * arrives within `idleTimeout` ms, the wrapper aborts and the generator
 * throws. Prevents hung connections when a provider's SSE stream stalls
 * without closing.
 *
 * @module
 */

export interface WrapSSEOptions {
  /** Max ms between chunks before abort. */
  idleTimeout: number;
  /** Optional external abort signal. */
  signal?: AbortSignal;
}

/**
 * Wraps an async iterable with a read-level idle timeout.
 * Each chunk resets the timer; if the timer fires before the next chunk
 * arrives, the wrapper aborts and the generator throws.
 */
export async function* wrapSSE<T>(source: AsyncIterable<T>, options: WrapSSEOptions): AsyncGenerator<T> {
  const { idleTimeout, signal: externalSignal } = options;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const abort = (reason: string): void => {
    controller.abort(reason);
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  // Tie external abort to our internal controller
  const onExternalAbort = (): void => {
    const reason = externalSignal?.reason?.toString() ?? 'External abort';
    abort(reason);
  };
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  const resetTimer = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => abort('Idle timeout'), idleTimeout);
  };

  try {
    const iterator = source[Symbol.asyncIterator]();

    while (true) {
      resetTimer();

      const result = await Promise.race([
        iterator.next(),
        new Promise<never>((_, reject) => {
          // nosemgrep: detect-object-injection — controller is a locally created AbortController, not user input
          controller.signal.addEventListener(
            'abort',
            () => reject(new Error(controller.signal.reason?.toString() ?? 'Aborted')),
            { once: true }
          );
        })
      ]);

      if (result.done === true) {
        return;
      }

      yield result.value;
    }
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    externalSignal?.removeEventListener('abort', onExternalAbort);
    controller.abort('Generator complete');
  }
}
