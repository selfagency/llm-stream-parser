/**
 * Slash command argument substitution.
 *
 * Supports:
 * - $ARGUMENTS → full argument string after the slash command name
 * - $1, $2, ...$N → positional args (1-indexed), quoted args preserved as single tokens
 * - Escaping via $$ or \$ → literal $
 *
 * Example:
 *   invocation: "/refactor src/utils/parser.ts"
 *   template:   "Refactor $ARGUMENTS to improve readability"
 *   → "Refactor src/utils/parser.ts to improve readability"
 *
 * Factory: createArgumentSubstitutor() returns the public API surface.
 */

export interface SlashInvocation {
  readonly args: readonly string[];
  readonly argsString: string;
  readonly commandName: string;
}

export interface SubstitutionResult {
  /** Parsed positional args. */
  readonly args: readonly string[];
  /** Raw args string (everything after command name, trimmed). */
  readonly argsString: string;
  /** Fully expanded template after substitution. */
  readonly substituted: string;
  /** Warnings for missing positional args etc. */
  readonly warnings: readonly string[];
}

const ESCAPED_DOLLAR_PLACEHOLDER = '\u0000__ESCAPED_DOLLAR__\u0000';

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function skipWhitespace(input: string, start: number): number {
  let idx = start;
  while (idx < input.length) {
    const ch = input[idx] as string;
    if (!isWhitespace(ch)) {
      break;
    }
    idx += 1;
  }
  return idx;
}

interface ParseState {
  current: string;
  inDouble: boolean;
  inSingle: boolean;
  result: string[];
}

function createParseState(): ParseState {
  return { current: '', inDouble: false, inSingle: false, result: [] };
}

function flushToken(state: ParseState): void {
  if (state.current.length > 0) {
    state.result.push(state.current);
    state.current = '';
  }
}

function tryHandleBackslashEscape(input: string, pos: number, state: ParseState): number | null {
  const ch = input[pos] as string;
  const next = input[pos + 1] as string | undefined;
  if (ch !== '\\' || state.inSingle) {
    return null;
  }
  if (next === '"' || next === "'" || next === '\\' || next === '$') {
    state.current += next;
    return pos + 2;
  }
  if (next !== undefined && (next === ' ' || next === '\t')) {
    state.current += next;
    return pos + 2;
  }
  return null;
}

function tryHandleQuote(input: string, pos: number, state: ParseState): number | null {
  const ch = input[pos] as string;
  if (ch === "'" && !state.inDouble) {
    state.inSingle = !state.inSingle;
    return pos + 1;
  }
  if (ch === '"' && !state.inSingle) {
    state.inDouble = !state.inDouble;
    return pos + 1;
  }
  return null;
}

function tryHandleWhitespace(input: string, pos: number, state: ParseState): number | null {
  const ch = input[pos] as string;
  if (isWhitespace(ch) && !state.inSingle && !state.inDouble) {
    flushToken(state);
    const nextPos = skipWhitespace(input, pos);
    return nextPos;
  }
  return null;
}

/**
 * Parse a raw argument string into positional tokens.
 * Respects single and double quotes:
 *   - "a b" → ["a b"]
 *   - 'a b' → ["a b"]
 *   - foo "bar baz" qux → ["foo", "bar baz", "qux"]
 *
 * Backslash escaping inside tokens is supported for quotes and backslash.
 * Unclosed quotes consume to end of string.
 */
export function parseArgumentString(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return [];
  }

  const state = createParseState();
  let i = 0;

  while (i < trimmed.length) {
    const esc = tryHandleBackslashEscape(trimmed, i, state);
    if (esc !== null) {
      i = esc;
      continue;
    }

    const quote = tryHandleQuote(trimmed, i, state);
    if (quote !== null) {
      i = quote;
      continue;
    }

    const ws = tryHandleWhitespace(trimmed, i, state);
    if (ws !== null) {
      i = ws;
      continue;
    }

    state.current += trimmed[i] as string;
    i += 1;
  }

  flushToken(state);
  return state.result;
}

/**
 * Parse a full slash invocation line like "/refactor src/a.ts src/b.ts"
 * into command name, raw args string, and tokenized args.
 */
export function parseSlashInvocation(input: string): SlashInvocation {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { args: [], argsString: '', commandName: '' };
  }

  const firstSpaceIndex = trimmed.search(/\s/u);
  if (firstSpaceIndex === -1) {
    return {
      args: [],
      argsString: '',
      commandName: trimmed
    };
  }

  const commandName = trimmed.slice(0, firstSpaceIndex);
  const argsString = trimmed.slice(firstSpaceIndex + 1).trim();
  const args = parseArgumentString(argsString);

  return {
    args,
    argsString,
    commandName
  };
}

function replacePositionalPlaceholders(template: string, args: string[], warnings: string[]): string {
  return template.replace(/\$(\d+)/gu, (_match, digitGroup: string) => {
    const index = Number.parseInt(digitGroup, 10);
    if (Number.isNaN(index)) {
      return _match;
    }
    const zeroBased = index - 1;
    if (zeroBased >= 0 && zeroBased < args.length) {
      return args[zeroBased] ?? '';
    }
    warnings.push(`Missing argument $${digitGroup}: only ${args.length} argument(s) provided`);
    return '';
  });
}

/**
 * Core substitution logic.
 *
 * Steps:
 * 1. Escape $$ and \$ to placeholder to avoid double-expansion
 * 2. Replace $ARGUMENTS with raw argsString (exact, case-sensitive)
 * 3. Replace $N with positional arg N (1-indexed), empty + warning if missing
 * 4. Restore placeholder → $
 */
export function substituteArguments(template: string, argsString: string): SubstitutionResult {
  const args = parseArgumentString(argsString);
  const warnings: string[] = [];

  let working = template.replaceAll('$$', ESCAPED_DOLLAR_PLACEHOLDER).replaceAll('\\$', ESCAPED_DOLLAR_PLACEHOLDER);

  working = working.replaceAll('$ARGUMENTS', argsString);
  working = replacePositionalPlaceholders(working, [...args], warnings);
  working = working.replaceAll(ESCAPED_DOLLAR_PLACEHOLDER, '$');

  return {
    args,
    argsString,
    substituted: working,
    warnings
  };
}

/**
 * Convenience: expand a prompt template using a full slash invocation string
 * like "/refactor src/utils/parser.ts"
 */
export function expandSlashCommandPrompt(template: string, invocationLine: string): SubstitutionResult {
  const parsed = parseSlashInvocation(invocationLine);
  return substituteArguments(template, parsed.argsString);
}

/**
 * Factory for public API — ESM-first, functional.
 */
export function createArgumentSubstitutor(): {
  expandSlashCommandPrompt: typeof expandSlashCommandPrompt;
  parseArgumentString: typeof parseArgumentString;
  parseSlashInvocation: typeof parseSlashInvocation;
  substituteArguments: typeof substituteArguments;
} {
  return {
    expandSlashCommandPrompt,
    parseArgumentString,
    parseSlashInvocation,
    substituteArguments
  };
}
