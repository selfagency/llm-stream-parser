import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface SpillResult {
  /** Path to the temp file on disk, or null when result fits in memory. */
  readonly path: string | null;
  /** Truncated preview string when spilled; full result when within threshold. */
  readonly preview: string;
}

/**
 * Spills a tool result to disk when it exceeds `maxChars`.
 *
 * @param result - The full tool result string.
 * @param maxChars - Maximum character count before spilling (default 10_000).
 * @returns `{ preview, path }` — preview is the truncation head when spilled,
 *          path is the temp file location or null.
 */
export function spillToDisk(result: string, maxChars = 10_000): SpillResult {
  if (result.length <= maxChars) {
    return { preview: result, path: null };
  }

  const dir = join(tmpdir(), 'agentsy-tools-spill');
  mkdirSync(dir, { recursive: true });

  const path = join(dir, `${randomUUID()}.txt`);
  writeFileSync(path, result, 'utf-8');

  return {
    preview: `${result.slice(0, maxChars)}... (truncated, full result at ${path})`,
    path
  };
}
