import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFactory, maskedValue, printSyncResultLine, runSecretsCommand } from './secrets.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => ({ existsSync: vi.fn() }));
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn() }));

const mockRegistry = {
  getAll: vi.fn(),
  listAll: vi.fn(),
  register: vi.fn(),
  resolve: vi.fn()
};

function MockProviderRegistry(): typeof mockRegistry {
  return mockRegistry;
}

const mockLoadConfig = vi.fn();
vi.mock('@agentsy/secrets', () => ({
  createOnePasswordKeyring: vi.fn(() => ({
    id: '1password',
    name: '1Password',
    capabilities: { canList: true, canSync: true, canTtl: false },
    resourceTypes: [],
    check: vi.fn(),
    resolve: vi.fn(),
    list: vi.fn(),
    sync: vi.fn()
  })),
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
  ProviderRegistry: MockProviderRegistry
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createIo() {
  return { stdout: vi.fn(), stderr: vi.fn() };
}

// ---------------------------------------------------------------------------
// maskedValue
// ---------------------------------------------------------------------------

describe('maskedValue', () => {
  it('masks short values entirely', () => {
    expect(maskedValue('ab')).toBe('****');
    expect(maskedValue('12345678')).toBe('****');
  });

  it('shows last 4 chars for longer values', () => {
    expect(maskedValue('abcdefghij')).toBe('...ghij');
    expect(maskedValue('sk_live_abc12345')).toBe('...2345');
  });
});

// ---------------------------------------------------------------------------
// getFactory
// ---------------------------------------------------------------------------

describe('getFactory', () => {
  it('returns factory for known provider', () => {
    const factory = getFactory('1password');
    expect(factory).toBeDefined();
    expect(typeof factory).toBe('function');
  });

  it('returns undefined for unknown provider', () => {
    expect(getFactory('nonexistent')).toBeUndefined();
  });

  it('returns undefined for prototype-pollution keys', () => {
    expect(getFactory('__proto__')).toBeUndefined();
    expect(getFactory('constructor')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// printSyncResultLine
// ---------------------------------------------------------------------------

describe('printSyncResultLine', () => {
  it('prints success line', () => {
    const io = createIo();
    printSyncResultLine({ provider: 'test', synced: true }, io);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('test'));
  });

  it('prints failure line without error', () => {
    const io = createIo();
    printSyncResultLine({ provider: 'test', synced: false }, io);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('test'));
  });

  it('prints failure line with error', () => {
    const io = createIo();
    printSyncResultLine({ provider: 'test', synced: false, error: 'timeout' }, io);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('timeout'));
  });
});

// ---------------------------------------------------------------------------
// runSecretsCommand
// ---------------------------------------------------------------------------

describe('runSecretsCommand', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('init', () => {
    it('creates config when none exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mockLoadConfig).mockResolvedValue({ providers: {} });
      const io = createIo();

      const code = await runSecretsCommand(['init'], io);

      expect(code).toBe(0);
      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
    });

    it('skips creation when config already has providers', async () => {
      vi.mocked(mockLoadConfig).mockResolvedValue({ providers: { doppler: {} } });
      const io = createIo();

      const code = await runSecretsCommand(['init'], io);

      expect(code).toBe(0);
      expect(mkdir).not.toHaveBeenCalled();
    });

    it('returns JSON when --json flag is set', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mockLoadConfig).mockResolvedValue({ providers: {} });
      const io = createIo();

      const code = await runSecretsCommand(['init', '--json'], io);

      expect(code).toBe(0);
      expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('"created": true'));
    });
  });

  describe('list', () => {
    it('shows empty state when no providers configured', async () => {
      vi.mocked(mockLoadConfig).mockResolvedValue({ providers: {} });
      const io = createIo();

      const code = await runSecretsCommand(['list'], io);

      expect(code).toBe(0);
      expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('No providers configured'));
    });

    it('lists providers and secrets', async () => {
      vi.mocked(mockLoadConfig).mockResolvedValue({ providers: { '1password': {} } });
      mockRegistry.getAll.mockReturnValue([
        { id: '1password', name: '1Password', capabilities: { canList: true, canSync: false, canTtl: false } }
      ]);
      mockRegistry.listAll.mockResolvedValue([{ resourceType: 'vercel_prod', providerId: '1password' }]);
      const io = createIo();

      const code = await runSecretsCommand(['list'], io);

      expect(code).toBe(0);
      expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('1password'));
    });

    it('returns JSON when --json flag is set', async () => {
      vi.mocked(mockLoadConfig).mockResolvedValue({ providers: { '1password': {} } });
      mockRegistry.getAll.mockReturnValue([]);
      mockRegistry.listAll.mockResolvedValue([]);
      const io = createIo();

      const code = await runSecretsCommand(['list', '--json'], io);

      expect(code).toBe(0);
      expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('"providers"'));
    });
  });

  describe('lookup', () => {
    it('errors when no resource type provided', async () => {
      const io = createIo();
      const code = await runSecretsCommand(['lookup'], io);
      expect(code).toBe(1);
      expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });

    it('errors when no providers configured', async () => {
      vi.mocked(mockLoadConfig).mockResolvedValue({ providers: {} });
      const io = createIo();

      const code = await runSecretsCommand(['lookup', 'test_key'], io);

      expect(code).toBe(1);
      expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('No providers configured'));
    });

    it('resolves and displays masked value', async () => {
      vi.mocked(mockLoadConfig).mockResolvedValue({ providers: { '1password': {} } });
      mockRegistry.resolve.mockResolvedValue('sk_secret_value_xyz');
      const io = createIo();

      const code = await runSecretsCommand(['lookup', 'test_key'], io);

      expect(code).toBe(0);
      expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('..._xyz'));
    });

    it('resolves and reveals full value with --reveal', async () => {
      vi.mocked(mockLoadConfig).mockResolvedValue({ providers: { '1password': {} } });
      mockRegistry.resolve.mockResolvedValue('sk_secret_value_xyz');
      const io = createIo();

      const code = await runSecretsCommand(['lookup', 'test_key', '--reveal'], io);

      expect(code).toBe(0);
      expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('sk_secret_value_xyz'));
    });

    it('returns JSON when --json flag is set', async () => {
      vi.mocked(mockLoadConfig).mockResolvedValue({ providers: { '1password': {} } });
      mockRegistry.resolve.mockResolvedValue('sk_secret_value_xyz');
      const io = createIo();

      const code = await runSecretsCommand(['lookup', 'test_key', '--json'], io);

      expect(code).toBe(0);
      expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('"resolved": true'));
    });

    it('handles resolve errors', async () => {
      vi.mocked(mockLoadConfig).mockResolvedValue({ providers: { '1password': {} } });
      mockRegistry.resolve.mockRejectedValue(new Error('not found'));
      const io = createIo();

      const code = await runSecretsCommand(['lookup', 'test_key'], io);

      expect(code).toBe(1);
      expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });
  });

  describe('sync', () => {
    it('errors when no providers configured', async () => {
      vi.mocked(mockLoadConfig).mockResolvedValue({ providers: {} });
      const io = createIo();

      const code = await runSecretsCommand(['sync'], io);

      expect(code).toBe(1);
      expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('No providers configured'));
    });

    it('syncs providers and reports results', async () => {
      vi.mocked(mockLoadConfig).mockResolvedValue({ providers: { '1password': {} } });
      const io = createIo();

      const code = await runSecretsCommand(['sync'], io);

      expect(code).toBe(0);
      expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Sync complete'));
    });
  });

  describe('unknown subcommand', () => {
    it('returns error for unknown subcommand', async () => {
      const io = createIo();
      const code = await runSecretsCommand(['unknown'], io);
      expect(code).toBe(1);
      expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Unknown'));
    });
  });
});
