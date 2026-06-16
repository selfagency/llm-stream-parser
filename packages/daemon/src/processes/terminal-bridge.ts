import type { Logger } from '../types.js';
import type { SubprocessManager } from './subprocess-manager.js';

export interface TerminalBridgeDeps {
  logger: Logger;
  subprocessManager: SubprocessManager;
}

export class TerminalBridge {
  private readonly deps: TerminalBridgeDeps;

  constructor(deps: TerminalBridgeDeps) {
    this.deps = deps;
  }

  createTerminal(command: string, args?: string[], cwd?: string): Promise<string> {
    return this.deps.subprocessManager.spawnProcess({
      command,
      ...(args === undefined ? {} : { args }),
      ...(cwd === undefined ? {} : { cwd }),
      restartPolicy: 'never'
    });
  }

  writeInput(_processId: string, _input: string): Promise<void> {
    // TODO: Implement stdin writing to subprocess
    this.deps.logger.debug('writeInput not yet implemented');
    return Promise.resolve();
  }

  resizeTerminal(_processId: string, _cols: number, _rows: number): Promise<void> {
    // TODO: Implement terminal resize
    this.deps.logger.debug('resizeTerminal not yet implemented');
    return Promise.resolve();
  }
}
