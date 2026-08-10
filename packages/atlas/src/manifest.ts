/**
 * AgentManifest — structured Atlas block for AgentSpec.
 *
 * Replaces free-form `constraints: string[]` with typed Atlas IDs.
 * Free-text constraints remain for project-specific clauses not in the Atlas.
 */

import { z } from 'zod';
import type {
  AtlasAiTaskId,
  AtlasArtifactId,
  AtlasConstraintId,
  AtlasHumanTaskId,
  AtlasLayerId,
  AtlasSystemTaskId,
  AtlasTouchpointId
} from './generated/ids.js';
import {
  AI_TASKS,
  CONSTRAINTS,
  DATA_ARTIFACTS,
  HUMAN_TASKS,
  LAYERS,
  SYSTEM_TASKS,
  TOUCHPOINTS
} from './generated/patterns.js';

const aiTaskIds = new Set(AI_TASKS.map(t => t.id));
const humanTaskIds = new Set(HUMAN_TASKS.map(t => t.id));
const systemTaskIds = new Set(SYSTEM_TASKS.map(t => t.id));
const artifactIds = new Set(DATA_ARTIFACTS.map(d => d.id));
const constraintIds = new Set(CONSTRAINTS.map(c => c.id));
const touchpointIds = new Set(TOUCHPOINTS.map(t => t.id));
const layerIds = new Set(LAYERS.map(l => l.id));

// Zod refinements that validate against the snapshot at parse time.
const aiTaskIdSchema = z.string().refine((id): id is AtlasAiTaskId => aiTaskIds.has(id), {
  message: 'Unknown Atlas AI task ID'
});
const humanTaskIdSchema = z.string().refine((id): id is AtlasHumanTaskId => humanTaskIds.has(id), {
  message: 'Unknown Atlas human task ID'
});
const systemTaskIdSchema = z.string().refine((id): id is AtlasSystemTaskId => systemTaskIds.has(id), {
  message: 'Unknown Atlas system task ID'
});
const artifactIdSchema = z.string().refine((id): id is AtlasArtifactId => artifactIds.has(id), {
  message: 'Unknown Atlas artifact ID'
});
const constraintIdSchema = z.string().refine((id): id is AtlasConstraintId => constraintIds.has(id), {
  message: 'Unknown Atlas constraint ID'
});
const touchpointIdSchema = z.string().refine((id): id is AtlasTouchpointId => touchpointIds.has(id), {
  message: 'Unknown Atlas touchpoint ID'
});
const layerIdSchema = z.string().refine((id): id is AtlasLayerId => layerIds.has(id), {
  message: 'Unknown Atlas layer ID'
});

export const AtlasManifestSchema = z.object({
  aiTasks: z.array(aiTaskIdSchema).default([]),
  humanTasks: z.array(humanTaskIdSchema).default([]),
  systemTasks: z.array(systemTaskIdSchema).default([]),
  dataArtifacts: z.array(artifactIdSchema).default([]),
  constraints: z.array(constraintIdSchema).default([]),
  touchpoints: z.array(touchpointIdSchema).default([]),
  layer: layerIdSchema.optional()
});

export type AtlasManifest = z.infer<typeof AtlasManifestSchema>;
