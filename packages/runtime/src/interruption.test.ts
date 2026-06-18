import type { SessionStore } from '@agentsy/session';
import type { RuntimeSnapshot } from '@agentsy/shared';
import { describe, expect, it, vi } from 'vitest';

import type { InterruptionCheckpoint } from './interruption.js';

import {
  createInterruption,
  getEscalationState,
  getFailedReplicas,
  markReplicaAttempted,
  resumeFromCheckpoint,
  setEscalationState
} from './interruption.js';

describe('createInterruption', () => {
  it('creates a checkpoint with the given reason and snapshot', () => {
    const store: Pick<SessionStore, 'setValue'> = { setValue: vi.fn() };
    const snapshot: RuntimeSnapshot = {
      sessionId: 'sess_1',
      depth: 0,
      completedTaskIds: [],
      results: [],
      childSnapshots: [],
      updatedAt: Date.now()
    };

    const checkpoint = createInterruption('sess_1', 'user interrupted', snapshot, store);

    expect(checkpoint.sessionId).toBe('sess_1');
    expect(checkpoint.reason).toBe('user interrupted');
    expect(checkpoint.snapshot).toEqual(snapshot);
    expect(store.setValue).toHaveBeenCalledWith(expect.stringContaining('interruption_checkpoint:'), checkpoint);
  });

  it('includes metadata when provided', () => {
    const store: Pick<SessionStore, 'setValue'> = { setValue: vi.fn() };
    const snapshot: RuntimeSnapshot = {
      sessionId: '',
      depth: 0,
      completedTaskIds: [],
      results: [],
      childSnapshots: [],
      updatedAt: 0
    };

    const checkpoint = createInterruption('sess_1', 'error', snapshot, store, {
      pendingToolCallId: 'call_123'
    });

    expect(checkpoint.metadata).toEqual({ pendingToolCallId: 'call_123' });
  });
});

describe('resumeFromCheckpoint', () => {
  it('returns null when no checkpoint exists', () => {
    const store: Pick<SessionStore, 'getValue'> = { getValue: vi.fn().mockReturnValue(null) };
    const result = resumeFromCheckpoint('chk_123', store);
    expect(result).toBeNull();
  });

  it('returns the checkpoint when found', () => {
    const checkpoint = {
      id: 'chk_123',
      sessionId: 'sess_1',
      reason: 'interrupted',
      timestamp: Date.now(),
      snapshot: {
        sessionId: 'sess_1',
        depth: 0,
        completedTaskIds: [],
        results: [],
        childSnapshots: [],
        updatedAt: Date.now()
      }
    };
    const store: Pick<SessionStore, 'getValue'> = { getValue: vi.fn().mockReturnValue(checkpoint) };

    const result = resumeFromCheckpoint('chk_123', store);
    expect(result).toEqual(checkpoint);
  });

  it('returns null for invalid checkpoint structure', () => {
    const store: Pick<SessionStore, 'getValue'> = {
      getValue: vi.fn().mockReturnValue({ id: 123, sessionId: 'sess_1' })
    };
    const result = resumeFromCheckpoint('chk_bad', store);
    expect(result).toBeNull();
  });
});

describe('getFailedReplicas', () => {
  it('returns empty array when metadata is undefined', () => {
    const result = getFailedReplicas({
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot
    });
    expect(result).toEqual([]);
  });

  it('returns empty array when metadata.attemptedReplicas is not an array', () => {
    const result = getFailedReplicas({
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot,
      metadata: { attemptedReplicas: 'not-an-array' }
    });
    expect(result).toEqual([]);
  });

  it('returns filtered string array when metadata has attemptedReplicas', () => {
    const result = getFailedReplicas({
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot,
      metadata: { attemptedReplicas: ['replica_a', 42, 'replica_b', null] }
    });
    expect(result).toEqual(['replica_a', 'replica_b']);
  });

  it('returns empty array when metadata is empty object', () => {
    const result = getFailedReplicas({
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot,
      metadata: {}
    });
    expect(result).toEqual([]);
  });
});

describe('markReplicaAttempted', () => {
  it('creates metadata bag if it does not exist, sets first replica', () => {
    const checkpoint = {
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot
    } as InterruptionCheckpoint;
    markReplicaAttempted(checkpoint, 'replica_1');
    expect(checkpoint.metadata).toEqual({ attemptedReplicas: ['replica_1'] });
  });

  it('appends to existing attemptedReplicas array', () => {
    const checkpoint = {
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot,
      metadata: { attemptedReplicas: ['replica_1'] }
    };
    markReplicaAttempted(checkpoint, 'replica_2');
    expect(checkpoint.metadata?.attemptedReplicas).toEqual(['replica_1', 'replica_2']);
  });

  it('does not add duplicate replica IDs', () => {
    const checkpoint = {
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot,
      metadata: { attemptedReplicas: ['replica_1'] }
    };
    markReplicaAttempted(checkpoint, 'replica_1');
    expect(checkpoint.metadata?.attemptedReplicas).toEqual(['replica_1']);
  });

  it('appends multiple distinct IDs', () => {
    const checkpoint = {
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot
    } as InterruptionCheckpoint;
    markReplicaAttempted(checkpoint, 'a');
    markReplicaAttempted(checkpoint, 'b');
    markReplicaAttempted(checkpoint, 'c');
    expect(checkpoint.metadata?.attemptedReplicas).toEqual(['a', 'b', 'c']);
  });
});

describe('getEscalationState', () => {
  it('returns null when metadata is undefined', () => {
    const result = getEscalationState({
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot
    });
    expect(result).toBeNull();
  });

  it('returns null when metadata.escalationState is missing', () => {
    const result = getEscalationState({
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot,
      metadata: {}
    });
    expect(result).toBeNull();
  });

  it('returns null when escalationState is wrong type', () => {
    const stringResult = getEscalationState({
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot,
      metadata: { escalationState: 'some-string' }
    });
    expect(stringResult).toBeNull();

    const arrayResult = getEscalationState({
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot,
      metadata: { escalationState: [1, 2, 3] }
    });
    expect(arrayResult).toBeNull();

    const numberResult = getEscalationState({
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot,
      metadata: { escalationState: 42 }
    });
    expect(numberResult).toBeNull();
  });

  it('returns the state object when present', () => {
    const state = { level: 'critical', escalatedBy: 'replica_1' };
    const result = getEscalationState({
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot,
      metadata: { escalationState: state }
    });
    expect(result).toEqual(state);
  });
});

describe('setEscalationState', () => {
  it('creates metadata bag if absent, sets state', () => {
    const checkpoint = {
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot
    } as InterruptionCheckpoint;
    setEscalationState(checkpoint, { level: 'warning' });
    expect(checkpoint.metadata).toEqual({ escalationState: { level: 'warning' } });
  });

  it('overwrites existing escalationState', () => {
    const checkpoint = {
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot,
      metadata: { escalationState: { level: 'info' } }
    };
    setEscalationState(checkpoint, { level: 'critical' });
    expect(checkpoint.metadata?.escalationState).toEqual({ level: 'critical' });
  });

  it('preserves other metadata keys', () => {
    const checkpoint = {
      id: 'chk_1',
      sessionId: 'sess_1',
      reason: 'test',
      timestamp: 1,
      snapshot: {} as RuntimeSnapshot,
      metadata: { attemptedReplicas: ['replica_1'], someKey: 'keep-me' }
    };
    setEscalationState(checkpoint, { level: 'error' });
    expect(checkpoint.metadata?.attemptedReplicas).toEqual(['replica_1']);
    expect(checkpoint.metadata?.someKey).toBe('keep-me');
    expect((checkpoint.metadata as Record<string, unknown>)?.escalationState).toEqual({ level: 'error' });
  });
});
