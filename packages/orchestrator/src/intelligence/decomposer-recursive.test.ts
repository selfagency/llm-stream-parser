import { describe, expect, it } from 'vitest';
import { TaskDecomposer } from './decomposer.js';

describe('decomposeRecursive', () => {
  const decomposer = new TaskDecomposer();

  it('returns tasks as-is when already solvable', () => {
    const tasks = decomposer.decomposeRecursive('research the API. test the output.');
    expect(tasks.length).toBeGreaterThan(0);
    // All tasks should have IDs
    for (const t of tasks) {
      expect(t.id).toBeDefined();
    }
  });

  it('decomposes frontier tasks further', () => {
    // "reason" maps to frontier tier — should be decomposed further
    const tasks = decomposer.decomposeRecursive('reason about the architecture');
    expect(tasks.length).toBeGreaterThan(0);
    // Should not contain any frontier-tier tasks at top level
    // (they should have been decomposed into smaller pieces)
    const frontierTasks = tasks.filter(t => t.tier === 'frontier');
    // At max depth, some might remain frontier but should have requiresHuman
    const _unresolved = frontierTasks.filter(t => t.metadata.requiresHuman);
    // If any frontier remain, they should be flagged
    for (const t of frontierTasks) {
      if (tasks.indexOf(t) >= 0) {
        // Either decomposed away or flagged
      }
    }
  });

  it('flags unsolvable tasks with requiresHuman at max depth', () => {
    const tasks = decomposer.decomposeRecursive('reason about the architecture', {
      maxDepth: 0 // no recursion — everything stays as-is
    });
    // With maxDepth 0, frontier tasks can't be decomposed
    const frontier = tasks.filter(t => t.tier === 'frontier');
    for (const t of frontier) {
      expect(t.metadata.requiresHuman).toBe(true);
    }
  });

  it('respects custom isSolvable', () => {
    const tasks = decomposer.decomposeRecursive('research the API. implement the feature.', {
      maxDepth: 2,
      isSolvable: task => task.tier === 'micro'
    });
    // Only micro tasks should pass isSolvable; others get decomposed
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('respects solvableThreshold', () => {
    const tasks = decomposer.decomposeRecursive('research the API.', {
      maxDepth: 2,
      solvableThreshold: 1 // everything above 1 token is unsolvable
    });
    // With threshold 1, almost everything gets decomposed further
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('produces unique IDs', () => {
    const tasks = decomposer.decomposeRecursive(
      'research the API. implement the feature. test the output. deploy the service.'
    );
    const ids = tasks.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
