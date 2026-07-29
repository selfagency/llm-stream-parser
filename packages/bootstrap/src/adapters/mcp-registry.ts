/**
 * MCP Registry Adapter
 *
 * Fetches from https://registry.modelcontextprotocol.io/v0.1/
 * with cursor pagination, parses server.json manifests.
 *
 * Server naming: reverse-DNS convention
 * - io.modelcontextprotocol.* — official
 * - io.github.* — GitHub-verified
 * - me.{domain}.* — DNS-verified
 *
 * @module
 */

import type { RegistryAdapter, RegistryEntry } from './types.js';

// ── Constants ─────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://registry.modelcontextprotocol.io/v0.1';
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 100;

// ── Options ───────────────────────────────────────────────

/** @internal */ export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface McpRegistryAdapterOptions {
  /** Base URL for the MCP Registry API (default: https://registry.modelcontextprotocol.io/v0.1) */
  baseUrl?: string;
  /** Custom fetch implementation (default: global fetch) */
  fetch?: FetchLike;
  /** Initial cursor for paginated listing (default: undefined) */
  initialCursor?: string;
  /** Maximum number of pages to fetch (default: 100) */
  maxPages?: number;
  /** Page size for cursor pagination (default: 50) */
  pageSize?: number;
}

// ── Internal types ────────────────────────────────────────

interface McpRegistryPackage {
  readonly name: string;
  readonly registryType: 'npm' | 'pypi' | 'nuget' | 'cargo' | 'oci' | 'mcpb';
  readonly version?: string;
}

interface McpServerManifest {
  readonly description?: string;
  readonly environmentVariables?: Array<{ name: string; description?: string; required?: boolean }>;
  readonly homepage?: string;
  readonly name?: string;
  readonly packages?: McpRegistryPackage[];
  readonly reverseDnsName?: string;
}

interface McpRegistryListResponse {
  readonly nextCursor?: string;
  readonly servers: McpRegistryItem[];
}

interface McpRegistryItem {
  readonly cursor?: string;
  readonly server: McpServerManifest;
}

// ── Type guards ───────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isMcpServerManifest(value: unknown): value is McpServerManifest {
  if (!isObject(value)) {
    return false;
  }
  return isValidString(value.name) || isValidString(value.reverseDnsName);
}

// ── Helpers ───────────────────────────────────────────────

function extractEntryId(server: McpServerManifest): string {
  if (isValidString(server.reverseDnsName)) {
    return server.reverseDnsName as string;
  }
  if (isValidString(server.name)) {
    return server.name as string;
  }
  // Fallback: use first package name
  if (server.packages !== undefined && server.packages.length > 0) {
    const firstPkg = server.packages[0];
    if (firstPkg !== undefined) {
      return firstPkg.name;
    }
  }
  return 'unknown';
}

function extractEntryName(server: McpServerManifest): string {
  if (isValidString(server.name)) {
    return server.name as string;
  }
  if (isValidString(server.reverseDnsName)) {
    // Convert reverse-DNS to human-readable: io.modelcontextprotocol.filesystem → filesystem
    const parts = (server.reverseDnsName as string).split('.');
    return parts.at(-1) ?? (server.reverseDnsName as string);
  }
  return extractEntryId(server);
}

function serverToEntry(server: McpServerManifest): RegistryEntry {
  const id = extractEntryId(server);
  const entry: Record<string, unknown> = {
    id,
    name: extractEntryName(server),
    description: server.description ?? '',
    source: 'mcp-registry'
  };
  const version = server.packages?.[0]?.version;
  if (version !== undefined) {
    entry.version = version;
  }
  return entry as unknown as RegistryEntry;
}

function parseListResponse(data: unknown): { entries: RegistryEntry[]; nextCursor: string | undefined } {
  if (!isObject(data)) {
    return { entries: [], nextCursor: undefined };
  }

  // Check for the standard format with servers array
  if (Array.isArray(data.servers)) {
    const listResponse = data as unknown as McpRegistryListResponse;
    const entries: RegistryEntry[] = [];

    for (const item of listResponse.servers) {
      if (item.server !== undefined && isMcpServerManifest(item.server)) {
        entries.push(serverToEntry(item.server));
      }
    }

    return {
      entries,
      nextCursor: listResponse.nextCursor
    };
  }

  // Some endpoints return a flat server manifest
  if (isMcpServerManifest(data)) {
    return {
      entries: [serverToEntry(data as McpServerManifest)],
      nextCursor: undefined
    };
  }

  return { entries: [], nextCursor: undefined };
}

async function fetchJson(url: string, fetchFn: typeof globalThis.fetch): Promise<unknown> {
  const response = await fetchFn(url, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`MCP Registry error: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as unknown;
}

// ── Adapter factory ───────────────────────────────────────

export function createMcpRegistryAdapter(options?: McpRegistryAdapterOptions): RegistryAdapter {
  const baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL;
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const fetchFn = options?.fetch ?? globalThis.fetch;

  async function fetchPage(cursor?: string): Promise<{
    entries: RegistryEntry[];
    nextCursor: string | undefined;
  }> {
    let url = `${baseUrl}/servers?limit=${pageSize}`;
    if (cursor !== undefined) {
      url += `&cursor=${encodeURIComponent(cursor)}`;
    }

    const data = await fetchJson(url, fetchFn);
    return parseListResponse(data);
  }

  return {
    name: 'mcp-registry',

    async list(): Promise<RegistryEntry[]> {
      const allEntries: RegistryEntry[] = [];
      let cursor: string | undefined = options?.initialCursor;
      let pages = 0;
      const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;

      do {
        const page = await fetchPage(cursor);
        allEntries.push(...page.entries);
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor !== undefined && pages < maxPages);

      return allEntries;
    },

    async search(query: string): Promise<RegistryEntry[]> {
      const allEntries = await this.list();
      const term = query.toLowerCase();

      return allEntries.filter(
        e =>
          e.name.toLowerCase().includes(term) ||
          e.description.toLowerCase().includes(term) ||
          e.id.toLowerCase().includes(term)
      );
    },

    async get(id: string): Promise<RegistryEntry | null> {
      // Try the detail endpoint first
      const detailUrl = `${baseUrl}/servers/${encodeURIComponent(id)}`;
      try {
        const data = await fetchJson(detailUrl, fetchFn);
        const parsed = parseListResponse(data);
        if (parsed.entries.length > 0) {
          return parsed.entries[0] ?? null;
        }
      } catch {
        // Fallback to search
      }

      // Fallback: list all and find by id
      const allEntries = await this.list();
      return allEntries.find(e => e.id === id) ?? null;
    }
  };
}
