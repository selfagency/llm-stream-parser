#!/usr/bin/env node
// fallow-ignore-file unused-file
/**
 * Theme Preview Utility
 * Displays all available Ink renderer themes with sample output
 *
 * Usage: node scripts/preview-themes.js
 */

// Attempt to load built output first (when running from installed package),
// otherwise fall back to local workspace source so this script works during dev
// without requiring a build step. This reduces duplicate source files and
// allows CI and local tooling to run the preview command in either state.
interface ThemeConfig {
  border?: { style?: string };
  thinking?: { textColor?: string; spinnerColor?: string };
  toolCall?: {
    pendingColor?: string;
    doneColor?: string;
    pendingSymbol?: string;
    doneSymbol?: string;
  };
}

let themesModule: Record<string, unknown>;
try {
  const distThemesPath = '../dist/renderers/ink/themes/index.js';
  // nosemgrep: typescript-unnecessary-assertion
  // Dynamic import returns `unknown`; cast is required for type safety.
  themesModule = (await import(distThemesPath)) as Record<string, unknown>;
} catch {
  // Fallback to local source so contributors can run the script before building
  // nosemgrep: typescript-unnecessary-assertion
  // Dynamic import returns `unknown`; cast is required for type safety.
  themesModule = (await import('../../renderers/src/ink/themes/index.ts')) as Record<string, unknown>;
}

const entries = Object.entries(themesModule).map(([name, value]) => ({
  name,
  value
}));

const ANSI = {
  bold: '\u001B[1m',
  cyan: '\u001B[36m',
  dim: '\u001B[2m',
  green: '\u001B[32m',
  reset: '\u001B[0m',
  white: '\u001B[37m',
  yellow: '\u001B[33m'
} as const;

console.log('Available themes:');
for (const e of entries) {
  console.log('-', e.name);
}

const THEMES = Object.entries(themesModule)
  .filter(([_, value]) => typeof value === 'object' && value !== null && 'thinking' in value)
  .map(([name, theme]) => ({
    name,
    theme: theme as ThemeConfig
  }));

/**
 * Apply color to text using chalk. JSDoc types avoid implicit any in strict typechecks.
 * @param {string} text
 * @param {string | undefined} color
 */
function applyColor(text: string, color: string | undefined): string {
  if (!color) {
    return text;
  }
  if (color.startsWith('#')) {
    return text;
  }

  let ansi: string | undefined;
  if (color in ANSI) {
    ansi = (ANSI as Record<string, string>)[color];
  }
  return ansi ? `${ansi}${text}${ANSI.reset}` : text;
}

function displayThemePreview() {
  console.log(`\n${ANSI.bold}${ANSI.cyan}═══════════════════════════════════${ANSI.reset}`);
  console.log(`${ANSI.bold}${ANSI.cyan}  Available Ink Renderer Themes${ANSI.reset}`);
  console.log(`${ANSI.bold}${ANSI.cyan}═══════════════════════════════════${ANSI.reset}\n`);

  for (const { name, theme } of THEMES) {
    console.log(`${ANSI.bold}${ANSI.white}${name.padEnd(25)}${ANSI.reset}`);

    if (theme.thinking) {
      const textColor = theme.thinking.textColor ?? 'cyan';
      const spinnerColor = theme.thinking.spinnerColor ?? 'cyan';
      const thinkingText = `text=${textColor}, spinner=${spinnerColor}`;
      console.log(`  ${applyColor('├─ Thinking:', textColor)} ${applyColor(thinkingText, spinnerColor)}`);
    }

    if (theme.toolCall) {
      const pendingColor = theme.toolCall.pendingColor ?? 'yellow';
      const doneColor = theme.toolCall.doneColor ?? 'green';
      const pendingSymbol = theme.toolCall.pendingSymbol ?? '⠋';
      const doneSymbol = theme.toolCall.doneSymbol ?? '✓';
      const toolsPending = `Tools: ${pendingSymbol}`;
      const toolsPreview = 'pending';
      const toolsDone = `${doneSymbol} done`;
      const toolsPendingText = `└─ ${toolsPending}`;
      const toolsLine = `  ${applyColor(toolsPendingText, pendingColor)} ${applyColor(toolsPreview, pendingColor)} ${applyColor(toolsDone, doneColor)}`;
      console.log(toolsLine);
    }

    if (theme.border) {
      const borderText = `Border: ${theme.border.style}`;
      const borderLine = `  ${ANSI.dim}${borderText}${ANSI.reset}`;
      console.log(borderLine);
    }

    console.log();
  }

  console.log(`${ANSI.dim}═══════════════════════════════════${ANSI.reset}`);
  console.log(`${ANSI.dim}\nUsage:${ANSI.reset}`);
  console.log(`${ANSI.dim}  createInkRenderer({ theme: "theme-name" })${ANSI.reset}`);
  const usageExample = String.raw`  import { draculaTheme } from "../src/ink/themes/index.js"\n`;
  console.log(`${ANSI.dim}${usageExample}${ANSI.reset}`);
}

displayThemePreview();
