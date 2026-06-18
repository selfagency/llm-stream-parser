/**
 * Model-call interceptor that wraps gateway invocations with
 * runtime lifecycle hook events (PreModelCall → call → PostModelCall / ModelCallFailed).
 *
 * The interceptor is a higher-order function: it takes a HookRegistry
 * and a session id, and returns a wrapper for gateway model calls.
 */

import type { CompletionRequest, CompletionResponse } from '@agentsy/shared';

import type { HookRegistry } from './registry.js';
import type { ModelCallFailedEvent, PostModelCallEvent, PreModelCallEvent } from './types.js';

// =============================================================================
// Interceptor input
// =============================================================================

export interface ModelCallInterceptorInput {
  estimatedTokens?: number;
  logicalModelId: string;
  providerId: string;
  replicaId: string;
  request: CompletionRequest;
  sessionId: string;
}

// =============================================================================
// Interceptor
// =============================================================================

/**
 * Wrap a gateway model call with PreModelCall → PostModelCall / ModelCallFailed lifecycle events.
 *
 * If a hook handler blocks the PreModelCall event, the call is rejected
 * with the block reason as an error.
 *
 * @param hooks - The runtime HookRegistry to fire events through.
 * @param input - Routing context for the model call.
 * @param call - The actual gateway invocation (e.g. client.complete() or client.stream()).
 * @returns The CompletionResponse from the gateway call.
 */
export async function interceptModelCall(
  hooks: HookRegistry,
  input: ModelCallInterceptorInput,
  call: () => Promise<CompletionResponse>
): Promise<CompletionResponse> {
  const { estimatedTokens, logicalModelId, providerId, replicaId, sessionId } = input;

  // Fire PreModelCall — allows hooks to block or transform
  const preResult = await hooks.fire({
    estimatedTokens: estimatedTokens ?? 0,
    logicalModelId,
    providerId,
    replicaId,
    sessionId,
    type: 'PreModelCall'
  } satisfies PreModelCallEvent);

  if ('transform' in preResult) {
    // Transform result — apply transformation to request if possible
    throw new Error('Model call blocked: hook requested transformation which is unsupported for model calls');
  }

  if (!preResult.continue) {
    throw new Error(`Model call blocked: ${preResult.reason}`);
  }

  // Execute the actual model call
  try {
    const startTime = Date.now();
    const response = await call();
    const latencyMs = Date.now() - startTime;

    // Fire PostModelCall
    await hooks.fire({
      actualTokens: response.usage?.totalTokens ?? estimatedTokens ?? 0,
      costUsd: 0, // cost tracking is handled by tokenomics package
      latencyMs,
      logicalModelId,
      providerId,
      replicaId,
      sessionId,
      type: 'PostModelCall'
    } satisfies PostModelCallEvent);

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Fire ModelCallFailed — attempt 1 for first failure in the interceptor
    await hooks.fire({
      attempt: 1,
      error: errorMessage,
      logicalModelId,
      providerId,
      replicaId,
      sessionId,
      type: 'ModelCallFailed'
    } satisfies ModelCallFailedEvent);

    throw error;
  }
}
