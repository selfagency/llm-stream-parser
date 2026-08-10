/* biome-ignore-all lint: git filter branching */

import { collapseBlankLines } from './shared.js';
import type { FilterContext, OutputFilterId, ShellFilter } from './types.js';

const GIT_REMOTE_PROGRESS_RE =
  /^\s*(remote:\s+)?(Enumerating|Counting|Compressing|Receiving|Resolving|Unpacking|Writing)\s+objects:/;
const GIT_PROGRESS_PERCENT_RE = /^\s*(remote:\s+)?(Receiving|Resolving|Unpacking).*\(\d+\/\d+\)/;
const GIT_SIDE_BAND_RE = /^\s*remote:\s+Total\s+\d+/;
const GIT_FETCH_PROGRESS_RE = /^\s*From\s+.*|^\s*\*\s+\[new (branch|tag)\]/;

export class GitFilter implements ShellFilter {
  readonly id: OutputFilterId = 'git';

  detect(context: FilterContext): boolean {
    const cmd = (context.command ?? '').trim().toLowerCase();
    if (cmd.startsWith('git ') || cmd === 'git' || cmd.includes(' git ')) {
      return true;
    }
    const sample = context.outputSample ?? '';
    return /^(remote:|Enumerating|Counting|Unpacking) objects/.test(sample) || /^To\s+https?:\/\//.test(sample);
  }

  filter(lines: string[]): string[] {
    const out: string[] = [];
    let filteredProgress = 0;

    for (const raw of lines) {
      const { keep, trimmed } = collapseBlankLines(out, raw);
      if (!keep) {
        continue;
      }

      if (/error:|fatal:|failed to|CONFLICT|rejected/i.test(raw)) {
        out.push(raw);
        continue;
      }

      const isGitProgress = GIT_REMOTE_PROGRESS_RE.test(raw) || GIT_PROGRESS_PERCENT_RE.test(raw);
      if (isGitProgress && /%/.test(raw) && !/error|fatal/i.test(raw)) {
        if (/100%\s*\(\d+\/\d+\)/.test(raw) && /Receiving objects:.*100%/.test(raw)) {
          out.push(raw);
        } else {
          filteredProgress++;
        }
        continue;
      }

      if (GIT_SIDE_BAND_RE.test(raw)) {
        out.push(raw);
        continue;
      }

      const isSummary =
        /^\s*To\s+https?:\/\//.test(raw) ||
        /^\s*\*\s+\[new branch\]/.test(raw) ||
        /^\s*\*\s+\[new tag\]/.test(raw) ||
        /^\s*branch\s+'.+'\s+set up/.test(raw) ||
        /^\s*\d+\s+files? changed/.test(raw) ||
        /^\s*create mode/.test(raw) ||
        /^\s*delete mode/.test(raw) ||
        GIT_FETCH_PROGRESS_RE.test(raw) ||
        /^\s*Updating\s+[a-f0-9]+\.\.[a-f0-9]+/.test(raw) ||
        /^\s*Fast-forward|^\s*Merge made/.test(raw);

      if (isSummary) {
        out.push(raw);
        continue;
      }

      if (raw.length < 500) {
        if (/^\s*\.+\s*$/.test(raw)) {
          filteredProgress++;
          continue;
        }
        out.push(raw);
      }
    }

    if (filteredProgress > 4) {
      out.push(`… [git] ${filteredProgress} progress lines filtered …`);
    }

    return out;
  }
}

export function createGitFilter(): ShellFilter {
  return new GitFilter();
}
