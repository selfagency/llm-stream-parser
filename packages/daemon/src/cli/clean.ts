import { unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CLEANABLE_FILES = ['daemon.sock', 'daemon.db', 'daemon.db-wal', 'daemon.db-shm'];

export interface CleanOptions {
  all?: boolean;
}

export async function cleanDaemon(options: CleanOptions = {}): Promise<{ cleaned: boolean; files?: string[] }> {
  if (!options.all) {
    return { cleaned: false };
  }

  const daemonDir = join(homedir(), '.agentsy');
  const filesToClean: string[] = [];

  for (const file of CLEANABLE_FILES) {
    try {
      await unlink(join(daemonDir, file));
      filesToClean.push(file);
    } catch {
      // doesn't exist, fine
    }
  }

  return { cleaned: true, files: filesToClean };
}
