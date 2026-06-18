import type { SpawnSyncOptions, SpawnSyncReturns } from 'node:child_process';
import { spawnSync } from 'node:child_process';

import { safePathEnv } from '@agentsy/shared/safe-path';

function resolveGitExecutable(): string | null {
  // nosemgrep: command-injection-path, NOSONAR
  // PATH is explicitly restricted to safe system directories via safePathEnv().
  const direct = spawnSync('git', ['--version'], {
    env: safePathEnv(),
    shell: false,
    stdio: 'ignore'
  });

  if (direct.status === 0) {
    return 'git';
  }

  const locatorCommand = process.platform === 'win32' ? 'where' : 'which';
  // nosemgrep: command-injection-path, NOSONAR
  // PATH is explicitly restricted to safe system directories via safePathEnv().
  const located = spawnSync(locatorCommand, ['git'], {
    encoding: 'utf-8',
    env: safePathEnv(),
    shell: false
  });

  if (located.status === 0) {
    const candidate = located.stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export interface GitHelpers {
  resolveGitExecutable(): string | null;
  runGit(args: readonly string[], options?: SpawnSyncOptions): SpawnSyncReturns<string>;
  setGitCommand(command: string): void;
}

export function createGitHelpers(root: string): GitHelpers {
  let gitCommand = 'git';

  function runGit(args: readonly string[], options: SpawnSyncOptions = {}): SpawnSyncReturns<string> {
    const result = spawnSync(gitCommand, args, {
      cwd: root,
      encoding: 'utf-8',
      shell: false,
      ...options,
      env: { ...safePathEnv(), ...options.env }
    });

    if (result.status !== 0) {
      const stderr = String(result.stderr || '').trim();
      const stdout = String(result.stdout || '').trim();
      const details = stderr ?? stdout ?? `git ${args.join(' ')} failed with exit code ${result.status}`;
      throw new Error(details);
    }

    return result as unknown as SpawnSyncReturns<string>;
  }

  return {
    resolveGitExecutable,
    runGit,
    setGitCommand(command: string): void {
      gitCommand = command;
    }
  };
}
