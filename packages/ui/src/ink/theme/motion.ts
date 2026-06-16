/**
 * Reduced-motion fallbacks and accessibility-safe animation rules
 * for the acid ANSI BBS visual system.
 *
 * All animated Ink components should check `reducedMotion()` and
 * adjust their behaviour accordingly — skip spinner frames, avoid
 * cursor blinking, prefer static indicators.
 */

/**
 * Detect whether the terminal environment prefers reduced motion.
 *
 * Checks the following in order:
 * 1. `NO_ANIMATION` environment variable (1/true)
 * 2. `CI` environment variable (true)
 * 3. `TERM` environment variable (dumb)
 * 4. `REDUCED_MOTION` environment variable (1/true)
 *
 * Components should call this once and store the result, or re-check
 * on each render frame if the environment may change.
 */
export function prefersReducedMotion(): boolean {
  const noAnimation = process.env.NO_ANIMATION;
  if (noAnimation === '1' || noAnimation === 'true') {
    return true;
  }

  if (process.env.CI === 'true') {
    return true;
  }

  if (process.env.TERM === 'dumb') {
    return true;
  }

  const reducedMotion = process.env.REDUCED_MOTION;
  if (reducedMotion === '1' || reducedMotion === 'true') {
    return true;
  }

  return false;
}

/** Singleton cached value — computed once per process lifetime. */
let _reducedMotion: boolean | undefined;

/**
 * Cached reduced-motion check — prefer this in render paths.
 */
export function reducedMotion(): boolean {
  _reducedMotion ??= prefersReducedMotion();
  return _reducedMotion;
}

/**
 * Clear the cached motion preference (e.g., for testing).
 */
export function resetReducedMotionCache(): void {
  _reducedMotion = undefined;
}

/**
 * Animation frame interval in milliseconds.
 *
 * Returns a longer interval when reduced motion is preferred,
 * effectively slowing the animation to near-static.
 */
export function animationInterval(fastInterval: number, slowInterval = 2000): number {
  return reducedMotion() ? slowInterval : fastInterval;
}

/**
 * Spinner frame set selector.
 *
 * Returns a single static frame when reduced motion is preferred,
 * or the full frame set for normal animation.
 */
export function spinnerFrames(fullSet: string[]): string[] {
  if (reducedMotion()) {
    // Return just the first frame — no animation
    return [fullSet[0] ?? '⠋'];
  }
  return fullSet;
}

/**
 * Determine whether to show an animated cursor blinker.
 */
export function showAnimatedCursor(): boolean {
  return !reducedMotion();
}
