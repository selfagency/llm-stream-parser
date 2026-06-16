import type { Logger } from '../types.js';

export interface ConnectorHostDeps {
  config: { enabled: boolean };
  logger: Logger;
}

export class ConnectorHost {
  private readonly connectors = new Map<string, { name: string; type: string }>();
  private readonly deps: ConnectorHostDeps;

  constructor(deps: ConnectorHostDeps) {
    this.deps = deps;
  }

  async initialize(): Promise<void> {
    if (!this.deps.config.enabled) {
      this.deps.logger.info('ConnectorHost disabled');
      return;
    }
    this.deps.logger.info('ConnectorHost initialized');
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

  async shutdown(): Promise<void> {
    this.connectors.clear();
    this.deps.logger.info('ConnectorHost shut down');
  }
}
