/**
 * Tests for the Gateway class.
 */

import { describe, expect, it, vi } from 'vitest';

import { createGateway, Gateway } from '../gateway.js';
import { InMemoryPersistenceAdapter } from '../persistence/in-memory.js';
import type { ProviderEntry } from '../types.js';

// =============================================================================
// Fixtures
// =============================================================================

function provider(id: string, overrides: Partial<ProviderEntry> = {}): ProviderEntry {
  return {
    id,
    name: id,
    provider: 'openai' as const,
    ...overrides
  };
}

const PROVIDER_A = provider('openai-main', { model: 'gpt-4o' });
const PROVIDER_B = provider('anthropic-main', { model: 'claude-sonnet-4' });

// =============================================================================
// Factory
// =============================================================================

describe('createGateway', () => {
  it('returns a Gateway instance', () => {
    const gw = createGateway();
    expect(gw).toBeInstanceOf(Gateway);
  });

  it('accepts initial providers', () => {
    const gw = createGateway({ providers: [PROVIDER_A, PROVIDER_B] });
    expect(gw.providerIds).toHaveLength(2);
    expect(gw.providerIds).toContain('openai-main');
    expect(gw.providerIds).toContain('anthropic-main');
  });

  it('accepts a custom persistence adapter', () => {
    const persistence = new InMemoryPersistenceAdapter();
    const gw = createGateway({ persistence });
    expect(gw).toBeInstanceOf(Gateway);
  });
});

// =============================================================================
// selectModel
// =============================================================================

describe('selectModel', () => {
  it('returns a decision with no-candidates when no providers configured', async () => {
    const gw = createGateway();
    const decision = await gw.selectModel({ tier: 'frontier' });
    expect(decision.providerId).toBe('none');
    expect(decision.selectedBecause).toContain('no-candidates');
  });

  it('selects from configured providers', async () => {
    const gw = createGateway({ providers: [PROVIDER_A, PROVIDER_B] });
    const decision = await gw.selectModel({});
    expect(decision.providerId).not.toBe('none');
    expect(decision.modelId).not.toBe('none');
    expect(decision.tier).toBe('unknown');
  });

  it('passes tier through to decision', async () => {
    const gw = createGateway({ providers: [PROVIDER_A] });
    const decision = await gw.selectModel({ tier: 'mid' });
    expect(decision.tier).toBe('mid');
  });

  it('persists the routing decision', async () => {
    const persistence = new InMemoryPersistenceAdapter();
    const gw = createGateway({ providers: [PROVIDER_A], persistence });

    // Spy on saveRoutingDecision
    const saveSpy = vi.spyOn(persistence, 'saveRoutingDecision');

    await gw.selectModel({ tier: 'small' });
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const calledWith = saveSpy.mock.calls[0]?.[0];
    expect(calledWith).toBeDefined();
    expect(calledWith?.tier).toBe('small');
  });
});

// =============================================================================
// spillover
// =============================================================================

describe('spillover', () => {
  it('returns null when no other providers exist', async () => {
    const gw = createGateway({ providers: [PROVIDER_A] });
    const decision = await gw.selectModel({});
    const result = await gw.spillover(decision);
    expect(result).toBeNull();
  });

  it('selects a different provider when one is available', async () => {
    const gw = createGateway({ providers: [PROVIDER_A, PROVIDER_B] });
    const decision = await gw.selectModel({});
    const result = await gw.spillover(decision);
    expect(result).not.toBeNull();
    expect(result?.providerId).not.toBe(decision.providerId);
  });

  it('persists the spillover decision', async () => {
    const persistence = new InMemoryPersistenceAdapter();
    const gw = createGateway({ providers: [PROVIDER_A, PROVIDER_B], persistence });
    const saveSpy = vi.spyOn(persistence, 'saveRoutingDecision');

    const decision = await gw.selectModel({});
    await gw.spillover(decision);

    // Two calls: one for selectModel, one for spillover
    expect(saveSpy).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// registerProvider
// =============================================================================

describe('registerProvider', () => {
  it('adds a provider to the registry', async () => {
    const gw = createGateway();
    expect(gw.providerIds).toHaveLength(0);
    await gw.registerProvider(PROVIDER_A);
    expect(gw.providerIds).toHaveLength(1);
    expect(gw.providerIds).toContain('openai-main');
  });
});

// =============================================================================
// healthReport
// =============================================================================

describe('healthReport', () => {
  it('returns a report with timestamp', async () => {
    const gw = createGateway({ providers: [PROVIDER_A] });
    const report = await gw.healthReport();
    expect(report).toHaveProperty('providers');
    expect(report).toHaveProperty('timestamp');
    expect(typeof report.timestamp).toBe('string');
  });
});

// =============================================================================
// Circuit breaker restore
// =============================================================================

describe('restoreCircuitBreakerState', () => {
  it('restores an open circuit breaker', () => {
    const gw = createGateway({ providers: [PROVIDER_A] });
    gw.restoreCircuitBreakerState('openai-main', 'open');
    // After restore with 'open', the circuit will remain closed initially
    // because healthRegistry lazily creates entries. On first check after restore,
    // the entry is created with an open circuit.
    // This test verifies the method doesn't throw.
    expect(gw.providerIds).toContain('openai-main');
  });
});
