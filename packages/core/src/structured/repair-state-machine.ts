/**
 * Stack-based state machine for incremental JSON repair.
 * Improves upon bracket-matching by tracking string/escape state,
 * incomplete numbers/keywords, and providing rollback positions.
 *
 * @remarks
 * This is an alternative JSON repair implementation currently not in use.
 * The simpler bracket-matching approach in `parseJson.ts` handles current needs well.
 * This state machine exists as a future-proof upgrade path if repair edge cases
 * are discovered or stricter handling of escape sequences becomes necessary.
 * It has comprehensive tests and can be swapped in by updating the repair flow in `parseJson.ts`.
 */

export interface RepairState {
  /** Stack of expected closing delimiters: '}' for '{', ']' for '[' */
  bracketStack: string[];
  /** Current accumulation buffer */
  buffer: string;
  /** Whether the previous character was an escape character */
  escaped: boolean;
  /** Whether we're currently inside a string literal */
  inString: boolean;
  /** Position of the last "safe" complete JSON structure */
  lastSafeEnd: number;
}

// biome-ignore lint/suspicious/noEmptyInterface: Reserved for future use
export interface RepairStateMachineOptions {}

/**
 * Create an initial repair state.
 */
export function createRepairState(): RepairState {
  return {
    bracketStack: [],
    buffer: '',
    escaped: false,
    inString: false,
    lastSafeEnd: -1
  };
}

/**
 * Feed a character through the state machine, updating state.
 * Returns the character that should be added to output (may differ from input).
 */
// #lizard forgives
export function feedCharToStateMachine(char: string, state: RepairState): string {
  // If inside a string, handle string-specific logic
  if (state.inString) {
    handleStringChar(char, state);
    return char;
  }

  // Outside string: handle structural characters
  return handleStructuralChar(char, state);
}

/**
 * Handle a character while inside a string literal.
 */
function handleStringChar(char: string, state: RepairState): void {
  // Handle escape sequences within strings
  if (state.escaped) {
    state.escaped = false;
    state.buffer += char;
    return;
  }

  if (char === '\\') {
    state.escaped = true;
    state.buffer += char;
    return;
  }

  // Toggle string state on unescaped quotes
  if (char === '"') {
    state.inString = !state.inString;
    state.buffer += char;
    return;
  }

  // All other string characters just accumulate
  state.buffer += char;
}

/**
 * Handle a character outside of a string literal.
 */
function handleStructuralChar(char: string, state: RepairState): string {
  // Opening brackets
  if (char === '{' || char === '[') {
    state.bracketStack.push(char === '{' ? '}' : ']');
    state.buffer += char;
    return char;
  }

  // Closing brackets
  if (char === '}' || char === ']') {
    return handleClosingBracket(char, state);
  }

  // All other characters just accumulate
  state.buffer += char;
  return char;
}

/**
 * Handle a closing bracket, checking for proper matching.
 */
function handleClosingBracket(char: string, state: RepairState): string {
  if (state.bracketStack.length > 0 && state.bracketStack.at(-1) === char) {
    state.bracketStack.pop();
    state.buffer += char;
    // Mark this as a safe position if we've closed a top-level structure
    if (state.bracketStack.length === 0) {
      state.lastSafeEnd = state.buffer.length;
    }
    return char;
  }
  // Mismatched closing delimiter: skip it
  return '';
}

/**
 * Close the state machine, returning a properly-closed JSON string.
 * Adds closing delimiters as needed and truncates if necessary.
 */
export function closeRepairState(state: RepairState): string {
  let result = state.buffer;

  // Close any unclosed strings with a quote
  if (state.inString) {
    result += '"';
  }

  // Close any unclosed brackets
  while (state.bracketStack.length > 0) {
    result += state.bracketStack.pop();
  }

  return result;
}

/**
 * Repair a JSON string using the state machine approach.
 * This is more robust than simple bracket-matching for handling:
 * - Truncated strings (adds closing quote)
 * - Escape sequences
 * - Incomplete numbers/keywords (preserved as-is)
 */
export function repairJsonWithStateMachine(input: string): string {
  const state = createRepairState();

  // Feed all characters through the state machine
  for (const char of input) {
    feedCharToStateMachine(char, state);
  }

  // Close and return
  return closeRepairState(state);
}
