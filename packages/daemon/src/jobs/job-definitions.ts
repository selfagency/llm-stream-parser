export interface JobDefinition {
  handler: string;
  name: string;
  params?: Record<string, unknown>;
  schedule: string;
  scope?: string;
  timeout?: number;
  type: 'cron' | 'interval' | 'one_time';
}

export const DEFAULT_JOB_DEFINITIONS: JobDefinition[] = [
  {
    name: 'memory-consolidation',
    type: 'interval',
    schedule: '60000',
    handler: './jobs/memory-consolidation.js',
    timeout: 30_000,
    scope: 'maintenance'
  },
  {
    name: 'stale-process-cleanup',
    type: 'interval',
    schedule: '300000',
    handler: './jobs/stale-cleanup.js',
    timeout: 15_000,
    scope: 'maintenance'
  },
  {
    name: 'rag-index',
    type: 'interval',
    schedule: '900000',
    handler: './jobs/rag-index.js',
    timeout: 60_000,
    scope: 'maintenance'
  }
];
