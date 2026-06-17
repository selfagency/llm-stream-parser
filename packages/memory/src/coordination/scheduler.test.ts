import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryScheduler } from './scheduler.js';

describe('Scheduler', () => {
  let scheduler: ReturnType<typeof createInMemoryScheduler>;

  beforeEach(() => {
    scheduler = createInMemoryScheduler();
  });

  describe('schedule', () => {
    it('should schedule a job with jobId and delay', async () => {
      const job = vi.fn<() => void>();

      scheduler.schedule('job-1', 50, job);

      // Job should not be called immediately
      expect(job).not.toHaveBeenCalled();

      // Wait for the job to execute
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(job).toHaveBeenCalledWith();
    });

    it('should execute job after specified delay', async () => {
      const job = vi.fn<() => void>();

      scheduler.schedule('delayed-job', 50, job);

      // Job should not be called immediately
      expect(job).not.toHaveBeenCalled();

      // Wait for the job to execute
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(job).toHaveBeenCalledOnce();
    });

    it('should handle jobs with zero delay', async () => {
      const job = vi.fn<() => void>();

      scheduler.schedule('zero-delay-job', 0, job);

      // Should execute almost immediately
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(job).toHaveBeenCalledWith();
    });

    it('should handle jobs with negative delay (converted to 0)', async () => {
      const job = vi.fn<() => void>();

      scheduler.schedule('negative-delay-job', -100, job);

      // Should execute almost immediately
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(job).toHaveBeenCalledWith();
    });

    it('should schedule multiple independent jobs', async () => {
      const job1 = vi.fn<() => void>();
      const job2 = vi.fn<() => void>();
      const job3 = vi.fn<() => void>();

      scheduler.schedule('job-1', 30, job1);
      scheduler.schedule('job-2', 60, job2);
      scheduler.schedule('job-3', 90, job3);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(job1).toHaveBeenCalledWith();
      expect(job2).toHaveBeenCalledWith();
      expect(job3).toHaveBeenCalledWith();
    });

    it('should replace a previously scheduled job with the same ID', async () => {
      const job1 = vi.fn<() => void>();
      const job2 = vi.fn<() => void>();

      scheduler.schedule('replacement-job', 50, job1);
      scheduler.schedule('replacement-job', 50, job2); // Replace with job2

      await new Promise(resolve => setTimeout(resolve, 100));

      // Only job2 should have been called, not job1
      expect(job1).not.toHaveBeenCalled();
      expect(job2).toHaveBeenCalledWith();
    });

    it('should support various jobId formats', async () => {
      const job1 = vi.fn<() => void>();
      const job2 = vi.fn<() => void>();
      const job3 = vi.fn<() => void>();

      scheduler.schedule('simple-id', 30, job1);
      scheduler.schedule('uuid-123e4567-e89b-12d3-a456-426614174000', 30, job2);
      scheduler.schedule('id-with-special-chars_123', 30, job3);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(job1).toHaveBeenCalledWith();
      expect(job2).toHaveBeenCalledWith();
      expect(job3).toHaveBeenCalledWith();
    });

    it('should handle large delay values', async () => {
      const job = vi.fn<() => void>();

      scheduler.schedule('large-delay-job', 5000, job);

      // Wait briefly
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not have executed yet
      expect(job).not.toHaveBeenCalled();

      // Cancel it instead of waiting 5 seconds
      scheduler.cancel('large-delay-job');
    });
  });

  describe('cancel', () => {
    it('should cancel a scheduled job', async () => {
      const job = vi.fn<() => void>();

      scheduler.schedule('job-to-cancel', 50, job);
      scheduler.cancel('job-to-cancel');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(job).not.toHaveBeenCalled();
    });

    it('should not affect other jobs when cancelling one', async () => {
      const job1 = vi.fn<() => void>();
      const job2 = vi.fn<() => void>();

      scheduler.schedule('job-1', 50, job1);
      scheduler.schedule('job-2', 60, job2);

      scheduler.cancel('job-1');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(job1).not.toHaveBeenCalled();
      expect(job2).toHaveBeenCalledWith();
    });

    it('should be safe to cancel a non-existent job', () => {
      expect(() => {
        scheduler.cancel('non-existent-job-id');
      }).not.toThrow();
    });

    it('should be safe to cancel the same job multiple times', async () => {
      const job = vi.fn<() => void>();

      scheduler.schedule('job-to-cancel-twice', 50, job);

      scheduler.cancel('job-to-cancel-twice');
      expect(() => {
        scheduler.cancel('job-to-cancel-twice');
      }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(job).not.toHaveBeenCalled();
    });

    it('should prevent execution after cancellation', async () => {
      const job = vi.fn<() => void>();

      scheduler.schedule('delayed-cancel', 100, job);

      // Cancel immediately after scheduling
      scheduler.cancel('delayed-cancel');

      // Wait longer than the original delay
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(job).not.toHaveBeenCalled();
    });

    it('should cancel job even after partial delay', async () => {
      const job = vi.fn<() => void>();

      scheduler.schedule('partial-delay-cancel', 100, job);

      // Cancel after 50ms (before the job should execute)
      await new Promise(resolve => setTimeout(resolve, 50));
      scheduler.cancel('partial-delay-cancel');

      // Wait for original delay to pass
      await new Promise(resolve => setTimeout(resolve, 60));

      expect(job).not.toHaveBeenCalled();
    });
  });

  describe('pendingCount', () => {
    it('should return 0 when no jobs are pending', () => {
      expect(scheduler.pendingCount()).toBe(0);
    });

    it('should count scheduled jobs', () => {
      const job1 = vi.fn<() => void>();
      const job2 = vi.fn<() => void>();
      const job3 = vi.fn<() => void>();

      scheduler.schedule('job-1', 100, job1);
      scheduler.schedule('job-2', 100, job2);
      scheduler.schedule('job-3', 100, job3);

      expect(scheduler.pendingCount()).toBe(3);
    });

    it('should decrement count when job is cancelled', () => {
      const job1 = vi.fn<() => void>();
      const job2 = vi.fn<() => void>();

      scheduler.schedule('job-1', 100, job1);
      scheduler.schedule('job-2', 100, job2);

      expect(scheduler.pendingCount()).toBe(2);

      scheduler.cancel('job-1');
      expect(scheduler.pendingCount()).toBe(1);

      scheduler.cancel('job-2');
      expect(scheduler.pendingCount()).toBe(0);
    });

    it('should decrement count when job executes', async () => {
      const job = vi.fn<() => void>();

      scheduler.schedule('job-to-execute', 30, job);
      expect(scheduler.pendingCount()).toBe(1);

      // Wait for job to execute
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(scheduler.pendingCount()).toBe(0);
    });

    it('should track pending count accurately with multiple operations', () => {
      const job1 = vi.fn<() => void>();
      const job2 = vi.fn<() => void>();
      const job3 = vi.fn<() => void>();
      const job4 = vi.fn<() => void>();

      scheduler.schedule('job-1', 100, job1);
      scheduler.schedule('job-2', 100, job2);
      scheduler.schedule('job-3', 100, job3);
      expect(scheduler.pendingCount()).toBe(3);

      scheduler.schedule('job-4', 100, job4);
      expect(scheduler.pendingCount()).toBe(4);

      scheduler.cancel('job-2');
      expect(scheduler.pendingCount()).toBe(3);

      scheduler.schedule('job-2', 100, vi.fn<() => void>()); // Re-add with same ID
      expect(scheduler.pendingCount()).toBe(4);

      scheduler.cancel('job-1');
      scheduler.cancel('job-3');
      scheduler.cancel('job-4');
      expect(scheduler.pendingCount()).toBe(1); // Only job-2 remains

      scheduler.cancel('job-2');
      expect(scheduler.pendingCount()).toBe(0);
    });

    it('should return 0 after all jobs execute', async () => {
      const job1 = vi.fn<() => void>();
      const job2 = vi.fn<() => void>();

      scheduler.schedule('job-1', 30, job1);
      scheduler.schedule('job-2', 40, job2);

      expect(scheduler.pendingCount()).toBe(2);

      // Wait for jobs to execute
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(scheduler.pendingCount()).toBe(0);
    });
  });

  describe('Job replacement', () => {
    it('should replace a job when scheduling with the same ID', async () => {
      const job1 = vi.fn<() => void>();
      const job2 = vi.fn<() => void>();
      const job3 = vi.fn<() => void>();

      scheduler.schedule('replace-me', 50, job1);
      scheduler.schedule('replace-me', 50, job2);
      scheduler.schedule('replace-me', 50, job3);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Only job3 should be called
      expect(job1).not.toHaveBeenCalled();
      expect(job2).not.toHaveBeenCalled();
      expect(job3).toHaveBeenCalledWith();
      expect(scheduler.pendingCount()).toBe(0);
    });

    it('should preserve pending count when replacing jobs', () => {
      const job1 = vi.fn<() => void>();
      const job2 = vi.fn<() => void>();

      scheduler.schedule('job-1', 100, job1);
      scheduler.schedule('job-2', 100, job2);
      expect(scheduler.pendingCount()).toBe(2);

      scheduler.schedule('job-1', 100, vi.fn<() => void>()); // Replace job-1
      expect(scheduler.pendingCount()).toBe(2); // Count should not change

      scheduler.schedule('job-3', 100, vi.fn<() => void>()); // Add new
      expect(scheduler.pendingCount()).toBe(3);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle concurrent jobs with different timings', async () => {
      const jobs = Array.from({ length: 5 }, () => vi.fn<() => void>());

      for (const [index, job] of jobs.entries()) {
        scheduler.schedule(`job-${index}`, 30 + index * 20, job);
      }

      expect(scheduler.pendingCount()).toBe(5);

      await new Promise(resolve => setTimeout(resolve, 200));

      for (const job of jobs) {
        expect(job).toHaveBeenCalledWith();
      }
      expect(scheduler.pendingCount()).toBe(0);
    });

    it('should manage lifecycle of many jobs', async () => {
      const jobs: { id: string; fn: ReturnType<typeof vi.fn<() => void>> }[] = Array.from({ length: 50 }, (_, i) => ({
        fn: vi.fn<() => void>(),
        id: `job-${i}`
      }));

      // Schedule all jobs
      for (const { id, fn } of jobs) {
        // nosemgrep: insecure-randomness -- Math.random() is used only for scheduling jitter in unit tests;
        // no security-sensitive operation depends on this value.
        scheduler.schedule(id, 100 + Math.random() * 50, fn);
      }

      expect(scheduler.pendingCount()).toBe(50);

      // Cancel every other job
      for (let i = 0; i < 50; i += 2) {
        const jobToCancel = jobs[i];
        if (jobToCancel) {
          scheduler.cancel(jobToCancel.id);
        }
      }

      expect(scheduler.pendingCount()).toBe(25);

      // Wait for remaining jobs
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check results
      let cancelledCount = 0;
      let executedCount = 0;
      for (const [index, { fn }] of jobs.entries()) {
        if (index % 2 === 0) {
          if (fn.mock.calls.length === 0) {
            cancelledCount++;
          }
        } else if (fn.mock.calls.length > 0) {
          executedCount++;
        }
      }

      expect(cancelledCount).toBe(25);
      expect(executedCount).toBe(25);
      expect(scheduler.pendingCount()).toBe(0);
    });

    it('should handle error in job without affecting scheduler', async () => {
      const errorJob = vi.fn<() => void>(() => {
        throw new Error('Job error');
      });
      const normalJob = vi.fn<() => void>();

      scheduler.schedule('error-job', 30, errorJob);
      scheduler.schedule('normal-job', 40, normalJob);

      await new Promise(resolve => setTimeout(resolve, 100));

      // errorJob threw but normalJob should still execute
      expect(errorJob).toHaveBeenCalledWith();
      expect(normalJob).toHaveBeenCalledWith();
      expect(scheduler.pendingCount()).toBe(0);
    });

    it('should handle rapid schedule/cancel operations', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          scheduler.schedule(`rapid-job-${i}`, 1000, vi.fn<() => void>());
          if (i % 3 === 0) {
            scheduler.cancel(`rapid-job-${i}`);
          }
        }
      }).not.toThrow();

      // Some jobs should still be pending
      const pending = scheduler.pendingCount();
      expect(pending).toBeGreaterThan(0);
      expect(pending).toBeLessThanOrEqual(100);
    });
  });
});
