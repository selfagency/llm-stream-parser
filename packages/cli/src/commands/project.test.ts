import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliIO } from '../index.js';
import { runProjectCommand } from './project.js';

// ---------------------------------------------------------------------------
// Mock @agentsy/bootstrap — use vi.hoisted() so variables exist before mock
// ---------------------------------------------------------------------------

const { mockScanProject, mockCreateDefaultConfig, mockWriteConfig, mockReadConfig, mockConfigExists, mockConfigPath } =
  vi.hoisted(() => ({
    mockScanProject: vi.fn(),
    mockCreateDefaultConfig: vi.fn(),
    mockWriteConfig: vi.fn(),
    mockReadConfig: vi.fn(),
    mockConfigExists: vi.fn(),
    mockConfigPath: vi.fn()
  }));

vi.mock('@agentsy/bootstrap', () => ({
  scanProject: mockScanProject,
  createDefaultConfig: mockCreateDefaultConfig,
  writeConfig: mockWriteConfig,
  readConfig: mockReadConfig,
  configExists: mockConfigExists,
  configPath: mockConfigPath
}));

// ---------------------------------------------------------------------------
// Mock @agentsy/bootstrap/generators
// ---------------------------------------------------------------------------

const { mockGenerateAgentsMd, mockGenerateAftMd, mockGenerateAftJson } = vi.hoisted(() => ({
  mockGenerateAgentsMd: vi.fn(() => '# AGENTS.md\n\nAuto-generated content\n'),
  mockGenerateAftMd: vi.fn(() => '# AFT.md\n\nAuto-generated file tree\n'),
  mockGenerateAftJson: vi.fn(() => '{"schemaVersion":1}\n')
}));

vi.mock('@agentsy/bootstrap/generators', () => ({
  generateAgentsMd: mockGenerateAgentsMd,
  generateAftMd: mockGenerateAftMd,
  generateAftJson: mockGenerateAftJson
}));

// ---------------------------------------------------------------------------
// Mock node:fs/promises
// ---------------------------------------------------------------------------

const { mockMkdir, mockWriteFile } = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn()
}));

vi.mock('node:fs/promises', () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile
}));

// ---------------------------------------------------------------------------
// IO spy helper — matches guardrails.test.ts pattern
// ---------------------------------------------------------------------------

interface IoSpy {
  stderr: ReturnType<typeof vi.fn>;
  stdout: ReturnType<typeof vi.fn>;
}

function createIoSpy(): CliIO & IoSpy {
  return { stdout: vi.fn(), stderr: vi.fn() } as unknown as CliIO & IoSpy;
}

// ---------------------------------------------------------------------------
// Profile fixture
// ---------------------------------------------------------------------------

const SAMPLE_PROFILE = {
  rootPath: '/test/project',
  languages: ['typescript', 'javascript'],
  frameworks: ['next.js', 'react'],
  packageManager: 'pnpm',
  buildSystem: 'next',
  linter: ['biome'],
  testRunner: ['vitest'],
  monorepo: false,
  ci: ['github-actions'],
  deploymentTarget: ['vercel'],
  detectedAt: '2026-07-25T00:00:00.000Z'
};

// =============================================================================
// runProjectCommand
// =============================================================================

describe('runProjectCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScanProject.mockResolvedValue(SAMPLE_PROFILE);
    mockCreateDefaultConfig.mockImplementation((_rootPath: string, profile: unknown) => ({
      schemaVersion: 1,
      project: {
        rootPath: _rootPath,
        profile,
        detectedAt: new Date().toISOString()
      },
      installed: { connectors: [], mcpServers: [], skills: [], guardrails: [], hooks: [] },
      recommendations: [],
      artifacts: { agentsMd: false, aft: false, magicContext: false }
    }));
  });

  // ---------------------------------------------------------------------------
  // Top-level --help
  // ---------------------------------------------------------------------------

  it('shows top-level help with --help', async () => {
    const io = createIoSpy();
    const code = await runProjectCommand(['--help'], io);
    expect(code).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('agentsy project'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('scan'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('init'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('update'));
  });

  it('shows top-level help with -h', async () => {
    const io = createIoSpy();
    const code = await runProjectCommand(['-h'], io);
    expect(code).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  // ---------------------------------------------------------------------------
  // Unknown subcommand
  // ---------------------------------------------------------------------------

  it('shows error for unknown subcommand', async () => {
    const io = createIoSpy();
    const code = await runProjectCommand(['unknown'], io);
    expect(code).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Unknown'));
  });

  // ---------------------------------------------------------------------------
  // project scan
  // ---------------------------------------------------------------------------

  it('scan runs scanner and writes config', async () => {
    const io = createIoSpy();
    const code = await runProjectCommand(['scan'], io);
    expect(code).toBe(0);
    expect(mockScanProject).toHaveBeenCalledOnce();
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Scan complete'));
  });

  it('scan --help shows help', async () => {
    const io = createIoSpy();
    const code = await runProjectCommand(['scan', '--help'], io);
    expect(code).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('agentsy project scan'));
  });

  it('scan produces JSON with --json flag', async () => {
    const io = createIoSpy();
    const code = await runProjectCommand(['scan', '--json'], io);
    expect(code).toBe(0);
    const stdoutOutput = io.stdout.mock.calls.map((c: string[]) => c[0] as string);
    const jsonLine = stdoutOutput.find((s: string) => s.startsWith('{'));
    expect(jsonLine).toBeDefined();
    if (jsonLine !== undefined) {
      const parsed = JSON.parse(jsonLine);
      expect(parsed).toHaveProperty('rootPath');
      expect(parsed).toHaveProperty('languages');
    }
  });

  // ---------------------------------------------------------------------------
  // project init
  // ---------------------------------------------------------------------------

  it('init generates all artifacts', async () => {
    const io = createIoSpy();
    const code = await runProjectCommand(['init'], io);
    expect(code).toBe(0);
    expect(mockScanProject).toHaveBeenCalledOnce();
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Initialized'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('.agentsy/config.yml'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('AGENTS.md'));
  });

  it('init --help shows help', async () => {
    const io = createIoSpy();
    const code = await runProjectCommand(['init', '--help'], io);
    expect(code).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('agentsy project init'));
  });

  it('init skips when config already exists without --force', async () => {
    mockConfigExists.mockResolvedValueOnce(true);
    const io = createIoSpy();
    const code = await runProjectCommand(['init'], io);
    expect(code).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('already initialized'));
  });

  it('init with --force overwrites existing config', async () => {
    mockConfigExists.mockResolvedValueOnce(true);
    const io = createIoSpy();
    const code = await runProjectCommand(['init', '--force'], io);
    expect(code).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Initialized'));
  });

  // ---------------------------------------------------------------------------
  // project update
  // ---------------------------------------------------------------------------

  it('update re-scans and regenerates artifacts', async () => {
    mockReadConfig.mockResolvedValueOnce({
      schemaVersion: 1,
      project: { rootPath: '/test/project', profile: SAMPLE_PROFILE, detectedAt: '2026-07-25T00:00:00.000Z' },
      installed: { connectors: [], mcpServers: [], skills: [], guardrails: [], hooks: [] },
      recommendations: [],
      artifacts: { agentsMd: true, aft: true, magicContext: false }
    });
    const io = createIoSpy();
    const code = await runProjectCommand(['update'], io);
    expect(code).toBe(0);
    expect(mockScanProject).toHaveBeenCalledOnce();
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Updated'));
  });

  it('update shows error when config not found', async () => {
    mockReadConfig.mockResolvedValue(null);
    const io = createIoSpy();
    const code = await runProjectCommand(['update'], io);
    expect(code).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('config.yml'));
  });

  it('update --help shows help', async () => {
    const io = createIoSpy();
    const code = await runProjectCommand(['update', '--help'], io);
    expect(code).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('agentsy project update'));
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  it('handles scanner errors gracefully', async () => {
    mockScanProject.mockRejectedValueOnce(new Error('Scanner crashed'));
    const io = createIoSpy();
    const code = await runProjectCommand(['scan'], io);
    expect(code).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Scanner crashed'));
  });

  it('no subcommand shows help', async () => {
    const io = createIoSpy();
    const code = await runProjectCommand([], io);
    expect(code).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });
});
