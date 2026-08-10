/**
 * Integration tests for cross-package replica routing in the model gateway client.
 *
 * Covers quota-aware replica selection, local preference routing,
 * tier-based model selection with failover spillover, and clean
 * denial when constraints cannot be satisfied.
 *
 * Each scenario uses the actual registries, selectors, and spillover
 * functions — only the provider call is mocked via `executeProviderCall`.
 */

import type { CompletionRequest, CompletionResponse } from '@agentsy/shared';
import { describe, expect, it } from 'vitest';

import { createModelGatewayClient, type ReplicaCallFunction } from './model-gateway-client.js';
import { ModelRegistry } from './model-registry.js';
import { ReplicaRegistry } from './replica-registry.js';
import { DefaultReplicaSelector, type ReplicaSelectionContext } from './replica-selector.js';
import { DefaultTierAwareModelSelector } from './selector.js';
import { spillover } from './spillover.js';
import type { ModelReplica } from './types.js';

// =============================================================================
// Test helpers
// =============================================================================

/** Minimal completion request for test invocations. */
function testRequest(model?: string): CompletionRequest {
  return {
    model: model ?? 'test-model',
    messages: [{ role: 'user', content: 'hello' }]
  };
}

/** Stub response for the mock provider call. */
function stubResponse(content = 'ok'): CompletionResponse {
  return { content };
}

/** Cheap cost suitable for small/local test replicas. */
const CHEAP_COST = Object.freeze({ inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 });

/** Zero cost for local replicas. */
const LOCAL_COST = Object.freeze({ inputPer1MTokens: 0, outputPer1MTokens: 0 });

/** Full capabilities object for models that support everything. */
const _FULL_CAPS = Object.freeze({
  audio: false,
  embeddings: false,
  jsonMode: true,
  reasoning: false,
  tools: true,
  vision: false
});

/**
 * Register a test replica and return it.
 */
function registerReplica(
  registry: ReplicaRegistry,
  overrides: Partial<ModelReplica> & {
    id: string;
    logicalModelId: string;
    providerId: string;
  }
): ModelReplica {
  const replica: ModelReplica = {
    cost: CHEAP_COST,
    isLocal: false,
    upstreamModelName: overrides.id,
    ...overrides
  };
  registry.register(replica);
  return replica;
}

/**
 * Build a default `ReplicaSelectionContext` with optional overrides.
 */
function testSelectionContext(overrides?: Partial<ReplicaSelectionContext>): ReplicaSelectionContext {
  return {
    errorRates: new Map(),
    latencies: new Map(),
    localPreference: 'preferred',
    tier: 'micro',
    ...overrides
  };
}

/**
 * Create a mock `executeProviderCall` that records which replica was called
 * and returns a stub response.
 */
function mockProviderCall(): { fn: ReplicaCallFunction; calledReplicas: ModelReplica[] } {
  const calledReplicas: ModelReplica[] = [];
  const fn: ReplicaCallFunction = (replica, _request) => {
    calledReplicas.push(replica);
    return Promise.resolve(stubResponse(`from-${replica.id}`));
  };
  return { fn, calledReplicas };
}

// =============================================================================
// Scenario 1: Quota-aware replica selection
// =============================================================================

describe('quota-aware replica selection', () => {
  it('selects the replica with more headroom when one is near exhaustion', () => {
    const registry = new ReplicaRegistry();
    const selector = new DefaultReplicaSelector();

    // Two replicas for the same logical model, different cloud accounts
    const exhausted = registerReplica(registry, {
      id: 'cloud-a/gpt-4o-mini',
      logicalModelId: 'gpt-4o-mini',
      providerId: 'cloud-a',
      upstreamModelName: 'gpt-4o-mini'
    });
    const healthy = registerReplica(registry, {
      id: 'cloud-b/gpt-4o-mini',
      logicalModelId: 'gpt-4o-mini',
      providerId: 'cloud-b',
      upstreamModelName: 'gpt-4o-mini'
    });

    const headroomPercentages = new Map<string, number>([
      [exhausted.id, 5], // 5% headroom → +0.75 (5 × 0.15)
      [healthy.id, 80] // 80% headroom → +12 (80 × 0.15)
    ]);

    const context = testSelectionContext({
      headroomPercentages,
      tier: 'small'
    });

    const selected = selector.selectReplica(registry.getByLogicalModel('gpt-4o-mini'), context);

    expect(selected).toBeDefined();
    // Healthy replica (80% headroom) should be preferred
    expect(selected?.id).toBe(healthy.id);
    expect(selected?.providerId).toBe('cloud-b');
  });
});

// =============================================================================
// Scenario 2: Small task → local replica preferred
// =============================================================================

describe('local preference for small tasks', () => {
  it('selects the local replica for a micro-tier chat call', async () => {
    const registry = new ReplicaRegistry();

    // Register both a local and a cloud replica for the same logical model
    const localReplica = registerReplica(registry, {
      id: 'ollama/llama3.2-1b',
      logicalModelId: 'llama3.2:1b',
      providerId: 'ollama',
      isLocal: true,
      cost: LOCAL_COST,
      upstreamModelName: 'llama3.2:1b'
    });
    registerReplica(registry, {
      id: 'openai/gpt-4o-mini',
      logicalModelId: 'llama3.2:1b',
      providerId: 'openai',
      upstreamModelName: 'gpt-4o-mini'
    });

    const { fn: executeProviderCall, calledReplicas } = mockProviderCall();

    const client = createModelGatewayClient({
      executeProviderCall,
      modelRegistry: new ModelRegistry(),
      modelSelector: new DefaultTierAwareModelSelector(),
      replicaRegistry: registry,
      replicaSelector: new DefaultReplicaSelector()
    });

    const result = await client.callByTier('micro', 'chat', testRequest());

    // Verify the local replica was selected
    expect(result.selection.replicaId).toBe(localReplica.id);
    expect(result.selection.providerId).toBe('ollama');
    expect(result.selection.selectedBecause).toBeDefined();
    expect(result.selection.selectedBecause.length).toBeGreaterThan(0);

    // Verify the provider call was routed to the local replica
    expect(calledReplicas).toHaveLength(1);
    expect(calledReplicas[0]?.id).toBe(localReplica.id);
  });
});

// =============================================================================
// Scenario 3: Frontier task → cloud replica chosen
// =============================================================================

describe('frontier tier routing', () => {
  it('selects a cloud replica for a frontier task', async () => {
    const registry = new ReplicaRegistry();

    // Register a cloud replica for a frontier model
    const cloudReplica = registerReplica(registry, {
      id: 'openai/o1-mini',
      logicalModelId: 'o1-mini',
      providerId: 'openai',
      cost: { inputPer1MTokens: 3, outputPer1MTokens: 12 },
      upstreamModelName: 'o1-mini'
    });

    // Also register a local small model to show local exists for other tiers
    registerReplica(registry, {
      id: 'ollama/llama3.2-1b',
      logicalModelId: 'llama3.2:1b',
      providerId: 'ollama',
      isLocal: true,
      cost: LOCAL_COST,
      upstreamModelName: 'llama3.2:1b'
    });

    const { fn: executeProviderCall, calledReplicas } = mockProviderCall();

    const client = createModelGatewayClient({
      executeProviderCall,
      modelRegistry: new ModelRegistry(),
      modelSelector: new DefaultTierAwareModelSelector(),
      replicaRegistry: registry,
      replicaSelector: new DefaultReplicaSelector()
    });

    const result = await client.callByTier('frontier', 'reasoning', testRequest());

    // Verify the cloud replica was selected
    expect(result.selection.providerId).toBe('openai');
    expect(result.selection.replicaId).toBe(cloudReplica.id);

    // Verify executed through the cloud replica
    expect(calledReplicas).toHaveLength(1);
    expect(calledReplicas[0]?.id).toBe(cloudReplica.id);
  });
});

// =============================================================================
// Scenario 4: Failover — spillover to the next replica
// =============================================================================

describe('spillover failover', () => {
  it('picks the next replica when the first is excluded', () => {
    const registry = new ReplicaRegistry();
    const selector = new DefaultReplicaSelector();

    const primary = registerReplica(registry, {
      id: 'provider-a/replica',
      logicalModelId: 'gpt-4o-mini',
      providerId: 'provider-a'
    });
    const secondary = registerReplica(registry, {
      id: 'provider-b/replica',
      logicalModelId: 'gpt-4o-mini',
      providerId: 'provider-b'
    });

    const context = testSelectionContext({ tier: 'small' });

    // Spillover with the primary replica excluded (simulates failure)
    const result = spillover('gpt-4o-mini', 'small', registry, selector, context, {
      excludeReplicas: new Set([primary.id])
    });

    expect(result).toBeDefined();
    expect(result?.replica.id).toBe(secondary.id);
    expect(result?.replica.providerId).toBe('provider-b');
    expect(result?.reason).toContain('next replica');
  });

  it('returns undefined when all replicas are excluded', () => {
    const registry = new ReplicaRegistry();
    const selector = new DefaultReplicaSelector();

    const only = registerReplica(registry, {
      id: 'provider-a/replica',
      logicalModelId: 'gpt-4o-mini',
      providerId: 'provider-a'
    });

    const context = testSelectionContext({ tier: 'small' });

    const result = spillover('gpt-4o-mini', 'small', registry, selector, context, {
      excludeReplicas: new Set([only.id])
    });

    expect(result).toBeUndefined();
  });
});

// =============================================================================
// Scenario 5: Local-only policy with no local replica → clean denial
// =============================================================================

describe('local-only constraint denial', () => {
  it('returns undefined when localPreference=required but no local replicas exist', () => {
    const registry = new ReplicaRegistry();
    const selector = new DefaultReplicaSelector();

    // Only cloud replicas — no local
    registerReplica(registry, {
      id: 'cloud/gpt-4o-mini',
      logicalModelId: 'gpt-4o-mini',
      providerId: 'cloud'
    });

    const context = testSelectionContext({
      localPreference: 'required',
      tier: 'small'
    });

    const selected = selector.selectReplica(registry.getByLogicalModel('gpt-4o-mini'), context);

    // Clean denial: undefined, not a crash
    expect(selected).toBeUndefined();
  });
});
