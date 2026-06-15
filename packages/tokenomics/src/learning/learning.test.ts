/**
 * Learning loop — comprehensive tests for all modules.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionLedgerEntry } from '../ledger/types.js';
import { applyPatch, getBehaviorsFilePath } from './patch-applier.js';
import { buildPatchGenerationPrompt, generatePatch } from './patch-generator.js';
import { recognizePatterns } from './pattern-recognizer.js';
import { getRoutingWeights, reinforcePattern } from './reinforcement.js';
import type { FailureMode, PromptPatch, ReinforcedPattern } from './types.js';

// =============================================================================
// Helpers
// =============================================================================

function makeEntry(overrides: Partial<SessionLedgerEntry> = {}): SessionLedgerEntry {
  const entry: SessionLedgerEntry = {
    id: randomUUID(),
    sessionId: overrides.sessionId ?? randomUUID(),
    agentId: overrides.agentId ?? 'agent-default',
    modelId: overrides.modelId ?? 'claude-sonnet-4',
    provider: overrides.provider ?? 'anthropic',
    startedAt: overrides.startedAt ?? new Date(Date.now() - 3_600_000),
    endedAt: overrides.endedAt ?? new Date(),
    durationMs: overrides.durationMs ?? 300_000,
    spend: overrides.spend ?? { requestCount: 5, totalCost: 0.05, totalTokens: 5000 },
    artifacts: overrides.artifacts ?? { cached: 0, generated: 5 },
    quality: overrides.quality ?? { feedbackCount: 0, score: 0 },
    frustration: overrides.frustration ?? { count: 0, reasons: [] },
    survivalRate30d: overrides.survivalRate30d ?? null,
    tags: overrides.tags ?? []
  };
  if (overrides.failoverChain !== undefined) {
    entry.failoverChain = overrides.failoverChain;
  }
  if (overrides.logicalModelId !== undefined) {
    entry.logicalModelId = overrides.logicalModelId;
  }
  if (overrides.replicaId !== undefined) {
    entry.replicaId = overrides.replicaId;
  }
  if (overrides.providerId !== undefined) {
    entry.providerId = overrides.providerId;
  }
  return entry;
}

// =============================================================================
// pattern-recognizer.ts
// =============================================================================

describe('recognizePatterns', () => {
  it('returns empty array when no entries provided', () => {
    const result = recognizePatterns([]);
    expect(result).toEqual([]);
  });

  it('returns empty array when no frustration signals exist', () => {
    const entries = [
      makeEntry({ frustration: { count: 0, reasons: [] } }),
      makeEntry({ frustration: { count: 0, reasons: [] } })
    ];
    const result = recognizePatterns(entries);
    expect(result).toEqual([]);
  });

  it('does not promote clusters below min session count', () => {
    const entries = [
      makeEntry({
        frustration: { count: 2, reasons: ['retry timeout'] },
        modelId: 'claude-sonnet-4',
        agentId: 'agent-alpha',
        endedAt: new Date()
      }),
      makeEntry({
        frustration: { count: 1, reasons: ['retry timeout'] },
        modelId: 'claude-sonnet-4',
        agentId: 'agent-alpha',
        endedAt: new Date()
      })
    ];
    // minSessionCount default is 3 — only 2 sessions, so no promotion
    const result = recognizePatterns(entries);
    expect(result).toEqual([]);
  });

  it('promotes clusters meeting session count and confidence thresholds', () => {
    const entries = Array.from({ length: 3 }, (_, i) =>
      makeEntry({
        sessionId: `session-retry-${i}`,
        frustration: { count: 3, reasons: ['retry timeout'] },
        modelId: 'claude-sonnet-4',
        agentId: 'agent-alpha',
        endedAt: new Date(Date.now() - i * 60_000)
      })
    );
    const result = recognizePatterns(entries);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const fm = result[0];
    expect(fm).toBeDefined();
    expect(fm?.sessionCount).toBeGreaterThanOrEqual(3);
    expect(fm?.confidence).toBeGreaterThanOrEqual(0.6);
    expect(fm?.dominantSignalKind).toBe('rapid_retry');
    expect(fm?.modelIds).toContain('claude-sonnet-4');
    expect(fm?.agentIds).toContain('agent-alpha');
  });

  it('filters entries outside the lookback window', () => {
    const old = makeEntry({
      sessionId: 'old-session',
      frustration: { count: 3, reasons: ['retry timeout'] },
      modelId: 'claude-sonnet-4',
      agentId: 'agent-alpha',
      endedAt: new Date(Date.now() - 200 * 86_400_000) // 200 days ago
    });
    const recent = Array.from({ length: 3 }, (_, i) =>
      makeEntry({
        sessionId: `recent-${i}`,
        frustration: { count: 3, reasons: ['retry timeout'] },
        modelId: 'claude-sonnet-4',
        agentId: 'agent-alpha',
        endedAt: new Date(Date.now() - i * 60_000)
      })
    );
    const result = recognizePatterns([old, ...recent]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Old session should not be counted
    const fm = result[0];
    expect(fm).toBeDefined();
    expect(fm?.evidenceSessions).not.toContain('old-session');
  });

  it('deduplicates against existing failure modes', () => {
    const entries = Array.from({ length: 3 }, (_, i) =>
      makeEntry({
        sessionId: `session-${i}`,
        frustration: { count: 3, reasons: ['retry timeout'] },
        modelId: 'claude-sonnet-4',
        agentId: 'agent-alpha',
        endedAt: new Date(Date.now() - i * 60_000)
      })
    );
    // Run once to get an ID
    const firstRun = recognizePatterns(entries);
    expect(firstRun.length).toBeGreaterThanOrEqual(1);
    const _existingId = firstRun[0]?.id;

    // Run again with the existing failure mode — should produce no new ones
    const secondRun = recognizePatterns(entries, firstRun);
    expect(secondRun).toEqual([]);
  });

  it('recognizes different frustration kinds separately', () => {
    const rewriteEntries = Array.from({ length: 3 }, (_, i) =>
      makeEntry({
        sessionId: `rewrite-${i}`,
        frustration: { count: 4, reasons: ['rewrite cycle'] },
        modelId: 'claude-sonnet-4',
        agentId: 'agent-alpha',
        endedAt: new Date(Date.now() - i * 60_000)
      })
    );
    const rejectEntries = Array.from({ length: 3 }, (_, i) =>
      makeEntry({
        sessionId: `reject-${i}`,
        frustration: { count: 2, reasons: ['rejected tool call'] },
        modelId: 'claude-sonnet-4',
        agentId: 'agent-alpha',
        endedAt: new Date(Date.now() - i * 60_000)
      })
    );
    const result = recognizePatterns([...rewriteEntries, ...rejectEntries]);
    expect(result.length).toBe(2);

    const kinds = result.map(f => f.dominantSignalKind).sort();
    expect(kinds).toContain('immediate_rewrite');
    expect(kinds).toContain('tool_rejection');
  });

  it('respects custom recognition options', () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        sessionId: `session-${i}`,
        frustration: { count: 2, reasons: ['timeout error'] },
        modelId: 'claude-sonnet-4',
        agentId: 'agent-alpha',
        endedAt: new Date(Date.now() - i * 60_000)
      })
    );
    // Higher threshold — needs more sessions
    const result = recognizePatterns(entries, [], {
      minSessionCount: 10,
      minConfidence: 0.9
    });
    expect(result).toEqual([]);
  });
});

// =============================================================================
// patch-generator.ts
// =============================================================================

describe('buildPatchGenerationPrompt', () => {
  it('builds a prompt from failure mode and sessions', () => {
    const fm: FailureMode = {
      id: 'fm_test123',
      category: 'retry-storm@claude-sonnet-4',
      dominantSignalKind: 'rapid_retry',
      sessionCount: 3,
      confidence: 0.75,
      evidenceSessions: ['s1', 's2', 's3'],
      contextFingerprint: 'm:claude-sonnet-4|a:agent-alpha',
      firstSeenAt: new Date(Date.now() - 7 * 86_400_000),
      lastSeenAt: new Date(),
      avgFrustrationScore: 0.45,
      agentIds: ['agent-alpha'],
      modelIds: ['claude-sonnet-4']
    };

    const entries = [
      makeEntry({
        sessionId: 's1',
        modelId: 'claude-sonnet-4',
        agentId: 'agent-alpha',
        tags: ['feature', 'tests-passed'],
        frustration: { count: 5, reasons: ['retry timeout', 'retry timeout'] },
        quality: { feedbackCount: 2, score: 0.3 },
        spend: { requestCount: 10, totalCost: 0.1, totalTokens: 10_000 }
      })
    ];

    const prompt = buildPatchGenerationPrompt(fm, entries);
    expect(prompt).toContain('fm_test123');
    expect(prompt).toContain('retry-storm');
    expect(prompt).toContain('claude-sonnet-4');
    expect(prompt).toContain('agent-alpha');
    expect(prompt).toContain('TARGET:');
    expect(prompt).toContain('CONTENT:');
    expect(prompt).toContain('DIAGNOSIS:');
    expect(prompt).not.toContain('raw session content'); // privacy guarantee
  });
});

describe('generatePatch', () => {
  it('generates a patch from failure mode using LLM', async () => {
    const fm: FailureMode = {
      id: 'fm_test456',
      category: 'tool-rejection-loop@claude-sonnet-4',
      dominantSignalKind: 'tool_rejection',
      sessionCount: 5,
      confidence: 0.85,
      evidenceSessions: ['s1', 's2'],
      contextFingerprint: 'm:claude-sonnet-4|a:agent-alpha',
      firstSeenAt: new Date(Date.now() - 30 * 86_400_000),
      lastSeenAt: new Date(),
      avgFrustrationScore: 0.6,
      agentIds: ['agent-alpha'],
      modelIds: ['claude-sonnet-4']
    };

    const llm = vi.fn().mockResolvedValue(`DIAGNOSIS: The agent keeps getting tool calls rejected.
TARGET: tool-policy
TARGET_PATH: agentsy/policies/tools/approval.md
SECTION: tool-rejection-loop
CONTENT:
When a tool call is rejected, retry with a less permissive scope before escalating.
CONFIDENCE: 0.92`);

    const entries = [
      makeEntry({
        sessionId: 's1',
        frustration: { count: 3, reasons: ['rejected tool call'] },
        modelId: 'claude-sonnet-4',
        agentId: 'agent-alpha'
      })
    ];

    const patch = await generatePatch(fm, entries, llm);
    expect(patch).toBeDefined();
    expect(patch.failureModeId).toBe('fm_test456');
    expect(patch.target).toBe('tool-policy');
    expect(patch.targetPath).toContain('approval.md');
    expect(patch.confidence).toBe(0.92);
    expect(patch.status).toBe('approved'); // >= 0.9 auto-approves
    expect(patch.createdAt).toBeInstanceOf(Date);
    expect(patch.appliedAt).toBeNull();
    expect(llm).toHaveBeenCalledOnce();
  });

  it('marks low-confidence patches as pending', async () => {
    const fm: FailureMode = {
      id: 'fm_lowconf',
      category: 'rewrite-loop@claude-sonnet-4',
      dominantSignalKind: 'immediate_rewrite',
      sessionCount: 3,
      confidence: 0.65,
      evidenceSessions: ['s1'],
      contextFingerprint: 'm:claude-sonnet-4|a:agent-alpha',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      avgFrustrationScore: 0.5,
      agentIds: ['agent-alpha'],
      modelIds: ['claude-sonnet-4']
    };

    const llm = vi.fn().mockResolvedValue(`DIAGNOSIS: Rewrite cycles occurring.
TARGET: instructions
TARGET_PATH: agentsy/instructions/rewrite.md
SECTION: rewrite-loop
CONTENT:
Before rewriting, verify the existing code and explain why the change is needed.
CONFIDENCE: 0.45`);

    const patch = await generatePatch(fm, [makeEntry()], llm);
    expect(patch.confidence).toBe(0.45);
    expect(patch.status).toBe('pending'); // below 0.9
  });
});

// =============================================================================
// patch-applier.ts
// =============================================================================

describe('applyPatch', () => {
  const tmpDir = resolve(tmpdir(), `agentsy-test-${Date.now()}`);
  const behaviorsPath = resolve(tmpDir, 'learned-behaviors.md');

  beforeEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
  });

  it('creates learned behaviors file and writes patch', () => {
    const patch: PromptPatch = {
      id: 'pp_test001',
      failureModeId: 'fm_test456',
      target: 'tool-policy',
      targetPath: 'agentsy/policies/tools/approval.md',
      section: 'tool-rejection-loop',
      content: 'When a tool call is rejected, retry with a less permissive scope.',
      confidence: 0.95,
      status: 'approved',
      createdAt: new Date(),
      appliedAt: null
    };

    const result = applyPatch(patch, { behaviorsPath });

    expect(result.applied).toBe(true);
    expect(result.requiredApproval).toBe(false); // >= 0.9
    expect(result.approvalGranted).toBe(true);
    expect(result.filePath).toBe(behaviorsPath);
    expect(result.patch.status).toBe('applied');
    expect(result.patch.appliedAt).toBeInstanceOf(Date);

    // Verify file was created
    expect(existsSync(behaviorsPath)).toBe(true);
    const content = readFileSync(behaviorsPath, 'utf-8');
    expect(content).toContain('# Learned Behaviors');
    expect(content).toContain('pp_test001');
    expect(content).toContain('fm_test456');
    expect(content).toContain('tool-rejection-loop');
  });

  it('requires approval for low-confidence patches', () => {
    const patch: PromptPatch = {
      id: 'pp_test002',
      failureModeId: 'fm_lowconf',
      target: 'instructions',
      targetPath: 'agentsy/instructions/rewrite.md',
      section: 'rewrite-loop',
      content: 'Before rewriting, explain why.',
      confidence: 0.7,
      status: 'pending',
      createdAt: new Date(),
      appliedAt: null
    };

    const result = applyPatch(patch, { behaviorsPath });

    expect(result.applied).toBe(false);
    expect(result.requiredApproval).toBe(true);
    expect(result.approvalGranted).toBe(false);
  });

  it('auto-applies when status is approved even if confidence is low', () => {
    // The approval gate is on status, not confidence (caller's responsibility)
    const patch: PromptPatch = {
      id: 'pp_test003',
      failureModeId: 'fm_medconf',
      target: 'skill',
      targetPath: 'agentsy/skills/rewrite',
      section: 'rewrite-loop',
      content: 'Always check file content before rewrite.',
      confidence: 0.7,
      status: 'approved',
      createdAt: new Date(),
      appliedAt: null
    };

    const result = applyPatch(patch, { behaviorsPath });

    expect(result.applied).toBe(true);
    expect(result.requiredApproval).toBe(true); // < 0.9 so requires approval
    expect(result.approvalGranted).toBe(true); // but status is already approved
  });

  it('appends to existing behaviors file', () => {
    // Create file with first entry
    const patch1: PromptPatch = {
      id: 'pp_001',
      failureModeId: 'fm_001',
      target: 'instructions',
      targetPath: 'path1',
      section: 'section1',
      content: 'content1',
      confidence: 0.95,
      status: 'approved',
      createdAt: new Date(),
      appliedAt: null
    };
    applyPatch(patch1, { behaviorsPath });

    // Append second entry
    const patch2: PromptPatch = {
      id: 'pp_002',
      failureModeId: 'fm_002',
      target: 'tool-policy',
      targetPath: 'path2',
      section: 'section2',
      content: 'content2',
      confidence: 0.98,
      status: 'approved',
      createdAt: new Date(),
      appliedAt: null
    };
    const result = applyPatch(patch2, { behaviorsPath });

    expect(result.applied).toBe(true);
    const content = readFileSync(behaviorsPath, 'utf-8');
    expect(content).toContain('pp_001');
    expect(content).toContain('pp_002');
  });

  it('returns path for getBehaviorsFilePath', () => {
    const path = getBehaviorsFilePath();
    expect(path).toContain('.agents');
    expect(path).toContain('agentsy');
    expect(path).toContain('learned-behaviors.md');
  });
});

// =============================================================================
// reinforcement.ts
// =============================================================================

describe('reinforcePattern', () => {
  it('returns null when frustration score is too high', () => {
    const entry = makeEntry({
      frustration: { count: 5, reasons: ['retry'] },
      tags: ['tests-passed'],
      survivalRate30d: 0.95
    });
    const result = reinforcePattern(entry, []);
    expect(result).toBeNull();
  });

  it('returns null when tests have not passed', () => {
    const entry = makeEntry({
      frustration: { count: 0, reasons: [] },
      tags: ['feature'],
      quality: { feedbackCount: 0, score: 0 },
      survivalRate30d: 0.95
    });
    const result = reinforcePattern(entry, []);
    expect(result).toBeNull();
  });

  it('returns null when survival rate is below threshold', () => {
    const entry = makeEntry({
      frustration: { count: 0, reasons: [] },
      tags: ['tests-passed'],
      survivalRate30d: 0.3
    });
    const result = reinforcePattern(entry, []);
    expect(result).toBeNull();
  });

  it('returns null when survival rate is null', () => {
    const entry = makeEntry({
      frustration: { count: 0, reasons: [] },
      tags: ['tests-passed'],
      survivalRate30d: null
    });
    // survivalRate30d null means not yet calculable — skip
    const result = reinforcePattern(entry, []);
    expect(result).toBeNull();
  });

  it('creates a new ReinforcedPattern when all criteria are met', () => {
    const entry = makeEntry({
      sessionId: 'good-session',
      modelId: 'claude-sonnet-4',
      agentId: 'agent-alpha',
      frustration: { count: 0, reasons: [] },
      tags: ['feature', 'tests-passed'],
      quality: { feedbackCount: 3, score: 0.8 },
      survivalRate30d: 0.92
    });
    const result = reinforcePattern(entry, []);
    expect(result).not.toBeNull();
    expect(result?.modelId).toBe('claude-sonnet-4');
    expect(result?.agentId).toBe('agent-alpha');
    expect(result?.taskCategory).toBe('feature');
    expect(result?.sessionCount).toBe(1);
    expect(result?.routingWeight).toBe(1.0);
    expect(result?.avgFrustrationScore).toBe(0);
    expect(result?.avgSurvivalRate).toBe(0.92);
    expect(result?.id).toBeDefined();
  });

  it('upserts existing pattern with updated metrics', () => {
    const existing: ReinforcedPattern = {
      id: 'rp_existing',
      modelId: 'claude-sonnet-4',
      agentId: 'agent-alpha',
      skillFingerprint: 'claude-sonnet-4:agent-alpha:feature',
      taskCategory: 'feature',
      avgFrustrationScore: 0.05,
      avgSurvivalRate: 0.9,
      sessionCount: 3,
      routingWeight: 1.15
    };

    const entry = makeEntry({
      modelId: 'claude-sonnet-4',
      agentId: 'agent-alpha',
      frustration: { count: 1, reasons: [] },
      tags: ['feature', 'tests-passed'],
      survivalRate30d: 0.85
    });

    const result = reinforcePattern(entry, [existing]);
    expect(result).not.toBeNull();
    expect(result?.sessionCount).toBe(4);
    expect(result?.routingWeight).toBeGreaterThan(1.15);
    expect(result?.routingWeight).toBeLessThanOrEqual(2.0);
    // Avg should be (0.05*3 + 0.1) / 4
    expect(result?.avgFrustrationScore).toBeCloseTo(0.0625, 4);
  });

  it('detects tests passed from quality score', () => {
    const entry = makeEntry({
      frustration: { count: 0, reasons: [] },
      tags: ['feature'],
      quality: { feedbackCount: 2, score: 0.7 },
      survivalRate30d: 0.9
    });
    const result = reinforcePattern(entry, []);
    expect(result).not.toBeNull();
  });

  it('respects custom reinforcement options', () => {
    const entry = makeEntry({
      frustration: { count: 1, reasons: [] },
      tags: ['tests-passed'],
      quality: { feedbackCount: 1, score: 0.6 },
      survivalRate30d: 0.6
    });
    // Default minSurvivalRate is 0.80 — this would fail
    const defaultResult = reinforcePattern(entry, []);
    expect(defaultResult).toBeNull();

    // With custom threshold — should pass
    const customResult = reinforcePattern(entry, [], {
      maxFrustrationScore: 0.2,
      minSurvivalRate: 0.5
    });
    expect(customResult).not.toBeNull();
  });
});

describe('getRoutingWeights', () => {
  it('returns empty map for empty patterns', () => {
    const result = getRoutingWeights([]);
    expect(result).toEqual({});
  });

  it('groups weights by model and maps to agent weights', () => {
    const patterns: ReinforcedPattern[] = [
      {
        id: 'rp_1',
        modelId: 'claude-sonnet-4',
        agentId: 'agent-alpha',
        skillFingerprint: 'fp1',
        taskCategory: 'feature',
        avgFrustrationScore: 0.05,
        avgSurvivalRate: 0.9,
        sessionCount: 5,
        routingWeight: 1.2
      },
      {
        id: 'rp_2',
        modelId: 'claude-sonnet-4',
        agentId: 'agent-beta',
        skillFingerprint: 'fp2',
        taskCategory: 'bugfix',
        avgFrustrationScore: 0.03,
        avgSurvivalRate: 0.95,
        sessionCount: 3,
        routingWeight: 1.1
      },
      {
        id: 'rp_3',
        modelId: 'gpt-4o',
        agentId: 'agent-alpha',
        skillFingerprint: 'fp3',
        taskCategory: 'general',
        avgFrustrationScore: 0.1,
        avgSurvivalRate: 0.85,
        sessionCount: 2,
        routingWeight: 1.0
      }
    ];

    const result = getRoutingWeights(patterns);
    expect(result['claude-sonnet-4']).toBeDefined();
    expect(result['claude-sonnet-4']?.['agent-alpha']).toBe(1.2);
    expect(result['claude-sonnet-4']?.['agent-beta']).toBe(1.1);
    expect(result['gpt-4o']).toBeDefined();
    expect(result['gpt-4o']?.['agent-alpha']).toBe(1.0);
  });

  it('handles patterns for the same model with multiple agents', () => {
    const patterns: ReinforcedPattern[] = [
      {
        id: 'rp_a',
        modelId: 'gpt-4o',
        agentId: 'agent-a',
        skillFingerprint: 'fp',
        taskCategory: 'feature',
        avgFrustrationScore: 0,
        avgSurvivalRate: 0.9,
        sessionCount: 1,
        routingWeight: 1.0
      },
      {
        id: 'rp_b',
        modelId: 'gpt-4o',
        agentId: 'agent-b',
        skillFingerprint: 'fp',
        taskCategory: 'bugfix',
        avgFrustrationScore: 0,
        avgSurvivalRate: 0.9,
        sessionCount: 1,
        routingWeight: 1.5
      }
    ];

    const result = getRoutingWeights(patterns);
    const gpt4oWeights = result['gpt-4o'];
    expect(gpt4oWeights).toBeDefined();
    expect(Object.keys(gpt4oWeights as Record<string, number>)).toHaveLength(2);
  });
});

// =============================================================================
// Module exports (learning/index.ts)
// =============================================================================

describe('module exports', () => {
  it('exports all expected functions and types', async () => {
    const mod = await import('./index.js');
    expect(mod.recognizePatterns).toBeTypeOf('function');
    expect(mod.generatePatch).toBeTypeOf('function');
    expect(mod.buildPatchGenerationPrompt).toBeTypeOf('function');
    expect(mod.applyPatch).toBeTypeOf('function');
    expect(mod.reinforcePattern).toBeTypeOf('function');
    expect(mod.getRoutingWeights).toBeTypeOf('function');
  });
});
