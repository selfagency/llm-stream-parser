/**
 * Project Configuration — .agentsy/config.yml schema and I/O.
 *
 * @module
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import YAML from 'yaml';
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
  const ymlPath = await configPath(rootPath);
  await mkdir(dirname(ymlPath), { recursive: true });
  await writeFile(ymlPath, YAML.stringify(config), 'utf-8');
}

export async function readConfig(rootPath: string): Promise<AgentsyConfig | null> {
  try {
    const ymlPath = await configPath(rootPath);
    const content = await readFile(ymlPath, 'utf-8');
    const parsed = YAML.parse(content);
    return isAgentsyConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ── Runtime shape guard (kept lightweight; no Zod dependency) ──────────────

function _isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isAgentsyConfig(value: unknown): value is AgentsyConfig {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.schemaVersion === 'number' &&
    typeof obj.project === 'object' &&
    obj.project !== null &&
    typeof (obj.project as Record<string, unknown>).rootPath === 'string' &&
    typeof (obj.project as Record<string, unknown>).profile === 'object' &&
    (obj.project as Record<string, unknown>).profile !== null &&
    Array.isArray(((obj.project as Record<string, unknown>).profile as Record<string, unknown>).languages) &&
    typeof obj.installed === 'object' &&
    obj.installed !== null &&
    Array.isArray((obj.installed as Record<string, unknown>).connectors) &&
    typeof obj.artifacts === 'object' &&
    obj.artifacts !== null &&
    typeof (obj.artifacts as Record<string, unknown>).agentsMd === 'boolean' &&
    Array.isArray(obj.recommendations)
  );
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
