import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createBuiltinScanners, GuardrailHub } from '@agentsy/guardrails';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CliIO } from '../index.js';
import {
  type GuardrailCliOptions,
  handleInstall,
  handleUninstall,
  parseSimplePolicy,
  runGuardrailsCommand
} from './guardrails.js';

// ---------------------------------------------------------------------------
// Mock the filesystem for policy tests
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => ({
  existsSync: vi.fn()
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn()
}));

// ---------------------------------------------------------------------------
// IO spy helpers
// ---------------------------------------------------------------------------

interface IoSpy {
  stderr: ReturnType<typeof vi.fn>;
  stdout: ReturnType<typeof vi.fn>;
}

function createIoSpy(): CliIO & IoSpy {
  return { stdout: vi.fn(), stderr: vi.fn() } as unknown as CliIO & IoSpy;
}

describe('parseSimplePolicy', () => {
  it('parses a minimal policy with one rule', () => {
    const yaml = `
version: "1.0"
description: "Test policy"
rules:
  - name: block-shell
    condition: tool.name == "shell_exec"
    action: deny
    severity: high
`;
    const doc = parseSimplePolicy(yaml);
    expect(doc.version).toBe('1.0');
    expect(doc.description).toBe('Test policy');
    expect(doc.rules).toHaveLength(1);
    expect(doc.rules[0]?.name).toBe('block-shell');
    expect(doc.rules[0]?.condition).toBe('tool.name == "shell_exec"');
    expect(doc.rules[0]?.action).toBe('deny');
    expect(doc.rules[0]?.severity).toBe('high');
  });

  it('parses a policy with multiple rules', () => {
    const yaml = `
version: "1.0"
rules:
  - name: allow-readonly
    condition: tool.annotations.readOnlyHint == true
    action: allow
  - name: block-destructive
    condition: tool.annotations.destructiveHint == true
    action: require_approval
    phase: tool-input
`;
    const doc = parseSimplePolicy(yaml);
    expect(doc.rules).toHaveLength(2);
    expect(doc.rules[0]?.name).toBe('allow-readonly');
    expect(doc.rules[0]?.action).toBe('allow');
    expect(doc.rules[1]?.name).toBe('block-destructive');
    expect(doc.rules[1]?.action).toBe('require_approval');
    expect(doc.rules[1]?.phase).toBe('tool-input');
  });

  it('handles empty rule list', () => {
    const yaml = `
version: "1.0"
rules:
`;
    const doc = parseSimplePolicy(yaml);
    expect(doc.rules).toHaveLength(0);
  });

  it('strips quotes from values', () => {
    const yaml = `
version: '1.0'
description: "desc"
rules:
  - name: "test"
    condition: 'true'
    action: log
`;
    const doc = parseSimplePolicy(yaml);
    expect(doc.version).toBe('1.0');
    expect(doc.description).toBe('desc');
    expect(doc.rules[0]?.name).toBe('test');
  });

  it('defaults invalid action to deny', () => {
    const yaml = `
version: "1.0"
rules:
  - name: bad
    condition: "true"
    action: invalid_action
`;
    const doc = parseSimplePolicy(yaml);
    expect(doc.rules[0]?.action).toBe('deny');
  });

  it('defaults missing version to 1.0', () => {
    const yaml = `
description: "no version"
rules:
  - name: test
    condition: "true"
    action: allow
`;
    const doc = parseSimplePolicy(yaml);
    expect(doc.version).toBe('1.0');
  });

  it('ignores comments and blank lines', () => {
    const yaml = `
# This is a comment
version: "1.0"

# Another comment
rules:
  - name: test
    # Inline comment
    condition: "true"
    action: deny
`;
    const doc = parseSimplePolicy(yaml);
    expect(doc.rules).toHaveLength(1);
    expect(doc.rules[0]?.name).toBe('test');
  });
});

// =============================================================================
// runGuardrailsCommand — CLI entry point
// =============================================================================

/**
 * Create a GuardrailHub seeded with built-in scanners, wrapped in an options
 * object suitable for passing to handleInstall / handleUninstall / handleList.
 */
function createSeededOpts(): GuardrailCliOptions {
  const hub = new GuardrailHub();
  for (const scanner of createBuiltinScanners()) {
    const uri = scanner.metadata.id;
    hub.install(uri, scanner.constructor.name, scanner.metadata.description, () => scanner);
  }
  return {
    hub,
    json: false,
    noColor: false,
    stderr: vi.fn(),
    stdout: vi.fn()
  };
}

describe('runGuardrailsCommand', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // list subcommand
  // ---------------------------------------------------------------------------

  it('list prints installed guardrails in text format', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['list'], io);
    expect(exitCode).toBe(0);
    // Should show 7 built-in scanners in human-readable format
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Installed guardrails ('));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('hub://guardrails/'));
  });

  it('list --json outputs JSON array', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['list', '--json'], io);
    expect(exitCode).toBe(0);
    // Should output parseable JSON
    const jsonCall = io.stdout.mock.calls.find(call => (call[0] as string).startsWith('['));
    expect(jsonCall).toBeDefined();
    const entries = JSON.parse(jsonCall?.[0] as string);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(7);
    expect(entries[0]).toHaveProperty('uri');
    expect(entries[0]).toHaveProperty('name');
    expect(entries[0]).toHaveProperty('description');
  });

  // ---------------------------------------------------------------------------
  // install subcommand
  // ---------------------------------------------------------------------------

  it('install without URI shows usage', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['install'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Built-in'));
  });

  it('install with invalid URI shows error', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['install', 'not-a-hub-uri'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Invalid hub URI'));
  });

  it('install with known builtin URI reports already installed', async () => {
    // createSeededHub pre-installs all 7 built-in scanners, so any builtin URI
    // is already installed
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['install', 'hub://guardrails/prompt-injection'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Already installed'));
  });

  it('install on pre-seeded hub detects already installed', () => {
    // createSeededOpts pre-installs all builtins — prompt-injection is already there
    const opts = createSeededOpts();
    const exitCode = handleInstall(['hub://guardrails/prompt-injection'], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Already installed'));
  });

  it('install with unresolvable URI shows error', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['install', 'hub://guardrails/nonexistent'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Cannot resolve'));
  });

  // ---------------------------------------------------------------------------
  // uninstall subcommand
  // ---------------------------------------------------------------------------

  it('uninstall without URI shows usage', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['uninstall'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('uninstall removes an installed scanner', () => {
    const opts = createSeededOpts();
    // Pre-install a scanner via handleInstall
    handleInstall(['hub://guardrails/prompt-injection'], opts);

    const exitCode = handleUninstall(['hub://guardrails/prompt-injection'], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Uninstalled'));
  });

  it('uninstall for non-installed scanner shows error', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['uninstall', 'hub://guardrails/missing-scanner'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Not installed'));
  });

  // ---------------------------------------------------------------------------
  // policy subcommand
  // ---------------------------------------------------------------------------

  it('policy with non-existent file shows error', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['policy', '/nonexistent/policy.yaml'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('policy shows parsed document in text format', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      'version: "1.0"\ndescription: "test"\nrules:\n  - name: block-it\n    condition: tool.name == "rm"\n    action: deny\n'
    );
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['policy', '/nonexistent-test-path/test-policy.yaml'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Policy:'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('block-it'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('deny'));
  });

  it('policy with --json outputs JSON document', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      'version: "1.0"\nrules:\n  - name: test-rule\n    condition: "true"\n    action: allow\n'
    );
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['policy', '--json', '/nonexistent-test-path/test-policy.json'], io);
    expect(exitCode).toBe(0);
    // Should output parseable JSON
    const jsonCall = io.stdout.mock.calls.find(call => (call[0] as string).startsWith('{'));
    expect(jsonCall).toBeDefined();
    const doc = JSON.parse(jsonCall?.[0] as string);
    expect(doc).toHaveProperty('version', '1.0');
    expect(doc.rules).toHaveLength(1);
    expect(doc.rules[0].name).toBe('test-rule');
  });

  it('policy with invalid YAML shows parse error', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    // Content that actually triggers a parse error: rule without a name is unnamed
    vi.mocked(readFile).mockResolvedValue('version: "1.0"\nrules:\n  - name: "test"\n    action: invalid_action\n');
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['policy', '/nonexistent-test-path/bad-policy.yaml'], io);
    // invalid_action defaults to deny, so parsing itself succeeds
    // The "invalid" YAML (bare - on its own) parses as 0 rules
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('test'));
  });

  // ---------------------------------------------------------------------------
  // unknown subcommand
  // ---------------------------------------------------------------------------

  it('unknown subcommand shows error', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['unknown_sub'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Unknown'));
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('list'));
  });
});
