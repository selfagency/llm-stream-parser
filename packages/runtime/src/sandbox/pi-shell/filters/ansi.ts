/**
 * ANSI escape stripping and progress-bar helpers.
 * @module
 */

// biome-ignore-all lint/suspicious/noControlCharactersInRegex: ANSI ESC required for stripping
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: progress detection needs branching
const ANSI_CSI_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g; // NOSONAR
const ANSI_OSC_RE = /\x1B\][^\x07]*\x07/g; // NOSONAR
const ANSI_ESC_RE = /\x1B[@-Z\\-_]/g; // NOSONAR

const SPINNER_CHARS = new Set([
  '⠋',
  '⠙',
  '⠹',
  '⠸',
  '⠼',
  '⠴',
  '⠦',
  '⠧',
  '⠇',
  '⠏',
  '⠿',
  '⠾',
  '⠷',
  '⠯',
  '⠟',
  '⠻',
  '⠶',
  '◐',
  '◑',
  '◒',
  '◓',
  '◔',
  '◕',
  '◖',
  '◗',
  '⣾',
  '⣽',
  '⣻',
  '⢿',
  '⡿',
  '⣟',
  '⣯',
  '⣷',
  '▁',
  '▂',
  '▃',
  '▄',
  '▅',
  '▆',
  '▇',
  '█',
  '░',
  '▒',
  '▓',
  '|',
  '/',
  '-'
]);

const PROGRESS_BAR_RE = /\[.*[=█░#]+\s*\].*\d*%?/;
const BRACKET_PERCENT_RE = /\[.*[=█░#>]+.*\].*\d+%/;
const PERCENT_ONLY_RE = /^\s*\d{1,3}%\s*$/;
const DOTS_PROGRESS_RE = /^\s*\.+\s*$/;
const FETCH_PROGRESS_RE = /^\s*(?:-\s*)?(?:fetchMetadata|extract|idealTree|npm\s+(?:timing|sill)\s+.*progress)/i;
const GIT_PROGRESS_RE = /^(?:remote:\s+)?(?:Counting|Compressing|Receiving|Resolving|Unpacking|Writing)\s+objects:/;

export function stripAnsi(input: string): string {
  if (!input) {
    return '';
  }
  let out = input.replace(ANSI_OSC_RE, '');
  out = out.replace(ANSI_CSI_RE, '');
  out = out.replace(ANSI_ESC_RE, '');
  out = out.replace(/\x1B/g, ''); // NOSONAR
  return out;
}

export function containsAnsi(input: string): boolean {
  return input.includes('\u001B[') || input.includes('\u001B]') || /\u001B\[/.test(input);
}

export function handleCarriageReturns(input: string): string {
  if (!input.includes('\r')) {
    return input;
  }
  const lines = input.split('\n');
  const processed: string[] = [];
  for (const line of lines) {
    if (!line.includes('\r')) {
      processed.push(line);
      continue;
    }
    const segments = line.split('\r');
    let current = '';
    for (const seg of segments) {
      if (seg.length === 0) {
        continue;
      }
      if (seg.length >= current.length) {
        current = seg;
      } else {
        current = seg + current.slice(seg.length);
      }
    }
    processed.push(current);
  }
  return processed.join('\n');
}

function isMostlySpinnerChars(trimmed: string): boolean {
  const chars = [...trimmed];
  if (chars.length === 0 || chars.length >= 80) {
    return false;
  }
  let spinnerCount = 0;
  for (const ch of chars) {
    if (SPINNER_CHARS.has(ch) || ch === ' ' || ch === '█' || ch === '░') {
      spinnerCount++;
    }
  }
  return spinnerCount / chars.length > 0.7;
}

function isSpinnerOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) {
    return false;
  }
  for (const ch of trimmed) {
    if (ch === ' ' || SPINNER_CHARS.has(ch)) {
      continue;
    }
    // Allow a few non-spinner chars for npm style "⠋ fetching..."
    if (/[a-zA-Z0-9.]/.test(ch)) {
      // Check if line starts with spinner
      const first = trimmed[0];
      if (first && SPINNER_CHARS.has(first)) {
        return true;
      }
      return false;
    }
    return false;
  }
  return trimmed.length > 0;
}

export function isProgressBarLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (PERCENT_ONLY_RE.test(trimmed)) {
    return true;
  }
  if (
    (PROGRESS_BAR_RE.test(trimmed) || BRACKET_PERCENT_RE.test(trimmed)) &&
    trimmed.length < 120 &&
    !/error|warning|failed|success/i.test(trimmed)
  ) {
    return true;
  }
  if (DOTS_PROGRESS_RE.test(trimmed)) {
    return true;
  }
  if (isSpinnerOnlyLine(line)) {
    return true;
  }
  if (isMostlySpinnerChars(trimmed) || FETCH_PROGRESS_RE.test(line)) {
    return true;
  }
  if (GIT_PROGRESS_RE.test(trimmed) && /%/.test(trimmed) && !/error/i.test(trimmed)) {
    return true;
  }
  // npm progress like "⠋ installing"
  if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s/.test(line)) {
    return true;
  }
  return false;
}

export function removeProgressBars(lines: string[]): string[] {
  const out: string[] = [];
  let lastProgress = false;
  for (const line of lines) {
    if (isProgressBarLine(line)) {
      lastProgress = true;
      continue;
    }
    if (lastProgress && line.trim() === '' && out.length > 0 && out.at(-1)?.trim() === '') {
      continue;
    }
    out.push(line);
    lastProgress = false;
  }
  return out;
}

export function collapseEmptyLines(lines: string[]): string[] {
  const out: string[] = [];
  let lastEmpty = false;
  for (const line of lines) {
    const empty = line.trim() === '';
    if (empty && lastEmpty) {
      continue;
    }
    out.push(line);
    lastEmpty = empty;
  }
  return out;
}
