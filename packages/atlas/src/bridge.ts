/**
 * Bridge — Agentsy-facing Atlas API with zero runtime dependency on
 * @quietloudlab/ai-interaction-atlas. All helpers re-implemented against
 * the generated snapshot data.
 */

import type { ConstraintCategory, DataCategory, TouchpointCategory } from './generated/categories.js';
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
  META,
  SYSTEM_TASKS,
  TOUCHPOINTS
} from './generated/patterns.js';
import type {
  AiTask,
  ConstraintDefinition,
  DataArtifactDefinition,
  HumanTask,
  Layer,
  SystemTask,
  TouchpointDefinition
} from './generated/types.js';

// Re-export all generated types and data
export * from './generated/index.js';

export type Dimension = 'ai' | 'human' | 'system' | 'data' | 'constraints' | 'touchpoints';
export type Task = AiTask | HumanTask | SystemTask;
export type Pattern = Task | DataArtifactDefinition | ConstraintDefinition | TouchpointDefinition;

const ALL_TASKS: readonly Task[] = [...AI_TASKS, ...HUMAN_TASKS, ...SYSTEM_TASKS];
const ALL_PATTERNS: readonly Pattern[] = [...ALL_TASKS, ...DATA_ARTIFACTS, ...CONSTRAINTS, ...TOUCHPOINTS];

const TASK_ID_SET: ReadonlySet<string> = new Set(ALL_TASKS.map(t => t.id));
const AI_TASK_ID_SET: ReadonlySet<string> = new Set(AI_TASKS.map(t => t.id));
const HUMAN_TASK_ID_SET: ReadonlySet<string> = new Set(HUMAN_TASKS.map(t => t.id));
const SYSTEM_TASK_ID_SET: ReadonlySet<string> = new Set(SYSTEM_TASKS.map(t => t.id));
const ARTIFACT_ID_SET: ReadonlySet<string> = new Set(DATA_ARTIFACTS.map(d => d.id));
const CONSTRAINT_ID_SET: ReadonlySet<string> = new Set(CONSTRAINTS.map(c => c.id));
const TOUCHPOINT_ID_SET: ReadonlySet<string> = new Set(TOUCHPOINTS.map(t => t.id));

/** Get a pattern by ID (slug or id). */
export function getPattern(id: string): Pattern | undefined {
  return ALL_PATTERNS.find(p => p.id === id);
}

/** Get all patterns from a specific dimension. */
export function getPatternsByDimension(dimension: Dimension): readonly Pattern[] {
  switch (dimension) {
    case 'ai':
      return AI_TASKS;
    case 'human':
      return HUMAN_TASKS;
    case 'system':
      return SYSTEM_TASKS;
    case 'data':
      return DATA_ARTIFACTS;
    case 'constraints':
      return CONSTRAINTS;
    case 'touchpoints':
      return TOUCHPOINTS;
    default:
      return [];
  }
}

/** Filter tasks by layer. */
export function filterByLayer<T extends Task>(tasks: readonly T[], layerId: AtlasLayerId): readonly T[] {
  return tasks.filter(t => t.layer_id === layerId);
}

/** Get all tasks in a specific layer, grouped by type. */
export function getTasksByLayer(layerId: AtlasLayerId): {
  ai: readonly AiTask[];
  human: readonly HumanTask[];
  system: readonly SystemTask[];
} {
  return {
    ai: filterByLayer(AI_TASKS, layerId),
    human: filterByLayer(HUMAN_TASKS, layerId),
    system: filterByLayer(SYSTEM_TASKS, layerId)
  };
}

/** Get a layer by ID. */
export function getLayer(layerId: string): Layer | undefined {
  return LAYERS.find(l => l.id === layerId);
}

/** Filter data artifacts by category. */
export function filterArtifactsByCategory(category: DataCategory): readonly DataArtifactDefinition[] {
  return DATA_ARTIFACTS.filter(d => d.category === category);
}

/** Filter constraints by category. */
export function filterConstraintsByCategory(category: ConstraintCategory): readonly ConstraintDefinition[] {
  return CONSTRAINTS.filter(c => c.category === category);
}

/** Filter touchpoints by category. */
export function filterTouchpointsByCategory(category: TouchpointCategory): readonly TouchpointDefinition[] {
  return TOUCHPOINTS.filter(t => t.category === category);
}

/** Get all unique categories for a dimension. */
export function getCategories(dimension: 'data' | 'constraints' | 'touchpoints'): readonly string[] {
  switch (dimension) {
    case 'data':
      return [...new Set(DATA_ARTIFACTS.map(d => d.category))];
    case 'constraints':
      return [...new Set(CONSTRAINTS.map(c => c.category))];
    case 'touchpoints':
      return [...new Set(TOUCHPOINTS.map(t => t.category))];
    default:
      return [];
  }
}

/** Atlas statistics. */
export function getAtlasStats(): {
  ai: number;
  human: number;
  system: number;
  data: number;
  constraints: number;
  touchpoints: number;
  layers: number;
  total: number;
} {
  return {
    ai: AI_TASKS.length,
    human: HUMAN_TASKS.length,
    system: SYSTEM_TASKS.length,
    data: DATA_ARTIFACTS.length,
    constraints: CONSTRAINTS.length,
    touchpoints: TOUCHPOINTS.length,
    layers: LAYERS.length,
    total:
      AI_TASKS.length +
      HUMAN_TASKS.length +
      SYSTEM_TASKS.length +
      DATA_ARTIFACTS.length +
      CONSTRAINTS.length +
      TOUCHPOINTS.length
  };
}

// ── Type guards ──────────────────────────────────────────────────────────

export function isAiTask(task: Task): task is AiTask {
  return task.task_type === 'ai';
}

export function isHumanTask(task: Task): task is HumanTask {
  return task.task_type === 'human';
}

export function isSystemTask(task: Task): task is SystemTask {
  return task.task_type === 'system';
}

// ── Validation helpers ───────────────────────────────────────────────────

export function isValidAiTaskId(id: string): id is AtlasAiTaskId {
  return AI_TASK_ID_SET.has(id);
}

export function isValidHumanTaskId(id: string): id is AtlasHumanTaskId {
  return HUMAN_TASK_ID_SET.has(id);
}

export function isValidSystemTaskId(id: string): id is AtlasSystemTaskId {
  return SYSTEM_TASK_ID_SET.has(id);
}

export function isValidTaskId(id: string): boolean {
  return TASK_ID_SET.has(id);
}

export function isValidArtifactId(id: string): id is AtlasArtifactId {
  return ARTIFACT_ID_SET.has(id);
}

export function isValidConstraintId(id: string): id is AtlasConstraintId {
  return CONSTRAINT_ID_SET.has(id);
}

export function isValidTouchpointId(id: string): id is AtlasTouchpointId {
  return TOUCHPOINT_ID_SET.has(id);
}

/** Get all valid task IDs (all three task types). */
export function getAllTaskIds(): readonly string[] {
  return [...TASK_ID_SET];
}

/** Get all valid AI task IDs. */
export function getAllAiTaskIds(): readonly string[] {
  return [...AI_TASK_ID_SET];
}

/** Get all valid human task IDs. */
export function getAllHumanTaskIds(): readonly string[] {
  return [...HUMAN_TASK_ID_SET];
}

/** Get all valid system task IDs. */
export function getAllSystemTaskIds(): readonly string[] {
  return [...SYSTEM_TASK_ID_SET];
}

/** Get all valid artifact IDs. */
export function getAllArtifactIds(): readonly string[] {
  return [...ARTIFACT_ID_SET];
}

/** Get all valid constraint IDs. */
export function getAllConstraintIds(): readonly string[] {
  return [...CONSTRAINT_ID_SET];
}

/** Get all valid touchpoint IDs. */
export function getAllTouchpointIds(): readonly string[] {
  return [...TOUCHPOINT_ID_SET];
}

export { META };
