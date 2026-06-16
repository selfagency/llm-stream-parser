import { Daemon, type DaemonDeps } from '../daemon.js';

export async function startDaemon(config?: Record<string, unknown>): Promise<Daemon> {
  const daemon = new Daemon({
    config: (config ?? {}) as DaemonDeps['config']
  });
  await daemon.start();
  return daemon;
}
