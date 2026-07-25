import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMcpRegistryAdapter, type FetchLike } from './mcp-registry.js';

// ── Fixtures ──────────────────────────────────────────────

const SERVER_FIXTURE_1: Record<string, unknown> = {
  servers: [
    {
      server: {
        reverseDnsName: 'io.modelcontextprotocol.filesystem',
        name: 'Filesystem',
        description: 'Access the local filesystem',
        packages: [{ registryType: 'npm', name: '@modelcontextprotocol/server-filesystem', version: '0.6.2' }],
        environmentVariables: []
      },
      cursor: 'cursor-1'
    },
    {
      server: {
        reverseDnsName: 'io.modelcontextprotocol.puppeteer',
        name: 'Puppeteer',
        description: 'Browser automation with Puppeteer',
        packages: [{ registryType: 'npm', name: '@modelcontextprotocol/server-puppeteer', version: '0.5.0' }]
      },
      cursor: 'cursor-2'
    }
  ],
  nextCursor: 'next-page-cursor'
};

const SERVER_FIXTURE_2: Record<string, unknown> = {
  servers: [
    {
      server: {
        reverseDnsName: 'io.github.example.my-server',
        name: 'My Server',
        description: 'An example MCP server',
        packages: [{ registryType: 'pypi', name: 'my-mcp-server', version: '1.0.0' }]
      },
      cursor: 'cursor-3'
    }
  ],
  nextCursor: undefined
};

// ── Mock fetch factory ───────────────────────────────────

function createMockFetch(firstPage: Record<string, unknown>, secondPage?: Record<string, unknown>): FetchLike {
  let callCount = 0;

  const fetcher: FetchLike = async (_input, _init) => {
    callCount += 1;

    if (callCount === 1 && firstPage !== undefined) {
      return {
        ok: true,
        status: 200,
        json: async () => firstPage
      } as Response;
    }

    if (secondPage !== undefined) {
      return {
        ok: true,
        status: 200,
        json: async () => secondPage
      } as Response;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ servers: [], nextCursor: undefined })
    } as Response;
  };

  return fetcher;
}

// ── Tests ─────────────────────────────────────────────────

describe('McpRegistryAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('list', () => {
    it('should return all servers from a single page', async () => {
      const mockFetch = createMockFetch(SERVER_FIXTURE_1, { servers: [], nextCursor: undefined });
      const adapter = createMcpRegistryAdapter({ fetch: mockFetch });
      const entries = await adapter.list();

      expect(entries).toHaveLength(2);
      expect(entries[0]?.id).toBe('io.modelcontextprotocol.filesystem');
      expect(entries[0]?.name).toBe('Filesystem');
      expect(entries[0]?.source).toBe('mcp-registry');
      expect(entries[0]?.version).toBe('0.6.2');
    });

    it('should paginate through multiple pages', async () => {
      const mockFetch = createMockFetch(SERVER_FIXTURE_1, SERVER_FIXTURE_2);
      const adapter = createMcpRegistryAdapter({ fetch: mockFetch, pageSize: 2 });
      const entries = await adapter.list();

      expect(entries).toHaveLength(3);
      expect(entries.map(e => e.id)).toContain('io.github.example.my-server');
    });

    it('should handle empty response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ servers: [], nextCursor: undefined })
      } as Response);

      const adapter = createMcpRegistryAdapter({ fetch: mockFetch });
      const entries = await adapter.list();
      expect(entries).toEqual([]);
    });

    it('should respect page size parameter', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => SERVER_FIXTURE_1
      } as Response);

      const adapter = createMcpRegistryAdapter({ fetch: mockFetch, pageSize: 10 });
      await adapter.list();

      const callUrl = mockFetch.mock.calls[0]?.[0]?.toString() ?? '';
      expect(callUrl).toContain('limit=10');
    });
  });

  describe('search', () => {
    it('should filter by name', async () => {
      const mockFetch = createMockFetch(SERVER_FIXTURE_1, { servers: [], nextCursor: undefined });
      const adapter = createMcpRegistryAdapter({ fetch: mockFetch });
      const results = await adapter.search('filesystem');

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('io.modelcontextprotocol.filesystem');
    });

    it('should filter by description', async () => {
      const mockFetch = createMockFetch(SERVER_FIXTURE_1, { servers: [], nextCursor: undefined });
      const adapter = createMcpRegistryAdapter({ fetch: mockFetch });
      const results = await adapter.search('browser');

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('io.modelcontextprotocol.puppeteer');
    });

    it('should return empty for no matches', async () => {
      const mockFetch = createMockFetch(SERVER_FIXTURE_1, { servers: [], nextCursor: undefined });
      const adapter = createMcpRegistryAdapter({ fetch: mockFetch });
      const results = await adapter.search('zzzznothing');
      expect(results).toEqual([]);
    });
  });

  describe('get', () => {
    it('should find a server by id', async () => {
      const mockFetch = createMockFetch(SERVER_FIXTURE_1, { servers: [], nextCursor: undefined });
      const adapter = createMcpRegistryAdapter({ fetch: mockFetch });
      const entry = await adapter.get('io.modelcontextprotocol.filesystem');

      expect(entry).not.toBeNull();
      expect(entry?.name).toBe('Filesystem');
    });

    it('should return null for non-existent id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'not found' })
      } as Response);

      const adapter = createMcpRegistryAdapter({ fetch: mockFetch });
      const entry = await adapter.get('non.existent');
      expect(entry).toBeNull();
    });
  });

  describe('adapter name', () => {
    it('should expose the adapter name', () => {
      const mockFetch = createMockFetch({});
      const adapter = createMcpRegistryAdapter({ fetch: mockFetch });
      expect(adapter.name).toBe('mcp-registry');
    });
  });

  describe('server name extraction', () => {
    it('should use reverseDnsName as id and name as display name', async () => {
      const mockFetch = createMockFetch(SERVER_FIXTURE_1, { servers: [], nextCursor: undefined });
      const adapter = createMcpRegistryAdapter({ fetch: mockFetch });
      const entries = await adapter.list();

      const fsEntry = entries.find(e => e.id === 'io.modelcontextprotocol.filesystem');
      expect(fsEntry?.name).toBe('Filesystem');
    });
  });
});
