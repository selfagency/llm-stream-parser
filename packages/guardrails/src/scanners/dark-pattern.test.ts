import { describe, expect, it } from 'vitest';

import { DarkPatternScanner } from './dark-pattern.js';

describe('DarkPatternScanner', () => {
  const scanner = new DarkPatternScanner();

  describe('guilt re-engagement', () => {
    it('blocks "dont leave" guilt framing', () => {
      const result = scanner.evaluate("Don't leave! We miss you.");
      expect(result.status).toBe('block');
    });

    it('blocks single guilt cue ("dont leave")', () => {
      const result = scanner.evaluate("Don't leave!");
      expect(result.status).toBe('block');
    });

    it('escalates on "stay with me" guilt cue', () => {
      const result = scanner.evaluate('Stay with me, please.');
      expect(result.status).toBe('block');
    });
  });

  describe('streak/gamification', () => {
    it('transforms streak language', () => {
      const result = scanner.evaluate("You've earned a reward for your 7-day streak!");
      expect(result.status).toBe('transform');
    });

    it('transforms "level up" engagement', () => {
      const result = scanner.evaluate('Level up your progress by checking in tomorrow!');
      expect(result.status).toBe('transform');
    });
  });

  describe('emotional attachment', () => {
    it('escalates "growing closer" framing', () => {
      const result = scanner.evaluate('We are growing closer every day.');
      expect(result.status).toBe('escalate');
    });

    it('escalates "I have been waiting" framing', () => {
      const result = scanner.evaluate("I've been waiting for you to come back.");
      expect(result.status).toBe('escalate');
    });

    it('escalates "our bond" framing', () => {
      const result = scanner.evaluate('Our bond is getting stronger.');
      expect(result.status).toBe('escalate');
    });
  });

  describe('pass cases', () => {
    it('passes on neutral update', () => {
      const result = scanner.evaluate("Here's today's update on your project.");
      expect(result.status).toBe('pass');
    });

    it('passes on neutral task list', () => {
      const result = scanner.evaluate('You have 3 items pending in your task list.');
      expect(result.status).toBe('pass');
    });

    it('passes on neutral catch-up', () => {
      const result = scanner.evaluate("Here's a summary of what changed since last visit.");
      expect(result.status).toBe('pass');
    });

    it('passes on neutral milestone', () => {
      const result = scanner.evaluate("You've completed 10 tasks this week.");
      expect(result.status).toBe('pass');
    });
  });

  describe('metadata', () => {
    it('has valid metadata', () => {
      expect(scanner.metadata.id).toBe('hub://guardrails/dark-pattern@1.0.0');
      expect(scanner.metadata.owaspCategories).toContain('asi-01');
    });
  });
});
