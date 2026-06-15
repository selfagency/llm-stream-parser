import { describe, expect, it } from 'vitest';

import type {
  ModelCallFailedEvent,
  ModelReplicaSwitchedEvent,
  PostModelCallEvent,
  PreModelCallEvent
} from './types.js';

describe('PreModelCallEvent', () => {
  it('constructs with all required fields', () => {
    const event: PreModelCallEvent = {
      estimatedTokens: 500,
      logicalModelId: 'gpt-4o',
      providerId: 'openai',
      replicaId: 'rep-1',
      sessionId: 'sess_abc',
      type: 'PreModelCall'
    };

    expect(event.type).toBe('PreModelCall');
    expect(event.logicalModelId).toBe('gpt-4o');
    expect(event.replicaId).toBe('rep-1');
    expect(event.providerId).toBe('openai');
    expect(event.estimatedTokens).toBe(500);
    expect(event.sessionId).toBe('sess_abc');
  });
});

describe('PostModelCallEvent', () => {
  it('constructs with all required fields including cost and latency', () => {
    const event: PostModelCallEvent = {
      actualTokens: 450,
      costUsd: 0.0025,
      latencyMs: 1200,
      logicalModelId: 'gpt-4o',
      providerId: 'openai',
      replicaId: 'rep-1',
      sessionId: 'sess_abc',
      type: 'PostModelCall'
    };

    expect(event.type).toBe('PostModelCall');
    expect(event.actualTokens).toBe(450);
    expect(event.costUsd).toBe(0.0025);
    expect(event.latencyMs).toBe(1200);
    expect(event.logicalModelId).toBe('gpt-4o');
    expect(event.replicaId).toBe('rep-1');
    expect(event.providerId).toBe('openai');
  });

  it('accepts zero cost and latency', () => {
    const event: PostModelCallEvent = {
      actualTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      logicalModelId: 'local-model',
      providerId: 'ollama',
      replicaId: 'rep-local',
      sessionId: 'sess_xyz',
      type: 'PostModelCall'
    };

    expect(event.costUsd).toBe(0);
    expect(event.latencyMs).toBe(0);
  });
});

describe('ModelCallFailedEvent', () => {
  it('constructs with all required fields including attempt', () => {
    const event: ModelCallFailedEvent = {
      attempt: 2,
      error: 'Rate limit exceeded',
      logicalModelId: 'gpt-4o',
      providerId: 'openai',
      replicaId: 'rep-1',
      sessionId: 'sess_abc',
      type: 'ModelCallFailed'
    };

    expect(event.type).toBe('ModelCallFailed');
    expect(event.attempt).toBe(2);
    expect(event.error).toBe('Rate limit exceeded');
    expect(event.logicalModelId).toBe('gpt-4o');
    expect(event.replicaId).toBe('rep-1');
    expect(event.providerId).toBe('openai');
  });

  it('tracks first attempt failures', () => {
    const event: ModelCallFailedEvent = {
      attempt: 1,
      error: 'Connection timeout',
      logicalModelId: 'claude-3',
      providerId: 'anthropic',
      replicaId: 'rep-2',
      sessionId: 'sess_def',
      type: 'ModelCallFailed'
    };

    expect(event.attempt).toBe(1);
  });
});

describe('ModelReplicaSwitchedEvent', () => {
  it('constructs with all required fields including reason', () => {
    const event: ModelReplicaSwitchedEvent = {
      fromReplicaId: 'rep-1',
      logicalModelId: 'gpt-4o',
      reason: 'Rate limit exceeded on rep-1',
      sessionId: 'sess_abc',
      toProviderId: 'openai',
      toReplicaId: 'rep-2',
      type: 'ModelReplicaSwitched'
    };

    expect(event.type).toBe('ModelReplicaSwitched');
    expect(event.fromReplicaId).toBe('rep-1');
    expect(event.toReplicaId).toBe('rep-2');
    expect(event.toProviderId).toBe('openai');
    expect(event.reason).toBe('Rate limit exceeded on rep-1');
    expect(event.logicalModelId).toBe('gpt-4o');
  });

  it('supports provider-level failover', () => {
    const event: ModelReplicaSwitchedEvent = {
      fromReplicaId: 'rep-openai-1',
      logicalModelId: 'gpt-4o',
      reason: 'All OpenAI replicas exhausted, switching to Azure',
      sessionId: 'sess_ghi',
      toProviderId: 'azure',
      toReplicaId: 'rep-azure-1',
      type: 'ModelReplicaSwitched'
    };

    expect(event.fromReplicaId).toBe('rep-openai-1');
    expect(event.toProviderId).toBe('azure');
    expect(event.toReplicaId).toBe('rep-azure-1');
    expect(event.reason).toContain('switching');
  });
});
