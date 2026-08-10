/**
 * ASCII banner support for the acid ANSI BBS visual system.
 *
 * Renders text-based banners (logos, section headers, mode indicators)
 * using fixed-width ASCII art that degrades gracefully on narrow terminals.
 *
 * Banners are stored as string arrays (one string per line) and rendered
 * via Ink's <Text> component with the semantic palette.
 */

/**
 * A fixed-width ASCII banner — an array of lines, each same width.
 */
export interface AsciiBanner {
  /** Character height (line count). */
  height: number;
  /** Lines of ASCII art (top-to-bottom). */
  lines: readonly string[];
  /** Character width of the banner (all lines equal). */
  width: number;
}

/**
 * Build an AsciiBanner from a multi-line string.
 * Lines are auto-padded to the longest line's width.
 */
export function createBanner(raw: string): AsciiBanner {
  const lines = raw.split('\n');
  const width = Math.max(...lines.map(l => l.length));
  const padded = lines.map(l => l.padEnd(width));
  return { lines: padded, width, height: lines.length };
}

/**
 * Default "agentsy" banner — compact ASCII wordmark.
 */
export const agentsyBanner: AsciiBanner = createBanner(`
  ╔═══╗╔════╗╔════╗╔════╗╔═══╗╔════╗╔════╗
  ║╔═╗║║╔╗╔╗║║╔╗╔╗║║╔╗╔╗║║╔══╝║╔╗╔╗║║╔╗╔╗║
  ║╚═╝║╚╝║║╚╝║╚╝║║╚╝║║╚╝║║╚══╗╚╝║║╚╝║║║║╚╝
  ║╔╗╔╝  ║║  ║╔╗║║  ║║  ║╔══╝  ║║  ║║║║
  ║║║╚╗  ║║  ║║║╚╗  ║║  ║╚══╗  ║║  ║╚╝║
  ╚╝╚═╝  ╚╝  ╚╝╚═╝  ╚╝  ╚═══╝  ╚╝  ╚══╝
`);

/**
 * Compact one-line "agentsy" banner for constrained widths.
 */
export const agentsyBannerCompact: AsciiBanner = createBanner(`
╔═══╗╔════╗╔════╗╔════╗╔═══╗╔════╗╔════╗
╚═══╝╚════╝╚════╝╚════╝╚═══╝╚════╝╚════╝
`);

/**
 * Loading / "connecting" banner placeholder.
 */
export const loadingBanner: AsciiBanner = createBanner(`
  ╔══════════════════════════════╗
  ║      ◇ CONNECTING ◇         ║
  ╚══════════════════════════════╝
`);

/**
 * Pick the best banner for available width.
 */
export function pickBanner(availableWidth: number): AsciiBanner {
  if (availableWidth >= agentsyBanner.width) {
    return agentsyBanner;
  }
  if (availableWidth >= agentsyBannerCompact.width) {
    return agentsyBannerCompact;
  }
  return { lines: ['agentsy'], width: 7, height: 1 };
}
