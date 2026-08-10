/**
 * Unit tests for the error/edge paths in `createModelGatewayClient`.
 *
 * Mocks all dependencies to cover the error-throwing branches that the
 * integration test (model-gateway-client.integration.test.ts) leaves
 * uncovered, plus minimal success-path verification.
 */

import type { CompletionRequest, CompletionResponse } from '@agentsy/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createModelGatewayClient, type ReplicaCallFunction } from '../model-gateway-client.js';
import type { ReplicaRegistry } from '../replica-registry.js';
import type { DefaultReplicaSelector } from '../replica-selector.js';
import type { DefaultTierAwareModelSelector } from '../selector.js';
import type { ModelEntry, ModelRegistry, ModelReplica } from '../types.js';

// ---------------------------------------------------------------------------
// Module-level mock — getLogicalModel
// ---------------------------------------------------------------------------
vi.mock('../logical-models.js', () => ({
  getLogicalModel: vi.fn()
}));

import { getLogicalModel } from '../logical-models.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeReplica = (overrides: Partial<ModelReplica> = {}): ModelReplica =>
  ({
    id: 'test-replica',
    logicalModelId: 'gpt-4o-mini',
    providerId: 'test',
    upstreamModelName: 'gpt-4o-mini',
    cost: { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
    ...(overrides as Record<string, unknown>)
  }) as ModelReplica;

const makeModelEntry = (overrides: Partial<ModelEntry> = {}): ModelEntry => ({
  id: 'test-provider/gpt-4o-mini',
  providerId: 'test',
  modelName: 'gpt-4o-mini',
  tier: 'small',
  useCases: ['chat', 'code'],
  capabilities: { audio: false, embeddings: false, jsonMode: true, reasoning: false, tools: true, vision: false },
  contextWindow: 128_000,
  maxOutputTokens: 16_384,
  cost: { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
  ...overrides
});

const stubRequest = (): CompletionRequest => ({
  model: 'test-model',
  messages: [{ role: 'user', content: 'hello' }]
});

const stubResponse = (overrides: Partial<CompletionResponse> = {}): CompletionResponse => ({
  content: 'ok',
  ...overrides
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockModelSelector = { selectModelForTier: vi.fn() };
const mockReplicaSelector = { selectReplica: vi.fn() };
const mockReplicaRegistry = {
  getByLogicalModel: vi.fn(),
  getById: vi.fn()
};
const mockModelRegistry = { getModelsByTier: vi.fn() };
const executeProviderCall = vi.fn() as ReturnType<typeof vi.fn>;

function createClient() {
  return createModelGatewayClient({
    modelRegistry: mockModelRegistry as unknown as ModelRegistry,
    replicaRegistry: mockReplicaRegistry as unknown as ReplicaRegistry,
    replicaSelector: mockReplicaSelector as unknown as DefaultReplicaSelector,
    modelSelector: mockModelSelector as unknown as DefaultTierAwareModelSelector,
    executeProviderCall: executeProviderCall as unknown as ReplicaCallFunction
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// callByTier — error paths
// ---------------------------------------------------------------------------

describe('callByTier', () => {
  it('throws when no replicas are available for the resolved logical model', async () => {
    mockModelSelector.selectModelForTier.mockResolvedValue(makeModelEntry({ id: 'p/gpt-4o-mini' }));
    mockModelRegistry.getModelsByTier.mockReturnValue([makeModelEntry({ id: 'p/gpt-4o-mini' })]);
    mockReplicaRegistry.getByLogicalModel.mockReturnValue([]);

    const client = createClient();

    await expect(client.callByTier('small', 'chat', stubRequest())).rejects.toThrow(
      'No replicas available for logical model: gpt-4o-mini'
    );
  });

  it('throws when the replica selector returns undefined', async () => {
    mockModelSelector.selectModelForTier.mockResolvedValue(makeModelEntry({ id: 'p/gpt-4o-mini' }));
    mockModelRegistry.getModelsByTier.mockReturnValue([makeModelEntry({ id: 'p/gpt-4o-mini' })]);
    mockReplicaRegistry.getByLogicalModel.mockReturnValue([makeReplica()]);
    mockReplicaSelector.selectReplica.mockReturnValue(undefined);

    const client = createClient();

    await expect(client.callByTier('small', 'chat', stubRequest())).rejects.toThrow(
      'No suitable replica for logical model: gpt-4o-mini'
    );
  });

  it('selects a replica and calls executeProviderCall with overridden model name', async () => {
    const replica = makeReplica({ id: 'selected-replica', upstreamModelName: 'gpt-4o-mini-2025' });
    mockModelSelector.selectModelForTier.mockResolvedValue(makeModelEntry({ id: 'p/gpt-4o-mini' }));
    mockModelRegistry.getModelsByTier.mockReturnValue([makeModelEntry({ id: 'p/gpt-4o-mini' })]);
    mockReplicaRegistry.getByLogicalModel.mockReturnValue([replica]);
    mockReplicaSelector.selectReplica.mockReturnValue(replica);
    executeProviderCall.mockResolvedValue(stubResponse({ content: 'from-selected' }));

    const client = createClient();

    const result = await client.callByTier('small', 'chat', stubRequest());

    expect(executeProviderCall).toHaveBeenCalledTimes(1);
    // Verify the model was overridden to the replica's upstreamModelName
    expect(executeProviderCall).toHaveBeenCalledWith(replica, expect.objectContaining({ model: 'gpt-4o-mini-2025' }));
    expect(result.response.content).toBe('from-selected');
    expect(result.selection.replicaId).toBe('selected-replica');
    expect(result.selection.providerId).toBe('test');
  });
});

// ---------------------------------------------------------------------------
// callLogicalModel — error paths
// ---------------------------------------------------------------------------

describe('callLogicalModel', () => {
  beforeEach(() => {
    vi.mocked(getLogicalModel).mockReset();
  });

  it('throws when the logical model is unknown', async () => {
    vi.mocked(getLogicalModel).mockReturnValue(undefined);

    const client = createClient();

    await expect(client.callLogicalModel('nonexistent-model', stubRequest())).rejects.toThrow(
      'Unknown logical model: nonexistent-model'
    );
  });

  it('throws when no replicas are available', async () => {
    vi.mocked(getLogicalModel).mockReturnValue({
      id: 'gpt-4o-mini',
      tier: 'small',
      useCases: ['chat'],
      capabilities: { tools: true, jsonMode: true, vision: false, audio: false, reasoning: false, embeddings: false },
      contextWindow: 128_000,
      maxOutputTokens: 16_384
    });
    mockReplicaRegistry.getByLogicalModel.mockReturnValue([]);

    const client = createClient();

    await expect(client.callLogicalModel('gpt-4o-mini', stubRequest())).rejects.toThrow(
      'No replicas available for logical model: gpt-4o-mini'
    );
  });

  it('throws when no suitable replica after selection', async () => {
    vi.mocked(getLogicalModel).mockReturnValue({
      id: 'gpt-4o-mini',
      tier: 'small',
      useCases: ['chat'],
      capabilities: { tools: true, jsonMode: true, vision: false, audio: false, reasoning: false, embeddings: false },
      contextWindow: 128_000,
      maxOutputTokens: 16_384
    });
    mockReplicaRegistry.getByLogicalModel.mockReturnValue([makeReplica()]);
    mockReplicaSelector.selectReplica.mockReturnValue(undefined);

    const client = createClient();

    await expect(client.callLogicalModel('gpt-4o-mini', stubRequest())).rejects.toThrow(
      'No suitable replica for logical model: gpt-4o-mini'
    );
  });

  it('selects a replica and calls executeProviderCall with overridden model name', async () => {
    const replica = makeReplica({ id: 'selected-replica', upstreamModelName: 'gpt-4o-mini-2025' });
    vi.mocked(getLogicalModel).mockReturnValue({
      id: 'gpt-4o-mini',
      tier: 'small',
      useCases: ['chat'],
      capabilities: { tools: true, jsonMode: true, vision: false, audio: false, reasoning: false, embeddings: false },
      contextWindow: 128_000,
      maxOutputTokens: 16_384
    });
    mockReplicaRegistry.getByLogicalModel.mockReturnValue([replica]);
    mockReplicaSelector.selectReplica.mockReturnValue(replica);
    executeProviderCall.mockResolvedValue(stubResponse({ content: 'from-selected' }));

    const client = createClient();

    const result = await client.callLogicalModel('gpt-4o-mini', stubRequest());

    expect(executeProviderCall).toHaveBeenCalledTimes(1);
    expect(executeProviderCall).toHaveBeenCalledWith(replica, expect.objectContaining({ model: 'gpt-4o-mini-2025' }));
    expect(result.response.content).toBe('from-selected');
    expect(result.selection.replicaId).toBe('selected-replica');
  });
});

// ---------------------------------------------------------------------------
// callReplica — error paths
// ---------------------------------------------------------------------------

describe('callReplica', () => {
  it('throws when the replica is unknown', async () => {
    mockReplicaRegistry.getById.mockReturnValue(undefined);

    const client = createClient();

    await expect(client.callReplica('nonexistent-replica', stubRequest())).rejects.toThrow(
      'Unknown replica: nonexistent-replica'
    );
  });

  it('selects a replica and calls executeProviderCall with overridden model name', async () => {
    const replica = makeReplica({ id: 'direct-replica', upstreamModelName: 'gpt-4o-mini-2025' });
    mockReplicaRegistry.getById.mockReturnValue(replica);
    executeProviderCall.mockResolvedValue(stubResponse({ content: 'from-direct' }));

    const client = createClient();

    const result = await client.callReplica('direct-replica', stubRequest());

    expect(executeProviderCall).toHaveBeenCalledTimes(1);
    expect(executeProviderCall).toHaveBeenCalledWith(replica, expect.objectContaining({ model: 'gpt-4o-mini-2025' }));
    expect(result.response.content).toBe('from-direct');
    expect(result.selection.replicaId).toBe('direct-replica');
  });
});
