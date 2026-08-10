import { describe, expect, it } from 'vitest';

import { agentsyBanner, agentsyBannerCompact, createBanner, loadingBanner, pickBanner } from './ascii.ts';

describe('ascii', () => {
  it('createBanner creates consistent AsciiBanner', () => {
    const banner = createBanner('hello\nworld');
    expect(banner.lines).toHaveLength(2);
    expect(banner.lines[0]).toBe('hello');
    expect(banner.lines[1]).toBe('world');
    expect(banner.width).toBe(5);
    expect(banner.height).toBe(2);
  });

  it('createBanner pads short lines', () => {
    const banner = createBanner('abc\ndefgh');
    expect(banner.lines[0]).toBe('abc  ');
    expect(banner.lines[1]).toBe('defgh');
    expect(banner.width).toBe(5);
  });

  it('agentsyBanner has positive dimensions', () => {
    expect(agentsyBanner.width).toBeGreaterThan(0);
    expect(agentsyBanner.height).toBeGreaterThan(0);
    expect(agentsyBanner.lines.length).toBe(agentsyBanner.height);
  });

  it('agentsyBannerCompact has positive dimensions', () => {
    expect(agentsyBannerCompact.width).toBeGreaterThan(0);
    expect(agentsyBannerCompact.height).toBeGreaterThan(0);
  });

  it('loadingBanner has positive dimensions', () => {
    expect(loadingBanner.width).toBeGreaterThan(0);
    expect(loadingBanner.height).toBeGreaterThan(0);
  });

  it('pickBanner returns full banner for wide terminals', () => {
    const banner = pickBanner(200);
    expect(banner).toBe(agentsyBanner);
  });

  it('pickBanner returns compact for medium terminals', () => {
    // agentsyBanner.width=42, agentsyBannerCompact.width=40 — choose between them
    const banner = pickBanner(41);
    expect(banner).toBe(agentsyBannerCompact);
  });

  it('pickBanner returns minimal for narrow terminals', () => {
    const banner = pickBanner(5);
    expect(banner.lines[0]).toBe('agentsy');
    expect(banner.width).toBe(7);
  });
});
