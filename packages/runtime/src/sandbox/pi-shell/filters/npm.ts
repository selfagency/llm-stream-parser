/* biome-ignore-all lint: npm filter branching */
import type { FilterContext, OutputFilterId, ShellFilter } from './types.js';

const NPM_TIMING_RE = /^\s*npm\s+(timing|sill|verb|http)\s+/i;
const NPM_INFO_RE = /^\s*npm\s+info\s+/i;
const PNPM_FETCH_RE = /^\s*Progress:\s+resolved\s+\d+.*|^\s*Packages:\s+\+\d+/;
const YARN_INFO_RE = /^\s*yarn\s+info\s+/i;
const BUN_FETCH_RE = /^\s*bun\s+(?:install|add)\s+v.*\(\d+ms\)/i;

const ERROR_RE =
  /(?:ERR!|error|ERR_.*|Yarn Error|ELIFECYCLE|Failed to compile|Module not found|Cannot find module|EACCES|ENOENT)/i;
const WARN_RE = /(?:WARN|warn)\s+/i;

export class NpmFilter implements ShellFilter {
  readonly id: OutputFilterId = 'npm';

  detect(context: FilterContext): boolean {
    const cmd = (context.command ?? '').toLowerCase();
    if (/\b(npm|yarn|pnpm|bun)\b/.test(cmd) || cmd.includes('npm run') || cmd.includes('yarn run')) {
      return true;
    }
    const sample = context.outputSample ?? '';
    return /^\s*npm\s+(ERR!|WARN|sill|timing)/m.test(sample) || /yarn\s+info|Packages:\s+\+\d+/.test(sample);
  }

  filter(lines: string[]): string[] {
    const out: string[] = [];
    let filteredNoise = 0;
    let addedPackages: string | null = null;

    for (const raw of lines) {
      const trimmed = raw.trim();

      if (trimmed === '') {
        if (out.length > 0 && out.at(-1)?.trim() === '') {
          continue;
        }
        out.push(raw);
        continue;
      }

      if (ERROR_RE.test(raw)) {
        out.push(raw);
        continue;
      }

      if (WARN_RE.test(raw) || /npm\s+WARN/.test(raw)) {
        out.push(raw);
        continue;
      }

      const isSummary =
        /^\s*added\s+\d+\s+packages?(?:.*in\s+[\d.]+s)?/i.test(raw) ||
        /^\s*audited\s+\d+\s+packages/.test(raw) ||
        /^\s*found\s+\d+\s+vulnerabilit/.test(raw) ||
        /^\s*up to date, audited/.test(raw) ||
        /^\s*Done in\s+[\d.]+s/.test(raw) ||
        /^\s*Build succeeded|^\s*Build failed|^\s*Compiled/.test(raw) ||
        /^\s*✔\s+/.test(raw);

      if (isSummary) {
        if (/added\s+\d+\s+packages/i.test(raw)) {
          addedPackages = raw.trim();
        }
        out.push(raw);
        continue;
      }

      const isNoise =
        NPM_TIMING_RE.test(raw) ||
        NPM_INFO_RE.test(raw) ||
        PNPM_FETCH_RE.test(raw) ||
        YARN_INFO_RE.test(raw) ||
        BUN_FETCH_RE.test(raw);

      if (isNoise) {
        filteredNoise++;
        continue;
      }

      if (/npm\s+(http|timing)\s+fetch/.test(raw) || /\[.*?\]\s+.*\b(fetched|idealTree)\b/.test(raw)) {
        filteredNoise++;
        continue;
      }

      if (/^\s*\[.*\/.*\]\s*(Resolving|Fetching|Linking|Building)\s+/i.test(raw)) {
        filteredNoise++;
        continue;
      }

      if (/^Progress:.*/.test(raw) || /^\s*Packages:\s+\+\d+\s+-\d+\s+\+\+\+\+/.test(raw)) {
        filteredNoise++;
        continue;
      }

      if (raw.length < 400) {
        if (/^[\s.]{10,}$/.test(raw) || /^[\s-]{10,}$/.test(raw)) {
          filteredNoise++;
          continue;
        }
        out.push(raw);
      } else {
        filteredNoise++;
      }
    }

    if (filteredNoise > 5) {
      const summary = addedPackages
        ? `… [npm] ${filteredNoise} verbose lines filtered, ${addedPackages.toLowerCase()} …`
        : `… [npm] ${filteredNoise} verbose timing/silly/http lines filtered …`;
      const summaryIdx = out.findIndex(l => /added\s+\d+\s+packages|audited|Done in/i.test(l));
      if (summaryIdx >= 0) {
        out.splice(summaryIdx, 0, summary);
      } else {
        out.unshift(summary);
      }
    }

    const deduped: string[] = [];
    for (const line of out) {
      if (deduped.length > 0 && deduped.at(-1) === line) {
        continue;
      }
      deduped.push(line);
    }

    return deduped;
  }
}

export function createNpmFilter(): ShellFilter {
  return new NpmFilter();
}
