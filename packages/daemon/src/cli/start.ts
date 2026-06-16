import { Daemon, type DaemonDeps } from '../daemon.js';

export async function startDaemon(config?: Record<string, unknown>, deps?: Partial<DaemonDeps>): Promise<Daemon> {
  const daemon = new Daemon({
    config: (config ?? {}) as DaemonDeps['config'],
    ...deps
  });
  await daemon.start();
  return daemon;
}
