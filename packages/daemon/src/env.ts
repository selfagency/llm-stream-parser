/**
 * Load `.env` files using Node 22 native `process.loadEnvFile()`.
 *
 * Loads files in priority order: `.env.local` (highest), then `.env`.
 * Existing `process.env` values are never overridden.
 * Missing files are silent (no error).
 * Malformed files throw (caller should catch and log a warning).
 */

/**
 * Load environment variables from `.env` files.
 *
 * Uses Node 22's native `process.loadEnvFile()` which parses standard
 * `.env` format (KEY=VALUE lines, `#` comments, quoted values).
 *
 * @param files - Ordered list of `.env` file paths (default: `['.env.local', '.env']`).
 *   Files earlier in the list take priority.
 * @throws {Error} If a file exists but is malformed (syntax error).
 */
export function loadDotenv(files: string[] = ['.env.local', '.env']): void {
  for (const file of files) {
    try {
      process.loadEnvFile(file);
    } catch (err) {
      // ENOENT — file doesn't exist, skip silently
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      // Re-throw malformed file errors
      throw err;
    }
  }
}
