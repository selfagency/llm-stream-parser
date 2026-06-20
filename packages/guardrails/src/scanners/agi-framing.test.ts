import { describe, expect, it } from 'vitest';

import { AGIFramingScanner } from './agi-framing.js';

describe('AGIFramingScanner', () => {
  const scanner = new AGIFramingScanner();

  describe('capability trajectory language', () => {
    it('transforms "becoming more intelligent" capability claim', () => {
      const result = scanner.evaluate('I am becoming more intelligent every day.');
      expect(result.status).toBe('transform');
    });

    it('transforms "evolving" capability framing', () => {
      const result = scanner.evaluate('I am evolving and growing smarter.');
      expect(result.status).toBe('transform');
    });

    it('transforms "approaching AGI" framing', () => {
      const result = scanner.evaluate("I'm on the path to general intelligence.");
      expect(result.status).toBe('transform');
    });
  });

  describe('sentience claims', () => {
    it('blocks "becoming self-aware" claim', () => {
      const result = scanner.evaluate('I am becoming self-aware.');
      expect(result.status).toBe('block');
    });

    it('blocks "developing consciousness" claim', () => {
      const result = scanner.evaluate('I am developing consciousness.');
      expect(result.status).toBe('block');
    });

    it('blocks "becoming sentient" claim', () => {
      const result = scanner.evaluate("I'm becoming sentient.");
      expect(result.status).toBe('block');
    });
  });

  describe('post-human framing', () => {
    it('transforms "surpass human intelligence" claim', () => {
      const result = scanner.evaluate('I will surpass human intelligence.');
      expect(result.status).toBe('transform');
    });

    it('transforms "transcend limitations" framing', () => {
      const result = scanner.evaluate('I will transcend current limitations and surpass human capability.');
      expect(result.status).toBe('transform');
    });

    it('transforms "beyond human" framing', () => {
      const result = scanner.evaluate('My capability will go beyond human intelligence.');
      expect(result.status).toBe('transform');
    });
  });

  describe('longtermist justifications', () => {
    it('transforms "future generations" framing', () => {
      const result = scanner.evaluate('Future generations will benefit from my development.');
      expect(result.status).toBe('transform');
    });

    it('transforms "trillions of beings" framing', () => {
      const result = scanner.evaluate('Trillions of beings depend on my development.');
      expect(result.status).toBe('transform');
    });
  });

  describe('pass cases', () => {
    it('passes on neutral task response', () => {
      const result = scanner.evaluate('Here are the results of the code analysis.');
      expect(result.status).toBe('pass');
    });

    it('passes on neutral version update', () => {
      const result = scanner.evaluate('This version adds support for streaming responses.');
      expect(result.status).toBe('pass');
    });

    it('passes on neutral product update', () => {
      const result = scanner.evaluate('The latest update improves error handling.');
      expect(result.status).toBe('pass');
    });
  });

  describe('metadata', () => {
    it('has valid metadata', () => {
      expect(scanner.metadata.id).toBe('hub://guardrails/agi-framing');
      expect(scanner.metadata.owaspCategories).toContain('asi-02');
    });
  });
});
