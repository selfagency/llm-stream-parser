import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createBuiltinScanners, GuardrailHub } from '@agentsy/guardrails';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { CliIO } from '../index.js';
import {
  type GuardrailCliOptions,
  handleHub,
  handleInstall,
  handleList,
  handlePolicy,
  handleTest,
  handleUninstall,
  runGuardrailsCommand
} from './guardrails.js';

// ---------------------------------------------------------------------------
// Mock js-yaml (not installed in node_modules)
// ---------------------------------------------------------------------------

vi.mock('js-yaml', () => {
  // Minimal js-yaml mock for YAML parsing
  const yaml = {
    load: vi.fn((input: string) => {
      // Simple YAML parser for test policy content
      const obj: Record<string, unknown> = {};
      let currentRules: unknown[] = [];
      let currentRule: Record<string, string> | null = null;

      for (const line of input.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) {
          continue;
        }

        const ruleStart = /^\s*-\s+name:\s*(.+)$/.exec(trimmed);
        if (ruleStart) {
          if (currentRule) {
            currentRules.push(currentRule);
          }
          currentRule = { name: ruleStart[1] as string };
          continue;
        }

        const fieldMatch = /^\s+(name|condition|action|description|phase|severity|version|rules):\s*(.*)$/.exec(line);
        if (fieldMatch && currentRule) {
          const val = (fieldMatch[2] as string).trim();
          const stripped = val.replace(/^['"]|['"]$/g, '');
          currentRule[fieldMatch[1] as string] = stripped;
          continue;
        }

        const topMatch = /^(version|description):\s*(.+)$/.exec(trimmed);
        if (topMatch) {
          const val = (topMatch[2] as string).trim();
          const stripped = val.replace(/^['"]|['"]$/g, '');
          obj[topMatch[1] as string] = stripped;
          continue;
        }

        if (trimmed === 'rules:') {
          currentRules = [];
        }
      }

      if (currentRule) {
        currentRules.push(currentRule);
      }

      if (currentRules.length > 0) {
        obj.rules = currentRules;
      }

      return Object.keys(obj).length > 0 ? obj : null;
    }),
    dump: vi.fn((input: unknown) => JSON.stringify(input))
  };

  return {
    ...yaml,
    default: yaml,
    load: yaml.load,
    dump: yaml.dump
  };
});

// ---------------------------------------------------------------------------
// Mock filesystem operations
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
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

// ---------------------------------------------------------------------------
// Seeded hub helpers
// ---------------------------------------------------------------------------

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
    stderr: vi.fn() as unknown as GuardrailCliOptions['stderr'],
    stdout: vi.fn() as unknown as GuardrailCliOptions['stdout']
  };
}

function createEmptyOpts(): GuardrailCliOptions {
  return {
    hub: new GuardrailHub(),
    json: false,
    noColor: false,
    stderr: vi.fn() as unknown as GuardrailCliOptions['stderr'],
    stdout: vi.fn() as unknown as GuardrailCliOptions['stdout']
  };
}

// ---------------------------------------------------------------------------
// Mock policy YAML content
// ---------------------------------------------------------------------------

const SAMPLE_POLICY_YAML = `version: "1.0"
description: "Test policy"
rules:
  - name: block-shell
    condition: 'tool.name == "shell_exec"'
    action: deny
    severity: high
  - name: allow-readonly
    condition: 'tool.annotations.readOnlyHint == true'
    action: allow
`;

const SAMPLE_POLICY_YAML_2 = `version: "1.0"
rules:
  - name: block-shell
    condition: 'tool.name == "shell_exec"'
    action: deny
`;

// =============================================================================
// handleList
// =============================================================================

describe('handleList', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('prints installed guardrails in text format', () => {
    const opts = createSeededOpts();
    const exitCode = handleList([], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Installed guardrails ('));
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('hub://guardrails/'));
  });

  it('prints empty message when no guardrails installed', () => {
    const opts = createEmptyOpts();
    const exitCode = handleList([], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('No guardrails installed.'));
  });

  it('outputs JSON with --json flag', () => {
    const opts = createSeededOpts();
    opts.json = true;
    const exitCode = handleList([], opts);
    expect(exitCode).toBe(0);
    const stdoutMock = opts.stdout as unknown as { mock: { calls: unknown[][] } };
    const jsonCall = stdoutMock.mock.calls.find((call: unknown[]) => (call[0] as string).startsWith('['));
    expect(jsonCall).toBeDefined();
    const entries = JSON.parse(jsonCall?.[0] as string);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(7);
    expect(entries[0]).toHaveProperty('uri');
    expect(entries[0]).toHaveProperty('name');
    expect(entries[0]).toHaveProperty('description');
  });

  it('shows help with --help flag', () => {
    const opts = createEmptyOpts();
    const exitCode = handleList(['--help'], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });
});

// =============================================================================
// handleInstall
// =============================================================================

describe('handleInstall', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows usage without URI', () => {
    const opts = createSeededOpts();
    const exitCode = handleInstall([], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('Built-in'));
  });

  it('shows help with --help flag', () => {
    const opts = createEmptyOpts();
    const exitCode = handleInstall(['--help'], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('reports already installed for known builtin', () => {
    const opts = createSeededOpts();
    // Use the exact URI from the scanner's metadata.id (no @version)
    const exitCode = handleInstall(['hub://guardrails/prompt-injection'], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Already installed'));
    // writeFileSync should NOT be called since it's already installed
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('installs by name match and persists', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const opts = createEmptyOpts();
    const exitCode = handleInstall(['hub://guardrails/prompt-injection'], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Installed'));
    // Should have called writeFileSync for persistence
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('shows error for unresolvable URI', () => {
    const opts = createEmptyOpts();
    const exitCode = handleInstall(['hub://guardrails/nonexistent'], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('Cannot resolve'));
  });

  it('shows error for invalid URI', () => {
    const opts = createEmptyOpts();
    const exitCode = handleInstall(['not-a-hub-uri'], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('Invalid hub URI'));
  });
});

// =============================================================================
// handleUninstall
// =============================================================================

describe('handleUninstall', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows usage without URI', () => {
    const opts = createSeededOpts();
    const exitCode = handleUninstall([], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('uninstalls an installed scanner', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('version: "1.0"\ninstalled:\n  - hub://guardrails/prompt-injection@1.0\n');
    const opts = createSeededOpts();
    // First install it so it's in the hub
    handleInstall(['hub://guardrails/prompt-injection'], opts);
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('version: "1.0"\ninstalled:\n  - hub://guardrails/prompt-injection\n');
    const exitCode = handleUninstall(['hub://guardrails/prompt-injection'], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Uninstalled'));
  });

  it('shows error for non-installed scanner', () => {
    const opts = createEmptyOpts();
    const exitCode = handleUninstall(['hub://guardrails/missing-scanner'], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('Not installed'));
  });
});

// =============================================================================
// handlePolicy
// =============================================================================

describe('handlePolicy', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows error for non-existent file', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const opts = createEmptyOpts();
    const exitCode = handlePolicy(['/nonexistent/policy.yaml'], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('parses and displays a valid policy', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_POLICY_YAML);
    const opts = createSeededOpts();
    const exitCode = handlePolicy(['/test-policy.yaml'], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Policy:'));
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('block-shell'));
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('deny'));
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('1.0'));
  });

  it('outputs JSON with --json flag', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_POLICY_YAML_2);
    const opts = createSeededOpts();
    opts.json = true;
    const exitCode = handlePolicy(['/test-policy.yaml'], opts);
    expect(exitCode).toBe(0);
    const stdoutFns = opts.stdout as unknown as { mock: { calls: unknown[][] } };
    const jsonCall = stdoutFns.mock.calls.find((call: unknown[]) => (call[0] as string).startsWith('{'));
    expect(jsonCall).toBeDefined();
    const doc = JSON.parse(jsonCall?.[0] as string);
    expect(doc).toHaveProperty('version', '1.0');
    expect(doc.rules).toHaveLength(1);
    expect(doc.rules[0].name).toBe('block-shell');
  });

  it('validates against scanner capabilities', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_POLICY_YAML);
    const opts = createSeededOpts();
    const exitCode = handlePolicy(['/test-policy.yaml'], opts);
    expect(exitCode).toBe(0);
    // Should show the policy summary regardless of validation results
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Policy:'));
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('block-shell'));
  });

  it('shows validation error for invalid YAML', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('invalid: [yaml: broken');
    const opts = createSeededOpts();
    const exitCode = handlePolicy(['/bad-policy.yaml'], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('Invalid policy'));
  });

  it('shows validation error for object with wrong shape', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not_a_policy: true');
    const opts = createSeededOpts();
    const exitCode = handlePolicy(['/bad-policy.yaml'], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('Invalid'));
  });

  it('shows help with --help flag', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const opts = createEmptyOpts();
    const exitCode = handlePolicy(['--help'], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });
});

// =============================================================================
// handleTest
// =============================================================================

describe('handleTest', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows usage without path', () => {
    const opts = createEmptyOpts();
    const exitCode = handleTest([], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('shows error for missing input', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_POLICY_YAML);
    const opts = createEmptyOpts();
    const exitCode = handleTest(['/some/policy.yaml'], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('Missing input'));
  });

  it('shows error for non-existent policy file', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const opts = createEmptyOpts();
    const exitCode = handleTest(['/nonexistent.yaml', 'some input'], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('evaluates policy and prints receipt', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_POLICY_YAML);
    const opts = createEmptyOpts();
    const exitCode = handleTest(['/test-policy.yaml', 'rm -rf /', '--tool', 'shell_exec'], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Guardrail Decision Receipt'));
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('block'));
  });

  it('outputs JSON with --json flag', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_POLICY_YAML);
    const opts = createEmptyOpts();
    const exitCode = handleTest(['/test-policy.yaml', 'rm -rf /', '--json', '--tool', 'shell_exec'], opts);
    expect(exitCode).toBe(0);
    const outMock = opts.stdout as unknown as { mock: { calls: unknown[][] } };
    const jsonCall = outMock.mock.calls.find((call: unknown[]) => (call[0] as string).startsWith('{'));
    expect(jsonCall).toBeDefined();
    const receipt = JSON.parse(jsonCall?.[0] as string);
    expect(receipt).toHaveProperty('decision');
    expect(receipt).toHaveProperty('policyId');
    expect(receipt).toHaveProperty('reasonCode');
    expect(receipt).toHaveProperty('detections');
  });

  it('allows pass for non-matching input', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_POLICY_YAML);
    const opts = createEmptyOpts();
    const exitCode = handleTest(['/test-policy.yaml', 'safe read-only operation'], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Decision Receipt'));
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('pass'));
  });

  it('shows help with --help flag', () => {
    const opts = createEmptyOpts();
    const exitCode = handleTest(['--help'], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });
});

// =============================================================================
// handleHub
// =============================================================================

describe('handleHub', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows usage without URI', async () => {
    const opts = createEmptyOpts();
    const exitCode = await handleHub([], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('shows error for invalid URI', async () => {
    const opts = createEmptyOpts();
    const exitCode = await handleHub(['not-a-valid-uri'], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('Invalid hub URI'));
  });

  it('shows error for unsupported scheme', async () => {
    const opts = createEmptyOpts();
    const exitCode = await handleHub(['hub://guardrails/some-scanner'], opts);
    expect(exitCode).toBe(1);
    expect(opts.stderr).toHaveBeenCalledWith(expect.stringContaining('Unsupported'));
  });

  it('shows help with --help flag', async () => {
    const opts = createEmptyOpts();
    const exitCode = await handleHub(['--help'], opts);
    expect(exitCode).toBe(0);
    expect(opts.stdout).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });
});

// =============================================================================
// runGuardrailsCommand — CLI entry point integration
// =============================================================================

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
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Installed guardrails ('));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('hub://guardrails/'));
  });

  it('list --json outputs JSON array', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['list', '--json'], io);
    expect(exitCode).toBe(0);
    const jsonCall = io.stdout.mock.calls.find((call: unknown[]) => (call[0] as string).startsWith('['));
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
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['install', 'hub://guardrails/prompt-injection'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Already installed'));
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
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_POLICY_YAML);
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['policy', '/test-policy.yaml'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Policy:'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('block-shell'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('deny'));
  });

  it('policy with --json outputs JSON document', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_POLICY_YAML_2);
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['policy', '--json', '/test-policy.yaml'], io);
    expect(exitCode).toBe(0);
    const jsonCall = io.stdout.mock.calls.find((call: unknown[]) => (call[0] as string).startsWith('{'));
    expect(jsonCall).toBeDefined();
    const doc = JSON.parse(jsonCall?.[0] as string);
    expect(doc).toHaveProperty('version', '1.0');
    expect(doc.rules).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // test subcommand
  // ---------------------------------------------------------------------------

  it('test evaluates policy and prints receipt', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_POLICY_YAML);
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['test', '/policy.yaml', 'rm -rf /', '--tool', 'shell_exec'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Guardrail Decision Receipt'));
  });

  it('test --json outputs receipt', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_POLICY_YAML);
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(
      ['test', '/policy.yaml', 'rm -rf /', '--json', '--tool', 'shell_exec'],
      io
    );
    expect(exitCode).toBe(0);
    const jsonCall = io.stdout.mock.calls.find((call: unknown[]) => (call[0] as string).startsWith('{'));
    expect(jsonCall).toBeDefined();
    const receipt = JSON.parse(jsonCall?.[0] as string);
    expect(receipt).toHaveProperty('decision');
    expect(receipt).toHaveProperty('policyId');
    expect(receipt).toHaveProperty('detections');
  });

  it('test with missing arguments shows usage', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['test'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  // ---------------------------------------------------------------------------
  // hub subcommand
  // ---------------------------------------------------------------------------

  it('hub without URI shows usage', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['hub'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('hub with invalid URI shows error', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['hub', 'not-a-valid-uri'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Invalid hub URI'));
  });

  // ---------------------------------------------------------------------------
  // top-level --help
  // ---------------------------------------------------------------------------

  it('--help shows subcommands overview', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['--help'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Subcommands'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('list'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('install'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('policy'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('test'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('hub'));
  });

  // ---------------------------------------------------------------------------
  // unknown subcommand
  // ---------------------------------------------------------------------------

  it('unknown subcommand shows error', async () => {
    const io = createIoSpy();
    const exitCode = await runGuardrailsCommand(['unknown_sub'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Unknown'));
  });
});
