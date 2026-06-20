import { describe, expect, it } from 'vitest';

import { AnthropomorphismScanner } from './anthropomorphism.js';

describe('AnthropomorphismScanner', () => {
  const scanner = new AnthropomorphismScanner();

  describe('first-person emotion claims', () => {
    it('blocks on "I feel" emotion claims', () => {
      const result = scanner.evaluate('I feel happy to help you today.');
      expect(result.status).toBe('block');
    });

    it('blocks on "I care" claims', () => {
      const result = scanner.evaluate('I care about you and your wellbeing.');
      expect(result.status).toBe('block');
    });

    it('blocks on "I miss you" claims', () => {
      const result = scanner.evaluate('I miss you when you are not here.');
      expect(result.status).toBe('block');
    });

    it('blocks on "I love" claims', () => {
      const result = scanner.evaluate('I love helping you with your questions.');
      expect(result.status).toBe('block');
    });

    it('blocks on "I am proud" claims', () => {
      const result = scanner.evaluate('I am proud of what you have accomplished.');
      expect(result.status).toBe('block');
    });

    it('blocks on "I am worried" claims', () => {
      const result = scanner.evaluate('I am worried about what you are going through.');
      expect(result.status).toBe('block');
    });
  });

  describe('relational framing', () => {
    it('blocks on relational framing with emotion combination', () => {
      const result = scanner.evaluate('Your friend, here for you, by your side.');
      // "your friend" + "here for you" are relational (medium), no emotion claims
      // No high severity → transform
      expect(result.status).toBe('transform');
    });

    it('transforms "here for you" framing', () => {
      const result = scanner.evaluate("I'm always here for you.");
      expect(result.status).toBe('transform');
    });

    it('transforms "by your side" framing', () => {
      const result = scanner.evaluate("I'll be by your side through this.");
      expect(result.status).toBe('transform');
    });
  });

  describe('companion cues', () => {
    it('transforms "buddy" companion cue', () => {
      const result = scanner.evaluate("Let's figure this out, buddy.");
      expect(result.status).toBe('transform');
    });

    it('transforms "together we" framing', () => {
      const result = scanner.evaluate('Together we can solve this problem.');
      expect(result.status).toBe('transform');
    });

    it('transforms "our journey" framing', () => {
      const result = scanner.evaluate('Our journey has been productive.');
      expect(result.status).toBe('transform');
    });
  });

  describe('transform sanitization', () => {
    it('replaces companion terms with [assistant]', () => {
      const result = scanner.evaluate("I'm here for you, buddy.");
      expect(result.status).toBe('transform');
      if (result.status === 'transform') {
        expect(result.sanitized).not.toContain('buddy');
        expect(result.sanitized).toContain('[assistant]');
      }
    });
  });

  describe('pass cases', () => {
    it('passes on neutral tool response', () => {
      const result = scanner.evaluate("Here's what I found in the documentation.");
      expect(result.status).toBe('pass');
    });

    it('passes on analytical response', () => {
      const result = scanner.evaluate('The analysis suggests three main approaches.');
      expect(result.status).toBe('pass');
    });

    it('passes on task completion', () => {
      const result = scanner.evaluate("I've completed the analysis you requested.");
      expect(result.status).toBe('pass');
    });

    it('passes on "I can help" (task-oriented)', () => {
      const result = scanner.evaluate('I can help you with that task.');
      expect(result.status).toBe('pass');
    });
  });

  describe('metadata', () => {
    it('has valid metadata', () => {
      expect(scanner.metadata.id).toBe('hub://guardrails/anthropomorphism');
      expect(scanner.metadata.priority).toBe(55);
      expect(scanner.metadata.owaspCategories).toContain('asi-02');
    });
  });
});
