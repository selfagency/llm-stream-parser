/**
 * DiagnosticsService tests — health report structure.
 *
 * Covers:
 * - health report shape
 * - daemon fields mapping
 * - services list
 * - agents mapping (id, role, state, tokens, turns, scope)
 * - routing stats
 * - memory stats
 * - jobs scheduled/running
 * - streams active
 * - subprocesses list
 * - acp enabled + activeSessions
 * - integration: full report with mixed deps
 */

import { describe, expect, it, vi } from 'vitest';
import type {
  AcpServerLike,
  AgentHostLike,
  DaemonLike,
  DiagnosticsServiceDeps,
  JobSchedulerLike,
  MemoryEngineLike,
  RoutingServiceLike,
  ServiceHostLike,
  StreamManagerLike,
  SubprocessManagerLike
} from './diagnostics-service.js';
import { createDiagnosticsService } from './diagnostics-service.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

function baseDeps(overrides: Partial<DiagnosticsServiceDeps> = {}): DiagnosticsServiceDeps {
  return {
    logger: createMockLogger() as never,
    ...overrides
  };
}

// =============================================================================
// Health report structure
// =============================================================================

describe('DiagnosticsService — health report shape', () => {
  it('returns all top-level keys', async () => {
    const svc = createDiagnosticsService(baseDeps());
    const report = await svc.getHealthReport();

    expect(report).toHaveProperty('daemon');
    expect(report).toHaveProperty('services');
    expect(report).toHaveProperty('agents');
    expect(report).toHaveProperty('routing');
    expect(report).toHaveProperty('memory');
    expect(report).toHaveProperty('jobs');
    expect(report).toHaveProperty('streams');
    expect(report).toHaveProperty('subprocesses');
    expect(report).toHaveProperty('acp');
    expect(report).toHaveProperty('timestamp');
    expect(typeof report.timestamp).toBe('string');
  });

  it('defaults to empty when no deps', async () => {
    const svc = createDiagnosticsService({}, { now: () => new Date('2026-01-01T00:00:00Z') });
    const report = await svc.getHealthReport();

    expect(report.daemon.state).toBe('unknown');
    expect(report.services).toEqual([]);
    expect(report.agents).toEqual([]);
    expect(report.routing.modelsRegistered).toBe(0);
    expect(report.routing.healthyProviders).toBe(0);
    expect(report.routing.totalProviders).toBe(0);
    expect(report.memory.scopes).toBe(0);
    expect(report.memory.totalItems).toBe(0);
    expect(report.memory.lastConsolidation).toBeNull();
    expect(report.streams.active).toBe(0);
    expect(report.subprocesses).toEqual([]);
    expect(report.acp.enabled).toBe(false);
    expect(report.acp.activeSessions).toBe(0);
  });
});

// =============================================================================
// Daemon fields
// =============================================================================

describe('DiagnosticsService — daemon fields', () => {
  it('maps daemon state/uptime/pid/memory', async () => {
    const daemon: DaemonLike = {
      state: 'running',
      acp: null
    };
    const svc = createDiagnosticsService(baseDeps({ daemon }), {
      pid: 12_345,
      uptime: () => 987.65,
      now: () => new Date('2026-02-02T10:00:00Z')
    });

    const report = await svc.getHealthReport();
    expect(report.daemon.state).toBe('running');
    expect(report.daemon.pid).toBe(12_345);
    expect(report.daemon.uptime).toBe(987.65);
    expect(typeof report.daemon.memory).toBe('object');
    expect(typeof report.daemon.memory.heapUsed).toBe('number');
  });

  it('handles crashed daemon state', async () => {
    const svc = createDiagnosticsService(baseDeps({ daemon: { state: 'crashed' } }));
    const report = await svc.getHealthReport();
    expect(report.daemon.state).toBe('crashed');
  });
});

// =============================================================================
// Services
// =============================================================================

describe('DiagnosticsService — services', () => {
  it('supports listStates() path', async () => {
    const serviceHost: ServiceHostLike = {
      listStates: () => [
        { name: 'memory', state: 'running' },
        { name: 'routing', state: 'active' }
      ],
      list: () => []
    };
    const svc = createDiagnosticsService(baseDeps({ serviceHost }));
    const report = await svc.getHealthReport();

    expect(report.services).toHaveLength(2);
    expect(report.services[0]).toEqual({ name: 'memory', state: 'running' });
    expect(report.services[1]).toEqual({ name: 'routing', state: 'active' });
  });

  it('falls back to list() when listStates missing', async () => {
    const serviceHost: ServiceHostLike = {
      list: () => [
        { name: 'jobs', state: 'running' },
        { name: 'stream', state: 'running' }
      ]
    };
    const svc = createDiagnosticsService(baseDeps({ serviceHost }));
    const report = await svc.getHealthReport();
    expect(report.services).toHaveLength(2);
  });

  it('handles empty services', async () => {
    const serviceHost: ServiceHostLike = {
      list: () => []
    };
    const svc = createDiagnosticsService(baseDeps({ serviceHost }));
    const report = await svc.getHealthReport();
    expect(report.services).toEqual([]);
  });
});

// =============================================================================
// Agents
// =============================================================================

describe('DiagnosticsService — agents', () => {
  it('maps id/role/state/tokensUsed/turnsCompleted/memoryScope', async () => {
    const agentHost: AgentHostLike = {
      list: () => [
        {
          id: 'agent-1',
          role: 'coder',
          state: 'running',
          tokensUsed: 1024,
          turnsCompleted: 5,
          memoryScope: 'project'
        }
      ]
    };
    const svc = createDiagnosticsService(baseDeps({ agentHost }));
    const report = await svc.getHealthReport();

    expect(report.agents).toHaveLength(1);
    expect(report.agents[0]).toMatchObject({
      id: 'agent-1',
      role: 'coder',
      state: 'running',
      tokensUsed: 1024,
      turnsCompleted: 5,
      memoryScope: 'project'
    });
  });

  it('handles spec-nested shape (AgentHost original)', async () => {
    const agentHost: AgentHostLike = {
      list: () =>
        [
          {
            spec: { id: 'agent-x', role: 'reviewer', memoryScope: 'team' },
            state: 'idle',
            tokensUsed: 2048,
            turnsCompleted: 10
          }
        ] as never
    };
    const svc = createDiagnosticsService(baseDeps({ agentHost }));
    const report = await svc.getHealthReport();
    expect(report.agents[0]?.id).toBe('agent-x');
    expect(report.agents[0]?.role).toBe('reviewer');
    expect(report.agents[0]?.memoryScope).toBe('team');
  });

  it('handles missing optional fields with defaults', async () => {
    const agentHost: AgentHostLike = {
      list: () => [{} as never]
    };
    const svc = createDiagnosticsService(baseDeps({ agentHost }));
    const report = await svc.getHealthReport();
    expect(report.agents[0]?.id).toBe('unknown');
    expect(report.agents[0]?.tokensUsed).toBe(0);
    expect(report.agents[0]?.turnsCompleted).toBe(0);
  });

  it('handles multiple agents', async () => {
    const agentHost: AgentHostLike = {
      list: () => [
        { id: 'a1', role: 'coder', state: 'running', tokensUsed: 1, turnsCompleted: 1, memoryScope: 's1' },
        { id: 'a2', role: 'planner', state: 'idle', tokensUsed: 2, turnsCompleted: 2, memoryScope: 's2' },
        { id: 'a3', role: 'tester', state: 'running', tokensUsed: 3, turnsCompleted: 3, memoryScope: 's3' }
      ]
    };
    const svc = createDiagnosticsService(baseDeps({ agentHost }));
    const report = await svc.getHealthReport();
    expect(report.agents).toHaveLength(3);
  });
});

// =============================================================================
// Routing
// =============================================================================

describe('DiagnosticsService — routing', () => {
  it('uses direct getModelCount methods on routingService', async () => {
    const routingService: RoutingServiceLike = {
      getModelCount: () => 12,
      getHealthyProviderCount: () => 3,
      getTotalProviderCount: () => 5
    };
    const svc = createDiagnosticsService(baseDeps({ routingService }));
    const report = await svc.getHealthReport();

    expect(report.routing.modelsRegistered).toBe(12);
    expect(report.routing.healthyProviders).toBe(3);
    expect(report.routing.totalProviders).toBe(5);
  });

  it('falls back to gatewayInstance when direct methods missing', async () => {
    const routingService: RoutingServiceLike = {
      gatewayInstance: {
        getModelCount: () => 20,
        getHealthyProviderCount: () => 2,
        getTotalProviderCount: () => 4
      }
    };
    const svc = createDiagnosticsService(baseDeps({ routingService }));
    const report = await svc.getHealthReport();

    expect(report.routing.modelsRegistered).toBe(20);
    expect(report.routing.healthyProviders).toBe(2);
    expect(report.routing.totalProviders).toBe(4);
  });

  it('uses providerIds array length for totalProviders', async () => {
    const routingService: RoutingServiceLike = {
      gatewayInstance: {
        providerIds: ['anthropic', 'openai', 'gemini']
      }
    };
    const svc = createDiagnosticsService(baseDeps({ routingService }));
    const report = await svc.getHealthReport();
    expect(report.routing.totalProviders).toBe(3);
  });

  it('defaults to zeros when routing missing', async () => {
    const svc = createDiagnosticsService(baseDeps());
    const report = await svc.getHealthReport();
    expect(report.routing).toEqual({
      modelsRegistered: 0,
      healthyProviders: 0,
      totalProviders: 0
    });
  });
});

// =============================================================================
// Memory
// =============================================================================

describe('DiagnosticsService — memory', () => {
  it('maps scopes, totalItems, lastConsolidation', async () => {
    const last = new Date('2026-01-15T12:00:00Z');
    const memory: MemoryEngineLike = {
      getScopeCount: () => 3,
      getTotalItemCount: () => 150,
      getLastConsolidationTime: () => last
    };
    const svc = createDiagnosticsService(baseDeps({ memory }));
    const report = await svc.getHealthReport();

    expect(report.memory.scopes).toBe(3);
    expect(report.memory.totalItems).toBe(150);
    expect(report.memory.lastConsolidation).toBe(last);
  });

  it('handles async memory methods', async () => {
    const memory: MemoryEngineLike = {
      getScopeCount: async () => 5,
      getTotalItemCount: async () => 200,
      getLastConsolidationTime: async () => new Date('2026-02-01T00:00:00Z')
    };
    const svc = createDiagnosticsService(baseDeps({ memory }));
    const report = await svc.getHealthReport();

    expect(report.memory.scopes).toBe(5);
    expect(report.memory.totalItems).toBe(200);
    expect(report.memory.lastConsolidation).toBeInstanceOf(Date);
  });

  it('handles string lastConsolidation', async () => {
    const memory: MemoryEngineLike = {
      getLastConsolidationTime: () => '2026-03-01T00:00:00Z'
    };
    const svc = createDiagnosticsService(baseDeps({ memory }));
    const report = await svc.getHealthReport();
    expect(report.memory.lastConsolidation).toBe('2026-03-01T00:00:00Z');
  });

  it('handles missing memory', async () => {
    const svc = createDiagnosticsService(baseDeps());
    const report = await svc.getHealthReport();
    expect(report.memory.scopes).toBe(0);
    expect(report.memory.totalItems).toBe(0);
    expect(report.memory.lastConsolidation).toBeNull();
  });

  it('handles errors gracefully', async () => {
    const memory: MemoryEngineLike = {
      getScopeCount: () => {
        throw new Error('oops');
      },
      getTotalItemCount: () => {
        throw new Error('oops');
      },
      getLastConsolidationTime: () => {
        throw new Error('oops');
      }
    };
    const svc = createDiagnosticsService(baseDeps({ memory }));
    const report = await svc.getHealthReport();
    expect(report.memory.scopes).toBe(0);
    expect(report.memory.totalItems).toBe(0);
    expect(report.memory.lastConsolidation).toBeNull();
  });
});

// =============================================================================
// Jobs
// =============================================================================

describe('DiagnosticsService — jobs', () => {
  it('returns scheduled list and running count', async () => {
    const jobScheduler: JobSchedulerLike = {
      list: () => [{ id: 'sched_1', name: 'learning-loop' }],
      getRunningCount: () => 2
    };
    const svc = createDiagnosticsService(baseDeps({ jobScheduler }));
    const report = await svc.getHealthReport();

    expect(Array.isArray(report.jobs.scheduled)).toBe(true);
    expect((report.jobs.scheduled as { id: string }[])[0]?.id).toBe('sched_1');
    expect(report.jobs.running).toBe(2);
  });

  it('handles async scheduler', async () => {
    const jobScheduler: JobSchedulerLike = {
      list: async () => [{ id: 's1' }, { id: 's2' }],
      getRunningCount: async () => 1
    };
    const svc = createDiagnosticsService(baseDeps({ jobScheduler }));
    const report = await svc.getHealthReport();
    expect((report.jobs.scheduled as unknown[]).length).toBe(2);
    expect(report.jobs.running).toBe(1);
  });

  it('handles missing running count', async () => {
    const jobScheduler: JobSchedulerLike = {
      list: () => [{ id: 's1' }]
    };
    const svc = createDiagnosticsService(baseDeps({ jobScheduler }));
    const report = await svc.getHealthReport();
    expect(report.jobs.running).toBe(0);
  });

  it('handles missing scheduler', async () => {
    const svc = createDiagnosticsService(baseDeps());
    const report = await svc.getHealthReport();
    expect(report.jobs.running).toBe(0);
    expect(report.jobs.scheduled).toEqual([]);
  });
});

// =============================================================================
// Streams
// =============================================================================

describe('DiagnosticsService — streams', () => {
  it('returns active count via getActiveStreamCount', async () => {
    const streamManager: StreamManagerLike = {
      getActiveStreamCount: () => 7
    };
    const svc = createDiagnosticsService(baseDeps({ streamManager }));
    const report = await svc.getHealthReport();
    expect(report.streams.active).toBe(7);
  });

  it('falls back to count()', async () => {
    const streamManager: StreamManagerLike = {
      count: () => 3
    };
    const svc = createDiagnosticsService(baseDeps({ streamManager }));
    const report = await svc.getHealthReport();
    expect(report.streams.active).toBe(3);
  });

  it('defaults to 0 when missing', async () => {
    const svc = createDiagnosticsService(baseDeps());
    const report = await svc.getHealthReport();
    expect(report.streams.active).toBe(0);
  });
});

// =============================================================================
// Subprocesses
// =============================================================================

describe('DiagnosticsService — subprocesses', () => {
  it('lists subprocesses with id/pid/status/memoryUsageMb/restartCount', async () => {
    const subprocessManager: SubprocessManagerLike = {
      listProcesses: () => [
        { id: 'proc_1', pid: 111, status: 'running', memoryUsageMb: 50, restartCount: 0 },
        { id: 'proc_2', pid: null, status: 'crashed', memoryUsageMb: null, restartCount: 2 }
      ]
    };
    const svc = createDiagnosticsService(baseDeps({ subprocessManager }));
    const report = await svc.getHealthReport();

    expect(report.subprocesses).toHaveLength(2);
    expect(report.subprocesses[0]).toMatchObject({
      id: 'proc_1',
      pid: 111,
      status: 'running',
      memoryUsageMb: 50,
      restartCount: 0
    });
    expect(report.subprocesses[1]).toMatchObject({
      id: 'proc_2',
      pid: null,
      status: 'crashed',
      memoryUsageMb: null,
      restartCount: 2
    });
  });

  it('handles missing subprocess manager', async () => {
    const svc = createDiagnosticsService(baseDeps());
    const report = await svc.getHealthReport();
    expect(report.subprocesses).toEqual([]);
  });
});

// =============================================================================
// ACP
// =============================================================================

describe('DiagnosticsService — acp', () => {
  it('reports enabled + activeSessions from daemon.acp + acpServer size', async () => {
    const daemon: DaemonLike = {
      state: 'running',
      acp: { some: 'server' }
    };
    const acpServer: AcpServerLike = {
      activeSessions: { size: 5 }
    };
    const svc = createDiagnosticsService(baseDeps({ daemon, acpServer }));
    const report = await svc.getHealthReport();

    expect(report.acp.enabled).toBe(true);
    expect(report.acp.activeSessions).toBe(5);
  });

  it('reports enabled: false when daemon.acp null', async () => {
    const daemon: DaemonLike = {
      state: 'running',
      acp: null
    };
    const svc = createDiagnosticsService(baseDeps({ daemon }));
    const report = await svc.getHealthReport();
    expect(report.acp.enabled).toBe(false);
  });

  it('uses acpServer Map.sessions size', async () => {
    const sessions = new Map<string, unknown>([
      ['s1', {}],
      ['s2', {}]
    ]);
    const acpServer: AcpServerLike = {
      sessions
    };
    const svc = createDiagnosticsService(baseDeps({ acpServer }));
    const report = await svc.getHealthReport();
    expect(report.acp.activeSessions).toBe(2);
    expect(report.acp.enabled).toBe(true);
  });

  it('uses getActiveSessionCount when present', async () => {
    const acpServer: AcpServerLike = {
      getActiveSessionCount: () => 10
    };
    const svc = createDiagnosticsService(baseDeps({ acpServer }));
    const report = await svc.getHealthReport();
    expect(report.acp.activeSessions).toBe(10);
  });

  it('reports disabled when no daemon and no acpServer', async () => {
    const svc = createDiagnosticsService(baseDeps());
    const report = await svc.getHealthReport();
    expect(report.acp.enabled).toBe(false);
    expect(report.acp.activeSessions).toBe(0);
  });
});

// =============================================================================
// Lifecycle
// =============================================================================

describe('DiagnosticsService — lifecycle', () => {
  it('starts stopped', () => {
    const svc = createDiagnosticsService();
    expect(svc.state).toBe('stopped');
  });

  it('transitions through running/sleeping', async () => {
    const svc = createDiagnosticsService();
    await svc.start();
    expect(svc.state).toBe('running');
    await svc.sleep();
    expect(svc.state).toBe('sleeping');
    await svc.wakeup();
    expect(svc.state).toBe('running');
    await svc.stop();
    expect(svc.state).toBe('stopped');
  });

  it('name is diagnostics', () => {
    const svc = createDiagnosticsService();
    expect(svc.name).toBe('diagnostics');
  });
});

// =============================================================================
// Integration test: full health report
// =============================================================================

describe('DiagnosticsService — integration', () => {
  it('builds full report with all deps populated', async () => {
    const daemon: DaemonLike = { state: 'running', acp: {} };
    const serviceHost: ServiceHostLike = {
      list: () => [
        { name: 'memory', state: 'running' },
        { name: 'routing', state: 'active' },
        { name: 'jobs', state: 'running' }
      ]
    };
    const agentHost: AgentHostLike = {
      list: () => [
        {
          id: 'agent-001',
          role: 'coder',
          state: 'running',
          tokensUsed: 1500,
          turnsCompleted: 3,
          memoryScope: 'project-alpha'
        },
        {
          spec: { id: 'agent-002', role: 'reviewer', memoryScope: 'team' },
          state: 'idle',
          tokensUsed: 500,
          turnsCompleted: 1
        } as never
      ]
    };
    const routingService: RoutingServiceLike = {
      getModelCount: () => 10,
      getHealthyProviderCount: () => 2,
      getTotalProviderCount: () => 3
    };
    const memory: MemoryEngineLike = {
      getScopeCount: () => 4,
      getTotalItemCount: () => 999,
      getLastConsolidationTime: () => new Date('2026-06-01T00:00:00Z')
    };
    const jobScheduler: JobSchedulerLike = {
      list: () => [{ id: 'learning' }, { id: 'cleanup' }],
      getRunningCount: () => 1
    };
    const streamManager: StreamManagerLike = {
      getActiveStreamCount: () => 2
    };
    const subprocessManager: SubprocessManagerLike = {
      listProcesses: () => [{ id: 'sub_1', pid: 1234, status: 'running', memoryUsageMb: 100, restartCount: 0 }]
    };
    const acpServer: AcpServerLike = {
      activeSessions: { size: 2 }
    };

    const svc = createDiagnosticsService(
      {
        daemon,
        serviceHost,
        agentHost,
        routingService,
        memory,
        jobScheduler,
        streamManager,
        subprocessManager,
        acpServer,
        logger: createMockLogger() as never
      },
      { now: () => new Date('2026-07-29T12:00:00Z'), pid: 9999, uptime: () => 3600 }
    );

    await svc.start();
    const report = await svc.getHealthReport();

    // daemon
    expect(report.daemon.state).toBe('running');
    expect(report.daemon.pid).toBe(9999);
    expect(report.daemon.uptime).toBe(3600);
    expect(report.daemon.memory).toBeDefined();

    // services
    expect(report.services).toHaveLength(3);

    // agents
    expect(report.agents).toHaveLength(2);
    expect(report.agents[0]?.id).toBe('agent-001');
    expect(report.agents[0]?.role).toBe('coder');
    expect(report.agents[1]?.id).toBe('agent-002');

    // routing
    expect(report.routing.modelsRegistered).toBe(10);
    expect(report.routing.healthyProviders).toBe(2);
    expect(report.routing.totalProviders).toBe(3);

    // memory
    expect(report.memory.scopes).toBe(4);
    expect(report.memory.totalItems).toBe(999);
    expect(report.memory.lastConsolidation).toBeInstanceOf(Date);

    // jobs
    expect((report.jobs.scheduled as unknown[]).length).toBe(2);
    expect(report.jobs.running).toBe(1);

    // streams
    expect(report.streams.active).toBe(2);

    // subprocesses
    expect(report.subprocesses).toHaveLength(1);
    expect(report.subprocesses[0]?.id).toBe('sub_1');
    expect(report.subprocesses[0]?.pid).toBe(1234);
    expect(report.subprocesses[0]?.memoryUsageMb).toBe(100);

    // acp
    expect(report.acp.enabled).toBe(true);
    expect(report.acp.activeSessions).toBe(2);

    // timestamp
    expect(report.timestamp).toBe('2026-07-29T12:00:00.000Z');
  });

  it('integration — non-empty report when daemon started conceptually', async () => {
    const daemon: DaemonLike = { state: 'running', acp: {} };
    const serviceHost: ServiceHostLike = {
      list: () => [{ name: 'memory', state: 'running' }]
    };
    const agentHost: AgentHostLike = {
      list: () => [
        { id: 'a1', role: 'coder', state: 'running', tokensUsed: 0, turnsCompleted: 0, memoryScope: 'default' }
      ]
    };

    const svc = createDiagnosticsService(
      {
        daemon,
        serviceHost,
        agentHost,
        logger: createMockLogger() as never
      },
      { pid: 42, uptime: () => 10 }
    );

    const report = await svc.getHealthReport();
    expect(report.daemon.state).toBe('running');
    expect(report.services.length).toBeGreaterThan(0);
    expect(report.agents.length).toBeGreaterThan(0);
    expect(Object.keys(report).length).toBeGreaterThanOrEqual(9);
  });
});
