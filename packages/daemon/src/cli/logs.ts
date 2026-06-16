import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

export interface LogsOptions {
  errors?: boolean;
  follow?: boolean;
  tail?: number;
}

export async function daemonLogs(logPath: string, options: LogsOptions = {}): Promise<string> {
  const { follow = false, tail = 50, errors = false } = options;

  if (follow) {
    return new Promise((resolve, reject) => {
      const tailProc = spawn('tail', ['-f', logPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      tailProc.stdout?.on('data', (data: Buffer) => {
        process.stdout.write(data);
      });
      tailProc.stderr?.on('data', (data: Buffer) => {
        if (errors) {
          process.stderr.write(data);
        } else {
          process.stdout.write(data);
        }
      });
      tailProc.on('error', reject);
      tailProc.on('exit', () => resolve(''));
    });
  }

  const content = await readFile(logPath, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  return lines.slice(-tail).join('\n');
}
