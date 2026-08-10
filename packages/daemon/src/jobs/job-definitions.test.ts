import { describe, expect, it } from 'vitest';
import { DEFAULT_JOB_DEFINITIONS } from './job-definitions.js';

describe('Job definitions', () => {
  it('should have pre-defined maintenance jobs', () => {
    expect(DEFAULT_JOB_DEFINITIONS.length).toBeGreaterThan(0);
  });

  it('each definition should have required fields', () => {
    for (const def of DEFAULT_JOB_DEFINITIONS) {
      expect(def.name).toBeTruthy();
      expect(def.type).toMatch(/^(cron|interval|one_time)$/);
      expect(def.schedule).toBeTruthy();
      expect(def.handler).toBeTruthy();
    }
  });

  it('should have memory-consolidation job', () => {
    const job = DEFAULT_JOB_DEFINITIONS.find(d => d.name === 'memory-consolidation');
    expect(job).toBeDefined();
    expect(job?.type).toBe('interval');
    expect(job?.scope).toBe('maintenance');
  });
});
