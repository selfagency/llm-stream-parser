/**
 * Agent-callable project tools for @agentsy/bootstrap.
 *
 * Three tools for agents to inspect and manage the project:
 * - agentsy.project.scan — re-runs scanner, updates .agentsy/config.yml
 * - agentsy.project.profile — returns current ProjectProfile
 * - agentsy.project.recommend — returns current recommendations
 *
 * Each handler returns a ProjectToolResult so callers never deal with
 * thrown exceptions — all errors are captured in the result.
 *
 * @module
 */

import type { AgentsyConfig, RecommendationEntry } from './config.js';
import { readConfig, writeConfig } from './config.js';
import { recommend } from './recommend.js';
import type { ProjectProfile } from './scanner.js';
import { scanProject } from './scanner.js';

// ── Result type ─────────────────────────────────────────

export interface ProjectToolResult<T = unknown> {
  readonly data?: T;
  readonly error?: string;
  readonly ok: boolean;
}

// ── Input types ─────────────────────────────────────────

export interface ScanInput {
  readonly rootPath: string;
}

export interface ProfileInput {
  readonly rootPath: string;
}

export interface RecommendInput {
  readonly rootPath: string;
}

// ── Result payload types ────────────────────────────────

export interface ScanResult {
  readonly config: AgentsyConfig;
  readonly profile: ProjectProfile;
}

export interface ProfileResult {
  readonly profile: ProjectProfile;
}

// ── Tool handlers ───────────────────────────────────────

/**
 * Re-run the scanner and update .agentsy/config.yml.
 *
 * Scans the project at `rootPath`, generates a fresh ProjectProfile,
 * creates a default config, writes it to disk, and returns both the
 * profile and the full config.
 */
export async function handleProjectScan(input: ScanInput): Promise<ProjectToolResult<ScanResult>> {
  const { rootPath } = input;
  if (!rootPath || typeof rootPath !== 'string') {
    return { ok: false, error: 'rootPath is required' };
  }

  try {
    const profile = await scanProject(rootPath);
    const config = createScanConfig(rootPath, profile);
    await writeConfig(rootPath, config);
    return { ok: true, data: { profile, config } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error during project scan'
    };
  }
}

/**
 * Return the current ProjectProfile from .agentsy/config.yml.
 *
 * Reads the config from disk at `rootPath` and returns the stored profile.
 * Returns an error result if no config exists yet.
 */
export async function handleProjectProfile(input: ProfileInput): Promise<ProjectToolResult<ProfileResult>> {
  const { rootPath } = input;
  if (!rootPath || typeof rootPath !== 'string') {
    return { ok: false, error: 'rootPath is required' };
  }

  try {
    const config = await readConfig(rootPath);
    if (!config) {
      return { ok: false, error: 'No .agentsy/config.yml found. Run agentsy.project.scan first.' };
    }
    return { ok: true, data: { profile: config.project.profile } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error reading project profile'
    };
  }
}

/**
 * Return current recommendations for the project.
 *
 * Reads the config at `rootPath`, then runs the recommendation engine
 * against the stored profile and installed components to generate
 * fresh recommendations.
 */
export async function handleProjectRecommend(
  input: RecommendInput
): Promise<ProjectToolResult<{ recommendations: RecommendationEntry[] }>> {
  const { rootPath } = input;
  if (!rootPath || typeof rootPath !== 'string') {
    return { ok: false, error: 'rootPath is required' };
  }

  try {
    const config = await readConfig(rootPath);
    if (!config) {
      return { ok: false, error: 'No .agentsy/config.yml found. Run agentsy.project.scan first.' };
    }
    const recommendations = recommend(config.project.profile, config.installed);
    return { ok: true, data: { recommendations } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error generating recommendations'
    };
  }
}

// ── Helpers ─────────────────────────────────────────────

function createScanConfig(rootPath: string, profile: ProjectProfile): AgentsyConfig {
  return {
    schemaVersion: 1,
    project: {
      rootPath,
      profile,
      detectedAt: new Date().toISOString()
    },
    installed: {
      connectors: [],
      guardrails: [],
      hooks: [],
      mcpServers: [],
      skills: []
    },
    recommendations: [],
    artifacts: {
      agentsMd: false,
      aft: false,
      magicContext: false
    }
  };
}
