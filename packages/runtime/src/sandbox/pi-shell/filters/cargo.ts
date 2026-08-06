/* biome-ignore-all lint: cargo filter needs branching for error context */
import type { FilterContext, OutputFilterId, ShellFilter } from './types.js';

const COMPILING_RE = /^\s*Compiling\s+\S+/;
const FRESH_RE = /^\s*Fresh\s+\S+/;
const CHECKING_RE = /^\s*Checking\s+\S+/;
const RUNNING_RE = /^\s*Running\s+(`|.*target\/)/;
const FINISHED_RE = /^\s*Finished\s+/;
const ERROR_RE = /(^|\s)error(\[|:)|error:\s+.*could\s+not\s+compile|error\[E\d+\]/i;
const WARN_RE = /^\s*warning:\s+/i;
const RUSTC_LOCATION_RE = /^\s*-->\s+/;
const RUSTC_CODE_LINE_RE = /^\s*\d+\s*\|\s*/;
const CARGO_TEST_RUN_RE = /^\s*Running\s+.*--test\s+|^\s*Running unittests/;
const TEST_RESULT_RE = /test result:/;
const FAILED_TEST_RE = /^\s*test\s+.*\s+\.\.\.\s+FAILED|^\s*failures:/i;
const PASSED_TEST_RE = /ok\.\s+\d+\s+passed/;

function isRustErrorContext(line: string): boolean {
  if (RUSTC_LOCATION_RE.test(line)) {
    return true;
  }
  if (RUSTC_CODE_LINE_RE.test(line)) {
    return true;
  }
  if (/^\s*\|\s*\^/.test(line)) {
    return true;
  }
  return /^\s*=\s*(note|help):/i.test(line);
}

function isSummaryLine(line: string): boolean {
  return (
    FINISHED_RE.test(line) ||
    TEST_RESULT_RE.test(line) ||
    FAILED_TEST_RE.test(line) ||
    /^\s*error:\s+.*(could not compile|aborting|failed)/i.test(line) ||
    /^\s*Build (failed|successful)/i.test(line) ||
    /^\s*failures:/i.test(line) ||
    PASSED_TEST_RE.test(line) ||
    /^\s*running\s+\d+\s+tests?/i.test(line) ||
    /^\s*test\s+.*\s+\.\.\.\s+(ok|FAILED)/i.test(line)
  );
}

export class CargoFilter implements ShellFilter {
  readonly id: OutputFilterId = 'cargo';

  detect(context: FilterContext): boolean {
    const cmd = (context.command ?? '').toLowerCase();
    if (/\bcargo\b/.test(cmd)) {
      return true;
    }
    const sample = context.outputSample ?? '';
    if (COMPILING_RE.test(sample) && /Finished|Compiling/.test(sample)) {
      return true;
    }
    return /\bFinished\s+`?dev|release`?\s+profile/.test(sample);
  }

  filter(lines: string[]): string[] {
    const out: string[] = [];
    let compilingCount = 0;
    let freshCount = 0;
    let inErrorBlock = false;
    const errorBuffer: string[] = [];

    const flushError = (): void => {
      if (errorBuffer.length > 0) {
        out.push(...errorBuffer);
        errorBuffer.length = 0;
      }
    };

    for (const raw of lines) {
      const trimmed = raw.trim();

      if (ERROR_RE.test(raw) || /^\s*error:\s+/i.test(raw)) {
        flushError();
        inErrorBlock = true;
        errorBuffer.push(raw);
        continue;
      }

      if (inErrorBlock) {
        const isBoundary =
          trimmed === '' || COMPILING_RE.test(raw) || FINISHED_RE.test(raw) || TEST_RESULT_RE.test(raw);
        if (isBoundary) {
          flushError();
          inErrorBlock = false;
        } else if (isRustErrorContext(raw) || WARN_RE.test(raw) || raw.includes('|') || trimmed.startsWith('=')) {
          errorBuffer.push(raw);
          continue;
        } else if (errorBuffer.length < 30) {
          errorBuffer.push(raw);
          continue;
        } else {
          flushError();
          inErrorBlock = false;
        }
      }

      if (COMPILING_RE.test(raw)) {
        compilingCount++;
        continue;
      }
      if (FRESH_RE.test(raw) || CHECKING_RE.test(raw)) {
        freshCount++;
        continue;
      }
      if (RUNNING_RE.test(raw)) {
        if (CARGO_TEST_RUN_RE.test(raw)) {
          out.push(raw.replace(/\(.*target\/debug\/deps\/[^)]+\)/, '(test binary)'));
        }
        continue;
      }

      if (isSummaryLine(raw)) {
        out.push(raw);
        continue;
      }

      if (WARN_RE.test(raw)) {
        out.push(raw);
        continue;
      }

      if (raw.toLowerCase().includes('warning') && !FRESH_RE.test(raw)) {
        out.push(raw);
        continue;
      }

      if (trimmed === '' && out.length > 0 && out.at(-1)?.trim() === '') {
        continue;
      }

      if (raw.toLowerCase().includes('error') || raw.includes('FAILED')) {
        out.push(raw);
        continue;
      }

      if (trimmed === '') {
        out.push(raw);
        continue;
      }

      if (trimmed.length > 0 && trimmed.length < 200) {
        if (!COMPILING_RE.test(raw) && !FRESH_RE.test(raw) && !/Compiling|Fresh|Checking/.test(raw)) {
          out.push(raw);
        }
      }
    }

    flushError();

    if (compilingCount > 3 || freshCount > 3) {
      const summary = `… [cargo] ${compilingCount} compiling, ${freshCount} fresh/cached …`;
      const finishedIdx = out.findIndex(l => FINISHED_RE.test(l));
      if (finishedIdx >= 0) {
        out.splice(finishedIdx, 0, summary);
      } else if (!out.some(l => FINISHED_RE.test(l))) {
        out.unshift(summary);
      }
    }

    const collapsed: string[] = [];
    let lastEmpty = false;
    for (const line of out) {
      const empty = line.trim() === '';
      if (empty && lastEmpty) {
        continue;
      }
      collapsed.push(line);
      lastEmpty = empty;
    }

    return collapsed;
  }
}

export function createCargoFilter(): ShellFilter {
  return new CargoFilter();
}
