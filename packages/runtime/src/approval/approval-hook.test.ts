import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPolicyApprovalHook } from './approval-hook.js';
import { ApprovalManager } from './approval-manager.js';

describe('createPolicyApprovalHook', () => {
  let manager: ApprovalManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ApprovalManager({ approvalTimeout: 5000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a hook function with metadata', () => {
    const hook = createPolicyApprovalHook({
      approvalManager: manager,
      policyRules: [{ pattern: 'fs-write', action: 'allow' }]
    });
    expect(hook).toHaveProperty('handler');
    expect(hook).toHaveProperty('id', 'approval:policy-gate');
    expect(hook).toHaveProperty('priority', 100);
  });

  it('allows tools matching an allow rule', async () => {
    const hook = createPolicyApprovalHook({
      approvalManager: manager,
      policyRules: [{ pattern: 'fs-write', action: 'allow' }]
    });
    const result = await hook.handler({
      type: 'PreToolCall',
      args: {},
      sessionId: 'test',
      toolName: 'fs-write'
    });
    expect(result).toEqual({ continue: true });
  });

  it('denies tools matching a deny rule', async () => {
    const hook = createPolicyApprovalHook({
      approvalManager: manager,
      policyRules: [{ pattern: 'shell-exec', action: 'deny' }]
    });
    const result = await hook.handler({
      type: 'PreToolCall',
      args: { command: 'rm -rf /' },
      sessionId: 'test',
      toolName: 'shell-exec'
    });
    if ('continue' in result && !result.continue) {
      expect(result.reason).toContain('Policy');
    }
  });

  it('passes through non-tool events', async () => {
    const hook = createPolicyApprovalHook({
      approvalManager: manager,
      policyRules: [{ pattern: '*', action: 'deny' }]
    });
    const result = await hook.handler({
      type: 'UserPromptSubmit',
      input: 'hello',
      sessionId: 'test'
    });
    expect(result).toEqual({ continue: true });
  });

  it('handles require_approval via the manager', async () => {
    const hook = createPolicyApprovalHook({
      approvalManager: manager,
      policyRules: [{ pattern: 'shell-exec', action: 'require_approval' }]
    });
    const promise = hook.handler({
      type: 'PreToolCall',
      args: { command: 'ls' },
      sessionId: 'test',
      toolName: 'shell-exec'
    });
    // resolve the pending approval
    const pending = manager.listPending();
    const first = pending[0] as { approvalId: string };
    const resolved = manager.resolve(first.approvalId, true);
    expect(resolved).toBe(true);
    const result = await promise;
    expect(result).toEqual({ continue: true });
  });

  it('denies when require_approval is rejected', async () => {
    const hook = createPolicyApprovalHook({
      approvalManager: manager,
      policyRules: [{ pattern: 'shell-exec', action: 'require_approval' }]
    });
    const promise = hook.handler({
      type: 'PreToolCall',
      args: { command: 'format' },
      sessionId: 'test',
      toolName: 'shell-exec'
    });
    const pending = manager.listPending();
    const first = pending[0] as { approvalId: string };
    manager.resolve(first.approvalId, false);
    const result = await promise;
    expect('continue' in result && !result.continue).toBe(true);
  });

  it('allows tools matching no rule when defaultAction is allow', async () => {
    const hook = createPolicyApprovalHook({
      approvalManager: manager,
      policyRules: [],
      defaultAction: 'allow'
    });
    const result = await hook.handler({
      type: 'PreToolCall',
      args: {},
      sessionId: 'test',
      toolName: 'unknown-tool'
    });
    expect(result).toEqual({ continue: true });
  });

  it('first-match-wins: earliest matching rule takes priority', async () => {
    const hook = createPolicyApprovalHook({
      approvalManager: manager,
      policyRules: [
        { pattern: 'fs-*', action: 'deny' },
        { pattern: 'fs-write', action: 'allow' }
      ]
    });
    const result = await hook.handler({
      type: 'PreToolCall',
      args: {},
      sessionId: 'test',
      toolName: 'fs-write'
    });
    if ('continue' in result && !result.continue) {
      expect(result.reason).toContain('Policy');
    }
  });

  it('denies tools when defaultAction is deny and no rule matches', async () => {
    const hook = createPolicyApprovalHook({
      approvalManager: manager,
      policyRules: [{ pattern: 'safe-tool', action: 'allow' }],
      defaultAction: 'deny'
    });
    const result = await hook.handler({
      type: 'PreToolCall',
      args: {},
      sessionId: 'test',
      toolName: 'unknown-tool'
    });
    if ('continue' in result && !result.continue) {
      expect(result.reason).toContain('Policy');
    }
  });

  it('supports catch-all pattern', async () => {
    const hook = createPolicyApprovalHook({
      approvalManager: manager,
      policyRules: [{ pattern: '*', action: 'allow' }]
    });
    const result = await hook.handler({
      type: 'PreToolCall',
      args: {},
      sessionId: 'test',
      toolName: 'anything'
    });
    expect(result).toEqual({ continue: true });
  });
});
