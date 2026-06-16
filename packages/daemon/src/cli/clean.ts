import { unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface CleanOptions {
  all?: boolean;
}

export async function cleanDaemon(options: CleanOptions = {}): Promise<{ cleaned: boolean; files?: string[] }> {
  const { all = false } = options;

  if (!all) {
    return { cleaned: false };
  }

  const daemonDir = join(homedir(), '.agentsy');
  const filesToClean: string[] = [];

  try {
    await unlink(join(daemonDir, 'daemon.sock'));
    filesToClean.push('daemon.sock');
  } catch {
    // doesn't exist, fine
  }

  try {
    await unlink(join(daemonDir, 'daemon.db'));
    filesToClean.push('daemon.db');
  } catch {
    // doesn't exist, fine
  }

  try {
    await unlink(join(daemonDir, 'daemon.db-wal'));
    filesToClean.push('daemon.db-wal');
  } catch {
    // doesn't exist, fine
  }

  try {
    await unlink(join(daemonDir, 'daemon.db-shm'));
    filesToClean.push('daemon.db-shm');
  } catch {
    // doesn't exist, fine
  }

  return { cleaned: true, files: filesToClean };
}
