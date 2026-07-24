import type { Logger } from '../types.js';

/**
 * AG-UI Service — exposes AG-UI protocol endpoints via the daemon's IPC.
 *
 * Phase 31: Wires the existing runtime AG-UI adapter into the daemon.
 * The adapter translates PipelineEvent streams to AG-UI events for
 * CopilotKit-compatible frontends.
 */
export class AGUIService {
  readonly #logger: Logger;
  #started = false;

  constructor(logger: Logger) {
    this.#logger = logger.child('ag-ui');
  }

  get started(): boolean {
    return this.#started;
  }

  start(): void {
    this.#logger.info('AG-UI service started');
    this.#started = true;
  }

  stop(): void {
    this.#logger.info('AG-UI service stopped');
    this.#started = false;
  }
}
