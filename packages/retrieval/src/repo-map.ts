import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

// ── Public Types ──────────────────────────────────────────────────────────────

export type SymbolKind = 'function' | 'class' | 'method' | 'type' | 'variable';

export interface RepoMapEntry {
  readonly filePath: string;
  readonly kind: SymbolKind;
  readonly line: number;
  readonly references: number;
  readonly score: number;
  readonly symbol: string;
}

export interface RepoMapIndex {
  readonly entries: readonly RepoMapEntry[];
  readonly totalFiles: number;
  readonly totalSymbols: number;
}

export interface RepoMapOptions {
  readonly convergenceThreshold?: number;
  readonly dampingFactor?: number;
  readonly exclude?: readonly string[];
  readonly include?: readonly string[];
  readonly maxIterations?: number;
}

// ── Internal Types & Defaults ─────────────────────────────────────────────────

interface ExtractedSymbol {
  readonly filePath: string;
  readonly kind: SymbolKind;
  readonly line: number;
  readonly name: string;
}

interface FileImports {
  readonly from: readonly string[];
}

interface GraphNode {
  readonly outbound: readonly number[];
  readonly symbol: ExtractedSymbol;
}

interface BuiltGraph {
  readonly edges: number[][];
  readonly nodes: GraphNode[];
}

const DEFAULT_OPTIONS: Required<RepoMapOptions> = {
  convergenceThreshold: 0.0001,
  dampingFactor: 0.85,
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/__test_fixtures__/**',
    '**/__tests__/**',
    '**/__mocks__/**',
    '**/coverage/**',
    '**/.git/**'
  ],
  include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mts', '**/*.mjs'],
  maxIterations: 100
};

// ── Symbol Extraction Patterns ────────────────────────────────────────────────

interface SymbolPattern {
  readonly kind: SymbolKind;
  readonly regex: RegExp;
}

const SYMBOL_PATTERNS: readonly SymbolPattern[] = [
  { kind: 'function', regex: /^\s*export\s+default\s+(?:async\s+)?function\s+(\w+)/ },
  { kind: 'class', regex: /^\s*export\s+default\s+class\s+(\w+)/ },
  { kind: 'function', regex: /^\s*export\s+(?:async\s+)?function\s+(\w+)/ },
  { kind: 'class', regex: /^\s*export\s+class\s+(\w+)/ },
  { kind: 'type', regex: /^\s*export\s+interface\s+(\w+)/ },
  { kind: 'type', regex: /^\s*export\s+type\s+(\w+)/ },
  { kind: 'variable', regex: /^\s*export\s+(?:const|let|var)\s+(\w+)/ },
  { kind: 'function', regex: /^\s*(?:async\s+)?function\s+(\w+)/ },
  { kind: 'class', regex: /^\s*class\s+(\w+)/ },
  { kind: 'type', regex: /^\s*interface\s+(\w+)/ },
  { kind: 'type', regex: /^\s*type\s+(\w+)/ },
  { kind: 'method', regex: /^\s{2,}(?:async\s+)?(\w+)\s*\(/ },
  { kind: 'function', regex: /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/ },
  { kind: 'function', regex: /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function/ }
];

const METHOD_KEYWORD_BLOCKLIST = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'throw',
  'delete',
  'typeof',
  'import',
  'export'
]);

const IMPORT_RE = /import\s+(?:\{[^}]*\}|[^;{]+?)\s+from\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const IMPORT_TYPE_RE = /import\s+type\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/g;
const IMPORT_NAMESPACE_RE = /import\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]/g;
const IMPORT_DEFAULT_RE = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isMethodKeyword(name: string): boolean {
  return METHOD_KEYWORD_BLOCKLIST.has(name);
}

/**
 * Extract exported/declared symbols from source code using regex patterns.
 */
interface PatternMatch {
  kind: SymbolKind;
  name: string;
}

function matchPatterns(line: string): PatternMatch | undefined {
  for (const pattern of SYMBOL_PATTERNS) {
    const match = line.match(pattern.regex);
    if (match) {
      const name = match[1];
      if (name === undefined) {
        continue;
      }
      if (pattern.kind === 'method' && isMethodKeyword(name)) {
        continue;
      }
      return { kind: pattern.kind, name };
    }
  }
}

function extractSymbols(content: string, filePath: string): readonly ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];
  const lines = content.split('\n');
  const seenInFile = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }

    const result = matchPatterns(line);
    if (result === undefined) {
      continue;
    }

    const key = `${result.name}:${result.kind}`;
    if (!seenInFile.has(key)) {
      symbols.push({ filePath, kind: result.kind, line: i + 1, name: result.name });
      seenInFile.add(key);
    }
  }

  return symbols;
}

/**
 * Extract import/require paths from source code.
 */
function extractImports(content: string): FileImports {
  const paths = new Set<string>();

  function collectFrom(re: RegExp): void {
    let match: RegExpExecArray | null;
    re.lastIndex = 0;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
    while ((match = re.exec(content)) !== null) {
      const path = match[1] ?? match[2];
      if (path) {
        paths.add(path);
      }
    }
  }

  collectFrom(IMPORT_RE);
  collectFrom(REQUIRE_RE);
  collectFrom(IMPORT_TYPE_RE);
  collectFrom(IMPORT_NAMESPACE_RE);
  collectFrom(IMPORT_DEFAULT_RE);

  return { from: [...paths] };
}

function isRelativeImport(importPath: string): boolean {
  return importPath.startsWith('.');
}

/**
 * Resolve a relative import path to the resolved absolute path.
 */
function resolveImportPath(currentFile: string, importPath: string, rootPath: string): string | null {
  if (!isRelativeImport(importPath)) {
    return null;
  }

  const dir = join(currentFile, '..');
  const resolvedBase = resolve(rootPath, join(dir, importPath));

  if (extname(resolvedBase) !== '') {
    return resolve(rootPath, resolvedBase);
  }

  return resolvedBase;
}

/**
 * Count inbound edges from distinct sources for a node.
 */
function countInboundEdges(edges: readonly (readonly number[])[], index: number): number {
  let count = 0;
  for (const inbound of edges) {
    if (inbound.includes(index)) {
      count++;
    }
  }
  return count;
}

/**
 * Match a resolved import path to a known file, accounting for extension
 * differences.
 */
function matchKnownFile(knownFiles: Set<string>, resolvedPath: string): string | null {
  if (knownFiles.has(resolvedPath)) {
    return resolvedPath;
  }

  const resolvedBase = resolvedPath.replace(/\.[^.]+$/, '');
  for (const knownFile of knownFiles) {
    const knownBase = knownFile.replace(/\.[^.]+$/, '');
    if (knownBase === resolvedBase) {
      return knownFile;
    }
  }

  const resolvedIndex = join(resolvedBase, 'index');
  for (const knownFile of knownFiles) {
    const knownBase = knownFile.replace(/\.[^.]+$/, '');
    if (knownBase === resolvedIndex) {
      return knownFile;
    }
  }

  return null;
}

/**
 * Convert a glob suffix pattern to a regex string for filename matching.
 * nosemgrep: nameGlob comes from include/exclude config arrays, not user input.
 */
function globPatternToRegex(nameGlob: string): RegExp {
  const escaped = nameGlob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matchInsideDirectory(relativePath: string, middle: string): boolean {
  return relativePath === middle || relativePath.startsWith(`${middle}/`) || relativePath.includes(`/${middle}/`);
}

function matchFilenameGlob(relativePath: string, nameGlob: string): boolean {
  const filename = relativePath.split('/').pop() ?? relativePath;
  return globPatternToRegex(nameGlob).test(filename);
}

function matchPathSuffix(relativePath: string, suffix: string): boolean {
  return relativePath === suffix || relativePath.endsWith(`/${suffix}`);
}

function matchPrefixWildcard(relativePath: string, prefix: string): boolean {
  const suffixPart = relativePath.slice(prefix.length + 1);
  return relativePath.startsWith(`${prefix}/`) && !suffixPart.includes('/');
}

function matchesStarStarPattern(relativePath: string, pattern: string): boolean {
  if (pattern.endsWith('/**')) {
    return matchInsideDirectory(relativePath, pattern.slice(3, -3));
  }
  if (pattern.includes('*', 3)) {
    return matchFilenameGlob(relativePath, pattern.slice(3));
  }
  return matchPathSuffix(relativePath, pattern.slice(3));
}

function matchesExcludePattern(relativePath: string, pattern: string): boolean {
  if (pattern.startsWith('**/')) {
    return matchesStarStarPattern(relativePath, pattern);
  }
  if (pattern.endsWith('/**')) {
    return matchPathSuffix(relativePath, pattern.slice(0, -3));
  }
  if (pattern.endsWith('/*')) {
    return matchPrefixWildcard(relativePath, pattern.slice(0, -2));
  }
  if (pattern.includes('*')) {
    return globPatternToRegex(pattern).test(relativePath);
  }
  return relativePath === pattern;
}

// ── RepoMap ───────────────────────────────────────────────────────────────────

export class RepoMap {
  readonly #options: Required<RepoMapOptions>;

  constructor(options?: RepoMapOptions) {
    this.#options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Walk source files, extract symbols, build reference graph, run PageRank.
   */
  async build(rootPath: string): Promise<RepoMapIndex> {
    const files = await this.#walkFiles(rootPath);

    const fileSymbols = new Map<string, readonly ExtractedSymbol[]>();
    const fileImports = new Map<string, FileImports>();

    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      fileSymbols.set(file, extractSymbols(content, file));
      fileImports.set(file, extractImports(content));
    }

    const { nodes, edges } = this.#buildGraph(fileSymbols, fileImports, rootPath);
    const scores = this.#pageRank(nodes, edges);

    const entries: RepoMapEntry[] = nodes.map((node, index) => ({
      filePath: node.symbol.filePath,
      kind: node.symbol.kind,
      line: node.symbol.line,
      references: countInboundEdges(edges, index),
      score: scores[index] ?? 0,
      symbol: node.symbol.name
    }));

    entries.sort((a, b) => b.score - a.score);

    return {
      entries,
      totalFiles: files.length,
      totalSymbols: nodes.length
    };
  }

  /**
   * Return top-N ranked symbols, biased toward open files.
   */
  async getMap(scope: string, openFiles: readonly string[], limit: number): Promise<RepoMapEntry[]> {
    const index = await this.build(scope);
    const resolvedScope = resolve(scope);
    const resolvedOpenFiles = new Set(openFiles.map(f => resolve(f)));

    const filtered = index.entries.filter(entry => resolve(entry.filePath).startsWith(resolvedScope));

    const boosted = filtered.map(entry => {
      if (resolvedOpenFiles.has(resolve(entry.filePath))) {
        return { ...entry, score: entry.score * 1.5 };
      }
      return entry;
    });

    boosted.sort((a, b) => b.score - a.score);
    return boosted.slice(0, limit);
  }

  async #walkFiles(dir: string): Promise<readonly string[]> {
    const results: string[] = [];
    const normalizedRoot = resolve(dir);

    const walk = async (currentDir: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        const relPath = relative(normalizedRoot, fullPath);

        if (this.#isExcluded(relPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && this.#isIncluded(entry.name)) {
          results.push(fullPath);
        }
      }
    };

    await walk(normalizedRoot);
    return results;
  }

  #isExcluded(relativePath: string): boolean {
    return this.#options.exclude.some(pattern => matchesExcludePattern(relativePath, pattern));
  }

  #isIncluded(filename: string): boolean {
    return this.#options.include.some(pattern => {
      if (pattern.startsWith('**/*')) {
        return filename.endsWith(pattern.slice(4));
      }
      if (pattern.startsWith('**/')) {
        return filename.endsWith(pattern.slice(3));
      }
      return filename === pattern;
    });
  }

  #buildGraph(
    fileSymbols: Map<string, readonly ExtractedSymbol[]>,
    fileImports: Map<string, FileImports>,
    rootPath: string
  ): BuiltGraph {
    const knownFiles = new Set(fileSymbols.keys());
    const { nodes, symbolKeyToIndex } = this.#buildSymbolNodes(fileSymbols);
    const outboundLists = this.#buildOutboundEdges(fileSymbols, fileImports, knownFiles, symbolKeyToIndex, rootPath);

    const edges = this.#buildReverseEdges(outboundLists, nodes.length);
    const graphNodes = this.#deduplicateOutboundEdges(outboundLists, nodes);

    return { edges, nodes: graphNodes };
  }

  #buildSymbolNodes(fileSymbols: Map<string, readonly ExtractedSymbol[]>): {
    nodes: GraphNode[];
    symbolKeyToIndex: Map<string, number>;
  } {
    const symbolKeyToIndex = new Map<string, number>();
    const nodes: GraphNode[] = [];

    for (const [_filePath, symbols] of fileSymbols) {
      for (const symbol of symbols) {
        const key = `${symbol.filePath}::${symbol.name}`;
        if (!symbolKeyToIndex.has(key)) {
          symbolKeyToIndex.set(key, nodes.length);
          nodes.push({ outbound: [], symbol });
        }
      }
    }

    return { nodes, symbolKeyToIndex };
  }

  #buildOutboundEdges(
    fileSymbols: Map<string, readonly ExtractedSymbol[]>,
    fileImports: Map<string, FileImports>,
    knownFiles: Set<string>,
    symbolKeyToIndex: Map<string, number>,
    rootPath: string
  ): number[][] {
    const nodeCount = symbolKeyToIndex.size;
    const outboundLists: number[][] = Array.from({ length: nodeCount }, () => []);

    for (const [filePath, imports] of fileImports) {
      const localKeys = this.#getLocalNodeIndices(fileSymbols, filePath, symbolKeyToIndex);
      if (localKeys.length === 0) {
        continue;
      }

      for (const importPath of imports.from) {
        const matchedPath = this.#resolveToKnownFile(filePath, importPath, rootPath, knownFiles);
        if (matchedPath === null) {
          continue;
        }

        const importedSymbols = fileSymbols.get(matchedPath);
        if (importedSymbols === undefined) {
          continue;
        }

        this.#connectSymbols(matchedPath, importedSymbols, localKeys, outboundLists, symbolKeyToIndex);
      }
    }

    return outboundLists;
  }

  #connectSymbols(
    matchedPath: string,
    importedSymbols: readonly ExtractedSymbol[],
    localKeys: number[],
    outboundLists: number[][],
    symbolKeyToIndex: Map<string, number>
  ): void {
    for (const localIdx of localKeys) {
      for (const imported of importedSymbols) {
        const importedKey = `${matchedPath}::${imported.name}`;
        const importedIdx = symbolKeyToIndex.get(importedKey);
        if (importedIdx !== undefined) {
          const list = outboundLists[localIdx];
          if (list !== undefined) {
            list.push(importedIdx);
          }
        }
      }
    }
  }

  #getLocalNodeIndices(
    fileSymbols: Map<string, readonly ExtractedSymbol[]>,
    filePath: string,
    symbolKeyToIndex: Map<string, number>
  ): number[] {
    const indices: number[] = [];
    const symbols = fileSymbols.get(filePath);
    if (symbols === undefined) {
      return indices;
    }

    for (const sym of symbols) {
      const key = `${filePath}::${sym.name}`;
      const idx = symbolKeyToIndex.get(key);
      if (idx !== undefined) {
        indices.push(idx);
      }
    }

    return indices;
  }

  #buildReverseEdges(outboundLists: number[][], nodeCount: number): number[][] {
    const edges: number[][] = Array.from({ length: nodeCount }, () => []);

    for (let i = 0; i < outboundLists.length; i++) {
      const outbound = outboundLists[i];
      if (outbound === undefined) {
        continue;
      }
      const deduplicated = [...new Set(outbound)];

      for (const target of deduplicated) {
        const targetEdges = edges[target];
        if (targetEdges !== undefined) {
          targetEdges.push(i);
        }
      }
    }

    return edges;
  }

  #deduplicateOutboundEdges(outboundLists: number[][], nodes: readonly { symbol: ExtractedSymbol }[]): GraphNode[] {
    return nodes.map((node, i) => {
      const outbound = outboundLists[i];
      return {
        outbound: outbound ? [...new Set(outbound)] : [],
        symbol: node.symbol
      };
    });
  }

  #resolveToKnownFile(
    currentFile: string,
    importPath: string,
    rootPath: string,
    knownFiles: Set<string>
  ): string | null {
    const resolvedPath = resolveImportPath(currentFile, importPath, rootPath);
    if (resolvedPath === null) {
      return null;
    }
    return matchKnownFile(knownFiles, resolve(resolvedPath));
  }

  #computePageRankIteration(
    nodes: readonly GraphNode[],
    edges: readonly (readonly number[])[],
    ranks: number[],
    d: number,
    teleport: number
  ): number[] {
    const n = nodes.length;
    const nextRanks = new Array<number>(n).fill(teleport);

    for (let i = 0; i < n; i++) {
      const inboundList = edges[i];
      if (inboundList === undefined) {
        continue;
      }

      for (const sourceIdx of inboundList) {
        const sourceNode = nodes[sourceIdx];
        if (sourceNode === undefined) {
          continue;
        }

        const outDegree = sourceNode.outbound.length;
        if (outDegree > 0) {
          const rank = ranks[sourceIdx];
          if (rank !== undefined) {
            nextRanks[i] = (nextRanks[i] ?? teleport) + d * (rank / outDegree);
          }
        }
      }
    }

    return nextRanks;
  }

  #computeConvergence(a: number[], b: number[], threshold: number): boolean {
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      const aVal = a[i];
      const bVal = b[i];
      if (aVal !== undefined && bVal !== undefined) {
        diff += Math.abs(aVal - bVal);
      }
    }
    return diff < threshold;
  }

  #pageRank(nodes: readonly GraphNode[], edges: readonly (readonly number[])[]): number[] {
    const n = nodes.length;
    if (n === 0) {
      return [];
    }

    const d = this.#options.dampingFactor;
    const maxIter = this.#options.maxIterations;
    const threshold = this.#options.convergenceThreshold;

    const initialRank = 1 / n;
    let ranks = new Array<number>(n).fill(initialRank);
    const teleport = (1 - d) / n;

    for (let iter = 0; iter < maxIter; iter++) {
      const nextRanks = this.#computePageRankIteration(nodes, edges, ranks, d, teleport);
      if (this.#computeConvergence(nextRanks, ranks, threshold)) {
        return nextRanks;
      }
      ranks = nextRanks;
    }

    return ranks;
  }
}
