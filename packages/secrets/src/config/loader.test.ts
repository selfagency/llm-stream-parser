import { access, readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverConfigPath, loadConfig } from './loader.js';

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn()
}));

const mockParse = vi.hoisted(() => vi.fn(() => ({})));
vi.mock('yaml', () => ({
  parse: mockParse
}));

describe('loadConfig', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty config when no file exists', async () => {
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

    const config = await loadConfig('/nonexistent-root');

    expect(config).toBeDefined();
    expect(config.providers).toEqual({});
  });

  it('loads and validates config from first existing path', async () => {
    vi.mocked(access).mockResolvedValueOnce(undefined);
    vi.mocked(readFile).mockResolvedValue('providers:\n  doppler: {}\n');

    const config = await loadConfig('/test/project-root');

    expect(config.providers).toBeDefined();
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it('uses homedir path as final fallback', async () => {
    vi.mocked(access)
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce(undefined);
    vi.mocked(readFile).mockResolvedValue('version: 1\n');
    mockParse.mockReturnValueOnce({ version: 1, providers: {} });

    const config = await loadConfig('/test/project-root');

    expect(config).toBeDefined();
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it('falls through to next path when first does not exist', async () => {
    vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValueOnce(undefined);
    vi.mocked(readFile).mockResolvedValue('providers:\n  vault: {}\n');
    mockParse.mockReturnValueOnce({ providers: { vault: {} } });

    const config = await loadConfig('/test/project-root');

    expect(config.providers).toBeDefined();
    expect(config.providers).toHaveProperty('vault');
  });
});

describe('discoverConfigPath', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns first existing path', async () => {
    vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValueOnce(undefined);

    const path = await discoverConfigPath('/test/project-root');

    expect(path).toContain('secrets.yaml');
    expect(access).toHaveBeenCalledTimes(2);
  });

  it('returns default project-local path when none exist', async () => {
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

    const path = await discoverConfigPath('/test/project-root');

    expect(path).toContain('.agentsy');
    expect(path).toContain('secrets.yaml');
  });
});
