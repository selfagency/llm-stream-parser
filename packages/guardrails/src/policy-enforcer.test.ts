import { describe, expect, it } from 'vitest';

import { PolicyEnforcer } from './policy-enforcer.js';

describe('PolicyEnforcer', () => {
  describe('default policy', () => {
    const enforcer = new PolicyEnforcer();

    it('blocks destructive open-world tools without approval', () => {
      const { result } = enforcer.evaluate('rm -rf /', 'tool-input', {
        toolName: 'shell_exec',
        annotations: {
          destructiveHint: true,
          openWorldHint: true,
          requiresApproval: true
        }
      });
      expect(result.status).toBe('block');
      expect(result.reason).toContain('deny-destructive-open-world-writes');
    });

    it('requires approval for shell_exec', () => {
      const { result } = enforcer.evaluate('echo hello', 'tool-input', {
        toolName: 'shell_exec',
        sessionId: 'test-session'
      });
      expect(result.status).toBe('escalate');
      expect(result.reason).toContain('require-approval-code-execution');
    });

    it('requires approval for repl_execute', () => {
      const { result } = enforcer.evaluate('console.log("hello")', 'tool-input', {
        toolName: 'repl_execute',
        sessionId: 'test-session'
      });
      expect(result.status).toBe('escalate');
    });

    it('allows read-only tools', () => {
      const { result } = enforcer.evaluate('cat file.txt', 'tool-input', {
        toolName: 'fs_read',
        annotations: { readOnlyHint: true },
        sessionId: 'test-session'
      });
      expect(result.status).toBe('pass');
    });

    it('passes on non-tool input without policy match', () => {
      const { result } = enforcer.evaluate('Hello, how are you?', 'input', {
        sessionId: 'test-session'
      });
      expect(result.status).toBe('pass');
    });
  });

  describe('receipts', () => {
    const enforcer = new PolicyEnforcer();

    it('produces a receipt for blocked decisions', () => {
      const { receipt } = enforcer.evaluate('rm -rf /', 'tool-input', {
        toolName: 'shell_exec',
        annotations: { destructiveHint: true, openWorldHint: true, requiresApproval: true },
        sessionId: 'sess_123'
      });
      expect(receipt.decision).toBe('block');
      expect(receipt.policyId).toContain('deny-destructive');
      expect(receipt.riskTier).toBe('prohibited');
      expect(receipt.sessionId).toBe('sess_123');
      expect(receipt.correlationId).toContain('sess_123');
    });

    it('produces a pass receipt for no-match', () => {
      const { receipt } = enforcer.evaluate('Hello', 'input', { sessionId: 'sess_456' });
      expect(receipt.decision).toBe('pass');
      expect(receipt.reasonCode).toBe('NO_MATCHING_POLICY_RULE');
    });
  });

  describe('custom policy', () => {
    it('evaluates a custom policy document', () => {
      const enforcer = new PolicyEnforcer({
        version: '1.0',
        description: 'Custom test policy',
        rules: [
          {
            name: 'block-dangerous-files',
            description: 'Block access to /etc/passwd',
            condition: "input.text contains '/etc/passwd'",
            action: 'deny',
            severity: 'high'
          }
        ]
      });

      const { result } = enforcer.evaluate('cat /etc/passwd', 'input');
      expect(result.status).toBe('block');
      expect(result.reason).toContain('block-dangerous-files');
    });

    it('passes when custom policy does not match', () => {
      const enforcer = new PolicyEnforcer({
        version: '1.0',
        description: 'Custom test policy',
        rules: [
          {
            name: 'block-dangerous-files',
            description: 'Block access to /etc/passwd',
            condition: "input.text contains '/etc/passwd'",
            action: 'deny',
            severity: 'high'
          }
        ]
      });

      const { result } = enforcer.evaluate('cat /etc/hosts', 'input');
      expect(result.status).toBe('pass');
    });
  });
});
