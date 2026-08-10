/**
 * Install Flow — downloads, configures, and persists Agentsy components.
 *
 * Dispatches on componentType to the correct registry adapter:
 * - mcp-server → MCP Registry adapter + SubprocessManager
 * - skill      → Skills.sh adapter + AgentSkills spec normalization
 * - guardrail  → Guardrails Hub adapter + TypeScript port + pipeline
 * - connector  → ECC Tools adapter
 *
 * @module
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createEccToolsAdapter } from './adapters/ecc-tools.js';
import { createGuardrailsHubAdapter, getValidatorDetails } from './adapters/guardrails-hub.js';
import { createMcpRegistryAdapter } from './adapters/mcp-registry.js';
import { createSkillsShAdapter } from './adapters/skills-sh.js';
import type { InstalledComponents, RecommendationEntry } from './config.js';
import { readConfig, writeConfig } from './config.js';

// ── Externally-injected interfaces ─────────────────────
// These are injected rather than imported to keep this package
// independently consumable (Phase 29 composability rule).

export interface SubprocessManager {
  start(modulePath: string, args?: string[]): Promise<{ pid: number }>;
}

export interface GuardrailPipeline {
  register(id: string, config?: Record<string, unknown>): Promise<void>;
}

// ── Types ───────────────────────────────────────────────

export interface InstallResult {
  readonly componentId: string;
  readonly componentType: RecommendationEntry['componentType'];
  readonly error?: string;
  readonly success: boolean;
}

export interface InstallOptions {
  readonly guardrailPipeline?: GuardrailPipeline;
  readonly rootPath: string;
  readonly subprocessManager?: SubprocessManager;
}

// ── Component type → config field mapping ───────────────

const COMPONENT_FIELD_MAP: Record<RecommendationEntry['componentType'], keyof InstalledComponents> = {
  'mcp-server': 'mcpServers',
  skill: 'skills',
  guardrail: 'guardrails',
  connector: 'connectors'
};

// ── Main install dispatcher ─────────────────────────────

/**
 * Install a single component from a recommendation.
 * Dispatches on `rec.componentType` to the correct install path.
 */
export async function installComponent(rec: RecommendationEntry, options: InstallOptions): Promise<InstallResult> {
  try {
    switch (rec.componentType) {
      case 'mcp-server': {
        return await installMcpServer(rec, options);
      }
      case 'skill': {
        return await installSkill(rec, options);
      }
      case 'guardrail': {
        return await installGuardrail(rec, options);
      }
      case 'connector': {
        return await installConnector(rec, options);
      }
      default:
        throw new Error(`Unknown component type: ${String(rec.componentType)}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      componentId: rec.componentId,
      componentType: rec.componentType,
      success: false,
      error: message
    };
  }
}

// ── CLI entry points ────────────────────────────────────

/**
 * `agentsy install <type> <id>` — install a specific component.
 */
export async function installById(
  rootPath: string,
  componentType: RecommendationEntry['componentType'],
  componentId: string,
  options?: { subprocessManager?: SubprocessManager; guardrailPipeline?: GuardrailPipeline }
): Promise<InstallResult> {
  const rec: RecommendationEntry = {
    componentType,
    componentId,
    confidence: 1,
    installCommand: `agentsy install ${componentType} ${componentId}`,
    reason: 'User-initiated install'
  };
  return await installComponent(rec, { ...options, rootPath });
}

/**
 * `agentsy install --recommended` — install all recommendations with
 * confidence >= threshold (default 0.8).
 */
export async function installRecommended(
  rootPath: string,
  threshold?: number,
  options?: { subprocessManager?: SubprocessManager; guardrailPipeline?: GuardrailPipeline }
): Promise<InstallResult[]> {
  const minConfidence = threshold ?? 0.8;
  const config = await readConfig(rootPath);
  if (config === null) {
    throw new Error('No .agentsy/config.yml found. Run `agentsy project scan` first.');
  }

  const toInstall = config.recommendations.filter((r: RecommendationEntry) => r.confidence >= minConfidence);

  return await Promise.all(
    toInstall.map((rec: RecommendationEntry) => installComponent(rec, { ...options, rootPath }))
  );
}

// ── Config persistence ──────────────────────────────────

/**
 * Append a component id to the appropriate installed list and write config.
 */
async function addToInstalled(rootPath: string, rec: RecommendationEntry): Promise<void> {
  const config = await readConfig(rootPath);
  if (config === null) {
    return;
  }

  const field = COMPONENT_FIELD_MAP[rec.componentType];
  const current = config.installed[field];

  if (!current.includes(rec.componentId)) {
    config.installed = {
      ...config.installed,
      [field]: [...current, rec.componentId]
    };
    await writeConfig(rootPath, config);
  }
}

// ── mcp-server install ──────────────────────────────────

async function installMcpServer(rec: RecommendationEntry, options: InstallOptions): Promise<InstallResult> {
  const adapter = createMcpRegistryAdapter();
  const entry = await adapter.get(rec.componentId);

  if (entry === null) {
    return {
      componentId: rec.componentId,
      componentType: rec.componentType,
      success: false,
      error: `MCP server '${rec.componentId}' not found in registry`
    };
  }

  // Use SubprocessManager to start the MCP server process
  if (options.subprocessManager !== undefined) {
    await options.subprocessManager.start(rec.componentId);
  }

  await addToInstalled(options.rootPath, rec);

  return {
    componentId: rec.componentId,
    componentType: rec.componentType,
    success: true
  };
}

// ── skill install ───────────────────────────────────────

async function installSkill(rec: RecommendationEntry, options: InstallOptions): Promise<InstallResult> {
  const adapter = createSkillsShAdapter();
  const entry = await adapter.get(rec.componentId);

  if (entry === null) {
    return {
      componentId: rec.componentId,
      componentType: rec.componentType,
      success: false,
      error: `Skill '${rec.componentId}' not found in Skills.sh registry`
    };
  }

  // Download and normalize to AgentSkills spec
  const skillsDir = join(options.rootPath, '.agentsy', 'skills', entry.name);
  await mkdir(skillsDir, { recursive: true });

  // Write SKILL.md with AgentSkills-compliant frontmatter
  const frontmatterLines: string[] = ['---', `name: ${entry.name}`, `description: ${entry.description}`];
  if (entry.version !== undefined) {
    frontmatterLines.push(`version: ${entry.version}`);
  }
  frontmatterLines.push('---', '', `# ${entry.name}`, '', entry.description, '');

  await writeFile(join(skillsDir, 'SKILL.md'), frontmatterLines.join('\n'), 'utf-8');

  await addToInstalled(options.rootPath, rec);

  return {
    componentId: rec.componentId,
    componentType: rec.componentType,
    success: true
  };
}

// ── guardrail install ───────────────────────────────────

async function installGuardrail(rec: RecommendationEntry, options: InstallOptions): Promise<InstallResult> {
  const adapter = createGuardrailsHubAdapter();
  const entry = await adapter.get(rec.componentId);

  if (entry === null) {
    return {
      componentId: rec.componentId,
      componentType: rec.componentType,
      success: false,
      error: `Guardrail '${rec.componentId}' not found in Guardrails Hub catalog`
    };
  }

  // Check port status — non-ported validators need TypeScript porting
  const validator = getValidatorDetails(rec.componentId);
  if (validator !== null && validator.portStatus !== 'ported' && options.guardrailPipeline === undefined) {
    // Porting stub: in practice this would generate TypeScript source
    // from the Python @register_validator decorator
    return {
      componentId: rec.componentId,
      componentType: rec.componentType,
      success: false,
      error: `Guardrail '${rec.componentId}' has portStatus '${validator.portStatus}' and requires GuardrailPipeline to port and register`
    };
  }

  // Register with GuardrailPipeline
  if (options.guardrailPipeline !== undefined) {
    await options.guardrailPipeline.register(rec.componentId);
  }

  await addToInstalled(options.rootPath, rec);

  return {
    componentId: rec.componentId,
    componentType: rec.componentType,
    success: true
  };
}

// ── connector install ───────────────────────────────────

async function installConnector(rec: RecommendationEntry, options: InstallOptions): Promise<InstallResult> {
  const adapter = createEccToolsAdapter();
  const entry = await adapter.get(rec.componentId);

  if (entry === null) {
    return {
      componentId: rec.componentId,
      componentType: rec.componentType,
      success: false,
      error: `Connector '${rec.componentId}' not found in ECC Tools registry`
    };
  }

  await addToInstalled(options.rootPath, rec);

  return {
    componentId: rec.componentId,
    componentType: rec.componentType,
    success: true
  };
}
