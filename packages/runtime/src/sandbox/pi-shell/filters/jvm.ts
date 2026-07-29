/* biome-ignore-all lint: jvm filter needs branching for gradle+maven */
import type { FilterContext, OutputFilterId, ShellFilter } from './types.js';

const GRADLE_TASK_UPTODATE_RE = />\s*Task\s+:\S+\s+UP-TO-DATE/;
const GRADLE_TASK_RE = />\s*Task\s+:\S+/;
const GRADLE_BUILD_RE = /BUILD (SUCCESSFUL|FAILED)/;
const GRADLE_DOWNLOAD_RE = /^\s*Download\s+https?:\/\/|^\s*>\s*IDLE|^\s*>\s*0%\s+WAITING/;
const MAVEN_DOWNLOAD_RE = /^\[INFO\]\s+(Downloading|Downloaded|Progress \(.*\))/;
const MAVEN_INFO_NOISE_RE = /^\[INFO\]\s+---\s+.*---|^\[INFO\]\s+Building\s+.*\[.*\]|^\[INFO\]\s+---\s*\[.*\]/;
const ERROR_RE = /(?:\[ERROR\]|FAILED|> Task :\S+ FAILED|\* What went wrong|\* Exception is|Caused by:|\s*error:\s)/i;
const SUMMARY_RE = /BUILD (SUCCESSFUL|FAILED)|Tests run:|FAILURE:|SUCCESS:/i;

export class JvmFilter implements ShellFilter {
  readonly id: OutputFilterId = 'jvm';

  detect(context: FilterContext): boolean {
    const cmd = (context.command ?? '').toLowerCase();
    if (/\b(gradle|gradlew|\.\/gradlew|mvn|mvnw|\.\/mvnw)\b/.test(cmd)) {
      return true;
    }
    const sample = context.outputSample ?? '';
    return (
      />\s*Task\s+:\S+/.test(sample) || /\[INFO\]\s+BUILD/.test(sample) || /BUILD SUCCESSFUL|BUILD FAILED/.test(sample)
    );
  }

  filter(lines: string[]): string[] {
    const out: string[] = [];
    let filteredTasks = 0;
    let filteredDownloads = 0;
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

      if (trimmed === '') {
        if (out.length > 0 && out.at(-1)?.trim() === '') {
          continue;
        }
        if (inErrorBlock) {
          errorBuffer.push(raw);
          if (errorBuffer.length > 40) {
            flushError();
            inErrorBlock = false;
          }
          continue;
        }
        out.push(raw);
        continue;
      }

      if (ERROR_RE.test(raw) || /FAILURE|Exception/i.test(raw)) {
        if (!inErrorBlock) {
          inErrorBlock = true;
        }
        errorBuffer.push(raw);
        continue;
      }

      if (inErrorBlock) {
        const isBoundary = GRADLE_TASK_RE.test(raw) || GRADLE_BUILD_RE.test(raw) || SUMMARY_RE.test(raw);
        if (isBoundary) {
          flushError();
          inErrorBlock = false;
        } else {
          errorBuffer.push(raw);
          continue;
        }
      }

      if (GRADLE_TASK_UPTODATE_RE.test(raw)) {
        filteredTasks++;
        continue;
      }

      if (GRADLE_DOWNLOAD_RE.test(raw) || MAVEN_DOWNLOAD_RE.test(raw)) {
        filteredDownloads++;
        continue;
      }

      if (/> Task :\S+ FAILED/.test(raw) || /\[ERROR\]/i.test(raw)) {
        out.push(raw);
        continue;
      }

      if (
        GRADLE_BUILD_RE.test(raw) ||
        SUMMARY_RE.test(raw) ||
        /^\s*\*\s+(What went wrong|Try:|Exception)/.test(raw) ||
        /^\s*>\s*Task/.test(raw)
      ) {
        out.push(raw);
        continue;
      }

      if (MAVEN_INFO_NOISE_RE.test(raw) || /^\[INFO\]\s+Nothing to compile/.test(raw)) {
        filteredDownloads++;
        continue;
      }

      if (/Tests run:|FAILURE|Caused by:/i.test(raw)) {
        out.push(raw);
        continue;
      }

      if (raw.length < 400 && !GRADLE_DOWNLOAD_RE.test(raw)) {
        out.push(raw);
      }
    }

    flushError();

    if (filteredTasks > 0 || filteredDownloads > 0) {
      const summary = `… [jvm] ${filteredTasks} up-to-date tasks, ${filteredDownloads} download/info lines filtered …`;
      if (filteredTasks > 3 || filteredDownloads > 5) {
        const buildIdx = out.findIndex(l => GRADLE_BUILD_RE.test(l) || SUMMARY_RE.test(l));
        if (buildIdx >= 0) {
          out.splice(buildIdx, 0, summary);
        } else {
          out.unshift(summary);
        }
      }
    }

    return out;
  }
}

export function createJvmFilter(): ShellFilter {
  return new JvmFilter();
}
