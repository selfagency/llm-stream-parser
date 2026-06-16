import type { MemoryEngine } from '@agentsy/memory';
import type { Logger } from '../types.js';
import type { ScopeManager } from './scope-manager.js';

export interface AgentHostDeps {
  logger: Logger;
  memory: MemoryEngine;
  scopeManager: ScopeManager;
}

export class AgentHost {
  private readonly agents = new Map<string, { id: string; name: string; role: string; memoryScope: string }>();
  private readonly deps: AgentHostDeps;

  constructor(deps: AgentHostDeps) {
    this.deps = deps;
  }

  async initialize(): Promise<void> {
    this.deps.logger.info('AgentHost initialized');
  }

  async spawn(spec: Record<string, unknown>): Promise<{ spec: { id: string } }> {
    const id = (spec.id as string) ?? `agent_${Date.now()}`;
    const name = (spec.name as string) ?? 'unnamed';
    const role = (spec.role as string) ?? 'general';
    const memoryScope = (spec.memoryScope as string) ?? 'default';

    this.agents.set(id, { id, name, role, memoryScope });
    this.deps.logger.info(`Agent spawned: ${id} (${name}, ${role})`);

    return { spec: { id } };
  }

  list(): { id: string; name: string; role: string }[] {
    return Array.from(this.agents.values()).map(a => ({
      id: a.id,
      name: a.name,
      role: a.role
    }));
  }

  kill(id: string): boolean {
    return this.agents.delete(id);
  }

  send(_agentId: string, _message: string): Promise<unknown> {
    // TODO: Implement message routing to agent
    return Promise.resolve({ sent: true });
  }

  startStream(_req: Record<string, unknown>): Promise<unknown> {
    // TODO: Implement stream start
    return Promise.resolve({ streamId: `stream_${Date.now()}` });
  }

  cancelStream(_streamId: string): boolean {
    // TODO: Implement stream cancel
    return true;
  }

  count(): number {
    return this.agents.size;
  }

  async shutdown(): Promise<void> {
    this.agents.clear();
    this.deps.logger.info('AgentHost shut down');
  }
}
