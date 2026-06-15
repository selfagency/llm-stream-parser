import type { ModelEntry, ModelTier, TierAwareModelSelector } from '@agentsy/gateway';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowNode } from '../types/workflow.js';
import { GatewayBackedModelRouter } from './gateway-backed-router.js';

// =============================================================================
// Helpers
// =============================================================================

function createMockSelector(): TierAwareModelSelector {
  return {
    selectModelForTier: vi.fn().mockImplementation(
      (input: { constraints?: unknown; tier: ModelTier; useCase?: string }): Promise<ModelEntry> =>
        Promise.resolve({
          id: `model-${input.tier}`,
          modelName: `test-${input.tier}`,
          providerId: 'test-provider',
          tier: input.tier,
          useCases: ['chat'],
          capabilities: {
            tools: true,
            jsonMode: true,
            vision: false,
            audio: false,
            reasoning: false,
            embeddings: false
          },
          contextWindow: 128_000,
          maxOutputTokens: 16_384,
          cost: { inputPer1MTokens: 1, outputPer1MTokens: 2 }
        })
    )
  };
}

function createMockGateway(selector?: TierAwareModelSelector) {
  const sel = selector ?? createMockSelector();
  return {
    getModelSelector: () => sel
  };
}

function makeNode(overrides?: Partial<WorkflowNode>): WorkflowNode {
  return {
    id: 'test-node',
    name: 'test',
    type: 'task',
    agent: 'test-agent',
    input: {},
    output: {},
    ...overrides
  } as unknown as WorkflowNode;
}

// =============================================================================
// Tests
// =============================================================================

describe('GatewayBackedModelRouter', () => {
  describe('chooseModelForTask', () => {
    it('should delegate model selection to the gateway selector', async () => {
      const selector = createMockSelector();
      const router = new GatewayBackedModelRouter(createMockGateway(selector));

      const model = await router.chooseModelForTask({
        node: makeNode({ name: 'code-review' }),
        taskTier: 'mid'
      });

      expect(model).toBeDefined();
      expect(model.tier).toBe('mid');
      expect(selector.selectModelForTier).toHaveBeenCalledWith(
        expect.objectContaining({ tier: 'mid', useCase: 'code' })
      );
    });

    it('should infer use case from node name', async () => {
      const selector = createMockSelector();
      const router = new GatewayBackedModelRouter(createMockGateway(selector));

      // Code keywords
      await router.chooseModelForTask({ node: makeNode({ name: 'implement-feature' }), taskTier: 'small' });
      expect(selector.selectModelForTier).toHaveBeenLastCalledWith(expect.objectContaining({ useCase: 'code' }));

      // Search keywords
      await router.chooseModelForTask({ node: makeNode({ name: 'search-docs' }), taskTier: 'micro' });
      expect(selector.selectModelForTier).toHaveBeenLastCalledWith(expect.objectContaining({ useCase: 'search' }));

      // Embed keywords
      await router.chooseModelForTask({ node: makeNode({ name: 'embed-vectors' }), taskTier: 'micro' });
      expect(selector.selectModelForTier).toHaveBeenLastCalledWith(expect.objectContaining({ useCase: 'embed' }));

      // Decision nodes → search
      await router.chooseModelForTask({ node: makeNode({ name: 'anything', type: 'decision' }), taskTier: 'micro' });
      expect(selector.selectModelForTier).toHaveBeenLastCalledWith(expect.objectContaining({ useCase: 'search' }));

      // Default → chat
      await router.chooseModelForTask({ node: makeNode({ name: 'unknown-task' }), taskTier: 'micro' });
      expect(selector.selectModelForTier).toHaveBeenLastCalledWith(expect.objectContaining({ useCase: 'chat' }));
    });

    it('should record selection in audit log', async () => {
      const router = new GatewayBackedModelRouter(createMockGateway());

      await router.chooseModelForTask({ node: makeNode({ name: 'test' }), taskTier: 'mid' });

      const record = router.getSelectionRecord();
      expect(record).toBeDefined();
      expect(record?.taskTier).toBe('mid');
      expect(record?.logicalModelId).toBe('model-mid');
      expect(record?.escalated).toBe(false);

      const auditLog = router.getSelectionAuditLog();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0]?.taskTier).toBe('mid');
    });

    it('should propagate selector errors', async () => {
      const selector: TierAwareModelSelector = {
        selectModelForTier: vi.fn().mockRejectedValue(new Error('No models for tier'))
      };
      const router = new GatewayBackedModelRouter(createMockGateway(selector));

      await expect(
        router.chooseModelForTask({ node: makeNode({ name: 'test' }), taskTier: 'frontier' })
      ).rejects.toThrow('No models for tier');
    });

    it('should set escalated flag on error', async () => {
      const selector: TierAwareModelSelector = {
        selectModelForTier: vi.fn().mockRejectedValue(new Error('fail'))
      };
      const router = new GatewayBackedModelRouter(createMockGateway(selector));

      await expect(router.chooseModelForTask({ node: makeNode({ name: 'test' }), taskTier: 'mid' })).rejects.toThrow();

      expect(router.getSelectionRecord()?.escalated).toBe(true);
    });

    it('should pass constraints to the selector', async () => {
      const selector = createMockSelector();
      const router = new GatewayBackedModelRouter(createMockGateway(selector), {
        modelSelectionConstraints: {
          excludeProviders: ['openai'],
          localPreference: 'preferred',
          requireJsonMode: true,
          requireTools: true
        }
      });

      await router.chooseModelForTask({ node: makeNode({ name: 'test' }), taskTier: 'small' });

      expect(selector.selectModelForTier).toHaveBeenCalledWith(
        expect.objectContaining({
          constraints: expect.objectContaining({
            excludeProviders: ['openai'],
            localPreference: 'preferred',
            requireJsonMode: true,
            requireTools: true
          })
        })
      );
    });
  });

  describe('no direct provider logic', () => {
    it('should not reference any provider by name in selection', async () => {
      // The router only passes tier and use case — no provider IDs
      const selector = createMockSelector();
      const router = new GatewayBackedModelRouter(createMockGateway(selector));

      await router.chooseModelForTask({ node: makeNode({ name: 'test' }), taskTier: 'mid' });

      const callArg = vi.mocked(selector.selectModelForTier).mock.calls[0]?.[0];
      expect(callArg).toBeDefined();
      // Should NOT contain provider-specific fields
      expect(Object.keys(callArg ?? {})).not.toContain('providerId');
      expect(Object.keys(callArg ?? {})).not.toContain('provider');
    });
  });
});
