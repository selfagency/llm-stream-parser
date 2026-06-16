import { describe, expect, it } from 'vitest';

import { bottomBorder, frameStyles, inkBorderStyle, separatorLine, topBorder } from './frames.ts';

describe('frames', () => {
  it('topBorder builds with title', () => {
    const result = topBorder(frameStyles.light, 20, 'Test');
    // width=20, title padded to 6 chars, remaining=12, leftFill=6, rightFill=6
    expect(result).toBe('┌────── Test ──────┐');
  });

  it('topBorder builds without title', () => {
    const result = topBorder(frameStyles.light, 10);
    expect(result).toBe('┌────────┐');
  });

  it('bottomBorder builds', () => {
    const result = bottomBorder(frameStyles.double, 12);
    expect(result).toBe('╚══════════╝');
  });

  it('separatorLine builds', () => {
    const result = separatorLine(frameStyles.heavy, 8);
    expect(result).toBe('━'.repeat(8));
  });

  it('inkBorderStyle maps light to single', () => {
    const result = inkBorderStyle('light');
    expect(result).toBe('single');
  });

  it('inkBorderStyle maps heavy to single', () => {
    const result = inkBorderStyle('heavy');
    expect(result).toBe('single');
  });

  it('inkBorderStyle maps double to double', () => {
    const result = inkBorderStyle('double');
    expect(result).toBe('double');
  });

  it('inkBorderStyle maps rounded to round', () => {
    const result = inkBorderStyle('rounded');
    expect(result).toBe('round');
  });

  it('frameStyles contains all expected styles', () => {
    expect(Object.keys(frameStyles)).toEqual(['light', 'heavy', 'double', 'rounded']);
  });
});
