import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliIO } from '../index.js';
import { runInstallCommand } from './install.js';

// ---------------------------------------------------------------------------
// Mock @agentsy/bootstrap/install — use vi.hoisted() for hoist-safe mocks
// ---------------------------------------------------------------------------

const { mockInstallById, mockInstallRecommended } = vi.hoisted(() => ({
  mockInstallById: vi.fn(),
  mockInstallRecommended: vi.fn()
}));

vi.mock('@agentsy/bootstrap/install', () => ({
  installById: mockInstallById,
  installRecommended: mockInstallRecommended
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

// =============================================================================
// runInstallCommand
// =============================================================================

describe('runInstallCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Top-level --help
  // ---------------------------------------------------------------------------

  it('shows help with --help', async () => {
    const io = createIoSpy();
    const code = await runInstallCommand(['--help'], io);
    expect(code).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('agentsy install'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('<type>'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('--recommended'));
  });

  it('shows help with -h', async () => {
    const io = createIoSpy();
    const code = await runInstallCommand(['-h'], io);
    expect(code).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  // ---------------------------------------------------------------------------
  // install <type> <id>
  // ---------------------------------------------------------------------------

  it('installs a component by type and id', async () => {
    mockInstallById.mockResolvedValueOnce({
      componentId: 'test-mcp',
      componentType: 'mcp-server',
      success: true
    });
    const io = createIoSpy();
    const code = await runInstallCommand(['mcp', 'test-mcp'], io);
    expect(code).toBe(0);
    expect(mockInstallById).toHaveBeenCalledWith(expect.any(String), 'mcp-server', 'test-mcp');
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Installed'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('test-mcp'));
  });

  it('shows error for missing type argument', async () => {
    const io = createIoSpy();
    const code = await runInstallCommand([], io);
    expect(code).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('shows error for missing id argument', async () => {
    const io = createIoSpy();
    const code = await runInstallCommand(['mcp'], io);
    expect(code).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Missing'));
  });

  it('shows error for invalid component type', async () => {
    const io = createIoSpy();
    const code = await runInstallCommand(['invalid-type', 'some-id'], io);
    expect(code).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Invalid component type'));
  });

  it('shows install failure message', async () => {
    mockInstallById.mockResolvedValueOnce({
      componentId: 'fail-mcp',
      componentType: 'mcp-server',
      success: false,
      error: 'Registry not reachable'
    });
    const io = createIoSpy();
    const code = await runInstallCommand(['mcp', 'fail-mcp'], io);
    expect(code).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Failed'));
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Registry not reachable'));
  });

  it('handles exceptions from installById gracefully', async () => {
    mockInstallById.mockRejectedValueOnce(new Error('Unexpected error'));
    const io = createIoSpy();
    const code = await runInstallCommand(['mcp', 'crash-mcp'], io);
    expect(code).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Unexpected error'));
  });

  // ---------------------------------------------------------------------------
  // install --recommended
  // ---------------------------------------------------------------------------

  it('--recommended installs all high-confidence recommendations', async () => {
    mockInstallRecommended.mockResolvedValueOnce([
      { componentId: 'rec-1', componentType: 'skill', success: true },
      { componentId: 'rec-2', componentType: 'mcp-server', success: true }
    ]);
    const io = createIoSpy();
    const code = await runInstallCommand(['--recommended'], io);
    expect(code).toBe(0);
    expect(mockInstallRecommended).toHaveBeenCalledOnce();
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Installed 2'));
  });

  it('--recommended reports partial failures', async () => {
    mockInstallRecommended.mockResolvedValueOnce([
      { componentId: 'rec-1', componentType: 'skill', success: true },
      { componentId: 'rec-2', componentType: 'mcp-server', success: false, error: 'Not found' }
    ]);
    const io = createIoSpy();
    const code = await runInstallCommand(['--recommended'], io);
    expect(code).toBe(1);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Installed 1'));
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Not found'));
  });

  it('--recommended with threshold flag', async () => {
    mockInstallRecommended.mockResolvedValueOnce([]);
    const io = createIoSpy();
    const code = await runInstallCommand(['--recommended', '--threshold', '0.9'], io);
    expect(code).toBe(0);
    expect(mockInstallRecommended).toHaveBeenCalledWith(expect.any(String), 0.9);
  });

  it('--recommended shows help', async () => {
    const io = createIoSpy();
    const code = await runInstallCommand(['--recommended', '--help'], io);
    expect(code).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('--recommended'));
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('handles component type aliases (mcp-server vs mcp)', async () => {
    mockInstallById.mockResolvedValueOnce({
      componentId: 'some-mcp',
      componentType: 'mcp-server',
      success: true
    });
    const io = createIoSpy();
    const code = await runInstallCommand(['mcp-server', 'some-mcp'], io);
    expect(code).toBe(0);
    expect(mockInstallById).toHaveBeenCalledWith(expect.any(String), 'mcp-server', 'some-mcp');
  });

  it('handles skill type', async () => {
    mockInstallById.mockResolvedValueOnce({
      componentId: 'my-skill',
      componentType: 'skill',
      success: true
    });
    const io = createIoSpy();
    const code = await runInstallCommand(['skill', 'my-skill'], io);
    expect(code).toBe(0);
    expect(mockInstallById).toHaveBeenCalledWith(expect.any(String), 'skill', 'my-skill');
  });
});
