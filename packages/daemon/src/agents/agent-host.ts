import type { MemoryEngine } from '@agentsy/memory';
import type { AgentPool } from '../pool/agent-pool.js';
import type { Logger } from '../types.js';
import type { ScopeManager } from './scope-manager.js';

export interface AgentHostDeps {
  logger: Logger;
  memory: MemoryEngine;
  pool: AgentPool;
  scopeManager: ScopeManager;
}

export class AgentHost {
  private readonly agents = new Map<string, { id: string; name: string; role: string; memoryScope: string }>();
  private readonly deps: AgentHostDeps;

  constructor(deps: AgentHostDeps) {
    this.deps = deps;
  }

  initialize(): Promise<void> {
    this.deps.logger.info('AgentHost initialized');
    return Promise.resolve();
  }

  spawn(spec: Record<string, unknown>): Promise<{ spec: { id: string } }> {
    const id = (spec.id as string) ?? `agent_${Date.now()}`;
    const name = (spec.name as string) ?? 'unnamed';
    const role = (spec.role as string) ?? 'general';
    const memoryScope = (spec.memoryScope as string) ?? 'default';

    this.agents.set(id, { id, name, role, memoryScope });
    this.deps.logger.info('Agent spawned: %s (%s, %s)', id, name, role);

    return Promise.resolve({ spec: { id } });
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
    return Promise.resolve({ sent: true });
  }

  startStream(_req: Record<string, unknown>): Promise<unknown> {
    return Promise.resolve({ streamId: `stream_${Date.now()}` });
  }

  cancelStream(_streamId: string): boolean {
    return true;
  }

  count(): number {
    return this.agents.size;
  }

  shutdown(): Promise<void> {
    this.agents.clear();
    this.deps.logger.info('AgentHost shut down');
    return Promise.resolve();
  }
}
