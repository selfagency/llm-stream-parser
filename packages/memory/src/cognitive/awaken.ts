import type { DecayedItem } from './decay.js';
import {
  createLearningLoopOrchestrator,
  type LearningCycleResult,
  type LearningLoopConfig,
  type LearningLoopOrchestrator
} from './learning/loop-orchestrator.js';
import type { MemoryTierLike } from './memory-tier.js';
import type { MemoryItem, TierName } from './tier-types.js';

export interface AwakenResult {
  budgetReclaimed: number;
  consolidation: {
    compressed: number;
    synthesized: number;
    summarized: number;
  };
  decayPass: {
    kept: number;
    promoted: number;
    demoted: number;
    discarded: number;
  };
  durationMs: number;
  learningCycle?: LearningCycleResult;
  pendingIngested: number;
}

export interface PendingEvent {
  content: string;
  importance?: number;
  metadata?: Record<string, unknown>;
}

export interface AwakenOptions {
  decayResults?: DecayedItem[];
  learningConfig?: Partial<LearningLoopConfig>;
  now?: () => number;
  pendingEvents?: PendingEvent[];
  runLearningCycle?: boolean;
}

const TIER_ORDER: TierName[] = [
  'sensory_buffer',
  'sensory_register',
  'working_memory',
  'short_term_memory',
  'long_term_memory'
];

export interface AwakenDeps {
  budgetRelease: (tier: TierName, tokens: number) => void;
  getAllItems?: (() => MemoryItem[]) | undefined;
  ingestItem: (content: string, importance: number, metadata: Record<string, unknown>) => string | null;
  runDecayPass: () => {
    kept: number;
    promoted: number;
    demoted: number;
    discarded: number;
    durationMs: number;
  };
  tiers: Partial<Record<TierName, MemoryTierLike>>;
}

interface DecayCounts {
  demoted: number;
  discarded: number;
  kept: number;
  promoted: number;
}

function countDecayActions(results: DecayedItem[]): DecayCounts {
  let kept = 0;
  let promoted = 0;
  let demoted = 0;
  let discarded = 0;

  for (const result of results) {
    if (result.action === 'discard') {
      discarded++;
    } else if (result.action === 'promote') {
      promoted++;
    } else if (result.action === 'demote') {
      demoted++;
    } else {
      kept++;
    }
  }

  return { kept, promoted, demoted, discarded };
}

function reclaimBudgetForDiscarded(results: DecayedItem[], budgetRelease: AwakenDeps['budgetRelease']): void {
  for (const result of results) {
    if (result.action === 'discard') {
      budgetRelease(result.tier, result.item.tokenCount);
    }
  }
}

function performPromote(result: DecayedItem, tiers: AwakenDeps['tiers'], currentTier: MemoryTierLike): void {
  const currentIdx = TIER_ORDER.indexOf(result.tier);
  const nextIdx = currentIdx + 1;
  if (nextIdx >= TIER_ORDER.length) {
    return;
  }
  const nextTierName = TIER_ORDER[nextIdx];
  // nosemgrep: typescript.lang.security.detect-object-injection.detect-object-injection -- known tier key, not user input
  const nextTier = nextTierName ? tiers[nextTierName] : undefined;
  if (nextTier) {
    currentTier.promote(1, nextTier);
  }
}

function performDemote(result: DecayedItem, tiers: AwakenDeps['tiers'], currentTier: MemoryTierLike): void {
  const currentIdx = TIER_ORDER.indexOf(result.tier);
  const prevIdx = currentIdx - 1;
  if (prevIdx < 0) {
    return;
  }
  const prevTierName = TIER_ORDER[prevIdx];
  // nosemgrep: typescript.lang.security.detect-object-injection.detect-object-injection -- known tier key, not user input
  const prevTier = prevTierName ? tiers[prevTierName] : undefined;
  if (prevTier) {
    currentTier.demote(1, prevTier);
  }
}

function applyDecayMoves(results: DecayedItem[], tiers: AwakenDeps['tiers']): void {
  for (const result of results) {
    // nosemgrep: typescript.lang.security.detect-object-injection.detect-object-injection -- known tier key, not user input
    const currentTier = tiers[result.tier];
    if (!currentTier) {
      continue;
    }

    if (result.action === 'promote') {
      performPromote(result, tiers, currentTier);
    } else if (result.action === 'demote') {
      performDemote(result, tiers, currentTier);
    }
  }
}

function runDecayStep(options: AwakenOptions, deps: AwakenDeps): DecayCounts {
  if (options.decayResults) {
    const counts = countDecayActions(options.decayResults);
    reclaimBudgetForDiscarded(options.decayResults, deps.budgetRelease);
    applyDecayMoves(options.decayResults, deps.tiers);
    return counts;
  }

  const result = deps.runDecayPass();
  return {
    kept: result.kept,
    promoted: result.promoted,
    demoted: result.demoted,
    discarded: result.discarded
  };
}

interface ConsolidationCounts {
  compressed: number;
  summarized: number;
  synthesized: number;
}

function processTierConsolidation(tier: MemoryTierLike, nextTier: MemoryTierLike, i: number): ConsolidationCounts {
  const cap = tier.capacity();
  const utilizationRatio = cap.maxTokens === 0 ? 0 : cap.usedTokens / cap.maxTokens;

  if (utilizationRatio < tier.config.consolidationThreshold) {
    return { compressed: 0, synthesized: 0, summarized: 0 };
  }

  const promoteCount = Math.ceil(cap.usedItems * tier.config.compressionTarget);
  const actuallyPromoted = tier.promote(promoteCount, nextTier);

  if (i < 2) {
    return { compressed: actuallyPromoted, synthesized: 0, summarized: 0 };
  }
  if (i < 3) {
    return { compressed: 0, synthesized: actuallyPromoted, summarized: 0 };
  }
  return { compressed: 0, synthesized: 0, summarized: actuallyPromoted };
}

function runConsolidationStep(tiers: AwakenDeps['tiers']): ConsolidationCounts {
  let compressed = 0;
  let synthesized = 0;
  let summarized = 0;

  for (let i = 0; i < TIER_ORDER.length - 1; i++) {
    // nosemgrep: typescript.lang.security.detect-object-injection.detect-object-injection -- constant array numeric index
    const tierName = TIER_ORDER[i];
    // nosemgrep: typescript.lang.security.detect-object-injection.detect-object-injection -- constant array numeric index
    const nextTierName = TIER_ORDER[i + 1];
    if (!(tierName && nextTierName)) {
      continue;
    }

    // nosemgrep: typescript.lang.security.detect-object-injection.detect-object-injection -- known tier key, not user input
    const tier = tiers[tierName];
    // nosemgrep: typescript.lang.security.detect-object-injection.detect-object-injection -- known tier key, not user input
    const nextTier = tiers[nextTierName];
    if (!(tier && nextTier)) {
      continue;
    }

    const result = processTierConsolidation(tier, nextTier, i);
    compressed += result.compressed;
    synthesized += result.synthesized;
    summarized += result.summarized;
  }

  return { compressed, synthesized, summarized };
}

function ingestPendingEvents(events: PendingEvent[], ingestItem: AwakenDeps['ingestItem']): number {
  let ingested = 0;
  for (const event of events) {
    const importance = event.importance ?? 0.5;
    const metadata = event.metadata ?? {};
    const result = ingestItem(event.content, importance, metadata);
    if (result !== null) {
      ingested++;
    }
  }
  return ingested;
}

function buildGetAllItems(tiers: AwakenDeps['tiers']): () => MemoryItem[] {
  return () => {
    const items: MemoryItem[] = [];
    for (const tierName of TIER_ORDER) {
      // nosemgrep: typescript.lang.security.detect-object-injection.detect-object-injection -- known tier key from TIER_ORDER
      const tier = tiers[tierName];
      if (!tier) {
        continue;
      }
      items.push(...tier.items());
    }
    return items;
  };
}

function runLearningCycle(
  deps: AwakenDeps,
  options: AwakenOptions,
  getNow: () => number
): Promise<LearningCycleResult | undefined> {
  if (!options.runLearningCycle) {
    return Promise.resolve(undefined);
  }

  const getAllItems = deps.getAllItems ?? buildGetAllItems(deps.tiers);
  const orchestrator: LearningLoopOrchestrator = createLearningLoopOrchestrator({ now: getNow });
  const allItems = getAllItems();
  const ltmTier = deps.tiers.long_term_memory;

  return Promise.resolve(
    orchestrator.runCycle(
      {
        getNewMemories: (limit: number) => allItems.slice(0, limit),
        getLTMMemories: () => [...(ltmTier?.items() ?? [])]
      },
      options.learningConfig
    )
  );
}

export async function awaken(deps: AwakenDeps, options: AwakenOptions = {}): Promise<AwakenResult> {
  const getNow = options.now ?? (() => performance.now());
  const start = getNow();

  const decayPass = runDecayStep(options, deps);
  const consolidation = runConsolidationStep(deps.tiers);
  const pendingIngested = options.pendingEvents ? ingestPendingEvents(options.pendingEvents, deps.ingestItem) : 0;

  const learningCycle = await runLearningCycle(deps, options, getNow);

  const durationMs = getNow() - start;

  return {
    decayPass,
    consolidation,
    budgetReclaimed: 0,
    pendingIngested,
    durationMs,
    ...(learningCycle ? { learningCycle } : {})
  };
}
