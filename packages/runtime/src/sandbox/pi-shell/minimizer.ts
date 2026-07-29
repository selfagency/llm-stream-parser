/**
 * pi-shell output minimizer
 * Per-language filters that reduce verbose command output to essential signal.
 * @module
 */
import {
  collapseEmptyLines,
  detectFilter,
  type FilterContext,
  getFilterById,
  handleCarriageReturns,
  type OutputFilterId,
  removeProgressBars,
  stripAnsi
} from './filters/index.js';

export interface MinimizerOptions {
  readonly collapseEmpty?: boolean;
  readonly command?: string;
  readonly forceFilter?: OutputFilterId | null;
  readonly maxLines?: number;
  readonly preserveErrors?: boolean;
  readonly removeProgress?: boolean;
  readonly stripAnsi?: boolean;
}

export interface MinimizedOutput {
  readonly appliedFilter: OutputFilterId | null;
  readonly detectedTool: OutputFilterId | null;
  readonly filteredLines: number;
  readonly hadAnsi: boolean;
  readonly originalLines: number;
  readonly output: string;
  readonly truncated: boolean;
}

export interface ShellMinimizer {
  detectTool(command: string, outputSample?: string): OutputFilterId | null;
  minimize(input: string, command?: string, options?: MinimizerOptions): MinimizedOutput;
  minimizeLines(lines: string[], context?: FilterContext, options?: MinimizerOptions): MinimizedOutput;
}

const DEFAULT_MAX_LINES = 600;
const HEAD_LINES = 200;
const TAIL_LINES = 200;

const ERROR_PATTERNS = [/error/i, /failed/i, /fatal/i, /exception/i, /panic/i, /FAIL\b/, /\[ERROR\]/i];

function containsError(line: string): boolean {
  for (const re of ERROR_PATTERNS) {
    if (re.test(line)) {
      return true;
    }
  }
  return false;
}

function applyHeadTailBuffer(lines: string[], maxLines: number): { lines: string[]; truncated: boolean } {
  if (lines.length <= maxLines) {
    return { lines, truncated: false };
  }
  if (lines.length > maxLines * 1.5) {
    const head = lines.slice(0, HEAD_LINES);
    const tail = lines.slice(-TAIL_LINES);
    const omitted = lines.length - HEAD_LINES - TAIL_LINES;
    const marker = `… [truncated ${omitted} lines - showing ${HEAD_LINES} head + ${TAIL_LINES} tail] …`;
    return { lines: [...head, marker, ...tail], truncated: true };
  }
  const headCount = Math.floor(maxLines * 0.7);
  const omitted = lines.length - headCount;
  const marker = `… [truncated ${omitted} lines] …`;
  return { lines: [...lines.slice(0, headCount), marker], truncated: true };
}

function buildFilterContext(command: string | undefined, outputSample: string | undefined): FilterContext {
  const ctx: FilterContext = {};
  if (command !== undefined) {
    (ctx as { command: string }).command = command;
  }
  if (outputSample !== undefined) {
    (ctx as { outputSample: string }).outputSample = outputSample;
  }
  return ctx;
}

function detectFromContext(command: string | undefined, outputSample: string): OutputFilterId | null {
  const ctx = buildFilterContext(command, outputSample);
  return detectFilter(ctx);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: minimizer pipeline inherently branched
function processLines(
  inputLines: string[],
  context: FilterContext | undefined,
  options: MinimizerOptions
): MinimizedOutput {
  const stripAnsiOpt = options.stripAnsi !== false;
  const removeProgressOpt = options.removeProgress !== false;
  const collapseEmptyOpt = options.collapseEmpty !== false;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;

  let lines = [...inputLines];
  const originalLines = lines.length;
  let hadAnsi = false;

  const joined = lines.join('\n');
  let processed = handleCarriageReturns(joined);
  if (stripAnsiOpt) {
    const before = processed;
    processed = stripAnsi(processed);
    hadAnsi = before !== processed;
  }
  lines = processed.split('\n');

  const command = context?.command ?? options.command;
  const sample = (context?.outputSample ?? lines.slice(0, 20).join('\n')).slice(0, 2000);
  const detected = options.forceFilter ?? detectFromContext(command, sample) ?? null;

  if (removeProgressOpt) {
    lines = removeProgressBars(lines);
  }

  let applied: OutputFilterId | null = null;
  if (detected) {
    const filter = getFilterById(detected);
    if (filter) {
      const beforeCount = lines.length;
      const filtered = filter.filter(lines);
      if (options.preserveErrors !== false) {
        const errorLines = lines.filter(l => containsError(l));
        const filteredSet = new Set(filtered);
        const missingErrors = errorLines.filter(l => !filteredSet.has(l));
        if (missingErrors.length > 0) {
          filtered.push(...missingErrors);
        }
      }
      lines = filtered;
      if (lines.length < beforeCount || detected) {
        applied = detected;
      }
    }
  }

  if (collapseEmptyOpt) {
    lines = collapseEmptyLines(lines);
    while (lines.length > 0 && lines[0]?.trim() === '') {
      lines.shift();
    }
    while (lines.length > 0 && lines.at(-1)?.trim() === '') {
      lines.pop();
    }
  }

  const { lines: finalLines, truncated } = applyHeadTailBuffer(lines, maxLines);

  return {
    appliedFilter: applied,
    detectedTool: detected,
    filteredLines: finalLines.length,
    hadAnsi,
    originalLines,
    output: finalLines.join('\n'),
    truncated
  };
}

export class PiShellMinimizer implements ShellMinimizer {
  detectTool(command: string, outputSample?: string): OutputFilterId | null {
    const ctx = buildFilterContext(command, outputSample);
    return detectFilter(ctx);
  }

  minimize(input: string, command?: string, options: MinimizerOptions = {}): MinimizedOutput {
    const mergedCommand = command ?? options.command;
    const merged: MinimizerOptions = {
      ...options,
      ...(mergedCommand === undefined ? {} : { command: mergedCommand })
    };
    const ctx = buildFilterContext(merged.command, input.slice(0, 2000));
    const lines = input.split('\n');
    return processLines(lines, ctx, merged);
  }

  minimizeLines(lines: string[], context?: FilterContext, options: MinimizerOptions = {}): MinimizedOutput {
    return processLines(lines, context, options);
  }
}

export function createShellMinimizer(_options?: MinimizerOptions): ShellMinimizer {
  return new PiShellMinimizer();
}

export function minimizeShellOutput(input: string, command?: string, options?: MinimizerOptions): MinimizedOutput {
  const minimizer = createShellMinimizer();
  return minimizer.minimize(input, command, options);
}

export function stripAnsiCodes(input: string): string {
  return stripAnsi(handleCarriageReturns(input));
}
