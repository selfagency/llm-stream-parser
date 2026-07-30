/**
 * Codegen — reads the frozen Atlas snapshot and emits Agentsy-native TypeScript.
 *
 * Run: pnpm --filter @agentsy/atlas build
 *
 * The snapshot is the single source of truth. The @quietloudlab/ai-interaction-atlas
 * npm package is only needed to regenerate the snapshot (see snapshot/refresh.ts),
 * not to run this codegen.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface AtlasSnapshot {
  ai_tasks: Array<{
    id: string;
    layer_id: string;
    name: string;
    slug: string;
    task_type: 'ai';
    elevator_pitch: string;
    example_usage: string;
  }>;
  constraints: Array<{
    id: string;
    name: string;
    category: string;
    icon: string;
    description?: string;
    type?: string;
    applies_to?: string[];
    ux_note?: string;
    example_values?: string;
  }>;
  data_artifacts: Array<{
    id: string;
    name: string;
    category: string;
    icon: string;
    description?: string;
    examples?: string[];
    compatible_with?: string[];
    format_notes?: string;
  }>;
  human_tasks: Array<{
    id: string;
    layer_id: string;
    name: string;
    slug: string;
    task_type: 'human';
    elevator_pitch: string;
    example_usage: string;
  }>;
  layers: Array<{
    id: string;
    name: string;
    slug: string;
    label: string;
    role: string;
    description: string;
    color: string;
  }>;
  meta: { title: string; description: string; version: string; schema_version: string };
  system_tasks: Array<{
    id: string;
    layer_id: string;
    name: string;
    slug: string;
    task_type: 'system';
    elevator_pitch: string;
    example_usage: string;
  }>;
  touchpoints: Array<{
    id: string;
    name: string;
    category: string;
    icon: string;
    description: string;
    examples: string[];
  }>;
}

const SNAPSHOT_PATH = resolve(__dirname, 'snapshot/atlas-1.0.json');
const OUT_DIR = resolve(__dirname, 'generated');

function loadSnapshot(): AtlasSnapshot {
  const raw = readFileSync(SNAPSHOT_PATH, 'utf-8');
  return JSON.parse(raw) as AtlasSnapshot;
}

function quote(id: string): string {
  return `'${id}'`;
}

function unionType(ids: string[]): string {
  return ids.map(quote).join(' | ');
}

function emitTypesTs(_data: AtlasSnapshot): string {
  return `/**
 * Agentsy-native Atlas types.
 *
 * Copied from @quietloudlab/ai-interaction-atlas dist/types.d.ts at snapshot time.
 * Do not edit by hand — regenerate via \`pnpm --filter @agentsy/atlas build\`.
 */

import type { DataCategory, ConstraintCategory, TouchpointCategory } from './categories.js';

export interface Meta {
  title: string;
  description: string;
  version: string;
  schema_version: string;
}

export interface LayerGuidance {
  when_to_use: string;
  typical_position: string;
  red_flags: string[];
}

export interface Layer {
  id: string;
  name: string;
  slug: string;
  label: string;
  role: string;
  description: string;
  color: string;
  guidance?: LayerGuidance;
}

type IOItem = string | { id: string; label: string; isArray?: boolean };

export interface IOSpec {
  inputs: { required: IOItem[]; optional: IOItem[] };
  constraints?: { optional: IOItem[] };
  outputs: { primary: IOItem; metadata: IOItem[] };
}

export interface ImplementationNotes {
  maturity: 'emerging' | 'established' | 'commoditized';
  typical_latency: 'realtime' | 'interactive' | 'batch';
  data_requirements: 'none' | 'small' | 'medium' | 'large' | 'continuous';
  human_oversight: 'none' | 'optional' | 'recommended' | 'required';
}

export interface UxNotes {
  risk: string;
  tip: string;
  anti_patterns: string[];
}

export interface Capability {
  name: string;
  tag: string;
  example: string;
}

export interface Relation {
  target_id: string;
  type: string;
  strength: string;
  reason: string;
}

export interface BaseTask {
  id: string;
  layer_id: string;
  name: string;
  slug: string;
  elevator_pitch: string;
  example_usage: string;
  io_spec: IOSpec;
}

export interface AiTask extends BaseTask {
  task_type: 'ai';
  implementation_notes: ImplementationNotes;
  ux_notes: UxNotes;
  capabilities: Capability[];
  relations: Relation[];
}

export interface HumanTask extends BaseTask {
  task_type: 'human';
  common_variants: string[];
  relations: Relation[];
}

export interface SystemTask extends BaseTask {
  task_type: 'system';
  common_variants: string[];
  relations: Relation[];
}

export type Task = AiTask | HumanTask | SystemTask;

export interface DataArtifactDefinition {
  id: string;
  name: string;
  category: DataCategory;
  icon: string;
  description?: string;
  examples?: string[];
  compatible_with?: string[];
  format_notes?: string;
}

export interface ConstraintDefinition {
  id: string;
  name: string;
  category: ConstraintCategory;
  icon: string;
  description?: string;
  type?: string;
  applies_to?: string[];
  ux_note?: string;
  example_values?: string;
}

export interface TouchpointDefinition {
  id: string;
  name: string;
  category: TouchpointCategory;
  icon: string;
  description: string;
  examples: string[];
}
`;
}

function emitIdsTs(data: AtlasSnapshot): string {
  const aiIds = data.ai_tasks.map(t => t.id);
  const humanIds = data.human_tasks.map(t => t.id);
  const systemIds = data.system_tasks.map(t => t.id);
  const artifactIds = data.data_artifacts.map(d => d.id);
  const constraintIds = data.constraints.map(c => c.id);
  const touchpointIds = data.touchpoints.map(t => t.id);
  const layerIds = data.layers.map(l => l.id);

  return `/**
 * Atlas ID unions — generated from snapshot. Do not edit by hand.
 *
 * Three separate task ID unions so a manifest can't put a human task
 * in the aiTasks array (catches YAML authoring errors at load time).
 */

export type AtlasAiTaskId = ${unionType(aiIds)};

export type AtlasHumanTaskId = ${unionType(humanIds)};

export type AtlasSystemTaskId = ${unionType(systemIds)};

export type AtlasArtifactId = ${unionType(artifactIds)};

export type AtlasConstraintId = ${unionType(constraintIds)};

export type AtlasTouchpointId = ${unionType(touchpointIds)};

export type AtlasLayerId = ${unionType(layerIds)};
`;
}

function emitCategoriesTs(data: AtlasSnapshot): string {
  return `/**
 * Atlas category unions — generated from snapshot. Do not edit by hand.
 */

export type DataCategory = ${[...new Set(data.data_artifacts.map(d => d.category))].map(c => `'${c}'`).join(' | ')};

export type ConstraintCategory = ${[...new Set(data.constraints.map(c => c.category))].map(c => `'${c}'`).join(' | ')};

export type TouchpointCategory = ${[...new Set(data.touchpoints.map(t => t.category))].map(c => `'${c}'`).join(' | ')};
`;
}

function emitPatternsTs(data: AtlasSnapshot): string {
  // Emit the full pattern arrays as JSON-in-TS for type safety + zero runtime deps
  const layersJson = JSON.stringify(data.layers, null, 2);
  const aiJson = JSON.stringify(data.ai_tasks, null, 2);
  const humanJson = JSON.stringify(data.human_tasks, null, 2);
  const systemJson = JSON.stringify(data.system_tasks, null, 2);
  const dataJson = JSON.stringify(data.data_artifacts, null, 2);
  const constraintsJson = JSON.stringify(data.constraints, null, 2);
  const touchpointsJson = JSON.stringify(data.touchpoints, null, 2);

  return `/**
 * Atlas pattern data — generated from snapshot. Do not edit by hand.
 *
 * These are readonly arrays of the frozen snapshot data. No runtime
 * dependency on @quietloudlab/ai-interaction-atlas.
 */

import type {
  Layer, AiTask, HumanTask, SystemTask,
  DataArtifactDefinition, ConstraintDefinition, TouchpointDefinition
} from './types.js';

export const META = ${JSON.stringify(data.meta, null, 2)} as const;

export const LAYERS: readonly Layer[] = ${layersJson} as const;

export const AI_TASKS: readonly AiTask[] = ${aiJson} as const;

export const HUMAN_TASKS: readonly HumanTask[] = ${humanJson} as const;

export const SYSTEM_TASKS: readonly SystemTask[] = ${systemJson} as const;

export const DATA_ARTIFACTS: readonly DataArtifactDefinition[] = ${dataJson} as const;

export const CONSTRAINTS: readonly ConstraintDefinition[] = ${constraintsJson} as const;

export const TOUCHPOINTS: readonly TouchpointDefinition[] = ${touchpointsJson} as const;
`;
}

function emitIndexTs(): string {
  return `/**
 * @agentsy/atlas generated barrel — do not edit by hand.
 */

export * from './types.js';
export * from './ids.js';
export * from './categories.js';
export * from './patterns.js';
`;
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const data = loadSnapshot();

  writeFileSync(resolve(OUT_DIR, 'types.ts'), emitTypesTs(data));
  writeFileSync(resolve(OUT_DIR, 'ids.ts'), emitIdsTs(data));
  writeFileSync(resolve(OUT_DIR, 'categories.ts'), emitCategoriesTs(data));
  writeFileSync(resolve(OUT_DIR, 'patterns.ts'), emitPatternsTs(data));
  writeFileSync(resolve(OUT_DIR, 'index.ts'), emitIndexTs());

  console.log(`codegen: wrote 5 files to ${OUT_DIR}`);
  console.log(
    `codegen: ${data.ai_tasks.length} ai, ${data.human_tasks.length} human, ${data.system_tasks.length} system, ${data.data_artifacts.length} data, ${data.constraints.length} constraints, ${data.touchpoints.length} touchpoints`
  );
}

main();
