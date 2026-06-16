import { parse as yamlParse } from 'yaml';
import { AgentSpecSchema } from '../specs/schema.js';
import type { AgentSpec, LoadedAgent, TokenBudget } from '../specs/types.js';

export * from './types.js';

/**
 * Load and parse an agent specification from YAML content
 */
export async function parseAgentSpec(yamlContent: string): Promise<AgentSpec> {
  const parsed = yamlParse(yamlContent) as unknown;
  const validated = AgentSpecSchema.parse(parsed) as AgentSpec;
  return validated;
}

/**
 * Create a LoadedAgent from an AgentSpec
 * Note: Hooks resolution and budget initialization will be done in Phase 3 and Phase 5
 */
export function createLoadedAgent(spec: AgentSpec): LoadedAgent {
  const hooks = new Map<string, Array<(context: unknown) => Promise<void> | void>>();

  if (spec.hooks) {
    const hookTypes = Object.keys(spec.hooks) as Array<keyof typeof spec.hooks>;

    for (const hookType of hookTypes) {
      const hookNames = spec.hooks[hookType] ?? [];
      if (hookNames.length > 0) {
        hooks.set(hookType, []);
      }
    }
  }

  const budget: TokenBudget = {
    total: spec.tokenBudget ?? 0,
    used: 0,
    remaining: spec.tokenBudget ?? 0,
    allocations: new Map()
  };

  const skillRegistry = spec.skillRegistry ?? [];

  return {
    budget,
    hooks,
    skillRegistry,
    spec
  };
}

/**
 * Load all agents from a directory
 */
export async function loadAllAgents(directory: string): Promise<Map<string, LoadedAgent>> {
  const agents = new Map<string, LoadedAgent>();
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  try {
    const files = await fs.readdir(directory);
    const yamlFiles = files.filter((f: string) => f.endsWith('.yaml'));

    for (const file of yamlFiles) {
      const filePath = path.join(directory, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const spec = await parseAgentSpec(content);
      const loaded = await createLoadedAgent(spec);
      agents.set(spec.name, loaded);
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return agents;
}

/**
 * Validate an AgentSpec against the schema
 */
export function validateAgentSpec(spec: unknown): spec is AgentSpec {
  return AgentSpecSchema.safeParse(spec).success;
}
