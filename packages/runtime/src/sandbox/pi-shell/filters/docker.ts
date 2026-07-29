/* biome-ignore-all lint: docker filter needs branching */
import type { FilterContext, OutputFilterId, ShellFilter } from './types.js';

const DOCKER_BUILDKIT_INTERNAL_RE = /^\s*#\d+\s+\[internal\]\s+load\s+|\[internal\].*\(.*\)|^\s*=>\s+\[internal\]/;
const DOCKER_CACHED_RE = /=>\s*CACHED|=>\s*=>\s*.*CACHED/i;
const DOCKER_PROGRESS_RE = /^\s*=>\s+.*\s+\d+\.\d+s|^\s*=>\s+.*\[[^\]]+\]|^\s*#\d+\s+.*DONE\s+\d+\.\d+s/;
const DOCKER_STEP_RE = /^\s*#\d+\s+(?:\[.*\]\s+)?(FROM|RUN|COPY|ADD|WORKDIR|ENV|EXPOSE|CMD|ENTRYPOINT|ARG|LABEL)/;
const DOCKER_ERROR_RE = /error|failed to|Error response from daemon|build failed|ERROR:/i;

export class DockerFilter implements ShellFilter {
  readonly id: OutputFilterId = 'docker';

  detect(context: FilterContext): boolean {
    const cmd = (context.command ?? '').toLowerCase();
    if (/\bdocker\b|\bpodman\b|\bnerdctl\b/.test(cmd)) {
      return true;
    }
    const sample = context.outputSample ?? '';
    return /^\s*#\d+\s+\[internal\]/.test(sample) || /=>\s+\[internal\]/.test(sample) || /Dockerfile/.test(sample);
  }

  filter(lines: string[]): string[] {
    const out: string[] = [];
    let filteredInternal = 0;
    let filteredCached = 0;

    for (const raw of lines) {
      const trimmed = raw.trim();

      if (trimmed === '') {
        if (out.length > 0 && out.at(-1)?.trim() === '') {
          continue;
        }
        out.push(raw);
        continue;
      }

      if (DOCKER_ERROR_RE.test(raw)) {
        out.push(raw);
        continue;
      }

      if (DOCKER_BUILDKIT_INTERNAL_RE.test(raw)) {
        filteredInternal++;
        continue;
      }

      if (DOCKER_CACHED_RE.test(raw)) {
        filteredCached++;
        continue;
      }

      if (/^\s*=>\s+.*transferring context/.test(raw) || /^\s*=>\s+.*naming to/.test(raw)) {
        filteredInternal++;
        continue;
      }

      if (DOCKER_STEP_RE.test(raw)) {
        out.push(raw);
        continue;
      }

      const isSuccessSummary =
        /^\s*=>\s+=>\s+.*writing image|^\s*=>\s+.*exporting layers|^\s*naming to|Successfully built|Successfully tagged|DONE\s+\d+\.\d+s/.test(
          raw
        );
      if (isSuccessSummary) {
        if (!DOCKER_CACHED_RE.test(raw)) {
          out.push(raw);
        } else {
          filteredCached++;
        }
        continue;
      }

      if (/^\s*\[\+\]\s+Building|^\s*#\d+\s+\[stage|^\s*DONE|ERROR/.test(raw)) {
        const isProgress = DOCKER_PROGRESS_RE.test(raw);
        const isError = /ERROR|failed/i.test(raw);
        if (!isProgress || isError) {
          out.push(raw);
        } else if (raw.includes('CACHED')) {
          filteredCached++;
        } else if (raw.length < 200) {
          out.push(raw);
        } else {
          filteredInternal++;
        }
        continue;
      }

      if (DOCKER_PROGRESS_RE.test(raw) && raw.length > 120 && !DOCKER_ERROR_RE.test(raw)) {
        filteredInternal++;
        continue;
      }

      if (raw.length < 400) {
        out.push(raw);
      }
    }

    if (filteredInternal > 3 || filteredCached > 3) {
      const summary = `… [docker] ${filteredInternal} internal/transfer lines, ${filteredCached} cached lines filtered …`;
      const lastIdx = out.findIndex(l => /Successfully built|Successfully tagged|DONE/.test(l));
      if (lastIdx >= 0) {
        out.splice(lastIdx, 0, summary);
      } else {
        out.unshift(summary);
      }
    }

    return out;
  }
}

export function createDockerFilter(): ShellFilter {
  return new DockerFilter();
}
