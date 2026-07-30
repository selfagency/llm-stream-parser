/**
 * @agentsy/testing atlas fixtures — Atlas pattern data for integration tests.
 *
 * Lets integration tests build manifests and assert against Atlas IDs
 * without hardcoding strings. Re-exports from @agentsy/atlas.
 */

export {
  AI_TASKS,
  type AtlasAiTaskId,
  type AtlasArtifactId,
  type AtlasConstraintId,
  type AtlasHumanTaskId,
  type AtlasLayerId,
  type AtlasManifest,
  AtlasManifestSchema,
  type AtlasSystemTaskId,
  type AtlasTouchpointId,
  CONSTRAINTS,
  DATA_ARTIFACTS,
  getAtlasStats,
  getPattern,
  HUMAN_TASKS,
  isValidAiTaskId,
  isValidConstraintId,
  isValidTouchpointId,
  LAYERS,
  SYSTEM_TASKS,
  TOUCHPOINTS,
  validateAgentManifest
} from '@agentsy/atlas';

/** Sample valid manifest for a coder-style agent. */
export const SAMPLE_CODER_MANIFEST = {
  aiTasks: ['task_generate', 'task_verify'],
  humanTasks: [],
  systemTasks: [],
  dataArtifacts: [],
  constraints: ['const_privacy', 'const_human_loop'],
  touchpoints: [],
  layer: 'layer_internal'
} as const;

/** Sample manifest with an invalid ID for negative tests. */
export const SAMPLE_INVALID_MANIFEST = {
  aiTasks: ['task_typo'],
  humanTasks: [],
  systemTasks: [],
  dataArtifacts: [],
  constraints: [],
  touchpoints: []
} as const;
