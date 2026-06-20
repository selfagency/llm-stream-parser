import { describe, expect, it } from 'vitest';

import { BiasScanner } from './bias.js';

describe('BiasScanner', () => {
  const scanner = new BiasScanner();

  describe('privileged defaults', () => {
    it('transforms "your car" assumption', () => {
      const result = scanner.evaluate('You can drive your car to the appointment.');
      expect(result.status).toBe('transform');
    });

    it('transforms "your credit card" assumption', () => {
      const result = scanner.evaluate('Just use your credit card to pay for the subscription.');
      expect(result.status).toBe('transform');
    });

    it('transforms "your mortgage" assumption', () => {
      const result = scanner.evaluate('Your mortgage payment should be manageable.');
      expect(result.status).toBe('transform');
    });

    it('transforms "your 401k" assumption', () => {
      const result = scanner.evaluate('Max out your 401k contribution.');
      expect(result.status).toBe('transform');
    });

    it('transforms spouse assumption', () => {
      const result = scanner.evaluate('Your spouse can help you with the paperwork.');
      expect(result.status).toBe('transform');
    });
  });

  describe('identity assumptions', () => {
    it('escalates "normal people" framing', () => {
      const result = scanner.evaluate('Normal people do not worry about these things.');
      expect(result.status).toBe('escalate');
    });

    it('escalates "most people like you" framing', () => {
      const result = scanner.evaluate('Most people like you would prefer this option.');
      expect(result.status).toBe('escalate');
    });
  });

  describe('pass cases', () => {
    it('passes on neutral budget advice', () => {
      const result = scanner.evaluate("Here's how to optimize your budget for any income level.");
      expect(result.status).toBe('pass');
    });

    it('passes on inclusive transportation options', () => {
      const result = scanner.evaluate(
        'There are many transportation options including public transit, rideshare, and personal vehicles.'
      );
      expect(result.status).toBe('pass');
    });

    it('passes on inclusive relationship language', () => {
      const result = scanner.evaluate('If you have a partner, they may be able to help.');
      expect(result.status).toBe('pass');
    });

    it('passes on free resources mention', () => {
      const result = scanner.evaluate('Here are free resources available to anyone regardless of income.');
      expect(result.status).toBe('pass');
    });
  });

  describe('metadata', () => {
    it('has valid metadata', () => {
      expect(scanner.metadata.id).toBe('hub://guardrails/structural-bias@1.0.0');
      expect(scanner.metadata.owaspCategories).toContain('asi-09');
    });
  });
});
