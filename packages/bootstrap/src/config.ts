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

function configToYaml(config: AgentsyConfig): string {
  const lines: string[] = ['schemaVersion: 1', 'project:'];
  lines.push(`  rootPath: ${config.project.rootPath}`);
  lines.push('  profile:');
  if (config.project.profile.languages.length > 0) {
    lines.push('    languages:');
    for (const lang of config.project.profile.languages) {
      lines.push(`      - ${lang}`);
    }
  }
  if (config.project.profile.frameworks.length > 0) {
    lines.push('    frameworks:');
    for (const fw of config.project.profile.frameworks) {
      lines.push(`      - ${fw}`);
    }
  }
  lines.push(`    packageManager: ${config.project.profile.packageManager}`);
  lines.push(`    buildSystem: ${config.project.profile.buildSystem}`);
  lines.push(`    monorepo: ${config.project.profile.monorepo}`);
  lines.push(`  detectedAt: ${config.project.detectedAt}`);
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

function parseYaml(_content: string): AgentsyConfig | null {
  // For now, return null to indicate YAML parsing needs a proper library.
  // This base implementation creates configs via createDefaultConfig().
  return null;
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
