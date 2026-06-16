import { describe, expect, it } from 'vitest';

describe('Worker entry', () => {
  it('should handle known task types by returning a result', async () => {
    const { default: handler } = await import('./worker-entry.js');
    const result = await handler({ type: 'agent.compute', payload: {} });
    expect(result).toBeDefined();
  });

  it('should throw for unknown task types', async () => {
    const { default: handler } = await import('./worker-entry.js');
    await expect(handler({ type: 'unknown', payload: {} })).rejects.toThrow('Unknown task type');
  });
});
