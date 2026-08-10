import type { LogicalModel, ModelEntry, ModelReplica, ModelTier } from '@agentsy/gateway';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EscalationPolicy } from '../intelligence/gateway-backed-router.js';
import type { CircuitBreakerSet } from './circuit-breaker-set.js';
import { type CreateFailoverChainOptions, createFailoverChain, ExhaustedError, getNextStep } from './model-failover.js';
import type { RateLimitStatus } from './rate-limit-escalation.js';

// Mock gateway dependency
vi.mock('@agentsy/gateway', () => ({
  getLogicalModel: vi.fn()
}));

vi.mock('./circuit-breaker-set.js', () => ({
  isOpen: vi.fn(() => false),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
  getOpenReplicaIds: vi.fn(() => []),
  getState: vi.fn(() => 'closed'),
  reset: vi.fn()
}));

// Import after mocks
import { getLogicalModel } from '@agentsy/gateway';

describe('createFailoverChain', () => {
  let mockModel: ModelEntry;
  let mockReplicas: ModelReplica[];
  let mockEscalationPolicy: EscalationPolicy;
  let mockCircuitBreakerSet: CircuitBreakerSet;
  let mockRateLimitMap: Map<string, RateLimitStatus>;

  beforeEach(() => {
    mockModel = {
      id: 'test-model-1',
      modelName: 'Test Model 1',
      tier: 'micro',
      providerId: 'test-provider',
      capabilities: { audio: false, embeddings: false, jsonMode: false, reasoning: false, tools: false, vision: false },
      contextWindow: 4096,
      cost: { inputPer1MTokens: 0.001, outputPer1MTokens: 0.003 },
      maxOutputTokens: 4096,
      useCases: []
    };

    mockReplicas = [
      {
        id: 'replica-1',
        logicalModelId: 'test-model-1',
        providerId: 'test-provider',
        cost: { inputPer1MTokens: 0.001, outputPer1MTokens: 0.003 },
        isLocal: false,
        upstreamModelName: 'gpt-4'
      },
      {
        id: 'replica-2',
        logicalModelId: 'test-model-1',
        providerId: 'test-provider',
        cost: { inputPer1MTokens: 0.001, outputPer1MTokens: 0.003 },
        isLocal: false,
        upstreamModelName: 'gpt-4'
      },
      {
        id: 'replica-3',
        logicalModelId: 'test-model-2',
        providerId: 'test-provider',
        cost: { inputPer1MTokens: 0.001, outputPer1MTokens: 0.003 },
        isLocal: false,
        upstreamModelName: 'claude-3'
      },
      {
        id: 'replica-4',
        logicalModelId: 'test-model-3',
        providerId: 'test-provider',
        cost: { inputPer1MTokens: 0.001, outputPer1MTokens: 0.003 },
        isLocal: false,
        upstreamModelName: 'gpt-4o'
      }
    ];

    mockEscalationPolicy = {
      allowEscalation: true,
      chain: ['micro', 'small', 'mid', 'frontier'],
      maxSteps: 3
    };

    mockCircuitBreakerSet = {
      isOpen: vi.fn(() => false),
      recordFailure: vi.fn(),
      recordSuccess: vi.fn(),
      getOpenReplicaIds: vi.fn(() => []),
      getState: vi.fn(() => 'closed'),
      reset: vi.fn()
    } as unknown as CircuitBreakerSet;

    mockRateLimitMap = new Map();

    vi.clearAllMocks();

    // Configure getLogicalModel to return proper tier info
    const logicalModelBase: LogicalModel = {
      id: '',
      tier: 'micro' as ModelTier,
      capabilities: { audio: false, embeddings: false, jsonMode: false, reasoning: false, tools: false, vision: false },
      contextWindow: 4096,
      maxOutputTokens: 4096,
      useCases: []
    };

    vi.mocked(getLogicalModel).mockImplementation((modelId: string) => {
      if (modelId === 'test-model-1') {
        return { ...logicalModelBase, id: modelId, tier: 'micro' as ModelTier };
      }
      if (modelId === 'test-model-2') {
        return { ...logicalModelBase, id: modelId, tier: 'micro' as ModelTier };
      }
      if (modelId === 'test-model-3') {
        return { ...logicalModelBase, id: modelId, tier: 'small' as ModelTier };
      }
      return;
    });
  });

  describe('basic chain construction', () => {
    it('creates chain with same-replica-retry as first step', () => {
      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        mockEscalationPolicy,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      expect(chain.currentStep).toBe(0);
      expect(chain.steps[0]).toEqual({
        type: 'same-replica-retry',
        logicalModelId: 'test-model-1',
        tier: 'micro'
      });
    });

    it('includes next-replica steps for available replicas', () => {
      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        mockEscalationPolicy,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      const replicaSteps = chain.steps.filter(s => s.type === 'next-replica');
      expect(replicaSteps).toHaveLength(2);
      expect(replicaSteps[0]?.replicaId).toBe('replica-1');
      expect(replicaSteps[1]?.replicaId).toBe('replica-2');
    });

    it('includes next-model steps for other models in same tier', () => {
      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        mockEscalationPolicy,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      const modelSteps = chain.steps.filter(s => s.type === 'next-model');
      expect(modelSteps).toHaveLength(1);
      expect(modelSteps[0]?.logicalModelId).toBe('test-model-2');
      expect(modelSteps[0]?.replicaId).toBe('replica-3');
    });

    it('includes tier-escalation steps when allowed', () => {
      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        mockEscalationPolicy,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      const escalationSteps = chain.steps.filter(s => s.type === 'tier-escalation');
      expect(escalationSteps).toHaveLength(1);
      expect(escalationSteps[0]?.replicaId).toBe('replica-4');
      expect(escalationSteps[0]?.tier).toBe('small');
    });

    it('excludes tier-escalation steps when disabled', () => {
      const options: CreateFailoverChainOptions = {
        tierEscalation: false
      };

      const chain = createFailoverChain(mockModel, mockReplicas, mockEscalationPolicy, options);

      const escalationSteps = chain.steps.filter(s => s.type === 'tier-escalation');
      expect(escalationSteps).toHaveLength(0);
    });
  });

  describe('exclusion filtering', () => {
    it('excludes specified replica ids from chain', () => {
      const options: CreateFailoverChainOptions = {
        excludeReplicaIds: new Set(['replica-2'])
      };

      const chain = createFailoverChain(mockModel, mockReplicas, mockEscalationPolicy, options);

      const replicaSteps = chain.steps.filter(s => s.type === 'next-replica');
      expect(replicaSteps).toHaveLength(1);
      expect(replicaSteps[0]?.replicaId).toBe('replica-1');
    });

    it('excludes circuit-broken replicas', () => {
      mockCircuitBreakerSet.isOpen = () => true;

      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        mockEscalationPolicy,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      const replicaSteps = chain.steps.filter(s => s.type === 'next-replica');
      expect(replicaSteps).toHaveLength(0);
    });

    it('excludes rate-limited replicas', () => {
      mockRateLimitMap.set('replica-1', { isRateLimited: true });

      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        mockEscalationPolicy,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      const replicaSteps = chain.steps.filter(s => s.type === 'next-replica');
      expect(replicaSteps).toHaveLength(1);
      expect(replicaSteps[0]?.replicaId).toBe('replica-2');
    });

    it('marks all replicas as seen when all are rate-limited', () => {
      mockRateLimitMap.set('replica-1', { isRateLimited: true });
      mockRateLimitMap.set('replica-2', { isRateLimited: true });

      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        mockEscalationPolicy,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      // All replicas should be marked as seen — only same-replica-retry + next-model steps
      const replicaSteps = chain.steps.filter(s => s.type === 'next-replica');
      expect(replicaSteps).toHaveLength(0);
    });
  });

  describe('exhaustion and getNextStep', () => {
    it('throws ExhaustedError when chain is exhausted', () => {
      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        mockEscalationPolicy,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      // Consume all steps (getNextStep increments before checking, so stop at length-1)
      while (chain.currentStep < chain.steps.length - 1) {
        getNextStep(chain, new Error('test'));
      }

      expect(() => getNextStep(chain, new Error('final error'))).toThrow(ExhaustedError);
    });

    it('ExhaustedError includes chain and attempt count', () => {
      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        mockEscalationPolicy,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      // Consume all steps
      while (chain.currentStep < chain.steps.length - 1) {
        getNextStep(chain, new Error('test'));
      }

      try {
        getNextStep(chain, new Error('final error'));
      } catch (error) {
        expect(error).toBeInstanceOf(ExhaustedError);
        const err = error as ExhaustedError;
        expect(err.chain).toEqual(chain.steps);
        expect(err.attempts).toBe(chain.steps.length);
        expect(err.message).toContain('after');
        expect(err.message).toContain(String(chain.steps.length));
      }
    });

    it('advances chain currentStep on each call', () => {
      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        mockEscalationPolicy,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      const step1 = getNextStep(chain, new Error('error 1'));
      expect(chain.currentStep).toBe(1);
      expect(step1).toEqual(chain.steps[1]);

      const step2 = getNextStep(chain, new Error('error 2'));
      expect(chain.currentStep).toBe(2);
      expect(step2).toEqual(chain.steps[2]);
    });

    it('returns step when chain has one step remaining after advancing', () => {
      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        mockEscalationPolicy,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      // Advance to last step (getNextStep increments before checking, so stop at length-2)
      while (chain.currentStep < chain.steps.length - 2) {
        getNextStep(chain, new Error('test'));
      }

      const lastStep = getNextStep(chain, new Error('final'));
      expect(lastStep).toEqual(chain.steps.at(-1));
      expect(chain.currentStep).toBe(chain.steps.length - 1);
    });
  });

  describe('overload handling', () => {
    it('accepts CircuitBreakerSet as direct parameter', () => {
      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        mockEscalationPolicy,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      expect(chain.steps.length).toBeGreaterThan(0);
    });

    it('accepts options object with CircuitBreakerSet', () => {
      const options: CreateFailoverChainOptions = {
        circuitBreakerSet: mockCircuitBreakerSet,
        rateLimitMap: mockRateLimitMap
      };

      const chain = createFailoverChain(mockModel, mockReplicas, mockEscalationPolicy, options);

      expect(chain.steps.length).toBeGreaterThan(0);
    });

    it('handles missing rateLimitMap in options', () => {
      const options: CreateFailoverChainOptions = {
        circuitBreakerSet: mockCircuitBreakerSet
      };

      const chain = createFailoverChain(mockModel, mockReplicas, mockEscalationPolicy, options);

      expect(chain.steps.length).toBeGreaterThan(0);
    });

    it('defaults tierEscalation to true when not specified', () => {
      const options: CreateFailoverChainOptions = {
        circuitBreakerSet: mockCircuitBreakerSet
      };

      const chain = createFailoverChain(mockModel, mockReplicas, mockEscalationPolicy, options);

      const escalationSteps = chain.steps.filter(s => s.type === 'tier-escalation');
      expect(escalationSteps.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty replicas list', () => {
      const chain = createFailoverChain(mockModel, [], mockEscalationPolicy, mockCircuitBreakerSet, mockRateLimitMap);

      // Only same-replica-retry step
      expect(chain.steps).toHaveLength(1);
      expect(chain.steps[0]?.type).toBe('same-replica-retry');
    });

    it('handles escalationPolicy without chain', () => {
      const policyWithoutChain: EscalationPolicy = {
        allowEscalation: false
      };

      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        policyWithoutChain,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      const escalationSteps = chain.steps.filter(s => s.type === 'tier-escalation');
      expect(escalationSteps).toHaveLength(0);
    });

    it('handles escalationPolicy without maxSteps', () => {
      const policyWithoutMaxSteps: EscalationPolicy = {
        allowEscalation: true,
        chain: ['micro', 'small']
      };

      const chain = createFailoverChain(
        mockModel,
        mockReplicas,
        policyWithoutMaxSteps,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      const escalationSteps = chain.steps.filter(s => s.type === 'tier-escalation');
      expect(escalationSteps).toHaveLength(1);
    });

    it('handles model with tier not in DEFAULT_CHAIN', () => {
      const modelWithCustomTier: ModelEntry = {
        id: 'custom-tier-model',
        modelName: 'Custom Tier Model',
        tier: 'custom' as ModelTier,
        providerId: 'test-provider',
        capabilities: {
          audio: false,
          embeddings: false,
          jsonMode: false,
          reasoning: false,
          tools: false,
          vision: false
        },
        contextWindow: 4096,
        cost: { inputPer1MTokens: 0.001, outputPer1MTokens: 0.003 },
        maxOutputTokens: 4096,
        useCases: []
      };

      const chain = createFailoverChain(
        modelWithCustomTier,
        mockReplicas,
        mockEscalationPolicy,
        mockCircuitBreakerSet,
        mockRateLimitMap
      );

      expect(chain.steps.length).toBeGreaterThan(0);
      expect(chain.steps[0]?.type).toBe('same-replica-retry');
    });

    it('returns chain even when no steps are available', () => {
      const chain = createFailoverChain(mockModel, [], mockEscalationPolicy, mockCircuitBreakerSet, mockRateLimitMap);

      expect(chain.steps).toHaveLength(1); // same-replica-retry always included
      expect(chain.currentStep).toBe(0);
    });
  });
});
