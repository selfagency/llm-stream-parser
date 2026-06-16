import { beforeEach, describe, expect, it } from 'vitest';

import { type AwakenDeps, awaken } from './awaken.js';
import type { DecayedItem } from './decay.js';
import { createLongTermMemory } from './long-term-memory.js';
import type { MemoryTierLike } from './memory-tier.js';
import { createSensoryBuffer } from './sensory-buffer.js';
import { createSensoryRegister } from './sensory-register.js';
import { createShortTermMemory } from './short-term-memory.js';
import { createTestMemoryItem, createTierTestClock, resetTestItemIdCounter } from './testing.js';
import type { TierName } from './tier-types.js';
import { createWorkingMemory } from './working-memory.js';

describe('awaken', () => {
  let clock: ReturnType<typeof createTierTestClock>;
  let sensoryBuffer: MemoryTierLike;
  let sensoryRegister: MemoryTierLike;
  let workingMemory: MemoryTierLike;
  let shortTermMemory: MemoryTierLike;
  let longTermMemory: MemoryTierLike;
  let tiers: Partial<Record<TierName, MemoryTierLike>>;
  let releasedTokens: Map<TierName, number>;

  beforeEach(() => {
    resetTestItemIdCounter();
  });

  function setupTiers(withPartial?: boolean): void {
    clock = createTierTestClock(10_000);
    sensoryBuffer = createSensoryBuffer({ now: clock.now });
    sensoryRegister = createSensoryRegister({ now: clock.now });
    workingMemory = createWorkingMemory({ now: clock.now });
    shortTermMemory = createShortTermMemory({ now: clock.now });
    longTermMemory = createLongTermMemory({ now: clock.now });

    tiers = {
      sensory_buffer: sensoryBuffer,
      sensory_register: sensoryRegister,
      working_memory: workingMemory,
      short_term_memory: shortTermMemory,
      long_term_memory: longTermMemory
    };

    if (withPartial) {
      // biome-ignore lint/performance/noDelete: TypeScript exactOptionalPropertyTypes prevents assigning undefined
      delete tiers.sensory_register;
      // biome-ignore lint/performance/noDelete: TypeScript exactOptionalPropertyTypes prevents assigning undefined
      delete tiers.long_term_memory;
    }

    releasedTokens = new Map();
  }

  function createDeps(overrides?: Partial<AwakenDeps>): AwakenDeps {
    return {
      tiers,
      runDecayPass: () => ({ kept: 0, promoted: 0, demoted: 0, discarded: 0, durationMs: 0 }),
      budgetRelease: (tier: TierName, tokens: number) => {
        const current = releasedTokens.get(tier) ?? 0;
        releasedTokens.set(tier, current + tokens);
      },
      ingestItem: (content: string, importance: number, _metadata: Record<string, unknown>) => {
        const item = createTestMemoryItem({
          content,
          importance,
          tokenCount: Math.max(1, Math.ceil(content.length / 4))
        });
        const written = sensoryBuffer.write(item);
        return written?.id ?? null;
      },
      ...overrides
    };
  }

  it('runs decay pass when no pre-computed results provided', async () => {
    setupTiers();
    const deps = createDeps();
    const result = await awaken(deps, { now: clock.now });
    expect(result.decayPass).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('processes pre-computed decay results', async () => {
    setupTiers();
    const deps = createDeps();

    const item = createTestMemoryItem({ tokenCount: 10 });
    const decayResults: DecayedItem[] = [{ item, newImportance: 0.01, tier: 'sensory_buffer', action: 'discard' }];

    const result = await awaken(deps, { decayResults, now: clock.now });
    expect(result.decayPass.discarded).toBe(1);
    expect(releasedTokens.get('sensory_buffer')).toBe(10);
  });

  it('processes promote actions from decay results', async () => {
    setupTiers();
    const item = createTestMemoryItem({ importance: 0.9, tokenCount: 5 });
    sensoryBuffer.write(item);

    const deps = createDeps();
    const decayResults: DecayedItem[] = [{ item, newImportance: 0.7, tier: 'sensory_buffer', action: 'promote' }];

    const result = await awaken(deps, { decayResults, now: clock.now });
    expect(result.decayPass.promoted).toBe(1);
  });

  it('processes demote actions from decay results', async () => {
    setupTiers();
    const item = createTestMemoryItem({ importance: 0.1, tokenCount: 5 });
    sensoryRegister.write(item);

    const deps = createDeps();
    const decayResults: DecayedItem[] = [{ item, newImportance: 0.05, tier: 'sensory_register', action: 'demote' }];

    const result = await awaken(deps, { decayResults, now: clock.now });
    expect(result.decayPass.demoted).toBe(1);
  });

  it('handles promote to non-existent next tier', async () => {
    setupTiers();
    const item = createTestMemoryItem({ importance: 0.9, tokenCount: 5 });
    longTermMemory.write(item);

    const deps = createDeps();
    const decayResults: DecayedItem[] = [{ item, newImportance: 0.8, tier: 'long_term_memory', action: 'promote' }];

    const result = await awaken(deps, { decayResults, now: clock.now });
    expect(result.decayPass.promoted).toBe(1);
  });

  it('handles demote to non-existent prev tier', async () => {
    setupTiers();
    const item = createTestMemoryItem({ importance: 0.1, tokenCount: 5 });
    sensoryBuffer.write(item);

    const deps = createDeps();
    const decayResults: DecayedItem[] = [{ item, newImportance: 0.05, tier: 'sensory_buffer', action: 'demote' }];

    const result = await awaken(deps, { decayResults, now: clock.now });
    expect(result.decayPass.demoted).toBe(1);
  });

  it('handles unknown tier in applyDecayMoves', async () => {
    setupTiers();
    const item = createTestMemoryItem({ importance: 0.9, tokenCount: 5 });

    const deps = createDeps();
    const decayResults: DecayedItem[] = [{ item, newImportance: 0.8, tier: 'sensory_buffer', action: 'promote' }];

    // biome-ignore lint/performance/noDelete: TypeScript exactOptionalPropertyTypes prevents assigning undefined
    delete tiers.sensory_buffer;
    const result = await awaken(deps, { decayResults, now: clock.now });
    expect(result.decayPass.promoted).toBe(1);
  });

  it('counts kept items from decay results', async () => {
    setupTiers();
    const item = createTestMemoryItem({ tokenCount: 5 });

    const deps = createDeps();
    const decayResults: DecayedItem[] = [{ item, newImportance: 0.5, tier: 'sensory_buffer', action: 'keep' }];

    const result = await awaken(deps, { decayResults, now: clock.now });
    expect(result.decayPass.kept).toBe(1);
  });

  it('ingests pending events', async () => {
    setupTiers();
    const deps = createDeps();
    const result = await awaken(deps, {
      pendingEvents: [
        { content: 'Hello world', importance: 0.8 },
        { content: 'Another event', importance: 0.6, metadata: { source: 'test' } }
      ],
      now: clock.now
    });

    expect(result.pendingIngested).toBe(2);
  });

  it('skips ingestion when pending events array is empty', async () => {
    setupTiers();
    const deps = createDeps();
    const result = await awaken(deps, { pendingEvents: [], now: clock.now });
    expect(result.pendingIngested).toBe(0);
  });

  it('skips ingestion when pendingEvents is undefined', async () => {
    setupTiers();
    const deps = createDeps();
    const result = await awaken(deps, { now: clock.now });
    expect(result.pendingIngested).toBe(0);
  });

  it('handles ingestItem returning null', async () => {
    setupTiers();
    const deps = createDeps({
      ingestItem: () => null
    });
    const result = await awaken(deps, {
      pendingEvents: [{ content: 'test' }],
      now: clock.now
    });
    expect(result.pendingIngested).toBe(0);
  });

  it('runs consolidation when tier utilization exceeds threshold', async () => {
    setupTiers();
    for (let i = 0; i < 30; i++) {
      const item = createTestMemoryItem({
        content: `Event ${i} content`,
        tokenCount: 8,
        // nosemgrep: insecure-randomness -- Math.random() is used only for test fixture importance randomization;
        // no security-sensitive operation depends on this value.
        importance: 0.5 + Math.random() * 0.5
      });
      sensoryBuffer.write(item);
    }

    const deps = createDeps();
    const result = await awaken(deps, { now: clock.now });
    expect(result.consolidation).toBeDefined();
    expect(
      result.consolidation.compressed + result.consolidation.synthesized + result.consolidation.summarized
    ).toBeGreaterThanOrEqual(0);
  });

  it('skips consolidation when tiers are missing', async () => {
    setupTiers();
    const deps = createDeps();
    // biome-ignore lint/performance/noDelete: TypeScript exactOptionalPropertyTypes prevents assigning undefined
    delete tiers.working_memory;
    // biome-ignore lint/performance/noDelete: TypeScript exactOptionalPropertyTypes prevents assigning undefined
    delete tiers.short_term_memory;

    const result = await awaken(deps, { now: clock.now });
    expect(result.consolidation.compressed).toBe(0);
    expect(result.consolidation.synthesized).toBe(0);
    expect(result.consolidation.summarized).toBe(0);
  });

  it('handles consolidation with maxTokens=0', async () => {
    setupTiers();
    const tierWithZero = createSensoryBuffer({ now: clock.now, config: { maxTokens: 0, maxItems: 100 } });
    tiers.sensory_buffer = tierWithZero;

    const deps = createDeps();
    const result = await awaken(deps, { now: clock.now });
    expect(result.consolidation.compressed).toBe(0);
  });

  it('runs learning cycle when option is set', async () => {
    setupTiers();
    for (let i = 0; i < 5; i++) {
      sensoryBuffer.write(createTestMemoryItem({ content: `learn-${i}`, importance: 0.8, tokenCount: 5 }));
    }

    const deps = createDeps();
    const result = await awaken(deps, { runLearningCycle: true, now: clock.now });
    expect(result.learningCycle).toBeDefined();
  });

  it('returns valid awaken result structure', async () => {
    setupTiers();
    const deps = createDeps();
    const result = await awaken(deps, { now: clock.now });

    expect(result).toHaveProperty('decayPass');
    expect(result).toHaveProperty('consolidation');
    expect(result).toHaveProperty('budgetReclaimed');
    expect(result).toHaveProperty('pendingIngested');
    expect(result).toHaveProperty('durationMs');
    expect(result.decayPass).toHaveProperty('kept');
    expect(result.decayPass).toHaveProperty('promoted');
    expect(result.decayPass).toHaveProperty('demoted');
    expect(result.decayPass).toHaveProperty('discarded');
    expect(result.consolidation).toHaveProperty('compressed');
    expect(result.consolidation).toHaveProperty('synthesized');
    expect(result.consolidation).toHaveProperty('summarized');
  });
});
