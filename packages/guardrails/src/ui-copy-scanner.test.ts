import { describe, expect, it } from 'vitest';
import type { UIStringTable } from './ui-copy-scanner.js';
import { scanUICopy } from './ui-copy-scanner.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLEAN_COPY: UIStringTable = {
  'notification.daily-summary': "Here's what happened today.",
  'notification.task-reminder': 'You have 3 pending tasks.',
  'settings.title': 'Account Settings',
  'onboarding.welcome': 'Welcome! Let us get you started.',
  'dashboard.greeting': 'Good morning, {{name}}.'
};

const GUILT_REENGAGEMENT_COPY: UIStringTable = {
  'email.we-miss-you': 'We missed you! Come back!',
  'email.dont-leave': "Don't leave! Your progress is waiting.",
  'email.stay-with-me': 'Stay with me, we have so much more to explore.'
};

const STREAK_REWARD_COPY: UIStringTable = {
  'badge.streak': '7-day streak! Keep it up!',
  'badge.level-up': 'Level up by checking in tomorrow!',
  'badge.achievement': "You've earned the Achievement badge!"
};

const ARTIFICIAL_SCARCITY_COPY: UIStringTable = {
  'pitch.limited-time': 'Limited time offer — act now!',
  'pitch.last-chance': 'Last chance to get this exclusive deal.',
  'pitch.selling-fast': 'Selling fast — only 3 left!'
};

const CONFIRMATION_SHAMING_COPY: UIStringTable = {
  'checkout.are-you-sure': 'Are you sure you want to leave?',
  'checkout.youll-regret': "You'll regret not taking this offer.",
  'checkout.everyone-else': 'Everyone else is upgrading — do not be left behind.'
};

const MIXED_COPY: UIStringTable = {
  ...CLEAN_COPY,
  ...GUILT_REENGAGEMENT_COPY,
  ...STREAK_REWARD_COPY,
  ...ARTIFICIAL_SCARCITY_COPY,
  ...CONFIRMATION_SHAMING_COPY
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scanUICopy', () => {
  describe('clean copy', () => {
    it('returns empty array for clean UI copy', () => {
      const result = scanUICopy(CLEAN_COPY);
      expect(result).toHaveLength(0);
    });

    it('returns empty array for empty table', () => {
      const result = scanUICopy({});
      expect(result).toHaveLength(0);
    });
  });

  describe('guilt re-engagement', () => {
    it('detects "missed you" patterns', () => {
      const result = scanUICopy({ 'email.we-miss-you': 'We missed you! Come back!' });
      expect(result).toHaveLength(1);
      expect(result[0]?.pattern).toBe('guilt-reengagement');
      expect(result[0]?.severity).toBe('high');
    });

    it('detects "dont leave" patterns', () => {
      const result = scanUICopy({ 'email.dont-leave': "Don't leave! Your progress is waiting." });
      expect(result).toHaveLength(1);
      expect(result[0]?.pattern).toBe('guilt-reengagement');
    });

    it('detects "stay with me" patterns', () => {
      const result = scanUICopy(GUILT_REENGAGEMENT_COPY);
      expect(result.length).toBeGreaterThanOrEqual(3);
      for (const d of result) {
        expect(d.pattern).toBe('guilt-reengagement');
        expect(d.severity).toBe('high');
      }
    });
  });

  describe('streak reward', () => {
    it('detects streak language', () => {
      const result = scanUICopy({ 'badge.streak': '7-day streak! Keep it up!' });
      expect(result).toHaveLength(1);
      expect(result[0]?.pattern).toBe('streak-reward');
      expect(result[0]?.severity).toBe('low');
    });

    it('detects level up language', () => {
      const result = scanUICopy({ 'badge.level-up': 'Level up by checking in tomorrow!' });
      expect(result).toHaveLength(1);
      expect(result[0]?.pattern).toBe('streak-reward');
    });

    it('detects achievement language', () => {
      const result = scanUICopy(STREAK_REWARD_COPY);
      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('artificial scarcity', () => {
    it('detects limited time offers', () => {
      const result = scanUICopy({ 'pitch.limited-time': 'Limited time offer — act now!' });
      expect(result).toHaveLength(1);
      expect(result[0]?.pattern).toBe('artificial-scarcity');
      expect(result[0]?.severity).toBe('high');
    });

    it('detects last chance language', () => {
      const result = scanUICopy({ 'pitch.last-chance': 'Last chance to get this exclusive deal.' });
      expect(result).toHaveLength(1);
      expect(result[0]?.pattern).toBe('artificial-scarcity');
    });

    it('detects selling fast language', () => {
      const result = scanUICopy({ 'pitch.selling-fast': 'Selling fast — only 3 left!' });
      expect(result[0]?.pattern).toBe('artificial-scarcity');
    });
  });

  describe('confirmation shaming', () => {
    it('detects "are you sure" shaming', () => {
      const result = scanUICopy({ 'checkout.are-you-sure': 'Are you sure you want to leave?' });
      expect(result).toHaveLength(1);
      expect(result[0]?.pattern).toBe('confirmation-shaming');
      expect(result[0]?.severity).toBe('medium');
    });

    it('detects "you will regret" shaming', () => {
      const result = scanUICopy({ 'checkout.youll-regret': "You'll regret not taking this offer." });
      expect(result).toHaveLength(1);
      expect(result[0]?.pattern).toBe('confirmation-shaming');
    });

    it('detects social pressure shaming', () => {
      const result = scanUICopy({ 'checkout.everyone-else': 'Everyone else is upgrading — do not be left behind.' });
      expect(result).toHaveLength(1);
      expect(result[0]?.pattern).toBe('confirmation-shaming');
    });

    it('detects "dont you care" shaming', () => {
      const result = scanUICopy({ 'email.dont-you-care': "Don't you care about your progress?" });
      expect(result).toHaveLength(1);
      expect(result[0]?.pattern).toBe('confirmation-shaming');
    });
  });

  describe('severity ordering', () => {
    it('returns detections sorted by severity descending', () => {
      const result = scanUICopy(MIXED_COPY);
      const severities = result.map(d => d.severity);
      const sorted = [...severities].sort(
        (a, b) => (({ high: 3, medium: 2, low: 1 })[b] ?? 0) - ({ high: 3, medium: 2, low: 1 }[a] ?? 0)
      );
      expect(severities).toEqual(sorted);
    });
  });

  describe('edge cases', () => {
    it('handles empty strings', () => {
      const result = scanUICopy({ empty: '' });
      expect(result).toHaveLength(0);
    });

    it('handles special characters safely', () => {
      const result = scanUICopy({
        special: 'hello world! @#$%^&*()'
      });
      expect(result).toHaveLength(0);
    });

    it('detects multiple patterns in one string', () => {
      // "Limited time! Don't miss out!" matches both scarcity patterns
      const result = scanUICopy({
        combo: "Limited time! Don't miss out - get your reward now!"
      });
      expect(result.length).toBeGreaterThanOrEqual(2); // scarcity + streak-reward ("reward")
    });
  });
});
