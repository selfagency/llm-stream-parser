/**
 * Agent Spec Loader — loads and validates agent specs from YAML.
 *
 * Supports both formats:
 * - Multi-layer specs (gpt-pilot pattern with layers, hooks, constraints)
 * - Simple specs (ACP-style with tools, scope, modelTier)
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';
import { AgentSpecSchema } from './schema.js';
import type { AgentSpec } from './types.js';

const SPECS_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * List of known default agent spec IDs.
 */
export const DEFAULT_AGENT_IDS = ['coder', 'researcher', 'planner', 'general'] as const;
export type DefaultAgentId = (typeof DEFAULT_AGENT_IDS)[number];

/**
 * Load an agent spec from a YAML file by ID.
 */
export function loadAgentSpec(id: DefaultAgentId): AgentSpec | null {
  const yamlPath = join(SPECS_DIR, `${id}.yaml`);
  if (!existsSync(yamlPath)) {
    return null;
  }

  try {
    const raw = readFileSync(yamlPath, 'utf-8');
    const parsed = yamlLoad(raw) as Record<string, unknown>;
    const result = AgentSpecSchema.safeParse(parsed);
    if (!result.success && process.env.DEBUG) {
      console.error('Zod validation errors for', id, JSON.stringify(result.error.issues, null, 2));
    }
    return result.success ? (result.data as AgentSpec) : null;
  } catch (err) {
    if (process.env.DEBUG) {
      console.error('Loader error for', id, String(err));
    }
    return null;
  }
}

/**
 * Load all default agent specs.
 */
export function loadAllDefaultSpecs(): AgentSpec[] {
  const specs: AgentSpec[] = [];
  for (const id of DEFAULT_AGENT_IDS) {
    const spec = loadAgentSpec(id);
    if (spec) {
      specs.push(spec);
    }
  }
  return specs;
}
