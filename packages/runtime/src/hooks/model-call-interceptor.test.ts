/* oxlint-disable xss/no-mixed-html -- Test inputs intentionally include string content */
import type { CompletionRequest, CompletionResponse } from '@agentsy/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ModelCallInterceptorInput } from './model-call-interceptor.js';
import { interceptModelCall } from './model-call-interceptor.js';
import type { HookRegistry } from './registry.js';
import type { HookResult } from './types.js';

// =============================================================================
// Helpers
// =============================================================================

function createInput(overrides?: Partial<ModelCallInterceptorInput>): ModelCallInterceptorInput {
  return {
    estimatedTokens: 100,
    logicalModelId: 'gpt-4o',
    providerId: 'openai',
    replicaId: 'us-east-1',
    request: { messages: [{ role: 'user' as const, content: 'hello' }] } as CompletionRequest,
    sessionId: 'sess_001',
    ...overrides
  };
}

/**
 * Build a minimal mock HookRegistry whose `fire` method is a controlled vi.fn().
 */
function createMockHooks(defaultFireResult?: HookResult): { hooks: HookRegistry; fire: ReturnType<typeof vi.fn> } {
  const fire = vi.fn().mockResolvedValue(defaultFireResult ?? ({ continue: true } satisfies HookResult));
  return {
    fire,
    hooks: { fire, list: vi.fn(), register: vi.fn(), unregister: vi.fn() } satisfies HookRegistry
  };
}

function createSuccessResponse(overrides?: Partial<CompletionResponse>): CompletionResponse {
  return {
    content: 'Hello, world!',
    ...overrides
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('interceptModelCall', () => {
  describe('successful call', () => {
    it('fires PreModelCall with correct fields, executes call, fires PostModelCall, returns response', async () => {
      const { hooks, fire } = createMockHooks();
      const call = vi.fn().mockResolvedValue(createSuccessResponse());
      const input = createInput();

      const result = await interceptModelCall(hooks, input, call);

      expect(result).toEqual(createSuccessResponse());
      expect(fire).toHaveBeenCalledTimes(2);
      expect(call).toHaveBeenCalledOnce();

      // PreModelCall event
      const preCall = fire.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
      expect(preCall.type).toBe('PreModelCall');
      expect(preCall.estimatedTokens).toBe(100);
      expect(preCall.logicalModelId).toBe('gpt-4o');
      expect(preCall.providerId).toBe('openai');
      expect(preCall.replicaId).toBe('us-east-1');
      expect(preCall.sessionId).toBe('sess_001');

      // PostModelCall event
      const postCall = fire.mock.calls[1]?.[0] as unknown as Record<string, unknown>;
      expect(postCall.type).toBe('PostModelCall');
      // response has no usage; falls back to estimatedTokens (100)
      expect(postCall.actualTokens).toBe(100);
      expect(postCall.logicalModelId).toBe('gpt-4o');
      expect(postCall.providerId).toBe('openai');
      expect(postCall.replicaId).toBe('us-east-1');
      expect(postCall.sessionId).toBe('sess_001');
    });

    it('uses response.usage.totalTokens as actualTokens when available', async () => {
      const { hooks, fire } = createMockHooks();
      const call = vi.fn().mockResolvedValue(createSuccessResponse({ usage: { totalTokens: 42 } }));
      const input = createInput({ estimatedTokens: 100 });

      await interceptModelCall(hooks, input, call);

      const postCall = fire.mock.calls[1]?.[0] as unknown as Record<string, unknown>;
      expect(postCall.actualTokens).toBe(42);
    });

    it('falls back to estimatedTokens when response has usage but no totalTokens', async () => {
      const { hooks, fire } = createMockHooks();
      const call = vi.fn().mockResolvedValue(createSuccessResponse({ usage: { inputTokens: 10, outputTokens: 20 } }));
      const input = createInput({ estimatedTokens: 100 });

      await interceptModelCall(hooks, input, call);

      const postCall = fire.mock.calls[1]?.[0] as unknown as Record<string, unknown>;
      // usage.totalTokens is undefined, falls back to estimatedTokens (100)
      expect(postCall.actualTokens).toBe(100);
    });

    it('falls back to 0 when neither usage nor estimatedTokens are provided', async () => {
      const { hooks, fire } = createMockHooks();
      const call = vi.fn().mockResolvedValue(createSuccessResponse());
      // Omit estimatedTokens entirely (undefined) to trigger the 0 fallback
      const { estimatedTokens: _, ...rest } = createInput();
      const input = rest as ModelCallInterceptorInput;

      await interceptModelCall(hooks, input, call);

      const postCall = fire.mock.calls[1]?.[0] as unknown as Record<string, unknown>;
      expect(postCall.actualTokens).toBe(0);
    });

    it('includes PostModelCall fields even when response has no usage at all', async () => {
      const { hooks, fire } = createMockHooks();
      const response: CompletionResponse = { content: 'Hello, world!' };
      const call = vi.fn().mockResolvedValue(response);
      const input = createInput({ estimatedTokens: 50 });

      await interceptModelCall(hooks, input, call);

      const postCall = fire.mock.calls[1]?.[0] as unknown as Record<string, unknown>;
      expect(postCall.actualTokens).toBe(50);
      expect(postCall.logicalModelId).toBe('gpt-4o');
      expect(postCall.providerId).toBe('openai');
      expect(postCall.replicaId).toBe('us-east-1');
      expect(postCall.sessionId).toBe('sess_001');
    });
  });

  describe('call blocked', () => {
    it('throws correct error when PreModelCall returns continue:false with a reason', async () => {
      const { hooks, fire } = createMockHooks({
        continue: false,
        reason: 'Content policy violation'
      } satisfies HookResult);
      const call = vi.fn();
      const input = createInput();

      await expect(interceptModelCall(hooks, input, call)).rejects.toThrow(
        'Model call blocked: Content policy violation'
      );

      // Only PreModelCall should have fired — call never executes, PostModelCall never fires
      expect(fire).toHaveBeenCalledTimes(1);
      expect(call).not.toHaveBeenCalled();
    });

    it('throws correct error when PreModelCall returns transform', async () => {
      const { hooks, fire } = createMockHooks({
        continue: true,
        transform: { custom: 'data' }
      } satisfies HookResult);
      const call = vi.fn();
      const input = createInput();

      await expect(interceptModelCall(hooks, input, call)).rejects.toThrow(
        'Model call blocked: hook requested transformation which is unsupported for model calls'
      );

      expect(fire).toHaveBeenCalledTimes(1);
      expect(call).not.toHaveBeenCalled();
    });

    it('checks transform before continue (transform takes precedence)', async () => {
      // A HookResult with BOTH transform and continue:false — transform branch runs first
      const result = {
        continue: false,
        reason: 'should not be reached',
        transform: { blocked: true }
      } as HookResult;
      const { hooks, fire } = createMockHooks(result);
      const call = vi.fn();
      const input = createInput();

      await expect(interceptModelCall(hooks, input, call)).rejects.toThrow('transformation which is unsupported');

      expect(fire).toHaveBeenCalledTimes(1);
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('call failure', () => {
    it('fires ModelCallFailed with error.message and re-throws the error', async () => {
      const { hooks, fire } = createMockHooks();
      const originalError = new Error('API timeout after 30s');
      const call = vi.fn().mockRejectedValue(originalError);
      const input = createInput();

      await expect(interceptModelCall(hooks, input, call)).rejects.toThrow(originalError);

      // PreModelCall + ModelCallFailed = 2 fires
      expect(fire).toHaveBeenCalledTimes(2);

      const failedEvent = fire.mock.calls[1]?.[0] as unknown as Record<string, unknown>;
      expect(failedEvent.type).toBe('ModelCallFailed');
      expect(failedEvent.error).toBe('API timeout after 30s');
      expect(failedEvent.logicalModelId).toBe('gpt-4o');
      expect(failedEvent.providerId).toBe('openai');
      expect(failedEvent.replicaId).toBe('us-east-1');
      expect(failedEvent.sessionId).toBe('sess_001');
    });

    it('fires ModelCallFailed with String(error) for non-Error thrown values and re-throws', async () => {
      const { hooks, fire } = createMockHooks();
      const thrown = { code: 503, status: 'Service Unavailable' };
      const call = vi.fn().mockRejectedValue(thrown);
      const input = createInput();

      await expect(interceptModelCall(hooks, input, call)).rejects.toBe(thrown);

      expect(fire).toHaveBeenCalledTimes(2);

      const failedEvent = fire.mock.calls[1]?.[0] as unknown as Record<string, unknown>;
      expect(failedEvent.type).toBe('ModelCallFailed');
      expect(failedEvent.error).toBe('[object Object]');
    });

    it('fires ModelCallFailed with String(error) when thrown string primitive', async () => {
      const { hooks, fire } = createMockHooks();
      const call = vi.fn().mockRejectedValue('rate limit exceeded');
      const input = createInput();

      await expect(interceptModelCall(hooks, input, call)).rejects.toBe('rate limit exceeded');

      expect(fire).toHaveBeenCalledTimes(2);

      const failedEvent = fire.mock.calls[1]?.[0] as unknown as Record<string, unknown>;
      expect(failedEvent.type).toBe('ModelCallFailed');
      expect(failedEvent.error).toBe('rate limit exceeded');
    });

    it('fires ModelCallFailed with String(error) when thrown null', async () => {
      const { hooks, fire } = createMockHooks();
      const call = vi.fn().mockRejectedValue(null);
      const input = createInput();

      await expect(interceptModelCall(hooks, input, call)).rejects.toBeNull();

      expect(fire).toHaveBeenCalledTimes(2);

      const failedEvent = fire.mock.calls[1]?.[0] as unknown as Record<string, unknown>;
      expect(failedEvent.type).toBe('ModelCallFailed');
      expect(failedEvent.error).toBe('null');
    });

    it('does not fire PostModelCall after call failure — only ModelCallFailed', async () => {
      const { hooks, fire } = createMockHooks();
      const call = vi.fn().mockRejectedValue(new Error('fail'));
      const input = createInput();

      await expect(interceptModelCall(hooks, input, call)).rejects.toThrow('fail');

      const types = fire.mock.calls.map(c => (c[0] as unknown as Record<string, unknown>).type);
      expect(types).toEqual(['PreModelCall', 'ModelCallFailed']);
    });
  });

  describe('PreModelCall event payload', () => {
    it('passes estimatedTokens as 0 when estimatedTokens is undefined', async () => {
      const fire = vi.fn().mockResolvedValue({ continue: true });
      const hooks: HookRegistry = { fire, list: vi.fn(), register: vi.fn(), unregister: vi.fn() };
      const call = vi.fn().mockResolvedValue(createSuccessResponse());
      // Omit estimatedTokens to make it undefined
      const { estimatedTokens: _, ...rest } = createInput();
      const input = rest as ModelCallInterceptorInput;

      await interceptModelCall(hooks, input, call);

      const preEvent = fire.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
      expect(preEvent.estimatedTokens).toBe(0);
    });

    it('passes all routing fields to PreModelCall', async () => {
      const captured: unknown[] = [];
      const fire = vi.fn().mockImplementation((event: unknown) => {
        captured.push(event);
        return Promise.resolve({ continue: true } satisfies HookResult);
      });
      const hooks: HookRegistry = { fire, list: vi.fn(), register: vi.fn(), unregister: vi.fn() };
      const call = vi.fn().mockResolvedValue(createSuccessResponse());
      const input = createInput();

      await interceptModelCall(hooks, input, call);

      const preEvent = captured[0] as Record<string, unknown>;
      expect(preEvent).toMatchObject({
        type: 'PreModelCall',
        estimatedTokens: 100,
        logicalModelId: 'gpt-4o',
        providerId: 'openai',
        replicaId: 'us-east-1',
        sessionId: 'sess_001'
      });
    });
  });

  describe('PostModelCall event payload', () => {
    it('passes all routing fields to PostModelCall', async () => {
      const captured: unknown[] = [];
      const fire = vi.fn().mockImplementation((event: unknown) => {
        captured.push(event);
        return Promise.resolve({ continue: true } satisfies HookResult);
      });
      const hooks: HookRegistry = { fire, list: vi.fn(), register: vi.fn(), unregister: vi.fn() };
      const call = vi.fn().mockResolvedValue(createSuccessResponse({ usage: { totalTokens: 77 } }));
      const input = createInput();

      await interceptModelCall(hooks, input, call);

      const postEvent = captured[1] as Record<string, unknown>;
      expect(postEvent).toMatchObject({
        type: 'PostModelCall',
        actualTokens: 77,
        logicalModelId: 'gpt-4o',
        providerId: 'openai',
        replicaId: 'us-east-1',
        sessionId: 'sess_001'
      });
    });
  });

  describe('ModelCallFailed event payload', () => {
    it('passes all routing fields to ModelCallFailed', async () => {
      const captured: unknown[] = [];
      const fire = vi.fn().mockImplementation((event: unknown) => {
        captured.push(event);
        return Promise.resolve({ continue: true } satisfies HookResult);
      });
      const hooks: HookRegistry = { fire, list: vi.fn(), register: vi.fn(), unregister: vi.fn() };
      const call = vi.fn().mockRejectedValue(new Error('provider unavailable'));
      const input = createInput();

      await expect(interceptModelCall(hooks, input, call)).rejects.toThrow('provider unavailable');

      const failEvent = captured[1] as Record<string, unknown>;
      expect(failEvent).toMatchObject({
        type: 'ModelCallFailed',
        error: 'provider unavailable',
        logicalModelId: 'gpt-4o',
        providerId: 'openai',
        replicaId: 'us-east-1',
        sessionId: 'sess_001'
      });
    });
  });

  describe('call function interactions', () => {
    it('invokes call as a zero-argument thunk', async () => {
      const { hooks } = createMockHooks();
      let callArgCount: number | undefined;
      const call = vi.fn().mockImplementation((...args: unknown[]) => {
        callArgCount = args.length;
        return Promise.resolve(createSuccessResponse());
      });
      const input = createInput();

      await interceptModelCall(hooks, input, call);

      expect(callArgCount).toBe(0);
    });

    it('returns whatever call() returns without modification', async () => {
      const { hooks } = createMockHooks();
      const callResponse = createSuccessResponse({
        content: 'custom content',
        id: 'cmpl_abc',
        model: 'gpt-4o-2024-08-06',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
      });
      const call = vi.fn().mockResolvedValue(callResponse);
      const input = createInput();

      const result = await interceptModelCall(hooks, input, call);

      expect(result).toBe(callResponse);
      expect(result).toEqual(callResponse);
    });
  });

  describe('no registered handlers edge case', () => {
    it('works when the HookRegistry fire method returns default { continue: true }', async () => {
      const { hooks, fire } = createMockHooks();
      const call = vi.fn().mockResolvedValue(createSuccessResponse());
      const input = createInput();

      const result = await interceptModelCall(hooks, input, call);

      expect(result.content).toBe('Hello, world!');
      expect(fire).toHaveBeenCalledTimes(2);
    });
  });
});
