/**
 * Agent pool types for Piscina-backed worker thread pool.
 */

export interface AgentPoolConfig {
  concurrentTasksPerWorker?: number;
  filename: string;
  idleTimeoutMs?: number;
  maxQueueSize?: number;
  maxThreads?: number;
  minThreads?: number;
  resourceLimits?: {
    maxOldGenerationSizeMb: number;
    maxYoungGenerationSizeMb: number;
  };
}

export interface PoolStats {
  completed: number;
  duration: number;
  queueSize: number;
  runTime: number;
  threads: number;
  utilization: number;
  waitTime: number;
}

export interface TaskPayload {
  payload: unknown;
  priority?: 'high' | 'normal' | 'low';
  type: string;
}

export interface TaskResult<T = unknown> {
  data?: T;
  error?: string;
  success: boolean;
}
