import { beforeEach, describe, expect, it } from 'vitest';
import { RateLimiterScanner } from './rate-limiter.js';

describe('RateLimiterScanner', () => {
  const scanner = new RateLimiterScanner({ maxRequests: 5, windowMs: 10_000 });

  beforeEach(() => {
    scanner.reset();
  });

  it('passes within limit', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await scanner.evaluate('safe request', { toolName: 'fs_read' });
      expect(r.status).toBe('pass');
    }
  });

  it('blocks after limit exceeded', async () => {
    for (let i = 0; i < 5; i++) {
      await scanner.evaluate('req', { toolName: 'fs_read' });
    }
    const r = await scanner.evaluate('req', { toolName: 'fs_read' });
    expect(r.status).toBe('block');
    if (r.status === 'block') {
      expect(r.reason).toContain('Rate limit exceeded');
    }
  });

  it('resets correctly', async () => {
    for (let i = 0; i < 6; i++) {
      await scanner.evaluate('req', { toolName: 'fs_read' });
    }
    (scanner as { reset: () => void }).reset();
    const r = await scanner.evaluate('req', { toolName: 'fs_read' });
    expect(r.status).toBe('pass');
  });

  it('differentiates by toolName', async () => {
    for (let i = 0; i < 10; i++) {
      await scanner.evaluate('req', { toolName: 'fs_read' });
    }
    const r = await scanner.evaluate('req', { toolName: 'shell_exec' });
    expect(r.status).toBe('pass');
  });

  it('tracks remaining allowances', async () => {
    await scanner.evaluate('req', { toolName: 'test_tool' });
    await scanner.evaluate('req', { toolName: 'test_tool' });
    const r = await scanner.evaluate('req', { toolName: 'test_tool' });
    expect(r.status).toBe('pass');
  });

  // E-36: per-key-type defaults
  it('defaults to 20/min for tool calls', async () => {
    const s = new RateLimiterScanner();
    for (let i = 0; i < 20; i++) {
      const r = await s.evaluate('req', { toolName: `tool_${i}` });
      expect(r.status).toBe('pass');
    }
  });

  it('defaults to 30/min for user messages', async () => {
    const s = new RateLimiterScanner();
    for (let i = 0; i < 30; i++) {
      const r = await s.evaluate('user msg', { rateLimitKey: `user_${i}` });
      expect(r.status).toBe('pass');
    }
  });

  it('defaults to 50/min for agent-to-agent calls', async () => {
    const s = new RateLimiterScanner();
    for (let i = 0; i < 50; i++) {
      const r = await s.evaluate('agent msg', { rateLimitKey: `agent_${i}` });
      expect(r.status).toBe('pass');
    }
  });

  it('blocks tool call at 21st request with default 20/min', async () => {
    const s = new RateLimiterScanner();
    for (let i = 0; i < 20; i++) {
      await s.evaluate('req', { toolName: 'fs_write' });
    }
    const r = await s.evaluate('req', { toolName: 'fs_write' });
    expect(r.status).toBe('block');
  });

  it('allows per-key-type override via defaults option', async () => {
    const s = new RateLimiterScanner({
      defaults: { tool: { maxRequests: 3, windowMs: 30_000 } }
    });
    for (let i = 0; i < 3; i++) {
      const r = await s.evaluate('req', { toolName: 'read' });
      expect(r.status).toBe('pass');
    }
    const r = await s.evaluate('req', { toolName: 'read' });
    expect(r.status).toBe('block');
  });

  it('has correct metadata', () => {
    const meta = scanner.metadata;
    expect(meta.id).toBe('hub://guardrails/rate-limiter');
    expect(meta.owaspCategories).toContain('asi-03');
  });
});
