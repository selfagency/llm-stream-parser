/**
 * Agentsy-native Atlas types.
 *
 * Copied from @quietloudlab/ai-interaction-atlas dist/types.d.ts at snapshot time.
 * Do not edit by hand — regenerate via `pnpm --filter @agentsy/atlas build`.
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
