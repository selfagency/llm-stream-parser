import type { AtlasLayerId } from '@agentsy/atlas';

export const NodeType = {
  TASK: 'task',
  DECISION: 'decision',
  PARALLEL: 'parallel',
  SEQUENCE: 'sequence',
  MERGE: 'merge'
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export const WorkflowStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
} as const;

export type WorkflowStatus = (typeof WorkflowStatus)[keyof typeof WorkflowStatus];

export interface TaskNode {
  agent: string;
  atlasLayer?: AtlasLayerId;
  id: string;
  input: Record<string, unknown>;
  name: string;
  output: Record<string, unknown>;
  retryPolicy?: RetryPolicy;
  timeout?: number;
  type: 'task';
}

export interface DecisionNode {
  condition: string;
  falseBranch: string[];
  id: string;
  name: string;
  trueBranch: string[];
  type: 'decision';
}

export interface ParallelNode {
  branches: string[];
  failFast?: boolean;
  id: string;
  maxConcurrency?: number;
  name: string;
  type: 'parallel';
}

export interface SequenceNode {
  continueOnError?: boolean;
  id: string;
  name: string;
  steps: string[];
  type: 'sequence';
}

export interface MergeNode {
  id: string;
  inputs: string[];
  name: string;
  strategy: MergeStrategy;
  type: 'merge';
}

export type WorkflowNode = TaskNode | DecisionNode | ParallelNode | SequenceNode | MergeNode;

export type MergeStrategy = 'join' | 'first' | 'all' | 'majority';

export interface RetryPolicy {
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number;
  maxAttempts: number;
  maxDelay: number;
}

export interface Dependency {
  node: string;
  type: 'sequential' | 'data' | 'resource';
}

export interface Constraint {
  type: 'timing' | 'resource' | 'skill' | 'cost';
  value: unknown;
}

export interface EventTrigger {
  condition?: string;
  event: string;
  source: string;
}

export interface EventHandler {
  async?: boolean;
  event: string;
  handler: string;
}

export interface EventFilter {
  action: string;
  condition: string;
  event: string;
}
