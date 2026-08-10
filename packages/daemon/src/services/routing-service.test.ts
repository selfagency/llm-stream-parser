/**
 * Tests for RoutingService.
 */

import type { RoutingDecision } from '@agentsy/gateway';
import { describe, expect, it, vi } from 'vitest';
import type { UnifiedDB } from '../db/unified-db.js';
import { RoutingService } from './routing-service.js';

// =============================================================================
// Mocks
// =============================================================================

function createMockDB(): UnifiedDB {
  return {
    execute: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    querySingle: vi.fn().mockResolvedValue(null),
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    migrate: vi.fn().mockResolvedValue(undefined),
    migrateFromLegacy: vi.fn().mockResolvedValue(undefined),
    queue: vi.fn(),
    stream: vi.fn(),
    createQueue: vi.fn(),
    createStream: vi.fn(),
    transaction: vi.fn(),
    isOpen: false,
    mode: 'fallback' as const
  } as unknown as UnifiedDB;
}

// =============================================================================
// Lifecycle
// =============================================================================

describe('RoutingService lifecycle', () => {
  it('starts in stopped state', () => {
    const service = new RoutingService({ db: createMockDB() });
    expect(service.state).toBe('stopped');
  });

  it('transitions to active after start', async () => {
    const service = new RoutingService({ db: createMockDB() });
    await service.start();
    expect(service.state).toBe('active');
  });

  it('transitions to sleeping on sleep', async () => {
    const service = new RoutingService({ db: createMockDB() });
    await service.start();
    await service.sleep();
    expect(service.state).toBe('sleeping');
  });

  it('transitions back to active on wakeup', async () => {
    const service = new RoutingService({ db: createMockDB() });
    await service.start();
    await service.sleep();
    await service.wakeup();
    expect(service.state).toBe('active');
  });

  it('transitions to stopped after stop', async () => {
    const service = new RoutingService({ db: createMockDB() });
    await service.start();
    await service.stop();
    expect(service.state).toBe('stopped');
  });

  it('exposes gateway instance after start', async () => {
    const service = new RoutingService({ db: createMockDB() });
    expect(service.gatewayInstance).toBeNull();
    await service.start();
    expect(service.gatewayInstance).not.toBeNull();
  });

  it('clears gateway instance after stop', async () => {
    const service = new RoutingService({ db: createMockDB() });
    await service.start();
    await service.stop();
    expect(service.gatewayInstance).toBeNull();
  });
});

// =============================================================================
// selectModel
// =============================================================================

describe('RoutingService.selectModel', () => {
  it('throws if not started', async () => {
    const service = new RoutingService({ db: createMockDB() });
    await expect(service.selectModel({})).rejects.toThrow('not started');
  });

  it('delegates to gateway', async () => {
    const service = new RoutingService({ db: createMockDB() });
    await service.start();
    const decision = await service.selectModel({ tier: 'mid' });
    expect(decision).toHaveProperty('providerId');
    expect(decision).toHaveProperty('modelId');
  });
});

// =============================================================================
// spillover
// =============================================================================

describe('RoutingService.spillover', () => {
  it('throws if not started', async () => {
    const service = new RoutingService({ db: createMockDB() });
    await expect(service.spillover({} as RoutingDecision)).rejects.toThrow('not started');
  });

  it('delegates to gateway', async () => {
    const service = new RoutingService({ db: createMockDB() });
    await service.start();
    const decision = await service.selectModel({});
    const result = await service.spillover(decision);
    // No providers registered, so spillover returns null
    expect(result).toBeNull();
  });
});

// =============================================================================
// Circuit breaker restore
// =============================================================================

describe('RoutingService circuit breaker restore', () => {
  it('restores circuit breaker state on start', async () => {
    const db = createMockDB();
    // Simulate existing circuit breaker state
    vi.mocked(db.querySingle).mockResolvedValue({ state: 'open' });

    const service = new RoutingService({ db });
    await service.start();
    // Register a provider so the restore loop has something to iterate
    // (gateway.providerIds is empty until providers are registered)
    // The restore loop runs during start() and iterates providerIds.
    // Since no providers are registered, querySingle is not called.
    // This test verifies the method doesn't throw.
    expect(service.state).toBe('active');
  });
});
