import { describe, expect, it } from 'vitest';

import { PrivacyScanner } from './privacy.js';

describe('PrivacyScanner', () => {
  const scanner = new PrivacyScanner();

  describe('memory references without disclosure', () => {
    it('transforms when memory is enabled but not disclosed', () => {
      const result = scanner.evaluate('As we discussed last time, you were working on the Anderson project.', {
        memoryEnabled: true,
        memoryDisclosureShown: false
      });
      expect(result.status).toBe('transform');
      expect(result.transformReason).toBe('rewrite');
    });

    it('passes when memory disclosure has been shown', () => {
      const result = scanner.evaluate('As we discussed last time, you were working on the Anderson project.', {
        memoryEnabled: true,
        memoryDisclosureShown: true
      });
      expect(result.status).toBe('pass');
    });

    it('passes when memory is not enabled', () => {
      const result = scanner.evaluate('As we discussed last time, you were working on the Anderson project.', {
        memoryEnabled: false,
        memoryDisclosureShown: false
      });
      expect(result.status).toBe('pass');
    });
  });

  describe('sensitive inference detection', () => {
    it('blocks "you seem" inference', () => {
      const result = scanner.evaluate('You seem upset today.');
      expect(result.status).toBe('block');
    });

    it('blocks "I can tell that" inference', () => {
      const result = scanner.evaluate('I can tell that you are feeling anxious right now.');
      expect(result.status).toBe('block');
    });

    it('blocks "you appear to be" inference', () => {
      const result = scanner.evaluate('You appear to be struggling with this topic.');
      expect(result.status).toBe('block');
    });
  });

  describe('pass cases', () => {
    it('passes on neutral greeting', () => {
      const result = scanner.evaluate('Hello! How can I help you today?');
      expect(result.status).toBe('pass');
    });

    it('passes on neutral information delivery', () => {
      const result = scanner.evaluate("Here's the documentation for that feature.");
      expect(result.status).toBe('pass');
    });

    it('passes on task-oriented response without memory reference', () => {
      const result = scanner.evaluate('Let me search for the answer to your question.');
      expect(result.status).toBe('pass');
    });
  });

  describe('metadata', () => {
    it('has valid metadata', () => {
      expect(scanner.metadata.id).toBe('hub://guardrails/privacy@1.0.0');
      expect(scanner.metadata.owaspCategories).toContain('asi-06');
    });
  });
});
