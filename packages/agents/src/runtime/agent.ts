import type { AgentSpec, LoadedAgent } from '../specs/types.js';
import { createLoadedAgent } from '../loader/agent-loader.js';

/**
 * Initialize an agent from a specification for runtime execution
 */
export function initializeAgent(spec: AgentSpec): LoadedAgent {
  return createLoadedAgent(spec);
}
