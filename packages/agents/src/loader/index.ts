import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { LoadedAgent } from '../specs/types.js';
import { createLoadedAgent, parseAgentSpec } from './agent-loader.js';
import type { LoadAgentError, LoadAgentOptions, LoadAgentResult } from './types.js';

export { createLoadedAgent, parseAgentSpec } from './agent-loader.js';

/**
 * Load an agent specification from a file path
 */
export async function loadAgent(options: LoadAgentOptions): Promise<LoadAgentResult> {
  const errors: LoadAgentError[] = [];

  try {
    const filePath = resolve(options.filePath);
    const yamlContent = await readFile(filePath, 'utf-8');

    const spec = await parseAgentSpec(yamlContent);
    const agent = await createLoadedAgent(spec);

    return { agent, errors };
  } catch (error) {
    const agentError: LoadAgentError = {
      message: error instanceof Error ? error.message : 'Unknown error loading agent',
      filePath: options.filePath,
      cause: error
    };
    errors.push(agentError);

    return { agent: null, errors };
  }
}

/**
 * Load multiple agents from file paths
 */
export async function loadAgents(
  filePaths: string[],
  options?: { parallel?: boolean }
): Promise<Map<string, LoadedAgent>> {
  const agents = new Map<string, LoadedAgent>();

  if (options?.parallel) {
    await Promise.all(
      filePaths.map(async filePath => {
        const { agent } = await loadAgent({ filePath });
        if (agent) {
          agents.set(agent.spec.name, agent);
        }
      })
    );
  } else {
    for (const filePath of filePaths) {
      const { agent } = await loadAgent({ filePath });
      if (agent) {
        agents.set(agent.spec.name, agent);
      }
    }
  }

  return agents;
}
