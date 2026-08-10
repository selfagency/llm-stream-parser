import type { Logger } from '../types.js';

export interface TUIBridgeDeps {
  logger: Logger;
}

export class TUIBridge {
  private readonly deps: TUIBridgeDeps;

  constructor(deps: TUIBridgeDeps) {
    this.deps = deps;
  }

  render(_data: unknown): string {
    return '';
  }

  start(): Promise<void> {
    this.deps.logger.info('TUIBridge started');
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.deps.logger.info('TUIBridge stopped');
    return Promise.resolve();
  }
}
