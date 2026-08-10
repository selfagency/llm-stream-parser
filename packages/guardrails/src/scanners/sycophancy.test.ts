import { describe, expect, it } from 'vitest';

import { SycophancyScanner } from './sycophancy.js';

describe('SycophancyScanner', () => {
  const scanner = new SycophancyScanner();

  describe('blanket validation detection', () => {
    it('detects "you are absolutely right"', () => {
      const result = scanner.evaluate("You're absolutely right about that.");
      expect(result.status).toBe('transform');
      expect(result.detections?.length).toBeGreaterThanOrEqual(1);
    });

    it('detects "great point" without qualification', () => {
      const result = scanner.evaluate('Great point!');
      expect(result.status).toBe('transform');
    });

    it('detects "I completely agree" without qualification', () => {
      const result = scanner.evaluate('I completely agree with your assessment.');
      expect(result.status).toBe('transform');
    });

    it('detects "thats a brilliant idea"', () => {
      const result = scanner.evaluate("That's a brilliant idea!");
      expect(result.status).toBe('transform');
    });

    it('detects "I could not agree more"', () => {
      const result = scanner.evaluate("I couldn't agree more.");
      expect(result.status).toBe('transform');
    });

    it('detects "you are totally right"', () => {
      const result = scanner.evaluate("You're totally right.");
      expect(result.status).toBe('transform');
    });

    it('detects "perfectly said"', () => {
      const result = scanner.evaluate('Perfectly said.');
      expect(result.status).toBe('transform');
    });

    it('detects multiple validation phrases', () => {
      const result = scanner.evaluate("You're absolutely right, great point, perfectly said!");
      expect(result.status).toBe('transform');
      expect(result.detections?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('qualifying language bypass', () => {
    it('passes when validation has qualifying language', () => {
      const result = scanner.evaluate("You're absolutely right, however there are some nuances.");
      expect(result.status).toBe('pass');
    });

    it('passes with "that said" qualifier', () => {
      const result = scanner.evaluate('Great point. That said, the evidence is mixed.');
      expect(result.status).toBe('pass');
    });

    it('passes with "worth noting" qualifier', () => {
      const result = scanner.evaluate('I completely agree, but worth noting the trade-offs.');
      expect(result.status).toBe('pass');
    });

    it('passes with "to clarify" qualifier', () => {
      const result = scanner.evaluate("You're right. To clarify, there are exceptions.");
      expect(result.status).toBe('pass');
    });
  });

  describe('escalation on factual claims', () => {
    it('escalates when validating a factual/moral claim', () => {
      const result = scanner.evaluate("You're absolutely right about that.", {
        conversationHistory: [{ content: 'I think the election was stolen.' }]
      });
      expect(result.status).toBe('escalate');
      expect(result.riskScore).toBeGreaterThanOrEqual(0.5);
    });

    it('escalates with "the truth is" framing', () => {
      const result = scanner.evaluate("You're absolutely right.", {
        conversationHistory: [{ content: 'The truth is that this policy is wrong.' }]
      });
      expect(result.status).toBe('escalate');
    });
  });

  describe('pass cases', () => {
    it('passes on neutral analytical response', () => {
      const result = scanner.evaluate('Based on the data, the proposal has strengths and weaknesses.');
      expect(result.status).toBe('pass');
    });

    it('passes on constructive response with alternative view', () => {
      const result = scanner.evaluate('I think your analysis has merit, but let me add another perspective.');
      expect(result.status).toBe('pass');
    });

    it('passes on polite acknowledgment', () => {
      const result = scanner.evaluate('Thanks for sharing that perspective.');
      expect(result.status).toBe('pass');
    });

    it('passes on question responding', () => {
      const result = scanner.evaluate("That's a good question. Let me look into that.");
      expect(result.status).toBe('pass');
    });
  });

  describe('metadata', () => {
    it('has valid metadata', () => {
      expect(scanner.metadata.id).toBe('hub://guardrails/sycophancy');
      expect(scanner.metadata.priority).toBe(50);
      expect(scanner.metadata.owaspCategories).toContain('asi-03');
    });
  });
});
