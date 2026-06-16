import type { Logger } from '../types.js';

export type ServiceState = 'stopped' | 'starting' | 'running' | 'stopping' | 'sleeping';

export interface ServiceHostDeps {
  logger: Logger;
}

export class ServiceHost {
  private readonly services = new Map<string, { instance: unknown; state: ServiceState }>();
  private readonly deps: ServiceHostDeps;

  constructor(deps: ServiceHostDeps) {
    this.deps = deps;
  }

  register(name: string, instance: unknown): void {
    this.services.set(name, { instance, state: 'stopped' });
    this.deps.logger.debug(`Service registered: ${name}`);
  }

  unregister(name: string): boolean {
    return this.services.delete(name);
  }

  get<T>(name: string): T | undefined {
    return this.services.get(name)?.instance as T | undefined;
  }

  setState(name: string, state: ServiceState): void {
    const service = this.services.get(name);
    if (service) {
      service.state = state;
    }
  }

  getState(name: string): ServiceState | undefined {
    return this.services.get(name)?.state;
  }

  count(): number {
    return this.services.size;
  }

  list(): { name: string; state: ServiceState }[] {
    return Array.from(this.services.entries()).map(([name, svc]) => ({
      name,
      state: svc.state
    }));
  }
}
