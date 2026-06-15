import type { PreToolCallEvent } from '@agentsy/runtime';
import { describe, expect, it, vi } from 'vitest';
import type { CredentialBroker } from '../broker/index.js';
import { createCredentialResolverHook } from './hook.js';

function createMockBroker(): CredentialBroker {
  return {
    check: vi.fn().mockResolvedValue(true),
    issue: vi.fn().mockResolvedValue({ id: 'cred_1', resourceType: 'db_pass', expiresAt: Date.now() + 60_000 }),
    resolve: vi.fn().mockResolvedValue('resolved-value'),
    revoke: vi.fn()
  } as unknown as CredentialBroker;
}

function createEvent(overrides: Partial<PreToolCallEvent> = {}): PreToolCallEvent {
  return {
    args: { text: 'hello $CRED(db_pass) world' },
    sessionId: 'session-1',
    toolName: 'shell_exec',
    ...overrides
  } as PreToolCallEvent;
}

describe('createCredentialResolverHook', () => {
  it('resolves $CRED tokens and returns transform', async () => {
    const broker = createMockBroker();
    const hook = createCredentialResolverHook({ broker });
    const event = createEvent();

    const result = await hook(event);

    expect(result.continue).toBe(true);
    expect(result).toHaveProperty('transform');
  });

  it('returns block when resolution fails', async () => {
    const broker = createMockBroker();
    vi.spyOn(broker, 'resolve').mockRejectedValue(new Error('not found'));
    const hook = createCredentialResolverHook({ broker });
    const event = createEvent();

    const result = await hook(event);

    expect(result.continue).toBe(false);
    expect(result).toHaveProperty('reason');
    expect((result as { continue: false; reason: string }).reason).toContain('not found');
  });

  it('handles non-Error rejection', async () => {
    const broker = createMockBroker();
    vi.spyOn(broker, 'resolve').mockRejectedValue('string error');
    const hook = createCredentialResolverHook({ broker });
    const event = createEvent();

    const result = await hook(event);

    expect(result.continue).toBe(false);
    expect((result as { continue: false; reason: string }).reason).toContain('Unknown');
  });

  it('handles args with no $CRED tokens', async () => {
    const broker = createMockBroker();
    const hook = createCredentialResolverHook({ broker });
    const event = createEvent({ args: { text: 'hello world' } });

    const result = await hook(event);

    expect(result.continue).toBe(true);
  });
});
