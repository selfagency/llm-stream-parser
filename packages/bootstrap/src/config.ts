/**
 * Project Configuration — .agentsy/config.yml schema and I/O.
 *
 * @module
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ProjectProfile } from './scanner.js';

// ── Types ───────────────────────────────────────────────

export interface InstalledComponents {
  connectors: string[];
  guardrails: string[];
  hooks: string[];
  mcpServers: string[];
  skills: string[];
}

export interface RecommendationEntry {
  componentId: string;
  componentType: 'connector' | 'mcp-server' | 'skill' | 'guardrail';
  confidence: number;
  installCommand: string;
  reason: string;
}

export interface AgentsyConfig {
  artifacts: {
    agentsMd: boolean;
    aft: boolean;
    magicContext: boolean;
  };
  installed: InstalledComponents;
  project: {
    rootPath: string;
    profile: ProjectProfile;
    detectedAt: string;
  };
  recommendations: RecommendationEntry[];
  schemaVersion: number;
}

// ── I/O ─────────────────────────────────────────────────

export function configPath(rootPath: string): string {
  return join(rootPath, '.agentsy', 'config.yml');
}

export async function configExists(rootPath: string): Promise<boolean> {
  try {
    await access(await configPath(rootPath));
    return true;
  } catch {
    return false;
  }
}

export function createDefaultConfig(rootPath: string, profile: ProjectProfile): AgentsyConfig {
  return {
    schemaVersion: 1,
    project: {
      rootPath,
      profile,
      detectedAt: new Date().toISOString()
    },
    installed: {
      connectors: [],
      mcpServers: [],
      skills: [],
      guardrails: [],
      hooks: []
    },
    recommendations: [],
    artifacts: {
      agentsMd: false,
      aft: false,
      magicContext: false
    }
  };
}

export async function writeConfig(rootPath: string, config: AgentsyConfig): Promise<void> {
  const yaml = configToYaml(config);
  const ymlPath = await configPath(rootPath);
  await mkdir(dirname(ymlPath), { recursive: true });
  await writeFile(ymlPath, yaml, 'utf-8');
}

export async function readConfig(rootPath: string): Promise<AgentsyConfig | null> {
  try {
    const ymlPath = await configPath(rootPath);
    const content = await readFile(ymlPath, 'utf-8');
    return parseYaml(content);
  } catch {
    return null;
  }
}

// ── Simple YAML serializer (no dependency) ──────────────

function yamlList(lines: string[], key: string, indent: number, items: string[]): void {
  const pad = '  '.repeat(indent);
  if (items.length === 0) {
    lines.push(`${pad}${key}: []`);
    return;
  }
  lines.push(`${pad}${key}:`);
  const itemPad = '  '.repeat(indent + 1);
  items.forEach(item => lines.push(`${itemPad}- ${item}`));
}

function configToYaml(config: AgentsyConfig): string {
  const lines: string[] = ['schemaVersion: 1', 'project:'];
  const p = config.project;
  lines.push(`  rootPath: ${p.rootPath}`);
  lines.push('  profile:');
  const prof = p.profile;
  lines.push(`    rootPath: ${prof.rootPath}`);
  yamlList(lines, 'languages', 2, prof.languages);
  yamlList(lines, 'frameworks', 2, prof.frameworks);
  lines.push(`    packageManager: ${prof.packageManager}`);
  lines.push(`    buildSystem: ${prof.buildSystem}`);
  yamlList(lines, 'linter', 2, prof.linter);
  yamlList(lines, 'testRunner', 2, prof.testRunner);
  lines.push(`    monorepo: ${prof.monorepo}`);
  if (prof.monorepoTool) {
    lines.push(`    monorepoTool: ${prof.monorepoTool}`);
  }
  yamlList(lines, 'ci', 2, prof.ci);
  yamlList(lines, 'deploymentTarget', 2, prof.deploymentTarget);
  lines.push(`    detectedAt: ${prof.detectedAt}`);
  lines.push(`  detectedAt: ${p.detectedAt}`);
  lines.push('installed:');
  lines.push('  connectors: []');
  lines.push('  mcpServers: []');
  lines.push('  skills: []');
  lines.push('  guardrails: []');
  lines.push('  hooks: []');
  lines.push('recommendations: []');
  lines.push('artifacts:');
  lines.push('  agentsMd: false');
  lines.push('  aft: false');
  lines.push('  magicContext: false');
  return `${lines.join('\n')}\n`;
}

/**
 * Minimal YAML parser for the subset of YAML written by configToYaml().
 *
 * Handles:
 *   - `key: value` scalar pairs (strings, booleans, numbers)
 *   - `key:` nested objects with indented children
 *   - `  - value` list items under a key
 *   - `key: []` empty list shorthand
 *
 * Uses a two-pass approach: first builds an intermediate tree, then
 * flattens it, so that `key:` followed by `- items` creates an array
 * rather than an object.
 *
 * Returns null on any parse failure so callers can fall through cleanly.
 */

interface YamlNode {
  /** Child key → child index map (object nodes only) */
  children: Map<string, number>;
  /** Nesting depth (0-based) */
  depth: number;
  /** True when this node is an array element */
  isArrayItem: boolean;
  /** Parent index or -1 for root */
  parent: number;
  /** Raw line text */
  text: string;
  /** Inline scalar value string, or null if container */
  value: string | null;
}

// NOSONAR — custom YAML parser inherently requires line-by-line conditional processing
function parseYaml(content: string): AgentsyConfig | null {
  try {
    const rawLines = content.split('\n');
    const nodes: YamlNode[] = [
      { depth: -1, text: '', children: new Map(), parent: -1, value: null, isArrayItem: false }
    ];
    let currentIdx = 0;

    for (const rawLine of rawLines) {
      const line = rawLine.trimEnd();
      if (line.trim() === '' || line.trim().startsWith('#')) {
        continue;
      }

      const depth = line.search(/\S/);
      const trimmed = line.trim();

      // Walk up to find the correct parent (skip siblings at same depth)
      while (currentIdx > 0) {
        const cur = nodes[currentIdx];
        if (cur === undefined) {
          break;
        }
        if (cur.depth < depth) {
          break;
        }
        currentIdx = cur.parent;
      }

      let value: string | null = null;
      const isListItem = trimmed.startsWith('- ');

      if (isListItem) {
        value = trimmed.slice(2);
        const parent = nodes[currentIdx];
        if (parent !== undefined && parent.value !== null) {
          parent.value = null;
        }
      } else {
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex === -1) {
          continue;
        }

        const rest = trimmed.slice(colonIndex + 1).trim();
        value = rest === '[]' ? '' : rest || null;
      }

      const nodeIdx = nodes.length;
      const node: YamlNode = {
        depth,
        text: trimmed,
        children: new Map(),
        parent: currentIdx,
        value,
        isArrayItem: isListItem
      };
      nodes.push(node);

      const parentNode = nodes[currentIdx];
      if (parentNode !== undefined && !isListItem && !parentNode.isArrayItem) {
        const key = trimmed.slice(0, trimmed.indexOf(':')).trim();
        parentNode.children.set(key, nodeIdx);
      }

      // Push scope for non-list-item lines that open a container
      if (!isListItem) {
        currentIdx = nodeIdx;
      }
    }

    function buildObj(nodeIdx: number): unknown {
      const node = nodes[nodeIdx];
      if (node === undefined) {
        return null;
      }

      if (node.value !== null) {
        return node.value === '' ? ([] as unknown[]) : parseScalar(node.value);
      }

      const childIndices: number[] = [];
      for (let i = nodeIdx + 1; i < nodes.length; i++) {
        const child = nodes[i];
        if (child === undefined || child.parent !== nodeIdx) {
          break;
        }
        if (child.depth <= node.depth) {
          break;
        }
        childIndices.push(i);
      }

      if (childIndices.length > 0 && childIndices.every(i => nodes[i]?.isArrayItem)) {
        return childIndices.map(i => buildObj(i));
      }

      const obj: Record<string, unknown> = {};
      for (const [key, childIdx] of node.children) {
        obj[key] = buildObj(childIdx);
      }
      return obj;
    }

    return buildObj(0) as AgentsyConfig;
  } catch {
    return null;
  }
}

function parseScalar(value: string): string | boolean | number {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  if (/^\d+\.\d+$/.test(value)) {
    return Number.parseFloat(value);
  }
  return value;
}

// ── Agent Tools ─────────────────────────────────────────

export function createProjectTools(config: AgentsyConfig) {
  return {
    'agentsy.project.profile': () => config.project.profile,
    'agentsy.project.recommend': () => config.recommendations,
    'agentsy.project.scan': async (scanner: typeof import('./scanner.js').scanProject) => {
      const profile = await scanner(config.project.rootPath);
      return profile;
    }
  };
}
