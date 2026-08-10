/* biome-ignore-all lint: python filter branching */

import { collapseBlankLines } from './shared.js';
import type { FilterContext, OutputFilterId, ShellFilter } from './types.js';

export class PythonFilter implements ShellFilter {
  readonly id: OutputFilterId = 'python';

  detect(context: FilterContext): boolean {
    const cmd = (context.command ?? '').toLowerCase();
    if (/\b(python|pip|pytest|python3|poetry|uv)\b/.test(cmd)) {
      return true;
    }
    const sample = context.outputSample ?? '';
    return /^Collecting\s+\S+/.test(sample) || /pytest.*passed|failed/i.test(sample);
  }

  filter(lines: string[]): string[] {
    const out: string[] = [];
    let filtered = 0;

    for (const raw of lines) {
      const { keep, trimmed } = collapseBlankLines(out, raw);
      if (!keep) {
        continue;
      }

      if (/error|failed|traceback|exception|assertion/i.test(raw)) {
        out.push(raw);
        continue;
      }

      if (/^Collecting\s+\S+/.test(raw) || /^Downloading\s+/.test(raw) || /^Using cached/.test(raw)) {
        filtered++;
        continue;
      }

      if (/^\s*Requirement already satisfied/.test(raw)) {
        filtered++;
        continue;
      }

      if (/=+\s*\d+\s+passed|FAILED|passed,/.test(raw) || /^\s*FAILED\s+/.test(raw)) {
        out.push(raw);
        continue;
      }

      if (/Installing collected packages:/.test(raw) || /Successfully installed/.test(raw)) {
        out.push(raw);
        continue;
      }

      if (raw.length < 500) {
        out.push(raw);
      }
    }

    if (filtered > 5) {
      out.unshift(`… [python] ${filtered} pip download/cache lines filtered …`);
    }

    return out;
  }
}

export function createPythonFilter(): ShellFilter {
  return new PythonFilter();
}
