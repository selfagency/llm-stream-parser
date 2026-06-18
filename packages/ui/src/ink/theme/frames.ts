/**
 * Chromed frame primitives for the acid ANSI BBS visual system.
 *
 * Renders boxed regions, borders, separators, and title bars using
 * Unicode box-drawing characters with Ink's <Box> component styling.
 * All frames consume the semantic palette from palette.ts.
 */

import type { AcidPalette } from './palette.ts';

export interface FrameStyle {
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  topLeft: string;
  topRight: string;
  vertical: string;
}

export const frameStyles = {
  light: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│'
  },
  heavy: {
    topLeft: '┏',
    topRight: '┓',
    bottomLeft: '┗',
    bottomRight: '┛',
    horizontal: '━',
    vertical: '┃'
  },
  double: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║'
  },
  rounded: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│'
  }
} as const satisfies Record<string, FrameStyle>;

export type FrameStyleName = keyof typeof frameStyles;

/**
 * Build a single-line horizontal separator string using the given frame style.
 * Example: ─────────────────────────────────────────
 */
export function separatorLine(style: FrameStyle, width: number): string {
  return style.horizontal.repeat(width);
}

/**
 * Build a top border string with optional title.
 * Example: ┌── Title ──────────────────────────────┐
 */
export function topBorder(style: FrameStyle, width: number, title?: string): string {
  if (!title) {
    return `${style.topLeft}${style.horizontal.repeat(width - 2)}${style.topRight}`;
  }
  const padded = ` ${title} `;
  const remaining = width - 2 - padded.length;
  if (remaining < 2) {
    return `${style.topLeft}${padded.slice(0, width - 4)}${style.topRight}`;
  }
  const leftFill = style.horizontal.repeat(Math.floor(remaining / 2));
  const rightFill = style.horizontal.repeat(Math.ceil(remaining / 2));
  return `${style.topLeft}${leftFill}${padded}${rightFill}${style.topRight}`;
}

/**
 * Build a bottom border string.
 * Example: └────────────────────────────────────────┘
 */
export function bottomBorder(style: FrameStyle, width: number): string {
  return `${style.bottomLeft}${style.horizontal.repeat(width - 2)}${style.bottomRight}`;
}

/**
 * Ink <Box> border style resolver.
 *
 * Maps our frame style to an Ink-compatible border style string so that
 * components can use Ink's declarative border rendering when possible.
 */
export function inkBorderStyle(styleName: FrameStyleName): 'single' | 'double' | 'round' {
  if (styleName === 'heavy' || styleName === 'light') {
    return 'single';
  }
  if (styleName === 'double') {
    return 'double';
  }
  return 'round';
}

/**
 * Ink <Box> border color resolver — applies the palette's frame border colour.
 */
export function inkBorderColor(palette: AcidPalette): string {
  return palette.frameBorder;
}

/**
 * Get the Ink-compatible border style and colour for a <Box> declarative border.
 */
export interface BorderConfig {
  readonly color: string;
  readonly style: 'single' | 'double' | 'round';
}

export function resolveBorderConfig(styleName: FrameStyleName, palette: AcidPalette): BorderConfig {
  return {
    style: inkBorderStyle(styleName),
    color: inkBorderColor(palette)
  };
}
