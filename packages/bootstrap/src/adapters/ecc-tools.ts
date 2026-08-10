/**
 * ECC Tools Registry Adapter
 *
 * Clones https://github.com/affaan-m/ECC and reads 3 manifest JSON files:
 * - install-components.json
 * - install-modules.json
 * - install-profiles.json
 *
 * @module
 */

import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { RegistryAdapter, RegistryEntry } from './types.js';

const execFileAsync = promisify(execFile);

// ── Constants ─────────────────────────────────────────────

const DEFAULT_REPO_URL = 'https://github.com/affaan-m/ECC';
const DEFAULT_CACHE_DIR = '.ecc-cache';
const MANIFEST_FILES = ['install-components.json', 'install-modules.json', 'install-profiles.json'] as const;

// ── Internal types ────────────────────────────────────────

interface EccManifestItem {
  readonly description?: string;
  readonly id?: string;
  readonly name?: string;
  readonly version?: string;
  readonly [key: string]: unknown;
}

interface EccManifest {
  readonly components?: EccManifestItem[];
  readonly modules?: EccManifestItem[];
  readonly profiles?: EccManifestItem[];
}

// ── Options ───────────────────────────────────────────────

export interface EccToolsAdapterOptions {
  /** Cache directory for cloned repository (default: .ecc-cache) */
  cacheDir?: string;
  /** GitHub repository URL (default: https://github.com/affaan-m/ECC) */
  repoUrl?: string;
}

// ── Helpers ───────────────────────────────────────────────

function isEccManifest(value: unknown): value is EccManifest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  return Array.isArray(v.components) || Array.isArray(v.modules) || Array.isArray(v.profiles);
}

function isValidString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseManifestItem(item: EccManifestItem, source: string): RegistryEntry | null {
  const name = item.name ?? item.id;
  if (!isValidString(name)) {
    return null;
  }
  return {
    id: item.id ?? name,
    name,
    description: item.description ?? '',
    source,
    ...(item.version === undefined ? {} : { version: item.version })
  };
}

function parseManifest(manifest: unknown, source: string): RegistryEntry[] {
  if (!isEccManifest(manifest)) {
    return [];
  }
  const entries: RegistryEntry[] = [];

  collectManifestItems(entries, manifest.components, `${source}/components`);
  collectManifestItems(entries, manifest.modules, `${source}/modules`);
  collectManifestItems(entries, manifest.profiles, `${source}/profiles`);

  return entries;
}

/** Parse a manifest section into registry entries, appending to the given list. */
function collectManifestItems(
  entries: RegistryEntry[],
  items: readonly EccManifestItem[] | undefined,
  source: string
): void {
  for (const item of items ?? []) {
    const entry = parseManifestItem(item, source);
    if (entry !== null) {
      entries.push(entry);
    }
  }
}

// ── Main logic ────────────────────────────────────────────

async function ensureRepoCloned(repoUrl: string, cacheDir: string): Promise<string | null> {
  // Check if already cloned by looking for manifest files
  try {
    await access(join(cacheDir, 'install-components.json'));
    return cacheDir;
  } catch {
    // Not cloned yet — attempt shallow clone with timeout
    try {
      await execFileAsync('git', ['clone', '--depth', '1', repoUrl, cacheDir], {
        timeout: 10_000
      });
      return cacheDir;
    } catch {
      // Git clone failed (no network, no git, timeout, etc.)
      return null;
    }
  }
}

async function readManifestFile(cacheDir: string, fileName: string): Promise<unknown> {
  const filePath = join(cacheDir, fileName);
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as unknown;
}

async function loadAllManifests(cacheDir: string): Promise<RegistryEntry[]> {
  const entries: RegistryEntry[] = [];

  for (const fileName of MANIFEST_FILES) {
    try {
      const manifest = await readManifestFile(cacheDir, fileName);
      const parsed = parseManifest(manifest, fileName);
      entries.push(...parsed);
    } catch {
      // Skip unreadable manifest files
    }
  }

  return entries;
}

// ── Adapter factory ───────────────────────────────────────

export function createEccToolsAdapter(options?: EccToolsAdapterOptions): RegistryAdapter {
  const repoUrl = options?.repoUrl ?? DEFAULT_REPO_URL;
  const cacheDir = options?.cacheDir ?? DEFAULT_CACHE_DIR;

  let cachedEntries: RegistryEntry[] | null = null;

  async function ensureLoaded(): Promise<RegistryEntry[]> {
    if (cachedEntries !== null) {
      return cachedEntries;
    }
    const cloneDir = await ensureRepoCloned(repoUrl, cacheDir);
    if (cloneDir === null) {
      cachedEntries = [];
      return [];
    }
    const entries = await loadAllManifests(cloneDir);
    cachedEntries = entries;
    return entries;
  }

  return {
    name: 'ecc-tools',

    async list(): Promise<RegistryEntry[]> {
      return await ensureLoaded();
    },

    async search(query: string): Promise<RegistryEntry[]> {
      const term = query.toLowerCase();
      const entries = await ensureLoaded();
      return entries.filter(
        e =>
          e.name.toLowerCase().includes(term) ||
          e.description.toLowerCase().includes(term) ||
          e.id.toLowerCase().includes(term)
      );
    },

    async get(id: string): Promise<RegistryEntry | null> {
      const entries = await ensureLoaded();
      return entries.find(e => e.id === id) ?? null;
    }
  };
}
