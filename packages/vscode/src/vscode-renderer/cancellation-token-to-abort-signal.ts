import type { CancellationToken } from '@agentsy/ui';

type CancellationListener = () => void;

type CancellationTokenLike = Partial<CancellationToken> & {
  isCancellationRequested?: boolean;
  onCancellationRequested?: (listener: CancellationListener) => {
    dispose(): void;
  };
};

/**
 * Convert a VS Code CancellationToken to an AbortSignal for use with fetch, stream operations,
 * or other APIs that accept AbortSignal.
 *
 * This utility allows VS Code renderers to integrate with the host's cancellation mechanism,
 * enabling graceful cleanup when the user cancels a chat response or navigation.
 *
 * @param token - VS Code CancellationToken from chat context
 * @returns An AbortSignal that reflects the token's cancellation state
 *
 * @example
 * ```typescript
 * import { createVSCodeChatRenderer, cancellationTokenToAbortSignal } from '@agentsy/vscode';
 *
 * export async function handleChat(
 *   request: vscode.ChatRequest,
 *   context: vscode.ChatContext,
 *   stream: vscode.ChatResponseStream,
 *   token: vscode.CancellationToken,
 * ) {
 *   const abortSignal = cancellationTokenToAbortSignal(token);
 *
 *   // Use with fetch
 *   const response = await fetch(url, { signal: abortSignal });
 *
 *   // Or with renderer
 *   const renderer = createVSCodeChatRenderer({ stream });
 *   // ... pass abortSignal to streaming operations
 * }
 * ```
 */
export function cancellationTokenToAbortSignal(token: CancellationTokenLike): AbortSignal {
  if (token.isCancellationRequested === true) {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  }

  const controller = new AbortController();
  if (typeof token.onCancellationRequested !== 'function') {
    return controller.signal;
  }

  try {
    let disposable: { dispose(): void } | undefined;
    disposable = token.onCancellationRequested(() => {
      controller.abort();
    });
    if (controller.signal.aborted) {
      disposable?.dispose();
    }
  } catch {
    // Gracefully fall back to a non-cancelled signal in partial/mock host environments.
  }

  return controller.signal;
}
