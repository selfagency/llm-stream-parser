import { execSync } from 'node:child_process';

export interface ExecResult {
  stderr: string;
  stdout: string;
}

/**
 * Run a CLI command synchronously.
 * Returns stdout/stderr — does NOT throw on non-zero exit.
 * Tests mock this via vi.mock('../local/exec.js').
 */
export function runCli(command: string, options?: { timeout?: number; env?: Record<string, string> }): ExecResult {
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      timeout: options?.timeout ?? 15_000,
      stdio: 'pipe',
      env: options?.env ? { ...process.env, ...options.env } : undefined
    });
    return { stdout: stdout.trim(), stderr: '' };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stderr' in error) {
      return { stdout: '', stderr: (error as { stderr: string }).stderr?.trim() ?? '' };
    }
    throw error;
  }
}

export function cliNotFoundError(cli: string): Error {
  const hints: Record<string, string> = {
    op: 'https://1password.com/downloads/command-line/',
    bw: 'https://bitwarden.com/help/cli/',
    dcli: 'https://www.dashlane.com/download',
    lpass: 'https://lastpass.com/support.php?cmd=showfaq&id=4278',
    security: 'Built into macOS (Security.framework)'
  };
  const hint = Object.hasOwn(hints, cli) ? hints[cli] : `Install "${cli}" and ensure it is on your PATH`;
  return new Error(`CLI "${cli}" not found. ${hint}`);
}

/**
 * Check whether a binary is available on PATH.
 */
export function isCliInstalled(cli: string): boolean {
  try {
    execSync(`which ${cli}`, { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
