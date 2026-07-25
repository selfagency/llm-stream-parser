import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEccToolsAdapter } from './ecc-tools.js';

// ── Fixtures ──────────────────────────────────────────────

const COMPONENTS_FIXTURE = {
  components: [
    { id: 'comp-1', name: 'Logger', description: 'Structured logging component', version: '1.0.0' },
    { id: 'comp-2', name: 'Metrics', description: 'Prometheus metrics collector' }
  ]
};

const MODULES_FIXTURE = {
  modules: [{ id: 'mod-auth', name: 'AuthModule', description: 'OAuth2 authentication module', version: '2.1.0' }]
};

const PROFILES_FIXTURE = {
  profiles: [{ id: 'prof-dev', name: 'Development', description: 'Dev environment profile' }]
};

// ── Helpers ───────────────────────────────────────────────

let tmpDir = '';

function writeFixture(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'install-components.json'), JSON.stringify(COMPONENTS_FIXTURE));
  writeFileSync(join(dir, 'install-modules.json'), JSON.stringify(MODULES_FIXTURE));
  writeFileSync(join(dir, 'install-profiles.json'), JSON.stringify(PROFILES_FIXTURE));
}

function makeAdapter(): ReturnType<typeof createEccToolsAdapter> {
  tmpDir = mkdtempSync(join(tmpdir(), 'ecc-test-'));
  writeFixture(tmpDir);
  // Bypass git clone by pointing directly at the fixture dir
  return createEccToolsAdapter({ cacheDir: tmpDir, repoUrl: 'https://github.com/affaan-m/ECC' });
}

// ── Tests ─────────────────────────────────────────────────

describe('EccToolsAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // OS temp dir policy handles cleanup
  });

  it('should list all entries from all manifest files', async () => {
    const adapter = makeAdapter();
    const entries = await adapter.list();

    expect(entries).toHaveLength(4);
    expect(entries.map(e => e.id)).toContain('comp-1');
    expect(entries.map(e => e.id)).toContain('comp-2');
    expect(entries.map(e => e.id)).toContain('mod-auth');
    expect(entries.map(e => e.id)).toContain('prof-dev');
  });

  it('should include source field indicating manifest origin', async () => {
    const adapter = makeAdapter();
    const entries = await adapter.list();

    const compSource = entries.filter(e => e.source.includes('install-components'));
    expect(compSource).toHaveLength(2);

    const modSource = entries.filter(e => e.source.includes('install-modules'));
    expect(modSource).toHaveLength(1);

    const profSource = entries.filter(e => e.source.includes('install-profiles'));
    expect(profSource).toHaveLength(1);
  });

  it('should include version when available', async () => {
    const adapter = makeAdapter();
    const entries = await adapter.list();

    const logger = entries.find(e => e.id === 'comp-1');
    expect(logger?.version).toBe('1.0.0');

    const metrics = entries.find(e => e.id === 'comp-2');
    expect(metrics?.version).toBeUndefined();
  });

  it('should search by name (case-insensitive)', async () => {
    const adapter = makeAdapter();
    const results = await adapter.search('logger');
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('comp-1');
  });

  it('should search by description', async () => {
    const adapter = makeAdapter();
    const results = await adapter.search('metrics');
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('comp-2');
  });

  it('should search across all fields', async () => {
    const adapter = makeAdapter();
    const results = await adapter.search('auth');
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('mod-auth');
  });

  it('should return empty array for non-matching search', async () => {
    const adapter = makeAdapter();
    const results = await adapter.search('zzzznotfound');
    expect(results).toHaveLength(0);
  });

  it('should get an entry by id', async () => {
    const adapter = makeAdapter();
    const entry = await adapter.get('mod-auth');
    expect(entry).not.toBeNull();
    expect(entry?.name).toBe('AuthModule');
  });

  it('should return null for non-existent id', async () => {
    const adapter = makeAdapter();
    const entry = await adapter.get('non-existent');
    expect(entry).toBeNull();
  });

  it('should expose the adapter name', () => {
    const adapter = makeAdapter();
    expect(adapter.name).toBe('ecc-tools');
  });

  it('should gracefully handle missing manifest files', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'ecc-empty-'));
    // Create minimal fixture files so the adapter reads local data instead of cloning
    mkdirSync(emptyDir, { recursive: true });
    writeFileSync(join(emptyDir, 'install-components.json'), JSON.stringify({ components: [] }));
    writeFileSync(join(emptyDir, 'install-modules.json'), JSON.stringify({ modules: [] }));
    writeFileSync(join(emptyDir, 'install-profiles.json'), JSON.stringify({ profiles: [] }));
    const adapter = createEccToolsAdapter({ cacheDir: emptyDir });
    const entries = await adapter.list();
    expect(entries).toEqual([]);
  });

  it('should handle items missing name field', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecc-valid-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'install-components.json'),
      JSON.stringify({
        components: [
          { id: 'valid', name: 'Valid', description: 'Good' },
          { id: 'no-name', description: 'Missing name' },
          { description: 'No id or name' }
        ]
      })
    );
    writeFileSync(join(dir, 'install-modules.json'), JSON.stringify({}));
    writeFileSync(join(dir, 'install-profiles.json'), JSON.stringify({}));
    const adapter = createEccToolsAdapter({ cacheDir: dir });
    const entries = await adapter.list();
    // Items with an id (even without name) use id as name fallback
    // Items without id or name are filtered out
    expect(entries).toHaveLength(2);
    expect(entries[0]?.id).toBe('valid');
    expect(entries[1]?.id).toBe('no-name');
  });
});
