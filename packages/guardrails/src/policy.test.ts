import { describe, expect, it } from 'vitest';
import type { PolicyContext, PolicyDocument } from './policy.js';
import { DEFAULT_POLICY, evaluateCondition, evaluatePolicy } from './policy.js';

describe('evaluateCondition', () => {
  it('tool.name == string equality', () => {
    const ctx: PolicyContext = { tool: { name: 'shell_exec', annotations: {} } };
    expect(evaluateCondition("tool.name == 'shell_exec'", ctx)).toBe(true);
    expect(evaluateCondition("tool.name == 'fs_write'", ctx)).toBe(false);
  });

  it('tool.annotations.destructiveHint == true', () => {
    const ctx: PolicyContext = { tool: { name: 'x', annotations: { destructiveHint: true } } };
    expect(evaluateCondition('tool.annotations.destructiveHint == true', ctx)).toBe(true);
  });

  it('tool.annotations.destructiveHint == false', () => {
    const ctx: PolicyContext = { tool: { name: 'x', annotations: { destructiveHint: false } } };
    expect(evaluateCondition('tool.annotations.destructiveHint == false', ctx)).toBe(true);
  });

  it('truthy path check on bare annotation', () => {
    const ctx: PolicyContext = { tool: { name: 'x', annotations: { requiresApproval: true } } };
    expect(evaluateCondition('tool.annotations.requiresApproval', ctx)).toBe(true);
    expect(evaluateCondition('tool.annotations.missingField', ctx)).toBe(false);
  });

  it('starts_with prefix match', () => {
    const ctx: PolicyContext = { input: { path: '/home/user/test.txt' } };
    expect(evaluateCondition("input.path starts_with '/home/'", ctx)).toBe(true);
    expect(evaluateCondition("input.path starts_with '/etc/'", ctx)).toBe(false);
  });

  it('contains substring match', () => {
    const ctx: PolicyContext = { input: { path: '/var/log/../../etc/passwd' } };
    expect(evaluateCondition("input.path contains '..'", ctx)).toBe(true);
    const rawNull = String.raw`\x00`;
    expect(evaluateCondition(`input.path contains ${rawNull}`, ctx)).toBe(false);
  });

  it('compound condition with &&', () => {
    const ctx: PolicyContext = {
      tool: { name: 'shell_exec', annotations: { destructiveHint: true, openWorldHint: true, requiresApproval: true } }
    };
    const condition =
      'tool.annotations.destructiveHint == true && tool.annotations.openWorldHint == true && tool.annotations.requiresApproval == true';
    expect(evaluateCondition(condition, ctx)).toBe(true);
  });

  it('compound condition returns false when one part is false', () => {
    const ctx: PolicyContext = {
      tool: { name: 'shell_exec', annotations: { destructiveHint: true, openWorldHint: false, requiresApproval: true } }
    };
    const condition =
      'tool.annotations.destructiveHint == true && tool.annotations.openWorldHint == true && tool.annotations.requiresApproval == true';
    expect(evaluateCondition(condition, ctx)).toBe(false);
  });

  it('missing nested path returns undefined -> falsy', () => {
    const ctx: PolicyContext = { tool: { name: 'x', annotations: {} } };
    expect(evaluateCondition('tool.annotations.nonexistent == true', ctx)).toBe(false);
  });

  it('boolean literals parse correctly', () => {
    const truthy = evaluateCondition('true == true', {});
    expect(truthy).toBe(true);
    const falsy = evaluateCondition('false == true', {});
    expect(falsy).toBe(false);
  });
});

describe('nested path resolution (dot-notation)', () => {
  it('resolves deeply nested dot-notation through evaluateCondition', () => {
    const ctx: PolicyContext = {
      tool: { name: 'test', annotations: { destructiveHint: true } }
    };
    expect(evaluateCondition('tool.annotations.destructiveHint == true', ctx)).toBe(true);
  });

  it('resolves path through input object', () => {
    const ctx: PolicyContext = {
      input: { path: '/home/user/test.txt' }
    };
    expect(evaluateCondition("input.path starts_with '/home/'", ctx)).toBe(true);
    expect(evaluateCondition("input.path starts_with '/tmp/'", ctx)).toBe(false);
  });
});

describe('array index path resolution', () => {
  it('resolves array index notation tool.parameters[0].name', () => {
    const ctx: PolicyContext = {
      tool: {
        name: 'test',
        parameters: [
          { name: 'filePath', type: 'string' },
          { name: 'recursive', type: 'boolean' }
        ]
      }
    };
    expect(evaluateCondition("tool.parameters[0].name == 'filePath'", ctx)).toBe(true);
    expect(evaluateCondition("tool.parameters[1].name == 'recursive'", ctx)).toBe(true);
    expect(evaluateCondition("tool.parameters[0].type == 'string'", ctx)).toBe(true);
  });

  it('returns false for out-of-bounds array index', () => {
    const ctx: PolicyContext = {
      tool: {
        name: 'test',
        parameters: [{ name: 'filePath', type: 'string' }]
      }
    };
    expect(evaluateCondition("tool.parameters[5] == 'filePath'", ctx)).toBe(false);
  });

  it('returns false for negative array index', () => {
    const ctx: PolicyContext = {
      tool: {
        name: 'test',
        parameters: [{ name: 'filePath', type: 'string' }]
      }
    };
    expect(evaluateCondition("tool.parameters[-1] == 'filePath'", ctx)).toBe(false);
  });

  it('returns false when tool has no parameters', () => {
    const ctx: PolicyContext = {
      tool: { name: 'test', annotations: {} }
    };
    expect(evaluateCondition("tool.parameters[0] == 'filePath'", ctx)).toBe(false);
  });
});

describe('regex safety (matches operator)', () => {
  it('accepts safe regex patterns', () => {
    const ctx: PolicyContext = { tool: { name: 'testtool', annotations: {} } };
    expect(evaluateCondition("tool.name matches '^[a-z]+$'", ctx)).toBe(true);
    expect(evaluateCondition("tool.name matches '^[a-z-]+$'", ctx)).toBe(true);
  });

  it('rejects patterns with nested quantifiers (catastrophic backtracking)', () => {
    const ctx: PolicyContext = { input: { path: '/tmp/test' } };
    // (a+)+ is a classic catastrophic backtracking pattern
    expect(evaluateCondition("input.path matches '(a+)+'", ctx)).toBe(false);
    expect(evaluateCondition("input.path matches '(a*)*'", ctx)).toBe(false);
  });

  it('rejects non-capturing group nested quantifiers', () => {
    const ctx: PolicyContext = { input: { path: '/tmp/test' } };
    expect(evaluateCondition("input.path matches '(?:a+)+'", ctx)).toBe(false);
    expect(evaluateCondition("input.path matches '(?:[a-z]+)+'", ctx)).toBe(false);
  });

  it('accepts regex patterns with quantifiers at safe depth', () => {
    const ctx: PolicyContext = { tool: { name: 'exec_shell', annotations: {} } };
    // Simple character class with + is fine (no nested quantifier)
    expect(evaluateCondition("tool.name matches '^[a-z_]+$'", ctx)).toBe(true);
    // Alternation without nested quantifiers
    expect(evaluateCondition("tool.name matches '^(cmd|exec)_'", ctx)).toBe(true);
  });
});

describe('evaluatePolicy', () => {
  const policy: PolicyDocument = {
    version: '1.0',
    rules: [
      {
        name: 'block-dangerous',
        condition: 'tool.annotations.destructiveHint == true && tool.annotations.openWorldHint == true',
        action: 'deny',
        phase: 'tool-input',
        severity: 'critical'
      },
      {
        name: 'require-approval-code-exec',
        condition: 'tool.name == "repl_execute" || tool.name == "shell_exec"',
        action: 'require_approval',
        phase: 'tool-input',
        severity: 'high'
      },
      {
        name: 'allow-readonly',
        condition: 'tool.annotations.readOnlyHint == true',
        action: 'allow',
        phase: 'tool-input'
      }
    ]
  };

  it('denies destructive open-world tools', () => {
    const ctx: PolicyContext = {
      tool: { name: 'shell_exec', annotations: { destructiveHint: true, openWorldHint: true } }
    };
    const result = evaluatePolicy(policy, ctx);
    expect(result.matched).toBe(true);
    expect(result.action).toBe('deny');
  });

  it('requires approval for code execution', () => {
    const ctx: PolicyContext = {
      tool: { name: 'shell_exec', annotations: { destructiveHint: true, openWorldHint: true, requiresApproval: true } }
    };
    const result = evaluatePolicy(policy, ctx);
    // block-dangerous matches first (destructive + openWorld), so it returns deny
    expect(result.action).toBe('deny');
  });

  it('first match wins (rule ordering)', () => {
    const ctx: PolicyContext = {
      tool: { name: 'fs_write', annotations: { destructiveHint: true, openWorldHint: true } }
    };
    const result = evaluatePolicy(policy, ctx);
    expect(result.matched).toBe(true);
    expect(result.action).toBe('deny');
  });

  it('allows read-only tools', () => {
    const ctx: PolicyContext = {
      tool: { name: 'fs_read', annotations: { readOnlyHint: true } }
    };
    const result = evaluatePolicy(policy, ctx);
    expect(result.matched).toBe(true);
    expect(result.action).toBe('allow');
  });

  it('returns not matched when no rule fires', () => {
    const ctx: PolicyContext = {
      tool: { name: 'fs_read', annotations: {} }
    };
    const result = evaluatePolicy(policy, ctx);
    expect(result.matched).toBe(false);
  });
});

describe('DEFAULT_POLICY', () => {
  it('has 3 rules with expected structure', () => {
    expect(DEFAULT_POLICY.version).toBe('1.0');
    expect(DEFAULT_POLICY.rules).toHaveLength(3);
    expect(DEFAULT_POLICY.rules[0]?.name).toBe('require-approval-destructive-open-world');
    expect(DEFAULT_POLICY.rules[1]?.name).toBe('require-approval-code-execution');
    expect(DEFAULT_POLICY.rules[2]?.name).toBe('allow-read-only-tools');
  });

  it('require-approval-destructive-open-world with destructiveHint && openWorldHint', () => {
    const ctx: PolicyContext = {
      tool: { name: 'shell_exec', annotations: { destructiveHint: true, openWorldHint: true } }
    };
    const result = evaluatePolicy(DEFAULT_POLICY, ctx);
    expect(result.matched).toBe(true);
    expect(result.action).toBe('require_approval');
  });

  it('does not require approval when only destructiveHint is set', () => {
    const ctx: PolicyContext = {
      tool: { name: 'test', annotations: { destructiveHint: true } }
    };
    const result = evaluatePolicy(DEFAULT_POLICY, ctx);
    expect(result.matched).toBe(false);
  });

  it('does not require approval when only openWorldHint is set', () => {
    const ctx: PolicyContext = {
      tool: { name: 'test', annotations: { openWorldHint: true } }
    };
    const result = evaluatePolicy(DEFAULT_POLICY, ctx);
    expect(result.matched).toBe(false);
  });

  it('allow-read-only-tools permits read-only tools', () => {
    const ctx: PolicyContext = {
      tool: { name: 'fs_read', annotations: { readOnlyHint: true } }
    };
    const result = evaluatePolicy(DEFAULT_POLICY, ctx);
    expect(result.matched).toBe(true);
    expect(result.action).toBe('allow');
  });
});
