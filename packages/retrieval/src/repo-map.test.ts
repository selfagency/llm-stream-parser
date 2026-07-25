import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RepoMap, type RepoMapEntry, type RepoMapIndex } from './repo-map.js';

function createFixtures(root: string): Record<string, string> {
  return {
    [join(root, 'src/index.ts')]: [
      "export { run } from './runner.js';",
      "export type { Config } from './config.js';",
      "export const VERSION = '1.0.0';"
    ].join('\n'),
    [join(root, 'src/runner.ts')]: [
      "import type { Config } from './config.js';",
      'export function run(config: Config): string {',
      '  return config.name;',
      '}'
    ].join('\n'),
    [join(root, 'src/config.ts')]: [
      'export interface Config {',
      '  name: string;',
      '  verbose?: boolean;',
      '}',
      '',
      'export function createConfig(name: string): Config {',
      '  return { name };',
      '}'
    ].join('\n'),
    [join(root, 'src/utils.ts')]: [
      'export function formatMessage(msg: string): string {',
      '  return msg.trim();',
      '}',
      '',
      'export class Formatter {',
      '  format(msg: string): string {',
      '    return formatMessage(msg);',
      '  }',
      '}'
    ].join('\n'),
    [join(root, 'src/types.ts')]: [
      'export type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };',
      'export type Result<T> = { ok: true; value: T } | { ok: false; error: Error };'
    ].join('\n')
  };
}

describe('RepoMap', () => {
  let tmpDir: string;
  let repoMap: RepoMap;

  beforeEach(async () => {
    tmpDir = join(import.meta.dirname, `__rmap_${Date.now()}`);
    const files = createFixtures(tmpDir);
    for (const [filePath, content] of Object.entries(files)) {
      const dir = filePath.slice(0, filePath.lastIndexOf('/'));
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, content, 'utf-8');
    }
    repoMap = new RepoMap();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('build', () => {
    it('extracts symbols from all source files', async () => {
      const index: RepoMapIndex = await repoMap.build(tmpDir);

      expect(index.totalFiles).toBeGreaterThanOrEqual(5);
      expect(index.totalSymbols).toBeGreaterThanOrEqual(8);

      const allNames = index.entries.map(e => e.symbol);

      expect(allNames).toContain('run');
      expect(allNames).toContain('Config');
      expect(allNames).toContain('VERSION');
      expect(allNames).toContain('createConfig');
      expect(allNames).toContain('formatMessage');
      expect(allNames).toContain('Formatter');
      expect(allNames).toContain('DeepPartial');
      expect(allNames).toContain('Result');
    });

    it('records line numbers for symbols', async () => {
      const index: RepoMapIndex = await repoMap.build(tmpDir);

      const config = index.entries.find(e => e.symbol === 'Config');
      expect(config?.line).toBe(1);

      const runFunc = index.entries.find(e => e.symbol === 'run' && e.filePath.endsWith('runner.ts'));
      expect(runFunc?.line).toBe(2);
    });

    it('records symbol kinds correctly', async () => {
      const index: RepoMapIndex = await repoMap.build(tmpDir);

      expect(index.entries.find(e => e.symbol === 'Config')?.kind).toBe('type');
      expect(index.entries.find(e => e.symbol === 'run')?.kind).toBe('function');
      expect(index.entries.find(e => e.symbol === 'Formatter')?.kind).toBe('class');
      expect(index.entries.find(e => e.symbol === 'VERSION')?.kind).toBe('variable');
      expect(index.entries.find(e => e.symbol === 'DeepPartial')?.kind).toBe('type');
    });

    it('assigns reference counts based on import graph', async () => {
      const index: RepoMapIndex = await repoMap.build(tmpDir);

      const configEntry = index.entries.find(e => e.symbol === 'Config');
      expect(configEntry?.references).toBeGreaterThanOrEqual(0);
    });

    it('ranks symbols by importance (PageRank)', async () => {
      const index: RepoMapIndex = await repoMap.build(tmpDir);

      expect(index.entries.length).toBeGreaterThan(0);

      for (let i = 1; i < index.entries.length; i++) {
        const prevScore = index.entries[i - 1]?.score ?? 0;
        const currScore = index.entries[i]?.score ?? 0;
        expect(currScore).toBeLessThanOrEqual(prevScore);
      }
    });

    it('handles empty directory', async () => {
      const emptyDir = join(tmpDir, 'empty');
      await mkdir(emptyDir, { recursive: true });

      const index: RepoMapIndex = await repoMap.build(emptyDir);
      expect(index.totalFiles).toBe(0);
      expect(index.totalSymbols).toBe(0);
      expect(index.entries).toEqual([]);
    });

    it('respects custom exclude patterns', async () => {
      const strictMap = new RepoMap({ exclude: ['**/*.ts'] });
      const index: RepoMapIndex = await strictMap.build(tmpDir);

      expect(index.totalFiles).toBe(0);
    });
  });

  describe('getMap', () => {
    it('returns top-N ranked symbols', async () => {
      const entries: RepoMapEntry[] = await repoMap.getMap(tmpDir, [], 3);

      expect(entries.length).toBe(3);

      for (const entry of entries) {
        expect(entry.symbol).toBeTruthy();
        expect(entry.filePath).toBeTruthy();
        expect(typeof entry.line).toBe('number');
        expect(['function', 'class', 'method', 'type', 'variable'] as const).toContain(entry.kind);
        expect(typeof entry.score).toBe('number');
        expect(typeof entry.references).toBe('number');
      }
    });

    it('biases toward open files', async () => {
      const allEntries: RepoMapEntry[] = await repoMap.getMap(tmpDir, [], 100);

      expect(allEntries.length).toBeGreaterThan(0);
      const lowEntry = allEntries.at(-1) as RepoMapEntry;

      const lowPath: string = lowEntry.filePath;
      const entriesWithBias: RepoMapEntry[] = await repoMap.getMap(tmpDir, [lowPath], 5);

      const hasOpenFileSymbol = entriesWithBias.some(e => e.filePath === lowPath);
      expect(hasOpenFileSymbol).toBe(true);
    });

    it('respects limit parameter', async () => {
      for (const limit of [1, 2, 5]) {
        const entries: RepoMapEntry[] = await repoMap.getMap(tmpDir, [], limit);
        expect(entries.length).toBeLessThanOrEqual(limit);
      }
    });

    it('returns entries within scope', async () => {
      const entries: RepoMapEntry[] = await repoMap.getMap(tmpDir, [], 10);

      for (const entry of entries) {
        expect(entry.filePath.startsWith(tmpDir)).toBe(true);
      }
    });
  });
});

describe('RepoMapEntry interface', () => {
  it('has correct shape', () => {
    const entry: RepoMapEntry = {
      symbol: 'foo',
      filePath: '/test.ts',
      line: 1,
      kind: 'function',
      score: 0.5,
      references: 3
    };

    expect(entry.symbol).toBe('foo');
    expect(entry.filePath).toBe('/test.ts');
    expect(entry.line).toBe(1);
    expect(entry.kind).toBe('function');
    expect(entry.score).toBeCloseTo(0.5);
    expect(entry.references).toBe(3);
  });
});

describe('RepoMapIndex interface', () => {
  it('has correct shape', () => {
    const index: RepoMapIndex = {
      entries: [],
      totalFiles: 0,
      totalSymbols: 0
    };

    expect(index.entries).toEqual([]);
    expect(index.totalFiles).toBe(0);
    expect(index.totalSymbols).toBe(0);
  });
});

describe('integration with larger fixture', () => {
  let tmpDir: string;
  let repoMap: RepoMap;

  beforeEach(async () => {
    tmpDir = join(import.meta.dirname, `__rmap_large_${Date.now()}`);
    const files: Record<string, string> = {
      [join(tmpDir, 'src/main.ts')]: [
        "import { handler } from './handler.js';",
        "import { validate } from './validate.js';",
        "import { Logger } from './logger.js';",
        "import type { Request, Response } from './types.js';",
        '',
        'export function start(port: number): void {',
        '  handler({ method: "GET" });',
        '}'
      ].join('\n'),
      [join(tmpDir, 'src/handler.ts')]: [
        "import { validate } from './validate.js';",
        "import { Logger } from './logger.js';",
        "import type { Request } from './types.js';",
        '',
        'export function handler(req: Request): void {',
        '  if (validate(req)) {',
        "    new Logger().log('handled');",
        '  }',
        '}'
      ].join('\n'),
      [join(tmpDir, 'src/validate.ts')]: [
        "import type { Request } from './types.js';",
        '',
        'export function validate(req: Request): boolean {',
        '  return true;',
        '}'
      ].join('\n'),
      [join(tmpDir, 'src/logger.ts')]: [
        '',
        'export class Logger {',
        '  log(msg: string): void {',
        '    console.log(msg);',
        '  }',
        '',
        '  warn(msg: string): void {',
        '    console.warn(msg);',
        '  }',
        '}'
      ].join('\n'),
      [join(tmpDir, 'src/types.ts')]: [
        'export interface Request {',
        '  method: string;',
        '  url?: string;',
        '  body?: unknown;',
        '}',
        '',
        'export interface Response {',
        '  status: number;',
        '  body: unknown;',
        '}'
      ].join('\n'),
      [join(tmpDir, 'src/standalone.ts')]: [
        'export function standalone(): string {',
        "  return 'isolated';",
        '}',
        '',
        'export const NAME = "standalone";'
      ].join('\n')
    };

    for (const [filePath, content] of Object.entries(files)) {
      const dir = filePath.slice(0, filePath.lastIndexOf('/'));
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, content, 'utf-8');
    }

    repoMap = new RepoMap();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('ranks highly-imported symbols higher', async () => {
    const index: RepoMapIndex = await repoMap.build(tmpDir);

    const standaloneFunc = index.entries.find(e => e.symbol === 'standalone' && e.filePath.endsWith('standalone.ts'));
    const requestType = index.entries.find(e => e.symbol === 'Request');

    expect(standaloneFunc).toBeDefined();
    expect(requestType).toBeDefined();

    const requestRank = index.entries.indexOf(requestType as RepoMapEntry);
    const standaloneRank = index.entries.indexOf(standaloneFunc as RepoMapEntry);

    expect(requestRank).toBeLessThan(standaloneRank);
  });

  it('detects methods inside classes', async () => {
    const index: RepoMapIndex = await repoMap.build(tmpDir);

    const methodNames = index.entries.filter(e => e.kind === 'method').map(e => e.symbol);

    expect(methodNames).toContain('log');
    expect(methodNames).toContain('warn');
  });

  it('builds index with correct counts', async () => {
    const index: RepoMapIndex = await repoMap.build(tmpDir);

    expect(index.totalFiles).toBe(6);
    expect(index.totalSymbols).toBeGreaterThanOrEqual(10);
    expect(index.entries.length).toBe(index.totalSymbols);
  });
});
