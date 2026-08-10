/**
 * SandboxService tests — capability/budget checks + virtualSandbox + secrets + audit.
 * TDD for Sprint 10 - subtask 13.
 */

// biome-ignore-all lint: test file allows relaxed style for readability
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AgentHostLike,
  type AuditEvent,
  createSandboxService,
  type SandboxService,
  type SandboxTool,
  type SecretsGuardLike,
  type ToolExecutionRequest,
  type ToolFilterConfig,
  type ToolRegistryLike,
  type VirtualSandboxLike
} from './sandbox-service.js';

function makeTool(name: string, timeout?: number): SandboxTool {
  const base: SandboxTool = {
    name,
    handler: vi.fn().mockResolvedValue({ ok: true })
  };
  if (timeout !== undefined) {
    return { ...base, timeout };
  }
  return base;
}

function makeToolRegistry(tools: Record<string, SandboxTool>): ToolRegistryLike {
  return {
    get(name: string) {
      return tools[name];
    },
    list() {
      return Object.values(tools);
    }
  };
}

function makeAgentHost(
  agents: Record<string, { capabilities: string[]; tokensUsed?: number; budget?: { max_tokens_per_session?: number } }>
): AgentHostLike {
  return {
    getAgent(agentId: string) {
      const rec = agents[agentId];
      if (!rec) {
        return null;
      }
      const base = {
        id: agentId,
        spec: { capabilities: rec.capabilities },
        tokensUsed: rec.tokensUsed ?? 0
      };
      if (rec.budget) {
        return { ...base, budget: rec.budget, spec: { capabilities: rec.capabilities } };
      }
      return { ...base, spec: { capabilities: rec.capabilities } };
    }
  };
}

function makeVirtualSandbox(
  impl?: (input: {
    tool: SandboxTool;
    args: Record<string, unknown>;
    agentId: string;
    timeout: number;
    secrets: Record<string, string>;
  }) => Promise<{
    status: 'ok' | 'error' | 'timeout' | 'blocked';
    durationMs: number;
    data?: unknown;
    stdout?: string;
    stderr?: string;
    error?: string;
  }>
): VirtualSandboxLike & { execute: ReturnType<typeof vi.fn> } {
  const fn = vi
    .fn()
    .mockImplementation(
      (input: {
        tool: SandboxTool;
        args: Record<string, unknown>;
        agentId: string;
        timeout: number;
        secrets: Record<string, string>;
      }) => {
        if (impl) {
          return impl(input);
        }
        const tool = input.tool;
        const handler = tool.handler;
        if (typeof handler === 'function') {
          return Promise.resolve(handler(input.args, { agentId: input.agentId, secrets: input.secrets })).then(
            data => ({
              status: 'ok' as const,
              durationMs: 10,
              data,
              stdout: '',
              stderr: ''
            })
          );
        }
        return Promise.resolve({
          status: 'ok' as const,
          durationMs: 10,
          data: { result: 'ok' }
        });
      }
    );
  return { execute: fn };
}

function makeSecretsGuard(secretsByAgent: Record<string, Record<string, string>> = {}): SecretsGuardLike {
  return {
    getAllowedSecrets(agentId: string) {
      return secretsByAgent[agentId] ?? {};
    }
  };
}

function makeRequest(overrides: Partial<ToolExecutionRequest> = {}): ToolExecutionRequest {
  return {
    agentId: 'agent_1',
    toolName: 'read_file',
    args: { path: '/tmp/test.txt' },
    ...overrides
  };
}

function createService(
  opts: {
    tools?: Record<string, SandboxTool>;
    agents?: Record<
      string,
      { capabilities: string[]; tokensUsed?: number; budget?: { max_tokens_per_session?: number } }
    >;
    sandboxImpl?: Parameters<typeof makeVirtualSandbox>[0];
    secrets?: Record<string, Record<string, string>>;
    auditSink?: (event: AuditEvent) => void;
    toolFilterConfig?: ToolFilterConfig;
  } = {}
): {
  service: SandboxService;
  sandbox: VirtualSandboxLike & { execute: ReturnType<typeof vi.fn> };
  auditEvents: AuditEvent[];
} {
  const tools = opts.tools ?? {
    read_file: makeTool('read_file'),
    write_file: makeTool('write_file'),
    shell: makeTool('shell')
  };
  const agents = opts.agents ?? {
    agent_1: {
      capabilities: ['read_file', 'write_file', 'shell'],
      tokensUsed: 100,
      budget: { max_tokens_per_session: 1000 }
    },
    agent_limited: { capabilities: ['read_file'], tokensUsed: 0, budget: { max_tokens_per_session: 10 } }
  };
  const sandbox = makeVirtualSandbox(opts.sandboxImpl);
  const registry = makeToolRegistry(tools);
  const host = makeAgentHost(agents);
  const secretsGuard = makeSecretsGuard(opts.secrets);
  const auditEvents: AuditEvent[] = [];
  const auditSink = (e: AuditEvent): void => {
    auditEvents.push(e);
    if (opts.auditSink) {
      opts.auditSink(e);
    }
  };
  const service = createSandboxService(
    {
      toolRegistry: registry,
      agentHost: host,
      virtualSandbox: sandbox,
      secretsGuard,
      auditSink,
      ...(opts.toolFilterConfig ? { toolFilterConfig: opts.toolFilterConfig } : {})
    },
    { defaultTimeoutMs: 5000 }
  );
  return { service, sandbox, auditEvents };
}

describe('SandboxService validation', () => {
  it('throws if toolRegistry missing', () => {
    expect(() =>
      createSandboxService({
        // @ts-expect-error testing invalid
        toolRegistry: undefined,
        agentHost: makeAgentHost({}),
        virtualSandbox: makeVirtualSandbox()
      })
    ).toThrow(/toolRegistry/);
  });
  it('throws if agentHost missing', () => {
    expect(() =>
      createSandboxService({
        toolRegistry: makeToolRegistry({}),
        // @ts-expect-error testing invalid
        agentHost: undefined,
        virtualSandbox: makeVirtualSandbox()
      })
    ).toThrow(/agentHost/);
  });
  it('throws if virtualSandbox missing', () => {
    expect(() =>
      createSandboxService({
        toolRegistry: makeToolRegistry({}),
        agentHost: makeAgentHost({}),
        // @ts-expect-error testing invalid
        virtualSandbox: undefined
      })
    ).toThrow(/virtualSandbox/);
  });
});

describe('SandboxService capability and tool registration checks', () => {
  let service: SandboxService;
  beforeEach(async () => {
    const { service: svc } = createService();
    service = svc;
    await service.start();
  });
  it('throws Unknown tool when tool not registered', async () => {
    const req = makeRequest({ toolName: 'nonexistent_tool' });
    await expect(service.execute(req)).rejects.toThrow(/Unknown tool: nonexistent_tool/);
  });
  it('throws Unknown agent when agent not found', async () => {
    const req = makeRequest({ agentId: 'ghost_agent' });
    await expect(service.execute(req)).rejects.toThrow(/Unknown agent: ghost_agent/);
  });
  it('throws lacks capability when agent missing required capability', async () => {
    const req = makeRequest({ agentId: 'agent_limited', toolName: 'write_file', args: {} });
    await expect(service.execute(req)).rejects.toThrow(/lacks capability: write_file/);
  });
  it('succeeds when tool registered and agent has capability', async () => {
    const req = makeRequest({ toolName: 'read_file' });
    const result = await service.execute(req);
    expect(result.ok).toBe(true);
    expect(result.toolName).toBe('read_file');
    expect(result.agentId).toBe('agent_1');
  });
});

describe('SandboxService budget check', () => {
  it('throws when tokensUsed >= max_tokens_per_session', async () => {
    const { service } = createService({
      agents: {
        agent_1: { capabilities: ['read_file'], tokensUsed: 1000, budget: { max_tokens_per_session: 1000 } }
      }
    });
    await service.start();
    const req = makeRequest({ toolName: 'read_file' });
    await expect(service.execute(req)).rejects.toThrow(/exceeded token budget/);
  });
  it('throws when tokensUsed exceeds budget', async () => {
    const { service } = createService({
      agents: {
        agent_1: { capabilities: ['read_file'], tokensUsed: 1500, budget: { max_tokens_per_session: 1000 } }
      }
    });
    await service.start();
    const req = makeRequest({ toolName: 'read_file' });
    await expect(service.execute(req)).rejects.toThrow(/exceeded token budget/);
  });
  it('allows execution when under budget', async () => {
    const { service } = createService({
      agents: {
        agent_1: { capabilities: ['read_file'], tokensUsed: 999, budget: { max_tokens_per_session: 1000 } }
      }
    });
    await service.start();
    const req = makeRequest({ toolName: 'read_file' });
    const result = await service.execute(req);
    expect(result.ok).toBe(true);
  });
  it('allows execution when no budget set', async () => {
    const { service } = createService({
      agents: {
        agent_1: { capabilities: ['read_file'], tokensUsed: 9999 }
      }
    });
    await service.start();
    const req = makeRequest({ toolName: 'read_file' });
    const result = await service.execute(req);
    expect(result.ok).toBe(true);
  });
});

describe('SandboxService sandbox delegation', () => {
  it('delegates to virtualSandbox with tool, args, agentId, timeout, secrets', async () => {
    const capturedHolder: {
      current: {
        tool: SandboxTool;
        args: Record<string, unknown>;
        agentId: string;
        timeout: number;
        secrets: Record<string, string>;
      } | null;
    } = { current: null };
    const { service, sandbox } = createService({
      sandboxImpl: input => {
        capturedHolder.current = input;
        return Promise.resolve({ status: 'ok', durationMs: 42, data: { content: 'file content' } });
      },
      secrets: {
        agent_1: { API_KEY: 'secret123', DB_PASSWORD: 'pass' }
      }
    });
    await service.start();
    const req = makeRequest({ toolName: 'read_file', args: { path: '/etc/hosts' }, timeoutMs: 7000 });
    const result = await service.execute(req);
    expect(sandbox.execute).toHaveBeenCalledTimes(1);
    expect(capturedHolder.current).not.toBeNull();
    const captured = capturedHolder.current as {
      tool: SandboxTool;
      args: Record<string, unknown>;
      agentId: string;
      timeout: number;
      secrets: Record<string, string>;
    };
    expect(captured.tool.name).toBe('read_file');
    expect(captured.args).toEqual({ path: '/etc/hosts' });
    expect(captured.agentId).toBe('agent_1');
    expect(captured.timeout).toBe(7000);
    expect(captured.secrets).toEqual({ API_KEY: 'secret123', DB_PASSWORD: 'pass' });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ content: 'file content' });
    expect(result.durationMs).toBe(42);
  });
  it('uses tool.timeout when request timeout not provided', async () => {
    let capturedTimeout = 0;
    const { service } = createService({
      tools: {
        read_file: makeTool('read_file', 12345)
      },
      sandboxImpl: input => {
        capturedTimeout = input.timeout;
        return Promise.resolve({ status: 'ok', durationMs: 1, data: {} });
      }
    });
    await service.start();
    const req = makeRequest({ toolName: 'read_file' });
    await service.execute(req);
    expect(capturedTimeout).toBe(12345);
  });
  it('uses default timeout when neither request nor tool provides one', async () => {
    let capturedTimeout = 0;
    const { service } = createService({
      tools: {
        read_file: { name: 'read_file' }
      },
      sandboxImpl: input => {
        capturedTimeout = input.timeout;
        return Promise.resolve({ status: 'ok', durationMs: 1, data: {} });
      }
    });
    await service.start();
    const req = makeRequest({ toolName: 'read_file' });
    await service.execute(req);
    expect(capturedTimeout).toBe(5000);
  });
  it('propagates sandbox error status', async () => {
    const { service } = createService({
      sandboxImpl: () => Promise.resolve({ status: 'error', durationMs: 5, error: 'execution failed', stderr: 'boom' })
    });
    await service.start();
    const req = makeRequest({ toolName: 'read_file' });
    const result = await service.execute(req);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.error).toBe('execution failed');
  });
  it('throws when sandbox throws exception', async () => {
    const { service } = createService({
      sandboxImpl: () => Promise.reject(new Error('container failure'))
    });
    await service.start();
    const req = makeRequest({ toolName: 'read_file' });
    await expect(service.execute(req)).rejects.toThrow(/Sandbox execution failed.*container failure/);
  });
});

describe('SandboxService secrets handling', () => {
  it('passes allowed secrets via secretsGuard', async () => {
    const secretsGuard = makeSecretsGuard({
      agent_1: { ALLOWED_TOKEN: 'allowed', OTHER: 'value' }
    });
    const getAllowedSpy = vi.spyOn(secretsGuard, 'getAllowedSecrets');
    const registry = makeToolRegistry({ read_file: makeTool('read_file') });
    const host = makeAgentHost({
      agent_1: { capabilities: ['read_file'], tokensUsed: 0, budget: { max_tokens_per_session: 100 } }
    });
    const sandbox = makeVirtualSandbox();
    let capturedSecrets: Record<string, string> | null = null;
    sandbox.execute.mockImplementation(input => {
      capturedSecrets = input.secrets;
      return Promise.resolve({ status: 'ok', durationMs: 1, data: {} });
    });
    const svc = createSandboxService({
      toolRegistry: registry,
      agentHost: host,
      virtualSandbox: sandbox,
      secretsGuard
    });
    await svc.start();
    await svc.execute(makeRequest({ toolName: 'read_file' }));
    expect(getAllowedSpy).toHaveBeenCalledWith('agent_1');
    expect(capturedSecrets).toEqual({ ALLOWED_TOKEN: 'allowed', OTHER: 'value' });
  });
  it('returns empty secrets when secretsGuard not present', async () => {
    const registry = makeToolRegistry({ read_file: makeTool('read_file') });
    const host = makeAgentHost({ agent_1: { capabilities: ['read_file'] } });
    const sandbox = makeVirtualSandbox();
    let capturedSecrets: Record<string, string> | null = null;
    sandbox.execute.mockImplementation(input => {
      capturedSecrets = input.secrets;
      return Promise.resolve({ status: 'ok', durationMs: 1, data: {} });
    });
    const svc = createSandboxService({
      toolRegistry: registry,
      agentHost: host,
      virtualSandbox: sandbox
    });
    await svc.start();
    await svc.execute(makeRequest({ toolName: 'read_file' }));
    expect(capturedSecrets).toEqual({});
  });
  it('handles secretsGuard throwing gracefully', async () => {
    const failingGuard: SecretsGuardLike = {
      getAllowedSecrets: () => {
        throw new Error('guard failure');
      }
    };
    const registry = makeToolRegistry({ read_file: makeTool('read_file') });
    const host = makeAgentHost({ agent_1: { capabilities: ['read_file'] } });
    const sandbox = makeVirtualSandbox();
    let capturedSecrets: Record<string, string> | null = null;
    sandbox.execute.mockImplementation(input => {
      capturedSecrets = input.secrets;
      return Promise.resolve({ status: 'ok', durationMs: 5, data: {} });
    });
    const svc = createSandboxService({
      toolRegistry: registry,
      agentHost: host,
      virtualSandbox: sandbox,
      secretsGuard: failingGuard
    });
    await svc.start();
    const result = await svc.execute(makeRequest({ toolName: 'read_file' }));
    expect(result.ok).toBe(true);
    expect(capturedSecrets).toEqual({});
  });
});

describe('SandboxService audit trail', () => {
  it('records audit event after successful execution', async () => {
    const { service, auditEvents } = createService();
    await service.start();
    await service.execute(makeRequest({ toolName: 'read_file', args: { path: 'a' } }));
    expect(auditEvents).toHaveLength(1);
    const evt = auditEvents[0] as AuditEvent;
    expect(evt.agentId).toBe('agent_1');
    expect(evt.toolName).toBe('read_file');
    expect(evt.ok).toBe(true);
    expect(evt.status).toBe('ok');
    expect(evt.timestamp).toBeDefined();
  });
  it('records audit event even when sandbox returns error status', async () => {
    const { service, auditEvents } = createService({
      sandboxImpl: () => Promise.resolve({ status: 'error', durationMs: 3, error: 'fail' })
    });
    await service.start();
    const result = await service.execute(makeRequest({ toolName: 'read_file' }));
    expect(result.ok).toBe(false);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.ok).toBe(false);
    expect(auditEvents[0]?.error).toBe('fail');
  });
  it('audit trail accessible via getAuditTrail and .auditTrail', async () => {
    const { service } = createService();
    await service.start();
    await service.execute(makeRequest({ toolName: 'read_file' }));
    await service.execute(makeRequest({ toolName: 'write_file', args: { path: 'b' } }));
    expect(service.getAuditTrail()).toHaveLength(2);
    expect(service.auditTrail).toHaveLength(2);
  });
  it('calls external auditSink', async () => {
    const sinkMock = vi.fn();
    const { service } = createService({ auditSink: sinkMock });
    await service.start();
    await service.execute(makeRequest({ toolName: 'read_file' }));
    expect(sinkMock).toHaveBeenCalledTimes(1);
    const evt = sinkMock.mock.calls[0]?.[0] as AuditEvent;
    expect(evt.toolName).toBe('read_file');
  });
  it('audit includes requestId when provided', async () => {
    const { service, auditEvents } = createService();
    await service.start();
    await service.execute(makeRequest({ toolName: 'read_file', requestId: 'req-123' }));
    expect(auditEvents[0]?.requestId).toBe('req-123');
  });
});

describe('SandboxService tool deny-rule filtering (subtask 06 dependency)', () => {
  it('blocks tool denied by filter config', async () => {
    const { service } = createService({
      toolFilterConfig: { deny: ['write_file', 'shell'] }
    });
    await service.start();
    const req = makeRequest({ toolName: 'write_file' });
    await expect(service.execute(req)).rejects.toThrow(/blocked by deny-rule filtering/);
  });
  it('blocks tool not in allow list when allow is set', async () => {
    const { service } = createService({
      toolFilterConfig: { allow: ['read_file'] }
    });
    await service.start();
    const req = makeRequest({ toolName: 'write_file' });
    await expect(service.execute(req)).rejects.toThrow(/blocked by deny-rule filtering/);
  });
  it('allows tool when passes filter', async () => {
    const { service } = createService({
      toolFilterConfig: { allow: ['read_*'], deny: ['read_secret'] }
    });
    await service.start();
    const req = makeRequest({ toolName: 'read_file' });
    const result = await service.execute(req);
    expect(result.ok).toBe(true);
  });
  it('supports wildcard in deny list', async () => {
    const { service } = createService({
      toolFilterConfig: { deny: ['*_file'] }
    });
    await service.start();
    const req = makeRequest({ toolName: 'read_file' });
    await expect(service.execute(req)).rejects.toThrow(/blocked by deny-rule filtering/);
  });
});

describe('SandboxService integration: tool execution via SandboxService with mocked sandbox', () => {
  it('integration: full flow read_file -> sandbox -> audit -> result', async () => {
    let execCount = 0;
    const { service, sandbox, auditEvents } = createService({
      sandboxImpl: input => {
        execCount++;
        if (input.tool.name === 'read_file') {
          const path = input.args.path as string;
          if (path === '/etc/passwd') {
            return Promise.resolve({
              status: 'blocked' as const,
              durationMs: 2,
              error: 'blocked path',
              stderr: 'Access denied'
            });
          }
          return Promise.resolve({
            status: 'ok' as const,
            durationMs: 10,
            data: { content: `content of ${path}` },
            stdout: `read ${path}`
          });
        }
        return Promise.resolve({ status: 'ok' as const, durationMs: 5, data: {} });
      },
      secrets: { agent_1: { READ_TOKEN: 'tok' } }
    });
    await service.start();
    const res1 = await service.execute(makeRequest({ toolName: 'read_file', args: { path: '/tmp/app.log' } }));
    expect(res1.ok).toBe(true);
    expect(res1.data).toEqual({ content: 'content of /tmp/app.log' });
    expect(res1.stdout).toBe('read /tmp/app.log');
    expect(execCount).toBe(1);
    const res2 = await service.execute(makeRequest({ toolName: 'read_file', args: { path: '/etc/passwd' } }));
    expect(res2.ok).toBe(false);
    expect(res2.status).toBe('blocked');
    expect(res2.error).toBe('blocked path');
    expect(execCount).toBe(2);
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents[0]?.toolName).toBe('read_file');
    expect(auditEvents[1]?.status).toBe('blocked');
    expect(sandbox.execute).toHaveBeenCalledTimes(2);
    const firstCall = sandbox.execute.mock.calls[0]?.[0] as { secrets: Record<string, string>; tool: SandboxTool };
    expect(firstCall.secrets).toEqual({ READ_TOKEN: 'tok' });
    expect(firstCall.tool.name).toBe('read_file');
  });
  it('integration: capability check prevents unauthorized tool even if registered', async () => {
    const { service } = createService({
      agents: {
        restricted: { capabilities: ['read_file'], tokensUsed: 0, budget: { max_tokens_per_session: 100 } }
      },
      tools: {
        read_file: makeTool('read_file'),
        shell: makeTool('shell')
      }
    });
    await service.start();
    const ok = await service.execute(makeRequest({ agentId: 'restricted', toolName: 'read_file' }));
    expect(ok.ok).toBe(true);
    await expect(service.execute(makeRequest({ agentId: 'restricted', toolName: 'shell' }))).rejects.toThrow(
      /lacks capability/
    );
  });
});

describe('SandboxService lifecycle', () => {
  it('starts in stopped, transitions to running, sleeping, stopped', async () => {
    const { service } = createService();
    expect(service.state).toBe('stopped');
    await service.start();
    expect(service.state).toBe('running');
    await service.sleep();
    expect(service.state).toBe('sleeping');
    await service.wakeup();
    expect(service.state).toBe('running');
    await service.stop();
    expect(service.state).toBe('stopped');
  });
});

describe('SandboxService input validation', () => {
  it('throws on empty toolName', async () => {
    const { service } = createService();
    await service.start();
    await expect(service.execute(makeRequest({ toolName: '' }))).rejects.toThrow(/Invalid toolName/);
  });
  it('throws on empty agentId', async () => {
    const { service } = createService();
    await service.start();
    await expect(service.execute(makeRequest({ agentId: '' }))).rejects.toThrow(/Invalid agentId/);
  });
  it('throws on invalid args (null)', async () => {
    const { service } = createService();
    await service.start();
    // @ts-expect-error testing invalid
    await expect(service.execute({ agentId: 'agent_1', toolName: 'read_file', args: null })).rejects.toThrow(
      /Invalid args/
    );
  });
});
