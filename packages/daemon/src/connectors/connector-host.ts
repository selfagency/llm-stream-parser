import type { Logger } from '../types.js';

export interface ConnectorHostDeps {
  config: { discord?: { token: string }; slack?: { token: string }; telegram?: { token: string } };
  logger: Logger;
}

export class ConnectorHost {
  private readonly connectors = new Map<string, { name: string; type: string }>();
  private readonly deps: ConnectorHostDeps;

  constructor(deps: ConnectorHostDeps) {
    this.deps = deps;
  }

  initialize(): Promise<void> {
    this.deps.logger.info('ConnectorHost initialized');
    return Promise.resolve();
  }

  register(name: string, type: string): void {
    this.connectors.set(name, { name, type });
    this.deps.logger.info(`Connector registered: ${name} (${type})`);
  }

  unregister(name: string): boolean {
    return this.connectors.delete(name);
  }

  list(): { name: string; type: string }[] {
    return Array.from(this.connectors.values());
  }

  shutdown(): Promise<void> {
    this.connectors.clear();
    this.deps.logger.info('ConnectorHost shut down');
    return Promise.resolve();
  }
}
