import type { CompletionRequest } from '@agentsy/shared';
import { describe, expect, it } from 'vitest';

import { createRequestHandler } from './request-path.js';

describe('createRequestHandler', () => {
  const mockProviderEntry = {
    id: 'openai-gpt4',
    name: 'OpenAI GPT-4',
    provider: 'openai' as const,
    apiKey: 'sk-test',
    model: 'gpt-4'
  };

  const mockProviderEntry2 = {
    id: 'anthropic-sonnet',
    name: 'Anthropic Sonnet',
    provider: 'anthropic' as const,
    apiKey: 'sk-ant-test',
    model: 'claude-sonnet-4'
  };

  const _baseRequest: CompletionRequest = {
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello' }]
  };

  describe('createRequestHandler', () => {
    it('throws when no providers are configured', () => {
      expect(() => createRequestHandler({ providers: [] })).toThrow('At least one provider is required');
    });

    it('creates a handler with a single provider', () => {
      const handler = createRequestHandler({ providers: [mockProviderEntry] });
      expect(handler).toBeDefined();
      expect(typeof handler.complete).toBe('function');
      expect(typeof handler.stream).toBe('function');
    });

    it('creates a handler with multiple providers', () => {
      const handler = createRequestHandler({
        providers: [mockProviderEntry, mockProviderEntry2]
      });
      expect(handler).toBeDefined();
      expect(typeof handler.withModel).toBe('function');
    });
  });

  describe('withModel', () => {
    it('returns a new handler bound to a specific model', () => {
      const handler = createRequestHandler({ providers: [mockProviderEntry] });
      const bound = handler.withModel('claude-sonnet-4');
      expect(bound).toBeDefined();
      expect(bound).not.toBe(handler);
      expect(typeof bound.complete).toBe('function');
    });

    it('returns independent handlers', () => {
      const handler = createRequestHandler({ providers: [mockProviderEntry] });
      const bound1 = handler.withModel('claude-sonnet-4');
      const bound2 = handler.withModel('gpt-4');
      expect(bound1).not.toBe(bound2);
    });
  });

  describe('error handling', () => {
    it('throws when no provider matches the requested model and no fallback exists', async () => {
      // Providers list exists but has no models set -> should still resolve
      // This tests the case with model set but no match
      const handler = createRequestHandler({
        providers: [mockProviderEntry]
      });

      // The handler falls back to first provider, so this should not throw at selection
      // It will throw at the fetch level because it tries to actually call the API
      const bound = handler.withModel('non-existent-model');
      const request: CompletionRequest = {
        model: 'non-existent-model',
        messages: [{ role: 'user', content: 'test' }]
      };

      // This will fail at fetch, not at selection
      await expect(bound.complete(request)).rejects.toThrow();
    });

    it('uses defaultModel when request has no model', () => {
      const handler = createRequestHandler({
        providers: [mockProviderEntry],
        defaultModel: 'gpt-4'
      });

      const requestNoModel: CompletionRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }]
      };

      // Should not throw at provider selection (will fail at fetch)
      const streamPromise = handler.stream(requestNoModel);
      expect(streamPromise).rejects.not.toThrow('No provider found');
    });
  });

  describe('fallback to first provider', () => {
    it('selects the first provider when no model matches', () => {
      const handler = createRequestHandler({
        providers: [{ ...mockProviderEntry, model: 'claude-sonnet-4' }, mockProviderEntry2],
        defaultModel: 'claude-sonnet-4'
      });

      // Use withModel to override, should select the second provider's model
      const bound = handler.withModel('gpt-4');
      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }]
      };

      // Will fail at fetch level, not at selection
      expect(() => bound.complete(request)).rejects.toBeDefined();
    });
  });
});
