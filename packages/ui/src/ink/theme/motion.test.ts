import { beforeEach, describe, expect, it } from 'vitest';

import { prefersReducedMotion, reducedMotion, resetReducedMotionCache } from './motion.ts';

describe('motion', () => {
  beforeEach(() => {
    // Clear any cached value before each test
    resetReducedMotionCache();
    delete process.env.NO_ANIMATION;
    delete process.env.CI;
    delete process.env.REDUCED_MOTION;
  });

  it('defaults to reduced motion = false', () => {
    expect(reducedMotion()).toBe(false);
  });

  it('respects NO_ANIMATION=1', () => {
    process.env.NO_ANIMATION = '1';
    expect(prefersReducedMotion()).toBe(true);
  });

  it('respects CI=true', () => {
    process.env.CI = 'true';
    expect(prefersReducedMotion()).toBe(true);
  });

  it('respects REDUCED_MOTION=true', () => {
    process.env.REDUCED_MOTION = 'true';
    expect(prefersReducedMotion()).toBe(true);
  });

  it('caches result after first call', () => {
    // First call sets the cache
    expect(reducedMotion()).toBe(false);
    // Change env after cache is set
    process.env.NO_ANIMATION = '1';
    // Should still return cached value
    expect(reducedMotion()).toBe(false);
    // Reset cache and it picks up the env change
    resetReducedMotionCache();
    expect(reducedMotion()).toBe(true);
  });
});
