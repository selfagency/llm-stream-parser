import { describe, expect, it } from 'vitest';

import {
  evaluateConstraints,
  evaluateRoutingConstraints,
  type GatewayModelInfo,
  type RoutingConstraint
} from './routing-constraints.js';

// =============================================================================
// Helpers
// =============================================================================

function makeModel(overrides?: Partial<GatewayModelInfo>): GatewayModelInfo {
  return {
    capabilities: { jsonMode: true, reasoning: true, tools: true, vision: true },
    isLocal: false,
    providerId: 'test-provider',
    ...overrides
  };
}

// =============================================================================
// evaluateConstraints
// =============================================================================

describe('evaluateConstraints', () => {
  it('should pass when no constraints are set', () => {
    const result = evaluateConstraints({}, makeModel());
    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  describe('localOnly', () => {
    it('should pass for local models when localOnly is true', () => {
      const result = evaluateConstraints({ localOnly: true }, makeModel({ isLocal: true }));
      expect(result.pass).toBe(true);
    });

    it('should fail for cloud models when localOnly is true', () => {
      const result = evaluateConstraints({ localOnly: true }, makeModel({ isLocal: false }));
      expect(result.pass).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.code).toBe('local-only-no-local-available');
    });
  });

  describe('excludeProviders', () => {
    it('should pass when provider is not excluded', () => {
      const result = evaluateConstraints(
        { excludeProviders: ['openai', 'anthropic'] },
        makeModel({ providerId: 'ollama' })
      );
      expect(result.pass).toBe(true);
    });

    it('should fail when provider is excluded', () => {
      const result = evaluateConstraints(
        { excludeProviders: ['openai', 'anthropic'] },
        makeModel({ providerId: 'openai' })
      );
      expect(result.pass).toBe(false);
      expect(result.violations[0]?.code).toBe('provider-excluded');
    });
  });

  describe('requireJsonMode', () => {
    it('should pass when model supports JSON mode', () => {
      const result = evaluateConstraints(
        { requireJsonMode: true },
        makeModel({ capabilities: { ...makeModel().capabilities, jsonMode: true } })
      );
      expect(result.pass).toBe(true);
    });

    it('should fail when model does not support JSON mode', () => {
      const result = evaluateConstraints(
        { requireJsonMode: true },
        makeModel({ capabilities: { ...makeModel().capabilities, jsonMode: false } })
      );
      expect(result.pass).toBe(false);
      expect(result.violations[0]?.code).toBe('missing-capability-json');
    });
  });

  describe('requireReasoning', () => {
    it('should pass when model supports reasoning', () => {
      const result = evaluateConstraints(
        { requireReasoning: true },
        makeModel({ capabilities: { ...makeModel().capabilities, reasoning: true } })
      );
      expect(result.pass).toBe(true);
    });

    it('should fail when model does not support reasoning', () => {
      const result = evaluateConstraints(
        { requireReasoning: true },
        makeModel({ capabilities: { ...makeModel().capabilities, reasoning: false } })
      );
      expect(result.pass).toBe(false);
      expect(result.violations[0]?.code).toBe('missing-capability-reasoning');
    });
  });

  describe('requireTools', () => {
    it('should pass when model supports tools', () => {
      const result = evaluateConstraints(
        { requireTools: true },
        makeModel({ capabilities: { ...makeModel().capabilities, tools: true } })
      );
      expect(result.pass).toBe(true);
    });

    it('should fail when model does not support tools', () => {
      const result = evaluateConstraints(
        { requireTools: true },
        makeModel({ capabilities: { ...makeModel().capabilities, tools: false } })
      );
      expect(result.pass).toBe(false);
      expect(result.violations[0]?.code).toBe('missing-capability-tools');
    });
  });

  describe('requireVision', () => {
    it('should pass when model supports vision', () => {
      const result = evaluateConstraints(
        { requireVision: true },
        makeModel({ capabilities: { ...makeModel().capabilities, vision: true } })
      );
      expect(result.pass).toBe(true);
    });

    it('should fail when model does not support vision', () => {
      const result = evaluateConstraints(
        { requireVision: true },
        makeModel({ capabilities: { ...makeModel().capabilities, vision: false } })
      );
      expect(result.pass).toBe(false);
      expect(result.violations[0]?.code).toBe('missing-capability-vision');
    });
  });

  it('should return all violations, not just the first', () => {
    const constraint: RoutingConstraint = {
      localOnly: true,
      excludeProviders: ['test-provider'],
      requireJsonMode: true,
      requireReasoning: true,
      requireTools: true,
      requireVision: true
    };
    const model = makeModel({
      isLocal: false,
      providerId: 'test-provider',
      capabilities: {
        jsonMode: false,
        reasoning: false,
        tools: false,
        vision: false
      }
    });

    const result = evaluateConstraints(constraint, model);
    expect(result.pass).toBe(false);
    // local-only + provider-excluded + 4 missing capabilities = 6
    expect(result.violations).toHaveLength(6);
  });
});

// =============================================================================
// evaluateRoutingConstraints
// =============================================================================

describe('evaluateRoutingConstraints', () => {
  it('should pass all candidates that satisfy constraints', () => {
    const candidates = [makeModel({ providerId: 'ollama', isLocal: true }), makeModel({ providerId: 'openai' })];

    const result = evaluateRoutingConstraints({}, candidates);
    expect(result.passed).toHaveLength(2);
    expect(result.denied).toHaveLength(0);
    expect(result.contestableDenials).toHaveLength(0);
  });

  it('should filter out candidates that violate localOnly', () => {
    const candidates = [
      makeModel({ providerId: 'ollama', isLocal: true }),
      makeModel({ providerId: 'openai', isLocal: false })
    ];

    const result = evaluateRoutingConstraints({ localOnly: true }, candidates);
    expect(result.passed).toHaveLength(1);
    expect(result.passed[0]?.providerId).toBe('ollama');
    expect(result.denied).toHaveLength(1);
    expect(result.denied[0]?.candidate.providerId).toBe('openai');
  });

  it('should filter out excluded providers', () => {
    const candidates = [
      makeModel({ providerId: 'ollama' }),
      makeModel({ providerId: 'openai' }),
      makeModel({ providerId: 'anthropic' })
    ];

    const result = evaluateRoutingConstraints({ excludeProviders: ['openai'] }, candidates);
    expect(result.passed).toHaveLength(2);
    expect(result.passed.map(c => c.providerId)).toEqual(['ollama', 'anthropic']);
    expect(result.denied).toHaveLength(1);
  });

  it('should filter by requireJsonMode', () => {
    const candidates = [
      makeModel({ providerId: 'a', capabilities: { ...makeModel().capabilities, jsonMode: true } }),
      makeModel({ providerId: 'b', capabilities: { ...makeModel().capabilities, jsonMode: false } })
    ];

    const result = evaluateRoutingConstraints({ requireJsonMode: true }, candidates);
    expect(result.passed).toHaveLength(1);
    expect(result.passed[0]?.providerId).toBe('a');
  });

  it('should filter by requireReasoning', () => {
    const candidates = [
      makeModel({ providerId: 'a', capabilities: { ...makeModel().capabilities, reasoning: true } }),
      makeModel({ providerId: 'b', capabilities: { ...makeModel().capabilities, reasoning: false } })
    ];

    const result = evaluateRoutingConstraints({ requireReasoning: true }, candidates);
    expect(result.passed).toHaveLength(1);
    expect(result.passed[0]?.providerId).toBe('a');
  });

  it('should filter by requireTools', () => {
    const candidates = [
      makeModel({ providerId: 'a', capabilities: { ...makeModel().capabilities, tools: true } }),
      makeModel({ providerId: 'b', capabilities: { ...makeModel().capabilities, tools: false } })
    ];

    const result = evaluateRoutingConstraints({ requireTools: true }, candidates);
    expect(result.passed).toHaveLength(1);
    expect(result.passed[0]?.providerId).toBe('a');
  });

  it('should filter by requireVision', () => {
    const candidates = [
      makeModel({ providerId: 'a', capabilities: { ...makeModel().capabilities, vision: true } }),
      makeModel({ providerId: 'b', capabilities: { ...makeModel().capabilities, vision: false } })
    ];

    const result = evaluateRoutingConstraints({ requireVision: true }, candidates);
    expect(result.passed).toHaveLength(1);
    expect(result.passed[0]?.providerId).toBe('a');
  });

  it('should emit contestable denials when no route satisfies policy', () => {
    const candidates = [
      makeModel({ providerId: 'openai', isLocal: false }),
      makeModel({ providerId: 'anthropic', isLocal: false })
    ];

    const result = evaluateRoutingConstraints({ localOnly: true }, candidates);
    expect(result.passed).toHaveLength(0);
    expect(result.denied).toHaveLength(2);
    expect(result.contestableDenials).toHaveLength(1);
    expect(result.contestableDenials[0]).toContain('localOnly');
  });

  it('should emit contestable denials for excluded providers', () => {
    const candidates = [makeModel({ providerId: 'openai' }), makeModel({ providerId: 'anthropic' })];

    const result = evaluateRoutingConstraints({ excludeProviders: ['openai', 'anthropic'] }, candidates);
    expect(result.passed).toHaveLength(0);
    expect(result.contestableDenials).toHaveLength(1);
    expect(result.contestableDenials[0]).toContain('excluded');
  });

  it('should emit contestable denials for missing capabilities', () => {
    const candidates = [
      makeModel({
        providerId: 'a',
        capabilities: { jsonMode: false, reasoning: false, tools: false, vision: false }
      })
    ];

    const result = evaluateRoutingConstraints(
      { requireJsonMode: true, requireReasoning: true, requireTools: true, requireVision: true },
      candidates
    );
    expect(result.passed).toHaveLength(0);
    // 4 distinct violation codes → 4 contestable denials
    expect(result.contestableDenials).toHaveLength(4);
    expect(result.contestableDenials[0]).toContain('JSON mode');
    expect(result.contestableDenials[1]).toContain('reasoning');
    expect(result.contestableDenials[2]).toContain('function calling');
    expect(result.contestableDenials[3]).toContain('vision');
  });

  it('should return empty passed and denied for empty candidates', () => {
    const result = evaluateRoutingConstraints({ localOnly: true }, []);
    expect(result.passed).toHaveLength(0);
    expect(result.denied).toHaveLength(0);
    expect(result.contestableDenials).toHaveLength(0);
  });
});
