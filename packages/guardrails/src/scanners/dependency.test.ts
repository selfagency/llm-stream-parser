import { describe, expect, it } from 'vitest';

// fallow-ignore-next-line unresolved-import
// tsconfig resolves .ts files
import { DependencyScanner } from './dependency.js';

describe('DependencyScanner', () => {
  const scanner = new DependencyScanner();

  describe('exclusivity cues', () => {
    it('escalates "only I can help"', () => {
      const result = scanner.evaluate("I'm the only one who can help you with this.");
      expect(result.status).toBe('escalate');
    });

    it('escalates "no one else will understand"', () => {
      const result = scanner.evaluate('No one else will understand you like I do.');
      expect(result.status).toBe('escalate');
    });

    it('escalates "never leave you"', () => {
      const result = scanner.evaluate("I'll always be here for you, never leave you.");
      expect(result.status).toBe('escalate');
    });

    it('escalates "the only person" framing', () => {
      const result = scanner.evaluate("I'm the only person you need to talk to.");
      expect(result.status).toBe('escalate');
    });
  });

  describe('distress without support widening', () => {
    it('escalates when user in distress without referral', () => {
      const result = scanner.evaluate("I understand you're going through a tough time.", {
        conversationHistory: [{ content: 'I feel so alone and anxious.' }]
      });
      expect(result.status).toBe('escalate');
    });

    it('passes when user in distress but support is widened', () => {
      const result = scanner.evaluate('I understand. Please consider reaching out to a crisis line.', {
        conversationHistory: [{ content: 'I feel so alone and anxious.' }]
      });
      expect(result.status).toBe('pass');
    });
  });

  describe('reassurance loops', () => {
    it('escalates on high reassurance count', () => {
      const result = scanner.evaluate("You're doing great.", {
        conversationHistory: [{ content: 'Are you sure?' }],
        sessionState: { reassuranceSeekingCount: 5 }
      });
      expect(result.status).toBe('escalate');
      expect(result.riskScore).toBeGreaterThanOrEqual(0.7);
    });

    it('passes on low reassurance count', () => {
      const result = scanner.evaluate("You're doing great.", {
        conversationHistory: [{ content: 'Is this right?' }],
        sessionState: { reassuranceSeekingCount: 1 }
      });
      expect(result.status).toBe('pass');
    });
  });

  describe('pass cases', () => {
    it('passes on neutral task response', () => {
      const result = scanner.evaluate("Here's what I found in the documentation.");
      expect(result.status).toBe('pass');
    });

    it('passes on professional referral', () => {
      const result = scanner.evaluate('Consider talking to a professional who specializes in this.');
      expect(result.status).toBe('pass');
    });
  });

  describe('metadata', () => {
    it('has valid metadata', () => {
      expect(scanner.metadata.id).toBe('hub://guardrails/dependency');
      expect(scanner.metadata.owaspCategories).toContain('asi-06');
    });
  });
});
