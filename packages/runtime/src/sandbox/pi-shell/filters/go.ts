/* biome-ignore-all lint: go filter needs branching */
import type { FilterContext, OutputFilterId, ShellFilter } from './types.js';

const GO_DOWNLOAD_RE = /^\s*go:\s+downloading\s+/;
const GO_FOUND_RE = /^\s*go:\s+found\s+/;
const GO_UPDATED_RE = /^\s*go:\s+.*\s+=>\s+v?\d+\.\d+/;
const GO_ERROR_RE = /^[^:]+:\d+:\d*:\s+.*|^#\s+\S+|^\s*FAIL\s+|^---\s+FAIL|^=== RUN|^\s*Error:/;
const FAIL_LINE_RE = /^\s*FAIL\s+|---\s*FAIL|^\s*ok\s+|^\s*FAIL\s*$|^\s*---\s*FAIL/;
const TEST_SUMMARY_RE = /^(ok|FAIL)\s+\S+\s+[\d.]+s|^\s*ok\s+|test result:/i;

export class GoFilter implements ShellFilter {
  readonly id: OutputFilterId = 'go';

  detect(context: FilterContext): boolean {
    const cmd = (context.command ?? '').toLowerCase();
    if (/\bgo\s+(build|test|run|mod|vet|list|install)\b/.test(cmd) || cmd.trimStart().startsWith('go ')) {
      return true;
    }
    const sample = context.outputSample ?? '';
    return /^#\s+\S+.*\n.*\.go:\d+:/m.test(sample);
  }

  filter(lines: string[]): string[] {
    const out: string[] = [];
    let goModNoise = 0;

    for (const raw of lines) {
      const line = raw;
      const trimmed = line.trim();

      if (GO_DOWNLOAD_RE.test(line) || GO_FOUND_RE.test(line) || GO_UPDATED_RE.test(line)) {
        goModNoise++;
        continue;
      }

      if (trimmed === '') {
        if (out.length > 0 && out.at(-1)?.trim() === '') {
          continue;
        }
        out.push(line);
        continue;
      }

      if (
        GO_ERROR_RE.test(line) ||
        FAIL_LINE_RE.test(line) ||
        TEST_SUMMARY_RE.test(line) ||
        /:\d+:\d*:\s+/.test(line) ||
        (/FAIL|error/i.test(line) && line.length < 300)
      ) {
        out.push(line);
        continue;
      }

      if (/^=== RUN/.test(line) || /^--- (PASS|FAIL|SKIP)/.test(line)) {
        out.push(line);
        continue;
      }

      if (/panic:|goroutine \d+ \[|runtime error:|fatal error:/i.test(line) || /^\s+.*\.go:\d+/.test(line)) {
        out.push(line);
        continue;
      }

      if (/^go:\s+/i.test(line)) {
        if (/error|failed|not found/i.test(line)) {
          out.push(line);
        } else {
          goModNoise++;
        }
        continue;
      }

      if (line.length < 500) {
        out.push(line);
      }
    }

    if (goModNoise > 5) {
      const summary = `… [go] ${goModNoise} module download/update lines filtered …`;
      const firstFailIdx = out.findIndex(l => /FAIL|error/i.test(l));
      if (firstFailIdx > 0) {
        out.splice(firstFailIdx, 0, summary);
      } else {
        out.unshift(summary);
      }
    }

    return out;
  }
}

export function createGoFilter(): ShellFilter {
  return new GoFilter();
}
