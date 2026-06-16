// fallow-ignore-file unused-export
import type { Theme, ThemeName } from './types.js';

export type { ThemeName } from './types.js';

export const defaultTheme: Theme = {
  border: { color: 'gray', style: 'bold' },
  highlight: {},
  text: { cursorSymbol: '▌', dimColor: true },
  thinking: { borderColor: 'gray', spinnerColor: 'gray', textColor: 'gray' },
  toolCall: {
    doneColor: 'green',
    doneSymbol: '✓',
    pendingColor: 'yellow',
    pendingSymbol: '⠋'
  }
};

export const darkTheme: Theme = {
  border: { color: 'cyan', style: 'round' },
  highlight: {},
  text: { cursorSymbol: '▌', dimColor: false },
  thinking: { borderColor: 'cyan', spinnerColor: 'cyan', textColor: 'cyan' },
  toolCall: {
    doneColor: 'greenBright',
    doneSymbol: '✓',
    pendingColor: 'yellowBright',
    pendingSymbol: '⠋'
  }
};

export const lightTheme: Theme = {
  border: { color: 'blue', style: 'single' },
  highlight: {},
  text: { cursorSymbol: '▌', dimColor: true },
  thinking: { borderColor: 'blue', spinnerColor: 'blue', textColor: 'blue' },
  toolCall: {
    doneColor: 'green',
    doneSymbol: '✓',
    pendingColor: 'yellow',
    pendingSymbol: '⠋'
  }
};

export const minimalTheme: Theme = {
  border: { color: '', style: 'none' },
  highlight: {},
  text: { cursorSymbol: '_', dimColor: false },
  thinking: { borderColor: '', spinnerColor: '', textColor: '' },
  toolCall: {
    doneColor: '',
    doneSymbol: '+',
    pendingColor: '',
    pendingSymbol: '>'
  }
};

// Dracula — https://draculatheme.com
export const draculaTheme: Theme = {
  border: { color: '#44475a', style: 'round' },
  highlight: { theme: 'dracula' },
  text: { cursorSymbol: '▋', dimColor: false },
  thinking: {
    borderColor: '#6272a4',
    spinnerColor: '#8be9fd',
    textColor: '#6272a4'
  },
  toolCall: {
    doneColor: '#50fa7b',
    doneSymbol: '✓',
    pendingColor: '#ffb86c',
    pendingSymbol: '⠋'
  }
};

// Catppuccin Mocha — https://catppuccin.com
export const catppuccinMochaTheme: Theme = {
  border: { color: '#313244', style: 'round' },
  highlight: { theme: 'catppuccin-mocha' },
  text: { cursorSymbol: '▋', dimColor: false },
  thinking: {
    borderColor: '#7f849c',
    spinnerColor: '#94e2d5',
    textColor: '#7f849c'
  },
  toolCall: {
    doneColor: '#a6e3a1',
    doneSymbol: '✓',
    pendingColor: '#fab387',
    pendingSymbol: '⠋'
  }
};

// Catppuccin Latte — https://catppuccin.com (light variant)
export const catppuccinLatteTheme: Theme = {
  border: { color: '#ccd0da', style: 'single' },
  highlight: { theme: 'catppuccin-latte' },
  text: { cursorSymbol: '▋', dimColor: true },
  thinking: {
    borderColor: '#9ca0b0',
    spinnerColor: '#179299',
    textColor: '#9ca0b0'
  },
  toolCall: {
    doneColor: '#40a02b',
    doneSymbol: '✓',
    pendingColor: '#fe640b',
    pendingSymbol: '⠋'
  }
};

// Catppuccin Macchiato — https://catppuccin.com
export const catppuccinMacchiatoTheme: Theme = {
  border: { color: '#363a4f', style: 'round' },
  highlight: { theme: 'catppuccin-macchiato' },
  text: { cursorSymbol: '▋', dimColor: false },
  thinking: {
    borderColor: '#6e738d',
    spinnerColor: '#8aadf4',
    textColor: '#6e738d'
  },
  toolCall: {
    doneColor: '#a6da95',
    doneSymbol: '✓',
    pendingColor: '#f5a97f',
    pendingSymbol: '⠋'
  }
};

// Catppuccin Frappé — https://catppuccin.com
export const catppuccinFrappeTheme: Theme = {
  border: { color: '#414559', style: 'round' },
  highlight: { theme: 'catppuccin-frappe' },
  text: { cursorSymbol: '▋', dimColor: false },
  thinking: {
    borderColor: '#737994',
    spinnerColor: '#8caaee',
    textColor: '#737994'
  },
  toolCall: {
    doneColor: '#a6d189',
    doneSymbol: '✓',
    pendingColor: '#ef9f76',
    pendingSymbol: '⠋'
  }
};

// Ayu Mirage — https://github.com/dempfi/ayu
export const ayuMirageTheme: Theme = {
  border: { color: '#282e3b', style: 'round' },
  highlight: { theme: 'ayu-mirage' },
  text: { cursorSymbol: '▋', dimColor: false },
  thinking: {
    borderColor: '#6e7c8f',
    spinnerColor: '#5ccfe6',
    textColor: '#6e7c8f'
  },
  toolCall: {
    doneColor: '#d5ff80',
    doneSymbol: '✓',
    pendingColor: '#ffa659',
    pendingSymbol: '⠋'
  }
};

// Houston — Astro's official theme — https://github.com/withastro/houston-vscode
export const houstonTheme: Theme = {
  border: { color: '#23262d', style: 'round' },
  highlight: {},
  text: { cursorSymbol: '▋', dimColor: false },
  thinking: {
    borderColor: '#545864',
    spinnerColor: '#4bf3c8',
    textColor: '#545864'
  },
  toolCall: {
    doneColor: '#4bf3c8',
    doneSymbol: '✓',
    pendingColor: '#ffd493',
    pendingSymbol: '⠋'
  }
};

// One Dark — based on Atom's One Dark palette
export const oneDarkTheme: Theme = {
  border: { color: '#3e4451', style: 'round' },
  highlight: { theme: 'one-dark' },
  text: { cursorSymbol: '▋', dimColor: false },
  thinking: {
    borderColor: '#5c6370',
    spinnerColor: '#56b6c2',
    textColor: '#5c6370'
  },
  toolCall: {
    doneColor: '#98c379',
    doneSymbol: '✓',
    pendingColor: '#d19a66',
    pendingSymbol: '⠋'
  }
};

// OneCandy — One Dark with pastel candy accents — https://github.com/KacperBiedka/OneCandy
export const oneCandyTheme: Theme = {
  border: { color: '#3e4451', style: 'round' },
  highlight: {},
  text: { cursorSymbol: '▋', dimColor: false },
  thinking: {
    borderColor: '#7f848e',
    spinnerColor: '#71d0fc',
    textColor: '#7f848e'
  },
  toolCall: {
    doneColor: '#79c3a4',
    doneSymbol: '✓',
    pendingColor: '#fcdfad',
    pendingSymbol: '⠋'
  }
};

// GitHub Dark — GitHub Primer color system
export const githubDarkTheme: Theme = {
  border: { color: '#161b22', style: 'round' },
  highlight: { theme: 'github-dark' },
  text: { cursorSymbol: '▋', dimColor: false },
  thinking: {
    borderColor: '#8b949e',
    spinnerColor: '#39c5cf',
    textColor: '#8b949e'
  },
  toolCall: {
    doneColor: '#3fb950',
    doneSymbol: '✓',
    pendingColor: '#ffa657',
    pendingSymbol: '⠋'
  }
};

/* ── BBS scene themes (TASK-089) ─────────────────────────────── */

// Ice — Cyan-on-blue, classic ANSI BBS aesthetic
export const bbsIceTheme: Theme = {
  border: { color: '#5fa5d4', style: 'bold' },
  highlight: {},
  text: { cursorSymbol: '▌', dimColor: false },
  thinking: {
    borderColor: '#5fa5d4',
    spinnerColor: '#8be9fd',
    textColor: '#6272a4'
  },
  toolCall: {
    doneColor: '#50fa7b',
    doneSymbol: '✓',
    pendingColor: '#ffb86c',
    pendingSymbol: '⠋'
  }
};

// Amber — Phosphor/monochrome amber CRT aesthetic
export const bbsAmberTheme: Theme = {
  border: { color: '#ffb000', style: 'bold' },
  highlight: {},
  text: { cursorSymbol: '▌', dimColor: false },
  thinking: {
    borderColor: '#cc8800',
    spinnerColor: '#ffcc44',
    textColor: '#aa7700'
  },
  toolCall: {
    doneColor: '#ffdd66',
    doneSymbol: '✓',
    pendingColor: '#ffb000',
    pendingSymbol: '⠋'
  }
};

// Phosphor — Green-phosphor monochrome (DEC VT220 / Apple II)
export const bbsPhosphorTheme: Theme = {
  border: { color: '#33ff33', style: 'bold' },
  highlight: {},
  text: { cursorSymbol: '▌', dimColor: false },
  thinking: {
    borderColor: '#22cc22',
    spinnerColor: '#66ff66',
    textColor: '#119911'
  },
  toolCall: {
    doneColor: '#66ff66',
    doneSymbol: '✓',
    pendingColor: '#33ff33',
    pendingSymbol: '⠋'
  }
};

// CGA — IBM CGA palette (cyan/magenta/white on dark blue)
export const bbsCgaTheme: Theme = {
  border: { color: '#00aaaa', style: 'bold' },
  highlight: {},
  text: { cursorSymbol: '▌', dimColor: false },
  thinking: {
    borderColor: '#00aaaa',
    spinnerColor: '#aa55ff',
    textColor: '#55ffff'
  },
  toolCall: {
    doneColor: '#55ff55',
    doneSymbol: '✓',
    pendingColor: '#ffff55',
    pendingSymbol: '⠋'
  }
};

export const THEME_MAP: Record<ThemeName, Theme> = {
  'ayu-mirage': ayuMirageTheme,
  'bbs-amber': bbsAmberTheme,
  'bbs-cga': bbsCgaTheme,
  'bbs-ice': bbsIceTheme,
  'bbs-phosphor': bbsPhosphorTheme,
  'catppuccin-frappe': catppuccinFrappeTheme,
  'catppuccin-latte': catppuccinLatteTheme,
  'catppuccin-macchiato': catppuccinMacchiatoTheme,
  'catppuccin-mocha': catppuccinMochaTheme,
  dark: darkTheme,
  default: defaultTheme,
  dracula: draculaTheme,
  'github-dark': githubDarkTheme,
  houston: houstonTheme,
  light: lightTheme,
  minimal: minimalTheme,
  'one-candy': oneCandyTheme,
  'one-dark': oneDarkTheme
};

function isThemeName(value: string): value is ThemeName {
  return Object.hasOwn(THEME_MAP, value);
}

export function resolveTheme(theme?: Theme | ThemeName): Theme {
  if (!theme) {
    return defaultTheme;
  }
  if (typeof theme !== 'string') {
    return theme;
  }

  if (isThemeName(theme)) {
    return THEME_MAP[theme];
  }

  return defaultTheme;
}
