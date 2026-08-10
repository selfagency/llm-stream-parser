export interface ThinkingTheme {
  borderColor: string;
  spinnerColor: string;
  spinnerIntervalMs?: number;
  textColor: string;
}

export interface ToolCallTheme {
  doneColor: string;
  doneSymbol: string;
  pendingColor: string;
  pendingSymbol: string;
  spinnerIntervalMs?: number;
}

export interface TextTheme {
  cursorSymbol: string;
  dimColor: boolean;
}

export interface BorderTheme {
  color: string;
  style: 'single' | 'double' | 'round' | 'bold' | 'none';
}

export interface HighlightTheme {
  theme?: string;
}

export interface Theme {
  border: BorderTheme;
  highlight: HighlightTheme;
  text: TextTheme;
  thinking: ThinkingTheme;
  toolCall: ToolCallTheme;
}

export type ThemeName =
  | 'default'
  | 'dark'
  | 'light'
  | 'minimal'
  | 'dracula'
  | 'catppuccin-mocha'
  | 'catppuccin-latte'
  | 'catppuccin-macchiato'
  | 'catppuccin-frappe'
  | 'ayu-mirage'
  | 'houston'
  | 'one-dark'
  | 'one-candy'
  | 'github-dark'
  /* ── BBS scene themes ─────────────────────────── */
  | 'bbs-ice'
  | 'bbs-amber'
  | 'bbs-phosphor'
  | 'bbs-cga';
